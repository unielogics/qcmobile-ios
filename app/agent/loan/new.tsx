// Mobile new funding-file wizard (broker only — the /agent/* tree is
// broker-gated). 4 steps mirroring the web SmartIntakeModal so the
// broker configures the same thing on either platform:
//   Borrower → Asset → Numbers → AI & Messaging
// Submits to POST /intake (find-or-create client + originate Loan).

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import { useClients, useCreateLoanFile } from "@/hooks/useApi";
import {
  EntityTypeOptions,
  ExperienceTierOptions,
  LoanTypeOptions,
  PropertyTypeOptions,
} from "@/lib/enums.generated";
import type { Client } from "@/lib/types";

type T = ReturnType<typeof useTheme>["t"];
type Side = "buyer" | "seller";
type Purpose = "purchase" | "refinance";
type Unit = "days" | "hours";

const STEPS = ["Borrower", "Asset", "Numbers", "AI & Messaging"] as const;

const SOURCE_OPTS = [
  { value: "direct_borrower", label: "Direct borrower" },
  { value: "agent_referral", label: "Agent referral" },
  { value: "existing_client", label: "Existing client" },
  { value: "website", label: "Website" },
  { value: "phone_call", label: "Phone call" },
  { value: "other", label: "Other" },
] as const;

interface CustomDoc {
  name: string;
  offset: string; // numeric string, in `docUnit`
}

interface Draft {
  client: Client | null;
  search: string;
  name: string;
  email: string;
  phone: string;
  entity_type: string;
  entity_name: string;
  experience: string;
  sourceAttribution: string;
  side: Side;
  purpose: Purpose;
  loan_type: string;
  address: string;
  city: string;
  state: string;
  property_type: string;
  amount: string;
  ltv: string;
  // AI & Messaging
  startValue: string;
  startUnit: Unit;
  docUnit: Unit;
  customDocs: CustomDoc[];
}

const INITIAL: Draft = {
  client: null,
  search: "",
  name: "",
  email: "",
  phone: "",
  entity_type: "individual",
  entity_name: "",
  experience: "1_2_flips",
  sourceAttribution: "direct_borrower",
  side: "buyer",
  purpose: "purchase",
  loan_type: "dscr",
  address: "",
  city: "",
  state: "",
  property_type: "single_family",
  amount: "",
  ltv: "70",
  startValue: "0",
  startUnit: "days",
  docUnit: "days",
  customDocs: [],
};

