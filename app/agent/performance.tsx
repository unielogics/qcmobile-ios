import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel, Pill } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { KpiTile } from "@/components/agent/KpiTile";
import { useClients, useLeadFunnel, useLoans } from "@/hooks/useApi";
import { deriveFunnelFromLoans } from "@/lib/agentDerivation";
import { ClientStageOptions, type ClientStage } from "@/lib/enums.generated";
import { Pressable } from "react-native";

const STAGE_LABEL: Record<ClientStage, string> = Object.fromEntries(
  ClientStageOptions.map((o) => [o.value, o.label])
) as Record<ClientStage, string>;

function fmtStat(v: number | null): string {
  if (v == null) return "—";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export default function AgentPerformanceRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: loans = [] } = useLoans("mine");
  const { data: clients = [] } = useClients("mine");
  const { data: funnelFromApi } = useLeadFunnel();
  const funnel = funnelFromApi ?? deriveFunnelFromLoans(loans, clients);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>Performance</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View>
          <SectionLabel>Funnel</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <KpiTile label="Leads (7d)" value={funnel.leads_this_week} />
            <KpiTile label="Contacted" value={funnel.contacted} />
            <KpiTile label="Stale leads" value={funnel.stale_lead_count} accent={funnel.stale_lead_count ? "warn" : "neutral"} />
          </View>
        </View>

        <View>
          <SectionLabel>Velocity</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <KpiTile label="Lead → Prequal" value={`${fmtStat(funnel.lead_to_prequal.value)}d`} />
            <KpiTile label="Prequal → Funded" value={`${fmtStat(funnel.prequal_to_funded.value)}d`} />
            <KpiTile label="Intake completion" value={funnel.intake_completion.value != null ? `${Math.round((funnel.intake_completion.value ?? 0) * 100)}%` : "—"} />
            <KpiTile label="Prequal conversion" value={funnel.prequal_conversion.value != null ? `${Math.round((funnel.prequal_conversion.value ?? 0) * 100)}%` : "—"} />
          </View>
        </View>

        <View>
          <SectionLabel>Clients by stage</SectionLabel>
          <Card pad={14}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(funnel.clients_by_stage).length === 0 ? (
                <Text style={{ fontSize: 13, color: t.ink3 }}>No clients yet.</Text>
              ) : Object.entries(funnel.clients_by_stage).map(([stage, count]) => (
                <Pill key={stage} bg={t.surface2} color={t.ink}>
                  {STAGE_LABEL[stage as ClientStage] ?? stage} · {count}
                </Pill>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
