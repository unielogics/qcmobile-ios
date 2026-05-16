// NurtureControls — the broker's primary lever for the Client-AI tier.
// Shown at the top of a lead/contacted/verified client's detail page.
//
// Three controls:
//   1. Auto-nurture toggle — flips ai_secretary_settings.outreach_mode
//      between "off" and "draft_first" (broker reviews before send) or
//      "portal_auto" (AI sends through the portal autonomously).
//   2. Cadence preset — gentle / standard / aggressive, persisted to
//      ai_secretary_settings.default_cadence on the realtor-phase
//      ClientAIPlan.
//   3. "Send intake link" button — fires a one-off send through the
//      configured channel (SMS preferred if phone present, email
//      otherwise). Logs an Activity row for audit.
//
// Once the client is past "verified" (handed off to funding), this
// surface auto-collapses to a read-only summary — see the host page.

import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import {
  useClientAIPlan,
  useSendIntakeLink,
  useSetClientNurture,
} from "@/hooks/useApi";

type CadencePreset = "gentle" | "standard" | "aggressive";

// Maps a UI preset to the cadence-policy shape the backend expects.
const PRESET_CADENCE: Record<CadencePreset, { hours_between_attempts: number; max_attempts: number }> = {
  gentle:     { hours_between_attempts: 24 * 7, max_attempts: 4 },
  standard:   { hours_between_attempts: 48,     max_attempts: 12 },
  aggressive: { hours_between_attempts: 24,     max_attempts: 30 },
};

function inferPresetFromCadence(c: {
  hours_between_attempts?: number;
  max_attempts?: number;
} | null | undefined): CadencePreset {
  if (!c?.hours_between_attempts) return "standard";
  if (c.hours_between_attempts >= 24 * 5) return "gentle";
  if (c.hours_between_attempts <= 24) return "aggressive";
  return "standard";
}

interface Props {
  clientId: string;
  hasPhone: boolean;
  hasEmail: boolean;
}

export function NurtureControls({ clientId, hasPhone, hasEmail }: Props) {
  const { t } = useTheme();
  const plan = useClientAIPlan(clientId, null);
  const setNurture = useSetClientNurture();
  const sendIntake = useSendIntakeLink();

  // ClientAIPlanRead doesn't formally expose ai_secretary_settings in
  // our generated types yet (it's a JSONB pass-through). Read via a
  // loose cast and fall back to safe defaults. Backend is the source
  // of truth; UI surfaces what's there.
  const settings = (plan.data as unknown as {
    ai_secretary_settings?: {
      outreach_mode?: string;
      default_cadence?: { hours_between_attempts?: number; max_attempts?: number };
    };
  } | undefined)?.ai_secretary_settings;

  const outreachMode = (settings?.outreach_mode ?? "off") as
    | "off" | "draft_first" | "portal_auto" | "portal_email" | "portal_email_sms";
  const isOn = outreachMode !== "off";
  const initialPreset = inferPresetFromCadence(settings?.default_cadence);
  const [preset, setPreset] = useState<CadencePreset>(initialPreset);

  const toggleNurture = () => {
    setNurture.mutate({
      clientId,
      settings: {
        outreach_mode: isOn ? "off" : "draft_first",
        default_cadence: isOn ? null : PRESET_CADENCE[preset],
      },
    });
  };

  const pickPreset = (next: CadencePreset) => {
    setPreset(next);
    setNurture.mutate({
      clientId,
      settings: {
        default_cadence: PRESET_CADENCE[next],
      },
    });
  };

  const onSendIntake = async () => {
    try {
      const res = await sendIntake.mutateAsync({ clientId });
      Alert.alert(
        "Intake link sent",
        `Delivered via ${res.sent_via}. Client receives a tracked link to complete intake on the portal.`,
      );
    } catch (e) {
      Alert.alert("Couldn't send", e instanceof Error ? e.message : "Try again later.");
    }
  };

  return (
    <Card pad={14}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: t.petrolSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="spark" size={16} color={t.petrol} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}>
            Nurture this lead
          </Text>
          <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }} numberOfLines={2}>
            Let the AI keep this client engaged on your schedule until they're funding-ready.
          </Text>
        </View>
        <NurtureToggle on={isOn} loading={setNurture.isPending} onPress={toggleNurture} />
      </View>

      <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginTop: 4, marginBottom: 6 }}>
        Cadence
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["gentle", "standard", "aggressive"] as const).map((p) => {
          const active = preset === p;
          return (
            <Pressable
              key={p}
              onPress={() => pickPreset(p)}
              disabled={!isOn || setNurture.isPending}
              accessibilityLabel={`Cadence ${p}`}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: 9,
                alignItems: "center",
                backgroundColor: active ? t.brand : t.surface2,
                borderColor: active ? t.brand : t.line,
                borderWidth: 1,
                opacity: (!isOn ? 0.45 : pressed ? 0.85 : 1),
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: active ? "#fff" : t.ink, textTransform: "capitalize" }}>
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <Pill bg={isOn ? t.profitBg : t.chip} color={isOn ? t.profit : t.ink3}>
          {isOn ? "AI nurturing on" : "AI nurturing off"}
        </Pill>
        <Pill bg={t.chip} color={t.ink2}>
          Mode: {outreachMode.replace(/_/g, " ")}
        </Pill>
      </View>

      <Pressable
        onPress={onSendIntake}
        disabled={sendIntake.isPending || (!hasPhone && !hasEmail)}
        accessibilityLabel="Send intake link"
        style={({ pressed }) => ({
          marginTop: 12,
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: !hasPhone && !hasEmail ? t.chip : pressed ? t.brand : t.brandSoft,
          borderColor: !hasPhone && !hasEmail ? t.line : t.brand,
          borderWidth: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: sendIntake.isPending ? 0.6 : 1,
        })}
      >
        {sendIntake.isPending ? (
          <ActivityIndicator size="small" color={t.brand} />
        ) : (
          <Icon name="send" size={13} color={!hasPhone && !hasEmail ? t.ink4 : t.brand} />
        )}
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: !hasPhone && !hasEmail ? t.ink4 : t.brand }}>
          {sendIntake.isPending ? "Sending…" : "Send intake link"}
        </Text>
      </Pressable>
      {!hasPhone && !hasEmail ? (
        <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 6, lineHeight: 14 }}>
          Add an email or phone on this client to enable intake link sends.
        </Text>
      ) : null}
    </Card>
  );
}

function NurtureToggle({ on, loading, onPress }: { on: boolean; loading: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        backgroundColor: on ? t.brand : t.chip,
        padding: 2,
        justifyContent: "center",
        opacity: loading ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          backgroundColor: "#fff",
          alignSelf: on ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );
}