export default function AgentNewLoanFileRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateLoanFile();
  const { data: clients = [] } = useClients("mine");
  const [d, setD] = useState<Draft>(INITIAL);
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  const filteredClients = useMemo(() => {
    if (d.client) return [];
    const q = d.search.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clients, d.search, d.client]);

  const locked = !!d.client;
  const bName = locked ? d.client!.name : d.name;
  const bEmail = locked ? d.client!.email ?? "" : d.email;
  const bPhone = locked ? d.client!.phone ?? "" : d.phone;

  const amountNum = Number(d.amount.replace(/[^0-9.]/g, ""));
  const ltvNum = Number(d.ltv);

  const stepValid = (s: (typeof STEPS)[number]): boolean => {
    if (s === "Borrower")
      return bName.trim().length > 0 && bEmail.trim().length > 3;
    if (s === "Asset") return d.address.trim().length > 0;
    if (s === "Numbers")
      return amountNum > 0 && ltvNum > 0 && ltvNum <= 100;
    return true;
  };

  const startDelayDays = (() => {
    const v = Number(d.startValue.replace(/[^0-9.]/g, "")) || 0;
    return d.startUnit === "hours" ? Math.round(v / 24) : Math.round(v);
  })();

  const onSubmit = async () => {
    if (!bEmail.trim()) {
      Alert.alert("Missing email", "A borrower email is required to open a loan file.");
      return;
    }
    const today = new Date();
    const add_items = d.customDocs
      .filter((c) => c.name.trim().length > 0)
      .map((c) => {
        const n = Number(c.offset.replace(/[^0-9.]/g, "")) || 0;
        const days = d.docUnit === "hours" ? Math.round(n / 24) : Math.round(n);
        const due = new Date(today);
        due.setDate(due.getDate() + (days > 0 ? days : 7));
        return { name: c.name.trim(), due_date: due.toISOString().slice(0, 10) };
      });
    const doc_overrides =
      add_items.length > 0 || startDelayDays > 0
        ? {
            skip_names: [],
            due_offset_overrides: {},
            add_items,
            ...(startDelayDays > 0
              ? { collection_start_delay_days: startDelayDays }
              : {}),
          }
        : undefined;
    try {
      const res = await create.mutateAsync({
        borrower: {
          name: bName.trim(),
          email: bEmail.trim(),
          phone: bPhone.trim(),
          entity_type: d.entity_type,
          entity_name: d.entity_name.trim() || null,
          experience: d.experience,
        },
        asset: {
          address: d.address.trim(),
          city: d.city.trim() || null,
          state: d.state.trim().toUpperCase() || null,
          property_type: d.property_type,
          annual_taxes: 0,
          annual_insurance: 0,
        },
        numbers: {
          type: d.loan_type,
          purpose: d.purpose === "refinance" ? "cash_out_refi" : "purchase",
          amount: amountNum,
          ltv: ltvNum,
          base_rate: 8.0,
        },
        ai_rules: {
          floor_rate: 8.0,
          max_buy_down_points: 1.5,
          require_soft_pull: true,
          auto_send_terms: false,
          doc_auto_verify: true,
          escalation_delta_bps: 25,
          // Brokers are locked to app push for now (parity with web).
          notify_channel: "push",
          intro_message: null,
        },
        deal_side: d.side,
        source_attribution: d.sourceAttribution,
        ...(doc_overrides ? { document_overrides: doc_overrides } : {}),
      });
      router.replace(`/agent/loan/${res.loan_id}` as Href);
    } catch (e) {
      Alert.alert("Could not create loan file", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink }}>New funding file</Text>
          <Text style={{ fontSize: 11, color: t.ink3 }}>
            Step {stepIdx + 1}/{STEPS.length} · {step}
          </Text>
        </View>
      </View>

      <KeyboardAware excludeTabBar>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {step === "Borrower" ? (
            <Card pad={14}>
              <SectionLabel t={t}>Buyer or Seller</SectionLabel>
              <Segmented
                t={t}
                value={d.side}
                opts={[
                  { value: "buyer", label: "Buyer" },
                  { value: "seller", label: "Seller" },
                ]}
                onChange={(v) => set("side", v as Side)}
              />
              <View style={{ height: 12 }} />
              <SectionLabel t={t}>Purpose</SectionLabel>
              <Segmented
                t={t}
                value={d.purpose}
                opts={[
                  { value: "purchase", label: "Purchase" },
                  { value: "refinance", label: "Refinance" },
                ]}
                onChange={(v) => set("purpose", v as Purpose)}
              />
              <View style={{ height: 12 }} />
              <SectionLabel t={t}>Loan program</SectionLabel>
              <Chips
                t={t}
                value={d.loan_type}
                opts={LoanTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => set("loan_type", v)}
              />
              <View style={{ height: 14 }} />
              <SectionLabel t={t}>Find an existing client</SectionLabel>
              {d.client ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{d.client.name}</Text>
                    <Text style={{ fontSize: 12, color: t.ink3 }}>{d.client.email ?? "—"}</Text>
                  </View>
                  <Pressable onPress={() => setD((p) => ({ ...p, client: null, search: "" }))}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: t.brand }}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextInput
                    value={d.search}
                    onChangeText={(v) => set("search", v)}
                    placeholder="Search by name or email…"
                    placeholderTextColor={t.ink4}
                    style={inputStyle(t)}
                  />
                  <View style={{ gap: 4, marginTop: filteredClients.length ? 8 : 0 }}>
                    {filteredClients.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => setD((p) => ({ ...p, client: c, search: "" }))}
                        style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.surface2 }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{c.name}</Text>
                        <Text style={{ fontSize: 11, color: t.ink3 }}>{c.email ?? "—"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
                    No match? Fill the fields below — we&apos;ll create a new client.
                  </Text>
                  <View style={{ height: 10 }} />
                  <Fld t={t} label="Name" value={d.name} onChange={(v) => set("name", v)} />
                  <Fld t={t} label="Email" value={d.email} onChange={(v) => set("email", v)} />
                  <Fld t={t} label="Phone" value={d.phone} onChange={(v) => set("phone", v)} />
                  <SectionLabel t={t}>Entity type</SectionLabel>
                  <Chips
                    t={t}
                    value={d.entity_type}
                    opts={EntityTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
                    onChange={(v) => set("entity_type", v)}
                  />
                  <View style={{ height: 8 }} />
                  <Fld t={t} label="Entity name" value={d.entity_name} onChange={(v) => set("entity_name", v)} />
                  <SectionLabel t={t}>Experience</SectionLabel>
                  <Chips
                    t={t}
                    value={d.experience}
                    opts={ExperienceTierOptions.map((o) => ({ value: o.value, label: o.label }))}
                    onChange={(v) => set("experience", v)}
                  />
                </>
              )}
              <View style={{ height: 14 }} />
              <SectionLabel t={t}>Source attribution</SectionLabel>
              <Chips
                t={t}
                value={d.sourceAttribution}
                opts={SOURCE_OPTS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => set("sourceAttribution", v)}
              />
            </Card>
          ) : null}

          {step === "Asset" ? (
            <Card pad={14}>
              <SectionLabel t={t}>Subject property</SectionLabel>
              <Fld t={t} label="Street address" value={d.address} onChange={(v) => set("address", v)} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 2 }}>
                  <Fld t={t} label="City" value={d.city} onChange={(v) => set("city", v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Fld t={t} label="State" value={d.state} onChange={(v) => set("state", v.toUpperCase().slice(0, 2))} />
                </View>
              </View>
              <SectionLabel t={t}>Property type</SectionLabel>
              <Chips
                t={t}
                value={d.property_type}
                opts={PropertyTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => set("property_type", v)}
              />
            </Card>
          ) : null}

          {step === "Numbers" ? (
            <Card pad={14}>
              <SectionLabel t={t}>Loan ask</SectionLabel>
              <Fld t={t} label="Amount ($)" value={d.amount} onChange={(v) => set("amount", v.replace(/[^0-9]/g, ""))} keyboard="number-pad" />
              <Fld t={t} label="LTV (%)" value={d.ltv} onChange={(v) => set("ltv", v.replace(/[^0-9.]/g, ""))} keyboard="decimal-pad" />
              <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>
                Funding team tunes precise terms after kickoff.
              </Text>
            </Card>
          ) : null}

          {step === "AI & Messaging" ? (
            <Card pad={14}>
              <SectionLabel t={t}>Preferred channel</SectionLabel>
              <View style={{ padding: 11, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2 }}>
                <Text style={{ fontSize: 13, color: t.ink }}>App push only</Text>
              </View>

              <View style={{ height: 14 }} />
              <SectionLabel t={t}>Start collecting</SectionLabel>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={d.startValue}
                  onChangeText={(v) => set("startValue", v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  style={[inputStyle(t), { width: 80 }]}
                />
                <Segmented
                  t={t}
                  value={d.startUnit}
                  opts={[
                    { value: "hours", label: "Hours" },
                    { value: "days", label: "Days" },
                  ]}
                  onChange={(v) => set("startUnit", v as Unit)}
                  compact
                />
              </View>
              <Text style={{ fontSize: 11, color: t.ink4, marginTop: 6 }}>
                {startDelayDays <= 0
                  ? "Outreach starts immediately when you create the file."
                  : `AI waits ~${startDelayDays} day(s) before chasing documents. Hours convert to whole days.`}
              </Text>

              <View style={{ height: 14 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <SectionLabel t={t}>Documents to collect</SectionLabel>
                <Segmented
                  t={t}
                  value={d.docUnit}
                  opts={[
                    { value: "hours", label: "Hours" },
                    { value: "days", label: "Days" },
                  ]}
                  onChange={(v) => set("docUnit", v as Unit)}
                  compact
                />
              </View>
              {d.customDocs.map((c, idx) => (
                <View key={idx} style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <TextInput
                    value={c.name}
                    onChangeText={(v) =>
                      set("customDocs", d.customDocs.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                    }
                    placeholder="Document name"
                    placeholderTextColor={t.ink4}
                    style={[inputStyle(t), { flex: 1 }]}
                  />
                  <TextInput
                    value={c.offset}
                    onChangeText={(v) =>
                      set("customDocs", d.customDocs.map((x, i) => (i === idx ? { ...x, offset: v.replace(/[^0-9]/g, "") } : x)))
                    }
                    keyboardType="number-pad"
                    placeholder="7"
                    placeholderTextColor={t.ink4}
                    style={[inputStyle(t), { width: 56 }]}
                  />
                  <Pressable
                    onPress={() => set("customDocs", d.customDocs.filter((_, i) => i !== idx))}
                    hitSlop={8}
                  >
                    <Icon name="x" size={14} color={t.danger} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => set("customDocs", [...d.customDocs, { name: "", offset: "7" }])}
                style={{ marginTop: 10, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: t.line }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink2 }}>+ Add document</Text>
              </Pressable>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Pressable
              onPress={() => setStepIdx((x) => Math.max(0, x - 1))}
              disabled={stepIdx === 0}
              style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: t.line, opacity: stepIdx === 0 ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink2 }}>Back</Text>
            </Pressable>
            {step !== "AI & Messaging" ? (
              <Pressable
                onPress={() => stepValid(step) && setStepIdx((x) => Math.min(STEPS.length - 1, x + 1))}
                disabled={!stepValid(step)}
                style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: stepValid(step) ? t.brand : t.chip }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: stepValid(step) ? "#fff" : t.ink4 }}>Next</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onSubmit}
                disabled={create.isPending}
                style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: create.isPending ? t.chip : t.brand }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: create.isPending ? t.ink4 : "#fff" }}>
                  {create.isPending ? "Creating…" : "Open loan file"}
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAware>
    </SafeAreaView>
  );
}

function SectionLabel({ t, children }: { t: T; children: ReactNode }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function Fld({
  t,
  label,
  value,
  onChange,
  keyboard,
}: {
  t: T;
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: "number-pad" | "decimal-pad";
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        placeholderTextColor={t.ink4}
        style={inputStyle(t)}
      />
    </View>
  );
}

function Segmented({
  t,
  value,
  opts,
  onChange,
  compact,
}: {
  t: T;
  value: string;
  opts: { value: string; label: string }[];
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: t.line, borderRadius: 10, overflow: "hidden" }}>
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{ flex: compact ? 0 : 1, paddingVertical: compact ? 7 : 10, paddingHorizontal: compact ? 14 : 0, alignItems: "center", backgroundColor: active ? t.brand : "transparent" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : t.ink3 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chips({
  t,
  value,
  opts,
  onChange,
}: {
  t: T;
  value: string;
  opts: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: active ? t.brand : t.line, backgroundColor: active ? t.brandSoft : t.surface2 }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.brand : t.ink2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function inputStyle(t: T) {
  return {
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: t.ink,
    fontSize: 14,
    backgroundColor: t.surface2,
  } as const;
}
