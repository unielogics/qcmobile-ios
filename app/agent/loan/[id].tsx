// Agent-side loan detail screen — full cockpit.
//
// Tabs (Phase 3 expansion + Phase 4 chat rewire):
//   - Snapshot   : funding mirror (existing read-only summary)
//   - Docs       : document list with verify / flag / request actions
//   - Criteria   : loan criteria viewer/editor
//   - Conditions : underwriting condition checklist
//   - HUD        : HUD lines viewer / editor
//   - Pre-Qual   : prequal request list + new request entry
//   - Messages   : SAME loan-chat the client sees, with the 4-mode
//                  composer (Live Chat / Ask Elara / Suggest / Instruct)
//   - AI         : Elara questions + tasks
//   - Lender     : lender thread + connect/disconnect
//   - Activity   : audit feed

import { useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon, type IconName } from "@/design-system/Icon";
import { DocumentRequestList } from "@/components/DocumentRequestList";
import { DealHealthPill } from "@/components/agent/DealHealthPill";
import { PauseBanner } from "@/components/loan/PauseBanner";
import { LoanChatThread } from "@/components/loan/LoanChatThread";
import { LoanChatComposer } from "@/components/loan/LoanChatComposer";
import { KeyboardAware } from "@/components/KeyboardAware";
import { CriteriaTab } from "@/components/agent/loan/CriteriaTab";
import { ConditionsTab } from "@/components/agent/loan/ConditionsTab";
import { HudTab } from "@/components/agent/loan/HudTab";
import { PrequalTab } from "@/components/agent/loan/PrequalTab";
import { AISecretaryTab } from "@/components/agent/loan/AISecretaryTab";
import { LenderChatTab } from "@/components/agent/loan/LenderChatTab";
import { QC_FMT } from "@/design-system/tokens";
import {
  useCurrentUser,
  useDocuments,
  useLoan,
  useLoanActivity,
  useLoanChat,
  useLoanWorkspace,
} from "@/hooks/useApi";
import { LoanStageOptions, type LoanStage } from "@/lib/enums.generated";
import type { Activity, Document, Loan } from "@/lib/types";

type Tab =
  | "snapshot"
  | "docs"
  | "criteria"
  | "conditions"
  | "prequal"
  | "hud"
  | "messages"
  | "ai"
  | "lender"
  | "activity";

const TABS: { value: Tab; label: string; icon: IconName }[] = [
  { value: "snapshot",   label: "Snapshot",   icon: "file" },
  { value: "messages",   label: "Chat",       icon: "chat" },
  { value: "docs",       label: "Docs",       icon: "vault" },
  { value: "criteria",   label: "Criteria",   icon: "sliders" },
  { value: "conditions", label: "Conditions", icon: "shield" },
  { value: "prequal",    label: "Pre-Qual",   icon: "docCheck" },
  { value: "hud",        label: "HUD",        icon: "calc" },
  { value: "ai",         label: "AI",         icon: "spark" },
  { value: "lender",     label: "Lender",     icon: "building2" },
  { value: "activity",   label: "Activity",   icon: "audit" },
];

const BOTTOM_BAR_PAD = 88;

const STAGE_LABEL: Record<LoanStage, string> = Object.fromEntries(
  LoanStageOptions.map((o) => [o.value, o.label])
) as Record<LoanStage, string>;

