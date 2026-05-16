import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { TopBar } from "@/components/TopBar";
import { KpiTile } from "@/components/agent/KpiTile";
import { NextActionRow } from "@/components/agent/NextActionRow";
import { AgentLoanCard } from "@/components/agent/AgentLoanCard";
import { AgentRateGrid } from "@/components/agent/AgentRateGrid";
import { AIChatSheet } from "@/components/sheets/AIChatSheet";
import { useAITasks, useClients, useCurrentUser, useLeadFunnel, useLoans, useNextActions } from "@/hooks/useApi";
import { deriveFunnelFromLoans, deriveNextActionsFromLoans } from "@/lib/agentDerivation";
import type { Loan, NextAction } from "@/lib/types";

const ACTIVE_LOAN_STAGES = new Set(["prequalified", "collecting_docs", "lender_connected", "processing", "closing"]);
const CLOSING_SOON_DAYS = 30;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string | undefined | null, email: string | undefined | null): string | null {
  const n = (name ?? "").trim();
  if (n && n !== email) return n.split(" ")[0];
  if (email) return email.split("@")[0].split(".")[0];
  return null;
}

function daysUntil(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (then - Date.now()) / 86_400_000;
}

export function TodayScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans("mine");
  const { data: clients = [] } = useClients("mine");
  const { data: aiTasks = [] } = useAITasks();
  const { data: funnelFromApi } = useLeadFunnel();
  const { data: nextActionsFromApi } = useNextActions();

  const funnel = useMemo(
    () => funnelFromApi ?? deriveFunnelFromLoans(loans, clients),
    [funnelFromApi, loans, clients]
  );
  const nextActions: NextAction[] = useMemo(
    () => nextActionsFromApi ?? deriveNextActionsFromLoans(loans, clients, aiTasks),
    [nextActionsFromApi, loans, clients, aiTasks]
  );

  const activePipeline = loans.filter((l) => ACTIVE_LOAN_STAGES.has(l.stage)).length;
  const stuck = loans.filter((l) => l.deal_health === "stuck" || l.deal_health === "at_risk");
  const closingSoon = loans.filter((l) => {
    if (l.stage === "funded") return false;
    const d = daysUntil(l.close_date);
    return d <= CLOSING_SOON_DAYS && d >= 0;
  }).sort((a, b) => daysUntil(a.close_date) - daysUntil(b.close_date));

  const callToday = nextActions.filter((a) => a.kind === "call_lead" || a.kind === "chase_doc" || a.kind === "pending_task");

  const clientNameOf = (l: Loan) => clients.find((c) => c.id === l.client_id)?.name;

  const goAction = (a: NextAction) => {
    if (a.target_type === "loan") router.push(`/agent/loan/${a.target_id}` as Href);
    else if (a.target_type === "client") router.push(`/agent/client/${a.target_id}` as Href);
    else router.push("/agent/today" as Href);
  };

  const name = firstName(user?.name, user?.email);
  const [showAIChat, setShowAIChat] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Today" onAIPress={() => setShowAIChat(true)} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, color: t.ink3, fontWeight: "600" }}>{greeting()}{name ? "," : ""}</Text>
          {name ? <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, marginTop: 2 }}>{name}</Text> : null}
        </View>

        <View>
          <SectionLabel>At a glance</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <KpiTile
              label="New leads (7d)"
              value={funnel.leads_this_week}
              onPress={() => router.push("/agent/(tabs)/pipeline?mode=leads" as Href)}
            />
            <KpiTile
              label="Active pipeline"
              value={activePipeline}
              onPress={() => router.push("/agent/(tabs)/pipeline" as Href)}
            />
            <KpiTile
              label="Stuck"
              value={stuck.length}
              accent={stuck.length ? "danger" : "neutral"}
              onPress={() => router.push("/agent/(tabs)/pipeline?filter=stuck" as Href)}
            />
            <KpiTile
              label="Closing ≤30d"
              value={closingSoon.length}
              accent={closingSoon.length ? "profit" : "neutral"}
              onPress={() => router.push("/agent/(tabs)/pipeline?filter=closing30" as Href)}
            />
          </View>
        </View>

        <View>
          <SectionLabel action={
            <Text
              onPress={() => router.push("/agent/rates" as Href)}
              style={{ fontSize: 11, fontWeight: "700", color: t.brand, letterSpacing: 0.4 }}
            >
              VIEW ALL ›
            </Text>
          }>Rates today</SectionLabel>
          <AgentRateGrid />
        </View>

        <View>
          <SectionLabel>Call today</SectionLabel>
          {callToday.length === 0 ? (
            <Card pad={18}>
              <Text style={{ fontSize: 13, color: t.ink2 }}>Nothing pressing — your call list is clear.</Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {callToday.slice(0, 6).map((a) => (
                <NextActionRow key={a.id} action={a} onPress={() => goAction(a)} />
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionLabel>Stuck</SectionLabel>
          {stuck.length === 0 ? (
            <Card pad={18}>
              <Text style={{ fontSize: 13, color: t.ink2 }}>No deals at risk. Nice.</Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {stuck.map((l) => (
                <AgentLoanCard
                  key={l.id}
                  loan={l}
                  clientName={clientNameOf(l)}
                  hint="Open the deal to see the blocker."
                  onPress={() => router.push(`/agent/loan/${l.id}` as Href)}
                />
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionLabel>Can close</SectionLabel>
          {closingSoon.length === 0 ? (
            <Card pad={18}>
              <Text style={{ fontSize: 13, color: t.ink2 }}>Nothing on the 30-day horizon.</Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {closingSoon.map((l) => {
                const d = Math.max(0, Math.round(daysUntil(l.close_date)));
                return (
                  <AgentLoanCard
                    key={l.id}
                    loan={l}
                    clientName={clientNameOf(l)}
                    hint={`Closing in ${d} day${d === 1 ? "" : "s"}.`}
                    onPress={() => router.push(`/agent/loan/${l.id}` as Href)}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <AIChatSheet
        visible={showAIChat}
        onClose={() => setShowAIChat(false)}
        context="Account-wide"
      />
    </SafeAreaView>
  );
}
