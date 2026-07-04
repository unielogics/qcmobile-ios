import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { TopBar } from "@/components/TopBar";
import { NextActionCard } from "@/components/NextActionCard";
import { LoanSnapshotCard } from "@/components/LoanSnapshotCard";
import { DocumentRequestList } from "@/components/DocumentRequestList";
import { AIChatSheet } from "@/components/sheets/AIChatSheet";
import { SharedAnalysisReports } from "@/components/SharedAnalysisReports";
import { Icon } from "@/design-system/Icon";
import {
  useAIChatThreads,
  useAnalysisRuns,
  useCreditCurrent,
  useCurrentUser,
  useDocuments,
  useLoans,
  useMyClient,
} from "@/hooks/useApi";
import { deriveNextAction } from "@/lib/nextAction";
import type { Loan } from "@/lib/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(user: { name?: string; email?: string } | null | undefined): string | null {
  if (!user) return null;
  const n = (user.name ?? "").trim();
  if (n && n !== user.email) return n.split(" ")[0];
  if (user.email) return user.email.split("@")[0].split(".")[0];
  return null;
}

export function GuidedHome() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: client } = useMyClient();
  const { data: credit } = useCreditCurrent();
  const { data: loans = [] } = useLoans();
  // All loans the borrower still has live work on. Funded loans are
  // retained-relationship territory and surface separately later.
  const activeLoans = useMemo(
    () => loans.filter((l) => l.stage !== "funded"),
    [loans],
  );
  // Primary loan for any single-loan affordance (next-action header,
  // document list anchoring). Falls back to the most recent loan
  // (including funded) so we never have a blank state when the user has
  // closed deals.
  const primaryLoan = activeLoans[0] ?? loans[0] ?? null;
  const { data: documents = [] } = useDocuments(primaryLoan?.id);
  // Threads drive the unread indicator + "last message" preview on the
  // chat hero card. Cheap query — the existing AIChatSheet already
  // uses the same hook so this is cached.
  const { data: threads = [] } = useAIChatThreads();
  const { data: sharedReports = [] } = useAnalysisRuns({ shared: true });

  const nextAction = useMemo(
    () => deriveNextAction({ client, credit, loans, documents }),
    [client, credit, loans, documents],
  );

  const name = firstNameOf(user);
  const [chatOpen, setChatOpen] = useState(false);

  // The Account-AI thread is what the AIChatSheet should open (per
  // Phase 7.5 — sheet is account-only; loan chats live on the loan
  // page). Per-loan unread/preview is surfaced inline as a chip
  // beside each loan in the picker.
  const accountThread = useMemo(() => threads.find((th) => !th.loan_id), [threads]);
  const hasAccountUnread = !!accountThread?.unread;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Home" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {/* Greeting kept slim so the chat hero is what the eye lands on. */}
        <View style={{ paddingHorizontal: 4, marginBottom: 2 }}>
          <Text style={{ fontSize: 13, color: t.ink3, fontWeight: "600" }}>
            {greeting()}{name ? "," : ""}
          </Text>
          {name ? (
            <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, marginTop: 2 }}>
              {name}
            </Text>
          ) : null}
        </View>

        {/* PRIMARY: AI Concierge picker. Account thread on the left
            (opens AIChatSheet), each active loan on the right (deep-
            links into /loan/[id]?tab=chat — the workspace thread that
            also receives broker Live-Chat). Putting both surfaces in
            one place keeps the conversation entry point predictable
            and matches the deal_id user-mental-model. */}
        <ChatHeroPicker
          t={t}
          accountUnread={hasAccountUnread}
          accountPreview={accountThread?.last_message_preview ?? null}
          accountLastAt={accountThread?.last_message_at ?? null}
          loans={activeLoans}
          onOpenAccount={() => setChatOpen(true)}
          onOpenLoan={(loanId) => router.push({ pathname: "/loan/[id]", params: { id: loanId, tab: "chat" } } as Href)}
        />

        {/* Secondary surfaces. Smaller, below the fold so they're
            accessible without competing with the chat. */}
        <NextActionCard
          action={nextAction}
          onCtaOverride={
            nextAction.kind === "review_terms"
              ? () => router.push("/(tabs)/simulator")
              : undefined
          }
        />

        <SharedAnalysisReports reports={sharedReports} />

        {activeLoans.length > 0 ? (
          <View style={{ gap: 10 }}>
            {activeLoans.map((l) => (
              <LoanSnapshotCard
                key={l.id}
                loan={l}
                onPress={() => router.push({ pathname: "/loan/[id]", params: { id: l.id } } as Href)}
              />
            ))}
          </View>
        ) : primaryLoan ? (
          <LoanSnapshotCard
            loan={primaryLoan}
            onPress={() => router.push({ pathname: "/loan/[id]", params: { id: primaryLoan.id } } as Href)}
          />
        ) : null}

        <DocumentRequestList documents={documents} />
      </ScrollView>

      <AIChatSheet
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        context="From your dashboard"
        initialThreadId={accountThread?.id ?? null}
      />
    </SafeAreaView>
  );
}


