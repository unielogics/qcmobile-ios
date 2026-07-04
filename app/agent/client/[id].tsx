import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Avatar, Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { LoanSnapshotCard } from "@/components/LoanSnapshotCard";
import { DocumentRequestList } from "@/components/DocumentRequestList";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import { ClientAIPlanCard } from "@/components/ClientAIPlanCard";
import { NurtureControls } from "@/components/agent/NurtureControls";
import { NurtureActivity } from "@/components/agent/NurtureActivity";
import { useClient, useCurrentUser, useDocuments, useEngagement, useFindOrCreateChatThread, useLoans, useRequestPrequalification, useStartFunding, useUpdateClientStage } from "@/hooks/useApi";
import { PauseBanner } from "@/components/loan/PauseBanner";
import { ContextMenu, type ContextMenuItem } from "@/components/agent/ContextMenu";
import { ReassignAgentSheet } from "@/components/agent/ReassignAgentSheet";
import { ClientStageOptions } from "@/lib/enums.generated";
import { creditDisplayFromFico } from "@/lib/creditDisplay";
import type { ClientStage } from "@/lib/enums.generated";
import type { Client } from "@/lib/types";

const STAGE_LABEL: Record<ClientStage, string> = Object.fromEntries(
  ClientStageOptions.map((o) => [o.value, o.label])
) as Record<ClientStage, string>;