export default function AgentLoanRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = BOTTOM_BAR_PAD + insets.bottom;
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const initialTab: Tab = (TABS.find((t) => t.value === tabParam)?.value ?? "snapshot") as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [copied, setCopied] = useState(false);

  const { data: loan } = useLoan(id);
  const { data: docs = [] } = useDocuments(id);
  const { data: activity = [] } = useLoanActivity(id);
  const { data: me } = useCurrentUser();
  const viewerRole = (me?.role === "super_admin" || me?.role === "loan_exec" || me?.role === "broker")
    ? me.role
    : "broker";
  // Activity scope: brokers only see their own actions (what they
  // did on this deal). Super-admin / loan_exec see the full audit
  // feed. Filtered client-side because /loans/{id}/activity doesn't
  // expose a scope= parameter yet.
  const visibleActivity = viewerRole === "broker"
    ? activity.filter((a) => a.actor_id != null && me?.id != null && a.actor_id === me.id)
    : activity;
  // Hide the Lender tab from brokers — the lender conversation is
  // an ops-only surface. Super-admin / loan_exec keep it.
  const visibleTabs = TABS.filter((tt) => tt.value !== "lender" || viewerRole !== "broker");

  if (!loan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: t.ink3 }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const shareDealId = async () => {
    try {
      await Share.share({ message: loan.deal_id });
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user dismissed */
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      {/* Slim header — identical on every tab. Address + type · L-id
          + value + close X. No DealHealthPill / summary block here
          (that detail lives in the Snapshot tab). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink }} numberOfLines={1}>
            {loan.address || "Subject property"}
          </Text>
          <Pressable onPress={shareDealId} hitSlop={6}>
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }} numberOfLines={1}>
              {String(loan.type).replace(/_/g, " ")} · {loan.deal_id}{copied ? " · shared" : ""}
            </Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 15, fontWeight: "700", color: t.ink, letterSpacing: -0.3 }}>
          {QC_FMT.short(Number(loan.amount || 0))}
        </Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Close"
          style={{
            width: 32, height: 32, borderRadius: 999,
            backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name="x" size={16} color={t.ink} />
        </Pressable>
      </View>

      {/* Pause banner — visible across every tab while AI is paused */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <PauseBanner loanId={loan.id} />
      </View>

      {/* Horizontally scrollable tab strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: t.line }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 8 }}
      >
        {visibleTabs.map((tt) => {
          const active = tab === tt.value;
          return (
            <Pressable
              key={tt.value}
              onPress={() => setTab(tt.value)}
              accessibilityLabel={tt.label}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: active ? t.brandSoft : t.surface2,
                borderWidth: 1,
                borderColor: active ? t.brand : t.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name={tt.icon} size={13} color={active ? t.brand : t.ink2} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.brand : t.ink2 }}>
                {tt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {tab === "snapshot" ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottomPad }}>
            <AgentFundingMirror loan={loan} docs={docs} activity={activity} />
          </ScrollView>
        ) : tab === "docs" ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottomPad }}>
            <DocumentRequestList documents={docs} />
          </ScrollView>
        ) : tab === "criteria" ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <CriteriaTab loanId={loan.id} />
          </ScrollView>
        ) : tab === "conditions" ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <ConditionsTab loanId={loan.id} />
          </ScrollView>
        ) : tab === "prequal" ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <PrequalTab loanId={loan.id} clientId={loan.client_id} />
          </ScrollView>
        ) : tab === "hud" ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <HudTab loanId={loan.id} loanAmount={Number(loan.amount || 0)} />
          </ScrollView>
        ) : tab === "messages" ? (
          <LoanMessagesTab loanId={loan.id} dealId={loan.deal_id} address={loan.address} viewerRole={viewerRole} />
        ) : tab === "ai" ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <AISecretaryTab loanId={loan.id} />
          </ScrollView>
        ) : tab === "lender" ? (
          <LenderChatTab loanId={loan.id} bottomPad={bottomPad} />
        ) : tab === "activity" ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: bottomPad }}>
            {visibleActivity.length === 0 ? (
              <Card pad={18}>
                <Text style={{ fontSize: 13, color: t.ink3 }}>
                  {viewerRole === "broker"
                    ? "You haven't taken any actions on this deal yet."
                    : "No activity recorded yet."}
                </Text>
              </Card>
            ) : (
              <Card pad={14}>
                {visibleActivity.map((a, i, arr) => (
                  <View
                    key={a.id}
                    style={{ paddingVertical: 8, borderBottomColor: t.line, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }}
                  >
                    <Text style={{ fontSize: 12, color: t.ink, fontWeight: "600" }} numberOfLines={2}>{a.summary}</Text>
                    <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{new Date(a.occurred_at).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            )}
          </ScrollView>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function LoanMessagesTab({
  loanId,
  dealId,
  address,
  viewerRole,
}: {
  loanId: string;
  dealId: string;
  address: string;
  viewerRole: "broker" | "super_admin" | "loan_exec" | "client";
}) {
  const { t } = useTheme();
  const { data: chat = [] } = useLoanChat(loanId);
  // Workspace is queried separately so the PauseBanner above stays
  // in sync even when the messages tab isn't open. Here we just
  // need the chat list.
  useLoanWorkspace(loanId);

  if (viewerRole === "client") {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: t.ink3, fontSize: 13 }}>This view is for operators.</Text>
      </View>
    );
  }

  return (
    <KeyboardAware excludeTabBar>
      {/* Sticky deal-id strip so it's obvious which file/thread this
          composer writes into — the broker may have several files open
          in adjacent tabs. */}
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 16, paddingVertical: 8,
          borderBottomColor: t.line, borderBottomWidth: 1,
          backgroundColor: t.surface,
        }}
      >
        <View
          style={{
            paddingHorizontal: 7, paddingVertical: 2,
            borderRadius: 6, backgroundColor: t.petrolSoft,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: t.petrol }}>
            {dealId}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: t.ink2, flex: 1 }} numberOfLines={1}>
          {address || "Loan chat"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <LoanChatThread messages={chat} viewerRole={viewerRole} />
      </View>
      <LoanChatComposer loanId={loanId} viewerRole={viewerRole} />
    </KeyboardAware>
  );
}