// AI Concierge picker — primary affordance on Guided home. Splits into
// two visually distinct rows so the borrower never confuses "ask the AI
// general questions" (account thread) with "talk about this loan"
// (workspace thread on /loan/[id]). Each loan row carries the deal_id
// prominently so users can identify which file they're opening before
// they tap.
function ChatHeroPicker({
  t,
  accountUnread,
  accountPreview,
  accountLastAt,
  loans,
  onOpenAccount,
  onOpenLoan,
}: {
  t: ReturnType<typeof useTheme>["t"];
  accountUnread: boolean;
  accountPreview: string | null;
  accountLastAt: string | null;
  loans: Loan[];
  onOpenAccount: () => void;
  onOpenLoan: (loanId: string) => void;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: t.warnBg,
        padding: 14,
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: t.warn, letterSpacing: 1.0 }}>
        AI CONCIERGE
      </Text>

      {/* Account thread row */}
      <Pressable
        onPress={onOpenAccount}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 12,
          backgroundColor: t.surface, borderRadius: 12, padding: 12,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <View
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: "rgba(168,106,18,0.15)",
            alignItems: "center", justifyContent: "center",
            position: "relative",
          }}
        >
          <Icon name="chat" size={20} color={t.warn} stroke={2.2} />
          {accountUnread ? (
            <View
              style={{
                position: "absolute", top: -2, right: -2,
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: t.danger, borderWidth: 2, borderColor: t.surface,
              }}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }} numberOfLines={1}>
            Account questions
          </Text>
          <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }} numberOfLines={1}>
            {accountPreview ?? "General questions about your portfolio."}
            {accountLastAt ? ` · ${relativeTime(accountLastAt) ?? ""}` : ""}
          </Text>
        </View>
        <Icon name="chevR" size={18} color={t.ink3} />
      </Pressable>

      {/* Per-loan rows — each routes to /loan/[id]?tab=chat (workspace
          chat the AI + broker also write to). */}
      {loans.length > 0 ? (
        <>
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: t.warn, letterSpacing: 1.0, marginTop: 4, marginLeft: 2 }}>
            ACTIVE CHATS
          </Text>
          {loans.map((loan) => (
            <Pressable
              key={loan.id}
              onPress={() => onOpenLoan(loan.id)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 10,
                backgroundColor: t.surface, borderRadius: 12, padding: 12,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <View
                style={{
                  paddingHorizontal: 8, paddingVertical: 4,
                  borderRadius: 7, backgroundColor: t.petrolSoft,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: t.petrol }}>
                  {loan.deal_id}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }} numberOfLines={1}>
                  {loan.address || "Subject property"}
                </Text>
                {loan.city ? (
                  <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }} numberOfLines={1}>
                    {loan.city}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevR" size={16} color={t.ink3} />
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
