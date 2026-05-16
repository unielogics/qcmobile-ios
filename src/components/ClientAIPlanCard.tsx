// Mobile mirror of the desktop ClientAIPlanCard — plain-language version.
//
// Same five blocks the agent scans:
//   1. Status (lead kind · phase · readiness %)
//   2. AI's Next Move
//   3. What We Know
//   4. What We Still Need / Documents / Appointments
//   5. Custom Instructions + Save / Test buttons
//
// No backend vocabulary on this screen — chips read Required /
// Recommended / Optional / Locked by Funding / Needed Later.

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import {
  useClient,
  useClientAIPlan,
  usePatchClientAIPlan,
  type ClientAIPlanItem,
} from "@/hooks/useApi";

interface Props {
  clientId: string;
  loanId?: string | null;
}


export function ClientAIPlanCard({ clientId, loanId }: Props) {
  const { t } = useTheme();
  const { data: plan, isLoading } = useClientAIPlan(clientId, loanId ?? null);
  const { data: client } = useClient(clientId);
  const patch = usePatchClientAIPlan();

  const [instr, setInstr] = useState<string>("");
  useEffect(() => { setInstr(plan?.custom_instructions || ""); }, [plan?.custom_instructions]);

  const open = useMemo(
    () => (plan?.required_items || []).filter(i =>
      i.status === "missing" || i.status === "asked" || i.status === "needed_later",
    ),
    [plan?.required_items],
  );
  const facts = open.filter(i => i.category === "fact");
  const docs = open.filter(i => i.category === "document" || i.category === "agreement");
  const appts = open.filter(i => i.category === "appointment" || i.category === "task");
  const known = useMemo(() => collectKnown(client?.realtor_profile), [client?.realtor_profile]);

  if (isLoading || !plan) {
    return (
      <Card pad={16}>
        <Text style={{ color: t.muted, fontSize: 13 }}>
          {isLoading ? "Loading AI plan…" : "No AI plan yet for this client."}
        </Text>
      </Card>
    );
  }

  const ctype = (client?.realtor_profile as Record<string, unknown> | undefined)?.client_type as string | undefined;
  const leadKind =
    ctype === "buyer" ? "Buyer Lead"
    : ctype === "seller" ? "Seller Lead"
    : ctype === "buyer_and_seller" ? "Buyer + Seller Lead"
    : "Lead";
  const phaseLabel = plan.current_phase === "lending" ? "Lending Phase" : "Realtor Phase";

  return (
    <Card pad={16}>
      {/* Status */}
      <View style={{ marginBottom: 12 }}>
        <SectionLabel>Client AI Plan</SectionLabel>
        <Text style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>
          {leadKind} · {phaseLabel} · {plan.readiness_score ?? 0}% Ready
        </Text>
      </View>

      {/* AI's Next Move */}
      {plan.next_best_question ? (
        <View style={{
          padding: 12, marginBottom: 14, borderRadius: 8,
          backgroundColor: t.surface2,
        }}>
          <Text style={{
            fontSize: 11, fontWeight: "700", color: t.muted, marginBottom: 4,
            textTransform: "uppercase",
          }}>
            AI&apos;s Next Move
          </Text>
          <Text style={{ fontSize: 14, color: t.ink, lineHeight: 20 }}>
            {plan.next_best_question}
          </Text>
        </View>
      ) : null}

      {/* What We Know */}
      {known.length > 0 ? (
        <Bucket title="What We Know" t={t}>
          {known.map((k, i) => (
            <Text key={i} style={{ fontSize: 13, color: t.ink, paddingVertical: 3 }}>
              · {k}
            </Text>
          ))}
        </Bucket>
      ) : null}

      {/* What We Still Need */}
      {facts.length > 0 ? (
        <Bucket title="What We Still Need" t={t}>
          {facts.map(item => <PlainRow key={item.requirement_key} item={item} t={t} />)}
        </Bucket>
      ) : null}

      {/* Documents */}
      {docs.length > 0 ? (
        <Bucket title="Documents" t={t}>
          {docs.map(item => <PlainRow key={item.requirement_key} item={item} t={t} />)}
        </Bucket>
      ) : null}

      {/* Appointments */}
      {appts.length > 0 ? (
        <Bucket title="Appointments" t={t}>
          {appts.map(item => <PlainRow key={item.requirement_key} item={item} t={t} />)}
        </Bucket>
      ) : null}

      {/* Waived */}
      {(plan.waived_items || []).length > 0 ? (
        <Bucket title="Waived for this client" t={t}>
          {plan.waived_items.map(w => (
            <Text key={w.requirement_key} style={{
              fontSize: 13, color: t.muted,
              textDecorationLine: "line-through", paddingVertical: 3,
            }}>
              · {w.label}
            </Text>
          ))}
        </Bucket>
      ) : null}

      {/* Custom Instructions */}
      <Bucket title="Custom Instructions" t={t}>
        <TextInput
          value={instr}
          onChangeText={setInstr}
          placeholder='e.g. "For this client, don&apos;t push prequal too hard yet."'
          multiline
          numberOfLines={3}
          style={{
            padding: 10, fontSize: 13,
            borderRadius: 8, borderWidth: 1, borderColor: t.border,
            backgroundColor: t.surface, color: t.ink,
            textAlignVertical: "top", minHeight: 70,
          }}
        />
      </Bucket>

      <Pressable
        onPress={() => patch.mutate({ clientId, loanId: loanId ?? null, custom_instructions: instr || null })}
        disabled={patch.isPending || instr === (plan.custom_instructions || "")}
        style={{
          marginTop: 8, paddingVertical: 10, paddingHorizontal: 14,
          borderRadius: 6, alignSelf: "flex-start",
          backgroundColor: t.accent,
          opacity: patch.isPending || instr === (plan.custom_instructions || "") ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
          {patch.isPending ? "Saving…" : "Save Instructions"}
        </Text>
      </Pressable>
    </Card>
  );
}


function PlainRow({
  item, t,
}: {
  item: ClientAIPlanItem;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const chip = chipFor(item);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.border,
    }}>
      <Text style={{ flex: 1, fontSize: 13, color: t.ink }}>{item.label}</Text>
      <Text style={{
        fontSize: 10, fontWeight: "700",
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
        backgroundColor: chip.bg, color: chip.color, textTransform: "uppercase",
      }}>
        {chip.label}
      </Text>
    </View>
  );
}


