// Mobile new-loan-file screen — Pipeline tab's create action.
//
// Distinct from /agent/client/new, which creates a CONTACT. This screen
// creates a LOAN FILE for an existing client — the AI nurtures the loan
// (not the person). Submits to POST /intake which finds-or-creates the
// client by email and originates a Loan with property + ask + AI cadence.

import { useMemo, useState } from "react";
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
import { useClients, useCreateLoanFile } from "@/hooks/useApi";
import { LoanTypeOptions, PropertyTypeOptions } from "@/lib/enums.generated";
import type { Client } from "@/lib/types";

type Cadence = "aggressive" | "standard" | "slow";

interface Draft {
  client: Client | null;
  search: string;
  address: string;
  city: string;
  state: string;
  property_type: string;
  loan_type: string;
  amount: string;
  ltv: string;
  cadence: Cadence;
}

const INITIAL: Draft = {
  client: null,
  search: "",
  address: "",
  city: "",
  state: "",
  property_type: "single_family",
  loan_type: "dscr",
  amount: "",
  ltv: "70",
  cadence: "standard",
};

const CADENCE_CHOICES: { value: Cadence; label: string; floor: number }[] = [
  { value: "aggressive", label: "Aggressive", floor: 7.5 },
  { value: "standard", label: "Standard", floor: 8.0 },
  { value: "slow", label: "Slow", floor: 8.5 },
];

