// Mobile new-client form — simplified single-page capture.
//
// What we ask the broker for, in this order:
//   1. Name (required)
//   2. Email + Phone (≥1 required)
//   3. Buyer or Seller toggle
//   4. Properties owned — multi-row editor (can be empty for buyer)
//   5. Listing property — seller only, pick which owned property is the listing
//
// What we DON'T ask anymore:
//   - lead_source, lead_temperature, financing_support_needed, contact_permission,
//     relationship_context  → all defaulted server-side (manual_entry / warm / unknown
//     / save_lead_only / new_lead). Broker tunes per-client later.
//   - property_type             → defaulted from owned-asset rows
//   - cadence preset            → defaults to "standard"; tunable via the
//                                 NurtureControls card on the client detail
//                                 page (Phase 7.3).
//   - numbers (price/timeline)  → captured later when they exist.
//   - handoff note              → captured later via the client detail page.
//
// Submit still POSTs to /clients with the same payload shape — fields are
// just defaulted rather than collected from the broker. The lead_intake
// JSONB carries the owned-properties + listing_index.

import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import { useBufferWizardIntent, useCreateClient, useSendIntakeLink } from "@/hooks/useApi";
import { ClientSearchBlock } from "@/components/agent/ClientSearchBlock";
import { OwnedAssetsEditor, NEW_ASSET, type OwnedAsset } from "@/components/agent/OwnedAssetsEditor";
import type { Client } from "@/lib/types";

type Side = "buyer" | "seller";

interface Draft {
  side: Side;
  name: string;
  email: string;
  phone: string;
  ownedAssets: OwnedAsset[];
  listingIndex: number | null; // seller only — which owned asset is the listing
}

const INITIAL: Draft = {
  side: "buyer",
  name: "",
  email: "",
  phone: "",
  ownedAssets: [],
  listingIndex: null,
};