export default function AgentClientRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client } = useClient(id);
  const { data: loans = [] } = useLoans("mine");
  const { data: engagement = [] } = useEngagement(id);
  const updateStage = useUpdateClientStage();
  const startFunding = useStartFunding();
  const requestPrequal = useRequestPrequalification();
  const findOrCreate = useFindOrCreateChatThread();
  const { data: me } = useCurrentUser();
  const isSuperAdmin = me?.role === "super_admin" || me?.role === "loan_exec";
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const clientLoans = useMemo(() => loans.filter((l) => l.client_id === id), [loans, id]);
  const activeLoan = useMemo(() => clientLoans.find((l) => l.stage !== "funded") ?? clientLoans[0] ?? null, [clientLoans]);
  const { data: docs = [] } = useDocuments(activeLoan?.id);
  const pendingDocs = docs.filter((d) => d.status === "requested" || d.status === "pending" || d.status === "flagged");
  const verifiedDocs = docs.filter((d) => d.status === "verified").length;

  if (!client) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: t.ink3 }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = client.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const onCall = async () => {
    if (!client.phone) {
      Alert.alert("No phone on file", "Add a phone number in the borrower's profile first.");
      return;
    }
    Linking.openURL(`tel:${client.phone}`).catch(() => Alert.alert("Couldn't open dialer"));
  };

  const onMessage = async () => {
    // Loan-specific conversation lives in the loan workspace chat
    // (loan_chat_messages) — the same surface the client sees + Elara
    // writes into. Sending here via the broker's per-user AI thread
    // would leave the client unaware, so we route to the loan page's
    // Messages tab whenever a loan exists. With no loan yet, fall back
    // to the broker's account-level AI thread for note-taking.
    setBusy("message");
    try {
      if (activeLoan) {
        router.push({
          pathname: "/agent/loan/[id]",
          params: { id: activeLoan.id, tab: "messages" },
        } as Href);
        return;
      }
      const thread = await findOrCreate.mutateAsync({ loan_id: null });
      router.push(`/agent/messages/${thread.id}` as Href);
    } catch {
      Alert.alert("Couldn't open the message thread");
    } finally {
      setBusy(null);
    }
  };

  const onMarkContacted = async () => {
    setBusy("contacted");
    try {
      await updateStage.mutateAsync({ clientId: client.id, stage: "contacted" });
    } catch {
      Alert.alert("Couldn't update stage");
    } finally {
      setBusy(null);
    }
  };

  const onRequestDocs = () => {
    if (!activeLoan) {
      Alert.alert("No active loan", "Start funding first to open a doc request.");
      return;
    }
    Alert.alert("Request docs", "The doc-request sheet ships with the next backend update. Until then, message the borrower with the list directly.");
  };

  // Agent's controlled handoff to the funding team (alembic 0031).
  // Backend builds the Lending Handoff Packet, creates a PrequalRequest,
  // spawns the lending AI thread with the first memory-aware message,
  // and drops an AITask in the funding queue. Two-step UX:
  //
  //   1. Confirm Alert — "Ready to send X to lending? Elara will…"
  //   2. After fire — success Alert with the handoff summary + the
  //      first question the Lending Elara asked.
  const onRequestPrequal = () => {
    Alert.alert(
      `Ready to send ${client.name} to lending?`,
      "Elara will:\n\n" +
        "• Summarize the realtor conversation\n" +
        "• Carry over relevant facts and files\n" +
        "• Identify missing lending items\n" +
        "• Create a prequal quote in the funding queue\n" +
        "• Spawn a lending AI thread that already knows everything",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send to Lending",
          style: "default",
          onPress: async () => {
            setBusy("prequal");
            try {
              const result = await requestPrequal.mutateAsync(client.id);
              const summary = result.handoff_summary
                ? `\n\nKnown from realtor side:\n${result.handoff_summary}`
                : "";
              const missing =
                result.missing_lending_items && result.missing_lending_items.length > 0
                  ? `\n\nLending AI will collect:\n• ${result.missing_lending_items.join("\n• ")}`
                  : "";
              const firstQ = result.first_lending_question
                ? `\n\nFirst question Elara asked:\n${result.first_lending_question}`
                : "";
              Alert.alert(
                `${client.name} moved to Lending Intake`,
                "Funding team has been notified. The Lending AI started a fresh thread and already knows the context." +
                  summary +
                  missing +
                  firstQ,
              );
            } catch (e) {
              Alert.alert(
                "Couldn't hand off",
                e instanceof Error ? e.message : "Try again in a minute.",
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const onStartFunding = () => {
    Alert.alert(
      "Start funding?",
      "This marks the prequal approved, creates the loan, and hands off to the Funding Team.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start funding",
          style: "default",
          onPress: async () => {
            setBusy("funding");
            try {
              await startFunding.mutateAsync(client.id);
            } catch {
              Alert.alert("Couldn't start funding");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const readyForLendingAction =
    client.stage === "lead" && client.lead_promotion_status !== "agent_requested_review"
      ? {
          label: "Ready for lending",
          icon: "bolt" as const,
          onPress: onRequestPrequal,
          loading: busy === "prequal",
        }
      : null;

  const primaryAction =
    client.stage === "verified"
        ? {
            label: "Start funding",
            icon: "bolt" as const,
            onPress: onStartFunding,
            loading: busy === "funding",
          }
        : null;

  const menuItems: ContextMenuItem[] = [
    {
      key: "reassign",
      label: "Reassign agent",
      sublabel: isSuperAdmin ? "Transfer this client to another agent" : "Super-admin only",
      icon: "user",
      onPress: () => isSuperAdmin && setReassignOpen(true),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>Client</Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          accessibilityLabel="More actions"
          style={({ pressed }) => ({
            padding: 6,
            borderRadius: 9,
            backgroundColor: pressed ? t.chip : "transparent",
          })}
        >
          <Icon name="more" size={18} color={t.ink} />
        </Pressable>
      </View>

      {/* Pause banner — visible if AI is paused on the client's active loan */}
      {activeLoan ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <PauseBanner loanId={activeLoan.id} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 186 + insets.bottom }}>
        <Card pad={18}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar label={initials} color={client.avatar_color ?? undefined} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink }}>{client.name}</Text>
              <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }} numberOfLines={1}>
                {[client.email, client.phone, client.city].filter(Boolean).join(" · ") || "No contact info"}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                {client.stage ? <Pill bg={t.brandSoft} color={t.brand}>{STAGE_LABEL[client.stage]}</Pill> : null}
                {client.client_type ? (
                  <Pill bg={t.chip} color={t.ink2}>
                    {client.client_type === "buyer" ? "Buyer" : "Seller"}
                  </Pill>
                ) : null}
              </View>
            </View>
          </View>
        </Card>

        {/* Phase 7 nurture surface — only when this client is still in
            the realtor-phase lifecycle (lead / contacted / verified).
            After handoff to lending the nurture controls collapse
            because the Pipeline AI takes over (per the two-tier
            architecture in the plan). */}
        {client.stage === "lead" || client.stage === "contacted" || client.stage === "verified" ? (
          <>
            <NurtureControls
              clientId={client.id}
              hasPhone={!!client.phone}
              hasEmail={!!client.email}
            />
            {readyForLendingAction ? (
              <ActionButton
                label={readyForLendingAction.label}
                icon={readyForLendingAction.icon}
                onPress={readyForLendingAction.onPress}
                loading={readyForLendingAction.loading}
                primary
                wide
              />
            ) : null}
            <NurtureActivity clientId={client.id} />
          </>
        ) : null}

        {/* Active AI Plan card (alembic 0032). Trumps the legacy
            missing_facts walk; renders the playbook-resolved active
            list for THIS client + lets the agent set per-client
            custom instructions for Elara. */}
        <ClientAIPlanCard clientId={client.id} loanId={null} />

        <AgentRelationshipWorkspace
          client={client}
          loanCount={clientLoans.length}
          activeLoanCount={clientLoans.filter((l) => l.stage !== "funded").length}
          verifiedDocs={verifiedDocs}
          totalDocs={docs.length}
        />

        {/* Realtor Client Intelligence Profile (alembic 0030). Renders
            when the Realtor AI has captured at least the client_type
            during a conversation. Mirrors the desktop card. */}
        {client.realtor_profile && client.realtor_profile.client_type !== "unknown" ? (
          <RealtorReadinessCard profile={client.realtor_profile} />
        ) : null}

        {clientLoans.length > 0 ? (
          <View style={{ gap: 10 }}>
            <SectionLabel>Active loans</SectionLabel>
            {clientLoans.map((l) => (
              <LoanSnapshotCard key={l.id} loan={l} onPress={() => router.push(`/agent/loan/${l.id}` as Href)} />
            ))}
          </View>
        ) : null}

        {activeLoan ? (
          <View>
            <SectionLabel>Documents</SectionLabel>
            <DocumentRequestList documents={docs} onSelect={() => router.push(`/agent/loan/${activeLoan.id}` as Href)} />
          </View>
        ) : null}

        <View>
          <SectionLabel>Recent activity</SectionLabel>
          {engagement.length === 0 ? (
            <Card pad={18}>
              <Text style={{ fontSize: 13, color: t.ink3 }}>No recorded activity yet.</Text>
            </Card>
          ) : (
            <Card pad={14}>
              {engagement.slice(0, 8).map((e, i, arr) => (
                <View
                  key={e.id}
                  style={{ paddingVertical: 8, borderBottomColor: t.line, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }}
                >
                  <Text style={{ fontSize: 12, color: t.ink, fontWeight: "600" }}>{e.signal_type.replace(/_/g, " ")}</Text>
                  <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{new Date(e.occurred_at).toLocaleString()}</Text>
                </View>
              ))}
            </Card>
          )}
        </View>

        {pendingDocs.length > 0 ? (
          <Card pad={14}>
            <Text style={{ fontSize: 12, color: t.ink2 }}>
              {pendingDocs.length} document{pendingDocs.length === 1 ? "" : "s"} still needed.
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 14 + insets.bottom,
          backgroundColor: t.surface,
          borderTopColor: t.line,
          borderTopWidth: 1,
          shadowColor: "#0B1629",
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
        }}
      >
        {primaryAction ? (
          <ActionButton
            label={primaryAction.label}
            icon={primaryAction.icon}
            onPress={primaryAction.onPress}
            loading={primaryAction.loading}
            primary
            wide
          />
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: primaryAction ? 10 : 0 }}>
          <ActionButton label="Call" icon="bolt" onPress={onCall} disabled={!client.phone} compact tone="call" />
          <ActionButton label="Message" icon="chat" onPress={onMessage} loading={busy === "message"} compact tone="message" />
          <ActionButton
            label="Analyze"
            icon="calc"
            onPress={() => router.push({ pathname: "/agent/deal-analyzer", params: { clientId: client.id } } as Href)}
            compact
          />
          <ActionButton
            label="Simulate"
            icon="sliders"
            onPress={() => router.push({ pathname: "/agent/simulate", params: { clientId: client.id } } as Href)}
            compact
          />
          {client.stage === "lead" ? (
            <ActionButton label="Contacted" icon="check" onPress={onMarkContacted} loading={busy === "contacted"} compact />
          ) : null}
          {activeLoan ? (
            <ActionButton label="Docs" icon="vault" onPress={onRequestDocs} compact />
          ) : null}
        </View>
      </View>

      <ContextMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Client actions"
        subtitle={client.name}
        items={menuItems}
      />

      {reassignOpen ? (
        <ReassignAgentSheet
          visible
          onClose={() => setReassignOpen(false)}
          clientId={client.id}
          clientName={client.name}
          currentAgentId={client.current_agent_id ?? client.broker_id ?? null}
        />
      ) : null}
    </SafeAreaView>
  );
}

function AgentRelationshipWorkspace({
  client,
  loanCount,
  activeLoanCount,
  verifiedDocs,
  totalDocs,
}: {
  client: Client;
  loanCount: number;
  activeLoanCount: number;
  verifiedDocs: number;
  totalDocs: number;
}) {
  const { t } = useTheme();
  const side = client.client_type ?? "buyer";
  const isSeller = side === "seller";
  const stage = client.stage ?? "lead";
  const creditDisplay = creditDisplayFromFico(client.fico);
  const actions = isSeller
    ? [
        stage === "lead" ? "Confirm listing timeline and target net." : "Update seller timeline after each funding milestone.",
        totalDocs === 0 ? "Add payoff, property facts, and seller-side docs." : "Review seller docs for missing transaction context.",
        activeLoanCount === 0 ? "Qualify buyer financing path before handoff." : "Coordinate offer and funding conditions.",
      ]
    : [
        creditDisplay.verified ? "Confirm buy box, budget, and close date." : "Ask client to complete credit readiness.",
        totalDocs === 0 ? "Collect intake, bank statements, entity docs, and property facts." : "Review received docs before handoff.",
        activeLoanCount === 0 ? "Move to lending once verified." : "Coordinate borrower conditions with funding updates.",
      ];

  return (
    <Card pad={16}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SectionLabel>Agent relationship file</SectionLabel>
          <Text style={{ fontSize: 17, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}>
            {isSeller ? "Seller workflow" : "Buyer workflow"}
          </Text>
          <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4, lineHeight: 17 }}>
            Agent-owned relationship work stays here. Funding criteria and underwriting stay inside the funding file.
          </Text>
        </View>
        <Pill bg={isSeller ? t.warnBg : t.brandSoft} color={isSeller ? t.warn : t.brand}>
          {isSeller ? "Seller" : "Buyer"}
        </Pill>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <MiniStat label="Files" value={activeLoanCount ? `${activeLoanCount}/${loanCount}` : "None"} />
        <MiniStat label="Docs" value={`${verifiedDocs}/${totalDocs || 0}`} />
        <MiniStat label="Credit" value={creditDisplay.shortLabel} />
      </View>

      <View style={{ gap: 8, marginTop: 14 }}>
        {actions.map((action, index) => (
          <View key={action} style={{ flexDirection: "row", gap: 9, alignItems: "flex-start" }}>
            <View
              style={{
                width: 21,
                height: 21,
                borderRadius: 999,
                backgroundColor: index === 0 ? t.petrolSoft : t.surface2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 10, color: index === 0 ? t.petrol : t.ink3, fontWeight: "800" }}>{index + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: t.ink2 }}>{action}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2 }}>
      <Text style={{ fontSize: 10, color: t.ink3, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 17, color: t.ink, fontWeight: "800", marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label, icon, onPress, primary, loading, disabled, wide, compact, tone,
}: {
  label: string;
  icon: "bolt" | "chat" | "check" | "vault" | "calc" | "sliders";
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  wide?: boolean;
  compact?: boolean;
  tone?: "call" | "message";
}) {
  const { t } = useTheme();
  const toneBg = tone === "call" ? "#16A34A" : tone === "message" ? "#2563EB" : null;
  const bg = primary ? t.brand : toneBg ?? t.surface2;
  const fg = primary || toneBg ? "#fff" : t.ink;
  const borderColor = primary ? t.brand : toneBg ?? t.line;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => ({
        flex: wide ? undefined : 1,
        minWidth: compact ? 96 : undefined,
        paddingVertical: wide ? 13 : 10,
        paddingHorizontal: compact ? 8 : 12,
        borderRadius: wide ? 12 : 10,
        backgroundColor: bg, borderColor, borderWidth: 1,
        alignItems: "center", gap: compact ? 5 : 7, flexDirection: "row", justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} size={14} color={fg} />
      <Text
        style={{ fontSize: compact ? 11 : 13, fontWeight: "800", color: fg, textAlign: "center" }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {loading ? "Working" : label}
      </Text>
    </Pressable>
  );
}

