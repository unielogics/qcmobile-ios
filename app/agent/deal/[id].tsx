// Broker mobile — (A) Agent deal chat surface.
//
// Reads/writes via /api/v1/deals/{id}/chat (the multi-party thread
// broker + client + AI share pre-funding). Mirrors the structure of
// /agent/loan/[id]'s messages tab but scoped to a Deal, not a Loan.
//
// Reached from:
//   - Push notifications with kind=deal_chat_message (notifications.ts)
//   - Future: AIChatSheet's (A) rows once we have a list-my-deals
//     endpoint on the backend.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { LoanChatThread } from "@/components/loan/LoanChatThread";
import { LoanChatComposer } from "@/components/loan/LoanChatComposer";
import { KeyboardAware } from "@/components/KeyboardAware";
import { useCurrentUser, useDeal, useDealAgentChat, useSendDealAgentChat } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

export default function AgentDealRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { data: deal } = useDeal(id);
  const { data: messages = [] } = useDealAgentChat(id);
  const { data: me } = useCurrentUser();
  const viewerRole: "broker" | "super_admin" | "loan_exec" | "client" =
    me?.role === Role.SUPER_ADMIN ? "super_admin"
    : me?.role === Role.LOAN_EXEC ? "loan_exec"
    : me?.role === Role.CLIENT ? "client"
    : "broker";

  if (!deal) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
        <Header t={t} title="Loading…" subtitle={null} onBack={() => router.back()} />
      </SafeAreaView>
    );
  }

  // The route accepts `tab` for forward-compat with future deal-detail
  // sub-tabs (Property / Tasks / etc). Today the screen is chat-only,
  // so we don't switch on it — but we surface the deal_id and address
  // up top no matter what tab the deep-link asked for.
  void tab;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header
        t={t}
        title={`(A) ${deal.title}`}
        subtitle={[deal.address, deal.city, deal.state].filter(Boolean).join(", ") || null}
        onBack={() => router.back()}
      />
      <DealChatBody dealId={deal.id} dealTitle={deal.title} viewerRole={viewerRole} messages={messages} />
    </SafeAreaView>
  );
}

function Header({
  t,
  title,
  subtitle,
  onBack,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  subtitle: string | null;
  onBack: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomColor: t.line, borderBottomWidth: 1,
      }}
    >
      <Pressable onPress={onBack} hitSlop={8}>
        <Icon name="arrowL" size={18} color={t.ink} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "800", color: t.ink }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function DealChatBody({
  dealId,
  dealTitle,
  viewerRole,
  messages,
}: {
  dealId: string;
  dealTitle: string;
  viewerRole: "broker" | "super_admin" | "loan_exec" | "client";
  messages: ReturnType<typeof useDealAgentChat>["data"] & object;
}) {
  const { t } = useTheme();
  return (
    <KeyboardAware excludeTabBar>
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 16, paddingVertical: 8,
          borderBottomColor: t.line, borderBottomWidth: 1,
          backgroundColor: t.surface,
        }}
      >
        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: t.brandSoft }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: t.brand }}>(A) AGENT</Text>
        </View>
        <Text style={{ fontSize: 12, color: t.ink2, flex: 1 }} numberOfLines={1}>
          {dealTitle}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <LoanChatThread messages={messages ?? []} viewerRole={viewerRole} />
      </View>
      <DealChatComposer dealId={dealId} viewerRole={viewerRole} />
    </KeyboardAware>
  );
}

// Thin (A)-flavored composer. Mirrors LoanChatComposer's mode chips
// but trims out INSTRUCT / BROKER_SUGGESTION since both reference
// loan-scoped tables. Wraps useSendDealAgentChat.
function DealChatComposer({
  dealId,
  viewerRole,
}: {
  dealId: string;
  viewerRole: "broker" | "super_admin" | "loan_exec" | "client";
}) {
  // We reuse the same LoanChatComposer shape for now by simulating it
  // inline — the underlying queue invalidations differ (dealAgentChat
  // vs loanChat). If you want full feature parity with the loan
  // composer (mode chips, hints, flash messages), refactor
  // LoanChatComposer to take a `send` function prop and reuse it here.
  return <LoanChatComposerProxy dealId={dealId} viewerRole={viewerRole} />;
}

// Minimal composer with just a textarea + send button. Uses the deal
// endpoint. Defaults to mode=live_chat for operators, chat for clients.
import { TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
function LoanChatComposerProxy({
  dealId,
  viewerRole,
}: {
  dealId: string;
  viewerRole: "broker" | "super_admin" | "loan_exec" | "client";
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const send = useSendDealAgentChat();
  const [draft, setDraft] = useState("");
  const defaultMode = viewerRole === "client" ? "chat" : viewerRole === "broker" ? "live_chat" : "chat";

  const submit = async () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft("");
    try {
      await send.mutateAsync({ dealId, body, mode: defaultMode as any });
    } catch {
      // keep the draft so the user can retry
      setDraft(body);
    }
  };

  return (
    <View
      style={{
        flexDirection: "row", alignItems: "flex-end", gap: 8,
        paddingHorizontal: 12, paddingTop: 8,
        paddingBottom: Math.max(8, insets.bottom + 4),
        borderTopWidth: 1, borderTopColor: t.line,
        backgroundColor: t.surface,
      }}
    >
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Message the client + AI on this deal…"
        placeholderTextColor={t.ink4}
        multiline
        style={{
          flex: 1, minHeight: 40, maxHeight: 120,
          paddingVertical: 10, paddingHorizontal: 14,
          borderRadius: 18, backgroundColor: t.surface2,
          borderWidth: 1, borderColor: t.line,
          color: t.ink, fontSize: 14,
        }}
      />
      <Pressable
        onPress={submit}
        disabled={!draft.trim() || send.isPending}
        accessibilityLabel="Send"
        style={({ pressed }) => ({
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: draft.trim() && !send.isPending ? t.brand : t.chip,
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {send.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Icon name="send" size={18} color={draft.trim() && !send.isPending ? "#fff" : t.ink4} />
        )}
      </Pressable>
    </View>
  );
}