export default function AgentNewLoanFileRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateLoanFile();
  const { data: clients = [] } = useClients("mine");
  const [draft, setDraft] = useState<Draft>(INITIAL);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const filteredClients = useMemo(() => {
    if (draft.client) return [];
    const q = draft.search.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clients, draft.search, draft.client]);

  const amountNum = Number(draft.amount.replace(/[^0-9.]/g, ""));
  const ltvNum = Number(draft.ltv);
  const canSubmit =
    !!draft.client &&
    draft.address.trim().length > 0 &&
    draft.loan_type.length > 0 &&
    amountNum > 0 &&
    ltvNum > 0 &&
    ltvNum <= 100 &&
    !create.isPending;

  const onSubmit = async () => {
    if (!draft.client) return;
    if (!draft.client.email) {
      Alert.alert(
        "Missing client email",
        "This client has no email on file. Add one on the client detail page before opening a loan file.",
      );
      return;
    }
    const cadence = CADENCE_CHOICES.find((c) => c.value === draft.cadence) ?? CADENCE_CHOICES[1];
    try {
      const res = await create.mutateAsync({
        borrower: {
          name: draft.client.name,
          email: draft.client.email,
          phone: draft.client.phone ?? "",
        },
        asset: {
          address: draft.address.trim(),
          city: draft.city.trim() || null,
          state: draft.state.trim().toUpperCase() || null,
          property_type: draft.property_type,
        },
        numbers: {
          type: draft.loan_type,
          amount: amountNum,
          ltv: ltvNum,
          // Sane default. Funding team adjusts after kickoff.
          base_rate: cadence.floor,
        },
        ai_rules: {
          floor_rate: cadence.floor,
          max_buy_down_points: 3.0,
          require_soft_pull: true,
          auto_send_terms: true,
          doc_auto_verify: true,
          escalation_delta_bps: 25,
          notify_channel: "push",
          intro_message: null,
        },
      });
      router.replace(`/agent/loan/${res.loan_id}` as Href);
    } catch (e) {
      Alert.alert("Could not create loan file", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
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
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink }}>New funding file</Text>
          <Text style={{ fontSize: 11, color: t.ink3 }}>Loan-file the AI will nurture. Separate from a client record.</Text>
        </View>
      </View>

      <KeyboardAware excludeTabBar>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* Step 1 — Client */}
          <Card pad={14}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: t.ink2, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Client</Text>
            {draft.client ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{draft.client.name}</Text>
                  <Text style={{ fontSize: 12, color: t.ink3 }}>{draft.client.email ?? "—"}</Text>
                </View>
                <Pressable onPress={() => setDraft((d) => ({ ...d, client: null, search: "" }))}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: t.brand }}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={draft.search}
                  onChangeText={(v) => update("search", v)}
                  placeholder="Search client by name or email…"
                  placeholderTextColor={t.ink4}
                  style={{
                    borderWidth: 1, borderColor: t.line, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 10,
                    color: t.ink, fontSize: 14,
                  }}
                />
                {filteredClients.length === 0 && draft.search.trim().length >= 2 ? (
                  <Text style={{ fontSize: 12, color: t.ink3, marginTop: 8 }}>
                    No match. Create the client first on the Clients tab.
                  </Text>
                ) : null}
                <View style={{ gap: 4, marginTop: filteredClients.length ? 8 : 0 }}>
                  {filteredClients.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setDraft((d) => ({ ...d, client: c, search: "" }))}
                      style={{
                        paddingVertical: 8, paddingHorizontal: 10,
                        borderRadius: 8, backgroundColor: t.surface2,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{c.name}</Text>
                      <Text style={{ fontSize: 11, color: t.ink3 }}>{c.email ?? "—"}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </Card>

          {/* Step 2 — Subject property */}
          <Card pad={14}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: t.ink2, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Subject property</Text>
            <TextInput
              value={draft.address}
              onChangeText={(v) => update("address", v)}
              placeholder="Street address"
              placeholderTextColor={t.ink4}
              style={inputStyle(t)}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                value={draft.city}
                onChangeText={(v) => update("city", v)}
                placeholder="City"
                placeholderTextColor={t.ink4}
                style={[inputStyle(t), { flex: 2 }]}
              />
              <TextInput
                value={draft.state}
                onChangeText={(v) => update("state", v.toUpperCase().slice(0, 2))}
                placeholder="ST"
                placeholderTextColor={t.ink4}
                autoCapitalize="characters"
                maxLength={2}
                style={[inputStyle(t), { flex: 1 }]}
              />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {PropertyTypeOptions.map((opt) => (
                <ChipChoice
                  key={opt.value}
                  t={t}
                  label={opt.label}
                  active={draft.property_type === opt.value}
                  onPress={() => update("property_type", opt.value)}
                />
              ))}
            </View>
          </Card>

          {/* Step 3 — Ask */}
          <Card pad={14}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: t.ink2, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Loan ask</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {LoanTypeOptions.map((opt) => (
                <ChipChoice
                  key={opt.value}
                  t={t}
                  label={opt.label}
                  active={draft.loan_type === opt.value}
                  onPress={() => update("loan_type", opt.value)}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 4 }}>Amount ($)</Text>
                <TextInput
                  value={draft.amount}
                  onChangeText={(v) => update("amount", v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="500000"
                  placeholderTextColor={t.ink4}
                  style={inputStyle(t)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 4 }}>LTV (%)</Text>
                <TextInput
                  value={draft.ltv}
                  onChangeText={(v) => update("ltv", v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="70"
                  placeholderTextColor={t.ink4}
                  style={inputStyle(t)}
                />
              </View>
            </View>
          </Card>

          {/* Step 4 — AI cadence */}
          <Card pad={14}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: t.ink2, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>AI cadence</Text>
            <Text style={{ fontSize: 12, color: t.ink3, marginBottom: 8 }}>How aggressively the AI Secretary chases this file. Floor rate is set from the preset; funding team adjusts after kickoff.</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {CADENCE_CHOICES.map((c) => (
                <ChipChoice
                  key={c.value}
                  t={t}
                  label={c.label}
                  active={draft.cadence === c.value}
                  onPress={() => update("cadence", c.value)}
                />
              ))}
            </View>
          </Card>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => ({
              backgroundColor: canSubmit ? t.brand : t.chip,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: canSubmit ? "#fff" : t.ink4, fontWeight: "800", fontSize: 14 }}>
              {create.isPending ? "Creating…" : "Open loan file"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAware>
    </SafeAreaView>
  );
}

function ChipChoice({
  t,
  label,
  active,
  onPress,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? t.brand : t.line,
        backgroundColor: active ? t.brandSoft : t.surface2,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.brand : t.ink2 }}>{label}</Text>
    </Pressable>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: t.ink,
    fontSize: 14,
  } as const;
}