function chipFor(item: ClientAIPlanItem): { label: string; bg: string; color: string } {
  if (item.status === "needed_later") return { label: "Needed Later", bg: "#f0e5d0", color: "#7a5e22" };
  if (item.source === "funding_required" && !item.can_agent_override) {
    return { label: "🔒 Funding", bg: "#fff2dd", color: "#a06000" };
  }
  if (item.required_level === "required") return { label: "Required", bg: "#fde0e0", color: "#c14444" };
  if (item.required_level === "recommended") return { label: "Recommended", bg: "#e0e8fd", color: "#3a55b8" };
  return { label: "Optional", bg: "#eee", color: "#666" };
}


function collectKnown(profile: unknown): string[] {
  const p = (profile || {}) as Record<string, unknown>;
  const bp = (p.buyer_profile || {}) as Record<string, unknown>;
  const sp = (p.seller_profile || {}) as Record<string, unknown>;
  const out: string[] = [];
  if (bp.target_property_type) out.push(`Looking for ${String(bp.target_property_type).replace(/_/g, " ")} property`);
  if (bp.target_location) out.push(`Wants ${bp.target_location}`);
  if (bp.target_budget) out.push(`Budget around $${Number(bp.target_budget).toLocaleString()}`);
  if (bp.financing_needed === true) out.push("Financing likely needed");
  if (bp.financing_needed === false) out.push("Cash buyer — no financing");
  if (bp.purchase_timeline) out.push(`Timeline: ${String(bp.purchase_timeline).replace(/_/g, "–")}`);
  if (sp.property_address) out.push(`Selling: ${sp.property_address}`);
  if (sp.desired_list_price) out.push(`List price ~$${Number(sp.desired_list_price).toLocaleString()}`);
  return out.slice(0, 10);
}


function Bucket({
  title, children, t,
}: {
  title: string;
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{
        fontSize: 11, fontWeight: "700", color: t.muted,
        marginBottom: 6, textTransform: "uppercase",
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