function AgentFundingMirror({ loan, docs, activity }: { loan: Loan; docs: Document[]; activity: Activity[] }) {
  const { t } = useTheme();
  const receivedDocs = docs.filter((d) => d.status === "received" || d.status === "verified").length;
  const openDocs = docs.filter((d) => d.status !== "verified").length;
  const closeStr = loan.close_date
    ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Unset";

  return (
    <>
      <Card pad={18}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="file" size={19} color={t.brand} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel>Agent funding mirror</SectionLabel>
            <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }} numberOfLines={2}>
              {loan.address || "Subject property"}
            </Text>
            <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4, lineHeight: 17 }}>
              Funding criteria and underwriting stay internal. This view keeps client coordination visible.
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <MirrorStat label="Amount" value={QC_FMT.short(Number(loan.amount || 0))} />
        <MirrorStat label="Docs" value={`${receivedDocs}/${docs.length || 0}`} />
        <MirrorStat label="Close" value={closeStr} />
      </View>

      <Card pad={16}>
        <SectionLabel>Status</SectionLabel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Pill bg={t.brandSoft} color={t.brand}>{STAGE_LABEL[loan.stage]}</Pill>
          <Pill bg={openDocs ? t.warnBg : t.profitBg} color={openDocs ? t.warn : t.profit}>
            {openDocs ? `${openDocs} open item${openDocs === 1 ? "" : "s"}` : "Docs clear"}
          </Pill>
          <DealHealthPill health={loan.deal_health ?? null} />
        </View>
        <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19, marginTop: 12 }}>
          {openDocs
            ? "Help the client gather open documents and keep transaction parties aligned."
            : "Keep the client updated while funding moves the file through lender milestones."}
        </Text>
      </Card>

      <Card pad={16}>
        <SectionLabel>Recent funding updates</SectionLabel>
        {activity.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.ink3 }}>No recent updates yet.</Text>
        ) : (
          activity.slice(0, 4).map((a, i, arr) => (
            <View key={a.id} style={{ paddingVertical: 8, borderBottomColor: t.line, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }}>
              <Text style={{ fontSize: 12.5, color: t.ink, fontWeight: "700" }} numberOfLines={2}>{a.summary}</Text>
              <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{new Date(a.occurred_at).toLocaleString()}</Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

function MirrorStat({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <Card pad={12} style={{ flex: 1, borderRadius: 14 }}>
      <Text style={{ fontSize: 10, fontWeight: "800", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: "800", color: t.ink, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{value}</Text>
    </Card>
  );
}
