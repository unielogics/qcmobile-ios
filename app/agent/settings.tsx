import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useBrokerSettings, useUpdateBrokerSettings } from "@/hooks/useApi";
import type { BrokerSettings } from "@/lib/types";

const DEFAULTS: BrokerSettings = {
  stale_lead_threshold_days: 3,
  default_buyer_doc_set: null,
  default_seller_doc_set: null,
  notify_on_new_lead: true,
  notify_on_stuck_deal: true,
};

export default function AgentSettingsRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: settings, isLoading, error } = useBrokerSettings();
  const update = useUpdateBrokerSettings();
  const [draft, setDraft] = useState<BrokerSettings>(DEFAULTS);
  const notDeployed = !!error && error instanceof Error && /404/.test(error.message);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const onSave = async () => {
    try {
      await update.mutateAsync(draft);
      Alert.alert("Saved");
    } catch {
      Alert.alert("Couldn't save settings");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {notDeployed ? (
          <Card pad={18}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink, marginBottom: 4 }}>Settings not yet enabled</Text>
            <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17 }}>
              The <Text style={{ fontFamily: "monospace" }}>/me/broker-settings</Text> endpoint isn't deployed in this environment.
            </Text>
          </Card>
        ) : null}

        <Pressable
          onPress={() => router.push("/agent/settings/ai-assistant" as never)}
          style={({ pressed }) => ({
            backgroundColor: t.surface,
            borderColor: t.line,
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            opacity: pressed ? 0.85 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          })}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink, marginBottom: 2 }}>
              Elara
            </Text>
            <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 16 }}>
              Buyer / seller playbooks · cadence · handoff gates · message style.
            </Text>
          </View>
          {/* `chevron-right` isn't a registered icon name; use `chevR`
              so the drill-in affordance actually renders. */}
          <Icon name="chevR" size={18} color={t.ink3} />
        </Pressable>

        <View>
          <SectionLabel>Lead handling</SectionLabel>
          <Card pad={16}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>Stale lead threshold</Text>
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2, marginBottom: 8 }}>How many days without contact before a lead surfaces in “Call today”.</Text>
            <TextInput
              keyboardType="number-pad"
              value={String(draft.stale_lead_threshold_days)}
              onChangeText={(v) => {
                const n = parseInt(v.replace(/\D/g, ""), 10);
                setDraft((d) => ({ ...d, stale_lead_threshold_days: Number.isNaN(n) ? 0 : n }));
              }}
              style={{
                backgroundColor: t.surface2, color: t.ink, fontSize: 14,
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                borderColor: t.line, borderWidth: 1,
              }}
            />
          </Card>
        </View>

        <View>
          <SectionLabel>Notifications</SectionLabel>
          <Card pad={16}>
            <ToggleRow
              label="Notify me when a new lead comes in"
              value={draft.notify_on_new_lead}
              onChange={(v) => setDraft((d) => ({ ...d, notify_on_new_lead: v }))}
            />
            <View style={{ height: 1, backgroundColor: t.line, marginVertical: 12 }} />
            <ToggleRow
              label="Notify me when a deal goes stuck"
              value={draft.notify_on_stuck_deal}
              onChange={(v) => setDraft((d) => ({ ...d, notify_on_stuck_deal: v }))}
            />
          </Card>
        </View>

        <Pressable
          onPress={onSave}
          disabled={update.isPending || isLoading || notDeployed}
          style={({ pressed }) => ({
            backgroundColor: t.brand,
            paddingVertical: 13, borderRadius: 10, alignItems: "center",
            opacity: update.isPending || notDeployed ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
            {update.isPending ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ flex: 1, fontSize: 13, color: t.ink }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}
