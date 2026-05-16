import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import type { RealtorClientProfile } from "@/lib/types";

// Mobile mirror of QCDashboard's RealtorReadinessCard. Renders the
// Realtor Client Intelligence Profile (alembic 0030) on the agent's
// /agent/client/[id] page. Compact layout — bar + KNOWN list +
// MISSING list + next-best-action + tap-to-open-AI-thread button.

interface Props {
  profile: RealtorClientProfile;
  onOpenChat?: () => void;
}

export function RealtorReadinessCard({ profile, onOpenChat }: Props) {
  const { t } = useTheme();
  const score = profile.readiness_score ?? 0;
  const ctype = profile.client_type;
  const headline =
    ctype === "buyer" ? "Buyer Readiness"
    : ctype === "seller" ? "Listing Readiness"
    : ctype === "buyer_and_seller" ? "Client Readiness"
    : "Client Readiness";

  const known = collectKnown(profile);
  const missing = profile.missing_facts ?? [];
  const nextAction = profile.next_best_action;
  const nextQuestion = profile.next_best_question;
  const barColor = score >= 70 ? t.profit : score >= 40 ? t.brand : t.warn;

  return (
    <Card pad={14}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: t.ink3, textTransform: "uppercase", flex: 1 }}>
          {headline}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, marginRight: 8 }}>
          {score}%
        </Text>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
          backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1,
        }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: t.ink3 }}>
            {humanizeStage(profile.relationship_stage)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: "hidden", marginBottom: 12 }}>
        <View style={{ height: "100%", width: `${score}%`, backgroundColor: barColor }} />
      </View>

      {!!profile.intent_summary && (
        <View style={{ padding: 10, borderRadius: 8, backgroundColor: t.brandSoft, marginBottom: 10 }}>
          <Text style={{ fontSize: 12.5, color: t.ink2, lineHeight: 18 }}>
            {profile.intent_summary}
          </Text>
        </View>
      )}

      {known.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: t.ink3, marginBottom: 4 }}>
            Known
          </Text>
          {known.map((line, i) => (
            <Text key={i} style={{ fontSize: 12.5, color: t.ink2, lineHeight: 19 }}>
              <Text style={{ color: t.profit }}>✓ </Text>
              {line}
            </Text>
          ))}
        </View>
      )}

      {missing.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: t.ink3, marginBottom: 4 }}>
            Missing
          </Text>
          {missing.map((field) => (
            <Text key={field} style={{ fontSize: 12.5, color: t.ink2, lineHeight: 19 }}>
              <Text style={{ color: t.warn }}>• </Text>
              {prettifyField(field)}
            </Text>
          ))}
        </View>
      )}

      {(nextAction || nextQuestion) && (
        <View style={{
          padding: 10, borderRadius: 8,
          borderColor: t.line, borderWidth: 1, borderStyle: "dashed",
          backgroundColor: t.surface2, marginBottom: onOpenChat ? 10 : 0,
        }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: t.ink3, marginBottom: 3 }}>
            Next best {nextAction ? "action" : "question"}
          </Text>
          <Text style={{ fontSize: 12.5, color: t.ink, lineHeight: 19 }}>
            {nextAction || nextQuestion}
          </Text>
        </View>
      )}

      {onOpenChat && (
        <Pressable
          onPress={onOpenChat}
          style={({ pressed }) => ({
            paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9,
            backgroundColor: t.brand, alignSelf: "flex-start",
            flexDirection: "row", alignItems: "center", gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="chat" size={12} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>
            Open AI thread
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

function collectKnown(profile: RealtorClientProfile): string[] {
  const out: string[] = [];
  const bp = profile.buyer_profile;
  if (bp) {
    if (bp.target_property_type) out.push(`Looking for ${humanize(bp.target_property_type)}`);
    if (bp.target_location) out.push(`Target: ${bp.target_location}`);
    if (bp.target_budget) out.push(`Budget ~$${bp.target_budget.toLocaleString("en-US")}`);
    if (bp.target_budget_range)
      out.push(`Budget range $${bp.target_budget_range.low.toLocaleString("en-US")}–$${bp.target_budget_range.high.toLocaleString("en-US")}`);
    if (bp.purchase_timeline) out.push(`Timeline: ${humanizeTimeline(bp.purchase_timeline)}`);
    if (bp.financing_needed === true) out.push("Financing needed");
    if (bp.financing_needed === false) out.push("Cash buyer");
    if (bp.buyer_agreement_status === "signed") out.push("Buyer agreement signed");
    if (bp.buyer_agreement_status === "sent") out.push("Buyer agreement sent");
    if (bp.prequalified) out.push("Prequalified");
  }
  const sp = profile.seller_profile;
  if (sp) {
    if (sp.property_address) out.push(`Listing: ${sp.property_address}`);
    if (sp.desired_list_price) out.push(`List ~$${sp.desired_list_price.toLocaleString("en-US")}`);
    if (sp.listing_agreement_status === "signed") out.push("Listing agreement signed");
    if (sp.cma_status === "complete") out.push("CMA complete");
    if (sp.photos_status === "scheduled") out.push("Picture day scheduled");
    if (sp.occupancy_status) out.push(`Occupancy: ${humanize(sp.occupancy_status)}`);
  }
  for (const f of profile.known_facts ?? []) {
    out.push(`${humanize(f.field)}: ${f.value}`);
  }
  return out;
}

function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeTimeline(t: string): string {
  switch (t) {
    case "asap": return "ASAP";
    case "0_30": return "0–30 days";
    case "30_60": return "30–60 days";
    case "60_plus": return "60+ days";
    default: return t;
  }
}

function humanizeStage(s: RealtorClientProfile["relationship_stage"]): string {
  const m: Record<RealtorClientProfile["relationship_stage"], string> = {
    new_lead: "New lead",
    contacted: "Contacted",
    needs_discovery: "Discovery",
    agreement_pending: "Agreement",
    active_client: "Active",
    finance_ready: "Finance ready",
    handoff_to_lending: "Handed off",
    under_contract: "Under contract",
    closed: "Closed",
    lost: "Lost",
  };
  return m[s] ?? s;
}

function prettifyField(field: string): string {
  const tail = field.split(".").pop() ?? field;
  if (tail.toLowerCase() === "cma_status") return "CMA status";
  return humanize(tail);
}