export default function AgentAddLeadRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateClient();
  const sendIntakeLink = useSendIntakeLink();
  const bufferIntent = useBufferWizardIntent();
  const [draft, setDraft] = useState<Draft>(INITIAL);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const hasContact = draft.email.trim().length > 0 || draft.phone.trim().length > 0;
  const sellerValid =
    draft.side !== "seller"
      ? true
      : draft.listingIndex != null && draft.ownedAssets[draft.listingIndex]?.address.trim().length > 0;
  const isSubmitting = create.isPending || sendIntakeLink.isPending;
  const canSubmit = draft.name.trim().length > 0 && hasContact && sellerValid && !isSubmitting;

  const onPickExisting = (c: Client) => router.replace(`/agent/client/${c.id}` as Href);

  const submit = async (intent: "save" | "save_and_invite") => {
    if (!canSubmit) return;
    try {
      const lead_intake = buildLeadIntake(draft);
      const created = await create.mutateAsync({
        name: draft.name.trim(),
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        stage: "lead",
        client_type: draft.side,
        lead_intake,
        // Server-side defaults — broker tunes later from the client page.
        lead_source: "manual_entry",
        lead_temperature: "warm",
        financing_support_needed: "unknown",
        contact_permission: intent === "save_and_invite" ? "send_invite_now" : "save_lead_only",
        relationship_context: "new_lead",
        source_channel: "agent_mobile",
      });
      // Default nurture cadence — broker can flip to gentle / aggressive
      // on the client detail page via NurtureControls. Non-blocking.
      try {
        await bufferIntent.mutateAsync({
          clientId: created.id,
          body: { cadence_preset: "standard" },
        });
      } catch {
        /* swallow — cadence configurable post-creation */
      }
      let intakeLinkError: string | null = null;
      if (intent === "save_and_invite") {
        try {
          await sendIntakeLink.mutateAsync({ clientId: created.id });
        } catch (e) {
          intakeLinkError = e instanceof Error ? e.message : "The intake link was not queued.";
        }
      }
      if (intakeLinkError) {
        Alert.alert("Client saved", `Intake link was not queued. ${intakeLinkError}`);
      }
      router.replace(`/agent/client/${created.id}` as Href);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 10,
          borderBottomColor: t.line,
          borderBottomWidth: 1,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close">
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>
          New client
        </Text>
      </View>

      <KeyboardAware excludeTabBar>
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card pad={14}>
            <SectionLabel t={t}>Contact</SectionLabel>
            <Field t={t} label="Name" required>
              <Input
                t={t}
                value={draft.name}
                onChangeText={(v) => update("name", v)}
                placeholder="Marcus Holloway"
              />
            </Field>
            <Field t={t} label="Email">
              <Input
                t={t}
                value={draft.email}
                onChangeText={(v) => update("email", v)}
                placeholder="marcus@holloway.cap"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
            <Field t={t} label="Phone">
              <Input
                t={t}
                value={draft.phone}
                onChangeText={(v) => update("phone", v)}
                placeholder="(917) 555-0148"
                keyboardType="phone-pad"
              />
            </Field>
            <Text
              style={{
                fontSize: 11,
                color: hasContact ? t.ink3 : t.warn,
                lineHeight: 16,
                marginTop: -4,
              }}
            >
              {hasContact ? "Either email or phone is fine. Both works too." : "Provide at least an email or a phone."}
            </Text>

            <ClientSearchBlock
              name={draft.name}
              email={draft.email}
              phone={draft.phone}
              onPickExisting={onPickExisting}
            />
          </Card>

          <Card pad={14}>
            <SectionLabel t={t}>Side</SectionLabel>
            <SegmentedRow
              t={t}
              options={[
                { value: "buyer", label: "Buyer" },
                { value: "seller", label: "Seller" },
              ]}
              value={draft.side}
              onChange={(v) => {
                const next = v as Side;
                update("side", next);
                // Reset listing-index if switching to buyer or if the
                // current index no longer points at a valid row.
                if (next === "buyer") update("listingIndex", null);
              }}
            />
          </Card>

          <Card pad={14}>
            <SectionLabel t={t}>Properties owned</SectionLabel>
            <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17, marginBottom: 10 }}>
              {draft.side === "seller"
                ? "Add the property they're listing (and any others they own)."
                : "Any properties they already own. Optional for buyers."}
            </Text>
            <OwnedAssetsEditor
              assets={draft.ownedAssets}
              onChange={(next) => {
                update("ownedAssets", next);
                // Re-validate listing index if a row got removed.
                if (
                  draft.listingIndex != null &&
                  (draft.listingIndex >= next.length || next.length === 0)
                ) {
                  update("listingIndex", next.length > 0 ? 0 : null);
                }
              }}
            />
          </Card>

          {draft.side === "seller" ? (
            <Card pad={14}>
              <SectionLabel t={t}>Listing property</SectionLabel>
              {draft.ownedAssets.length === 0 ? (
                <Pressable
                  onPress={() => update("ownedAssets", [{ ...NEW_ASSET }])}
                  accessibilityLabel="Add the property they're listing"
                  style={({ pressed }) => ({
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: t.warn,
                    backgroundColor: pressed ? t.warnBg : "transparent",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  })}
                >
                  <Icon name="plus" size={13} color={t.warn} />
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.warn }}>
                    Add the property they're listing
                  </Text>
                </Pressable>
              ) : (
                <View style={{ gap: 6 }}>
                  {draft.ownedAssets.map((a, idx) => {
                    const active = draft.listingIndex === idx;
                    const summary =
                      a.address.trim().length > 0
                        ? `${a.address}${a.city ? ", " + a.city : ""}${a.state ? " " + a.state : ""}`
                        : "Untitled property (fill in above)";
                    const disabled = a.address.trim().length === 0;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => !disabled && update("listingIndex", idx)}
                        disabled={disabled}
                        accessibilityLabel={`Mark ${summary} as the listing`}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: active ? t.brand : t.line,
                          backgroundColor: active ? t.brandSoft : pressed ? t.surface2 : t.surface,
                          opacity: disabled ? 0.45 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            borderWidth: 2,
                            borderColor: active ? t.brand : t.lineStrong,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {active ? (
                            <View
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: 999,
                                backgroundColor: t.brand,
                              }}
                            />
                          ) : null}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 13,
                            color: active ? t.brand : t.ink,
                            fontWeight: active ? "800" : "600",
                          }}
                          numberOfLines={1}
                        >
                          {summary}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {!sellerValid ? (
                    <Text style={{ fontSize: 11, color: t.warn, marginTop: 4 }}>
                      Pick which property they're listing.
                    </Text>
                  ) : null}
                </View>
              )}
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAware>

      <View
        style={{
          padding: 12,
          paddingBottom: 22,
          borderTopColor: t.line,
          borderTopWidth: 1,
          backgroundColor: t.surface,
          flexDirection: "row",
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => void submit("save")}
          disabled={!canSubmit}
          accessibilityLabel="Save client"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 13,
            borderRadius: 10,
            alignItems: "center",
            backgroundColor: t.surface2,
            borderColor: t.line,
            borderWidth: 1,
            opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: t.ink, fontWeight: "800", fontSize: 13 }}>
            {isSubmitting ? "Saving…" : "Save"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void submit("save_and_invite")}
          disabled={!canSubmit}
          accessibilityLabel="Save and send intake link"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 13,
            borderRadius: 10,
            alignItems: "center",
            backgroundColor: t.brand,
            opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
            {isSubmitting ? "Sending…" : "Save + Send Intake Link"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildLeadIntake(draft: Draft): Record<string, unknown> {
  const owned_assets = draft.ownedAssets
    .filter((a) => a.address.trim().length > 0)
    .map((a, idx) => ({
      address: a.address.trim(),
      city: a.city.trim(),
      state: a.state.trim().toUpperCase(),
      use: a.use,
      value: parseDollars(a.value),
      balance_owed: parseDollars(a.balanceOwed),
      is_listing: draft.side === "seller" && draft.listingIndex === idx,
    }));

  // For sellers, also surface the listing address at the top level so
  // downstream consumers (Realtor AI, prequal hydration) don't have to
  // scan owned_assets to find it.
  const listing =
    draft.side === "seller" && draft.listingIndex != null
      ? owned_assets.find((_a, i) => i === draft.listingIndex) ?? null
      : null;

  return {
    side: draft.side,
    owned_assets,
    listing_address: listing
      ? `${listing.address}${listing.city ? ", " + listing.city : ""}${listing.state ? " " + listing.state : ""}`
      : null,
    cadence_preset: "standard",
  };
}

function parseDollars(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Primitives ──────────────────────────────────────────────────────────

function Field({
  t,
  label,
  required,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: t.ink3,
          letterSpacing: 0.6,
          marginBottom: 6,
        }}
      >
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      {children}
    </View>
  );
}

function SectionLabel({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: t.ink3,
        letterSpacing: 0.6,
        marginBottom: 8,
      }}
    >
      {String(children).toUpperCase()}
    </Text>
  );
}

function Input({
  t,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  autoCapitalize?: "none" | "sentences" | "characters";
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.ink4}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? "sentences"}
      multiline={multiline}
      style={{
        backgroundColor: t.surface2,
        color: t.ink,
        fontSize: 14,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 12 : 10,
        borderColor: t.line,
        borderWidth: 1,
        minHeight: multiline ? 80 : undefined,
        textAlignVertical: multiline ? "top" : "auto",
      }}
    />
  );
}

function SegmentedRow({
  t,
  options,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 10,
              borderRadius: 9,
              alignItems: "center",
              backgroundColor: active ? t.brand : t.surface2,
              borderColor: active ? t.brand : t.line,
              borderWidth: 1,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#fff" : t.ink }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
