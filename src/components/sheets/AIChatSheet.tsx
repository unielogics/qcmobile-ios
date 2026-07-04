// Elara chat sheet (mobile).
//
// Default landing surface = the conversations LIST. The list is
// DERIVED, not raw — exactly one Account thread row + one row per
// loan the user has, so we can never show duplicates regardless of
// what the DB has. Threads lazy-create on first tap via the
// /ai/chat/threads/find-or-create endpoint (canonical guarantee:
// alembic 0017 partial unique idx on (user, loan), 0018 partial
// unique idx on (user) WHERE loan_id IS NULL).
//
// Caller paths:
//   FAB (Dashboard / Calendar)     no initialThreadId → list view
//   Loan detail / pipeline          initialThreadId set → chat view
//
// Touch handling matches the rest of the app: `transparent` Modal,
// no SafeAreaView nested inside (it swallows touches on Android).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter, type Href } from "expo-router";
import { hasBackend } from "@/lib/featureFlags";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import {
  useAIChatThread,
  useAIChatThreads,
  useChatAttachmentInit,
  useFindOrCreateChatThread,
  useLoans,
  useMarkClientFinanceReady,
  useMarkThreadSeen,
  useRequestPrequalification,
  useRouteDocument,
  useSendAIChatMessage,
  useSendBuyerAgreement,
  useSendListingAgreement,
} from "@/hooks/useApi";
import type { AIChatThread, ChatAction, ChatAttachment, Loan } from "@/lib/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  // Optional sub-title — caller can hint context, e.g. "From your dashboard".
  context?: string;
  // When set, the sheet opens directly into this thread (used from
  // the loan detail page / pipeline). Not set → list view.
  initialThreadId?: string | null;
}

const STARTER_PROMPTS = [
  "What's the next thing I need to do?",
  "Are any of my docs overdue?",
  "What's blocking my deal from closing?",
  "Show me my current pipeline",
];

export function AIChatSheet({ visible, onClose, context, initialThreadId }: Props) {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: loans = [] } = useLoans();
  const { data: threads = [], isLoading: threadsLoading } = useAIChatThreads();
  const findOrCreate = useFindOrCreateChatThread();
  const sendMessage = useSendAIChatMessage();
  const attachmentInit = useChatAttachmentInit();
  const routeDocument = useRouteDocument();
  const requestPrequal = useRequestPrequalification();
  const sendBuyerAgreement = useSendBuyerAgreement();
  const sendListingAgreement = useSendListingAgreement();
  const markFinanceReady = useMarkClientFinanceReady();
  const markSeen = useMarkThreadSeen();

  // When the caller controls the thread (initialThreadId set), we
  // jump straight into chat. When they don't, we land in the
  // conversations LIST.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId ?? null);
  const [showList, setShowList] = useState<boolean>(!initialThreadId);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Files staged in the composer (paperclip-uploaded but not yet sent
  // with a message). Cleared on send / dismiss.
  const [staged, setStaged] = useState<{ document_id: string; name: string }[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);

  const activeThreadQ = useAIChatThread(activeThreadId);
  const messages = activeThreadQ.data?.messages ?? [];
  const activeThreadLoanId = activeThreadQ.data?.loan_id ?? null;

  // Derived list — exactly one Account row + one row per loan.
  // Threads in the DB that don't match (orphans, dupes pre-0018)
  // are ignored by this derived view, so the user only sees the
  // canonical set.
  const accountThread = useMemo<AIChatThread | undefined>(
    () => threads.find((th) => !th.loan_id),
    [threads],
  );
  const loanThreadMap = useMemo(() => {
    const map = new Map<string, AIChatThread>();
    for (const th of threads) {
      if (th.loan_id) map.set(th.loan_id, th);
    }
    return map;
  }, [threads]);

  // Phase 7.5 — AIChatSheet is now account-AI-only. The previous list
  // view (account + per-loan threads) caused confusion because per-loan
  // threads live in `ai_chat_threads` (per-user AI) but operator
  // workspace messages live in `loan_chat_messages` (different table) —
  // users were tapping a "loan thread" here and not seeing the
  // operator's message. Per-loan conversations now live ONLY on the
  // loan detail page (/agent/loan/[id] or /loan/[id]?tab=chat), which
  // reads workspace chat.
  //
  // Behavior here:
  //  - initialThreadId present  → open that exact thread (legacy callers)
  //  - initialThreadId absent   → find-or-create the account thread
  //                                (loan_id=null) and land in it directly
  useEffect(() => {
    if (!visible) return;
    if (initialThreadId) {
      setActiveThreadId(initialThreadId);
      setShowList(false);
      return;
    }
    // Account thread might already be cached in `threads`. If so, use
    // it; otherwise find-or-create.
    if (accountThread?.id) {
      setActiveThreadId(accountThread.id);
      setShowList(false);
      return;
    }
    let cancelled = false;
    findOrCreate.mutateAsync({ loan_id: null })
      .then((th) => {
        if (cancelled) return;
        setActiveThreadId(th.id);
        setShowList(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't open the account thread.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThreadId, visible, accountThread?.id]);

  // Auto-scroll the thread to the bottom when a new message lands or
  // the AI starts thinking.
  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length, sendMessage.isPending]);

  // Mark the thread as seen whenever it becomes the active view —
  // clears the unread dot. Re-fires when the user switches threads
  // OR when a fresh assistant message lands while the thread is
  // open (so seen stays caught up while the borrower is reading).
  useEffect(() => {
    if (showList || !activeThreadId) return;
    markSeen.mutate(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, showList, messages.length]);

  const openThread = async (loan_id: string | null) => {
    setError(null);
    const existing = loan_id == null ? accountThread : loanThreadMap.get(loan_id);
    if (existing) {
      setActiveThreadId(existing.id);
      setShowList(false);
      return;
    }
    try {
      const created = await findOrCreate.mutateAsync({ loan_id });
      setActiveThreadId(created.id);
      setShowList(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the thread.");
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if ((!text && staged.length === 0) || sendMessage.isPending) return;
    setError(null);
    const priorInput = input;
    const priorStaged = staged;
    setInput("");
    setStaged([]);
    try {
      let threadId = activeThreadId;
      if (!threadId) {
        // Fall back to the canonical Account thread — find-or-create
        // (NOT plain create) so we never spawn a duplicate.
        const t = await findOrCreate.mutateAsync({ loan_id: null });
        threadId = t.id;
        setActiveThreadId(threadId);
      }
      const tokens = staged.map((s) => s.document_id);
      await sendMessage.mutateAsync({
        threadId,
        body: text,
        attachment_tokens: tokens.length > 0 ? tokens : null,
      });
    } catch (e) {
      setInput(priorInput);
      setStaged(priorStaged);
      setError(e instanceof Error ? e.message : "Elara failed to respond.");
    }
  };

  // Pick a file from the system picker and stage it for the next
  // send. Only meaningful in loan-scoped threads — backend rejects
  // attachments on account-wide threads.
  const onAttachPress = async () => {
    if (!activeThreadId || !activeThreadLoanId) {
      Alert.alert("Open a loan thread", "Attachments only work inside a loan-specific conversation.");
      return;
    }
    if (attachmentInit.isPending) return;
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const file = picked.assets[0];
      const result = await attachmentInit.mutateAsync({
        threadId: activeThreadId,
        file: {
          uri: file.uri,
          name: file.name ?? "attachment",
          mimeType: file.mimeType ?? "application/octet-stream",
        },
      });
      setStaged((prev) => [...prev, { document_id: result.document_id, name: file.name ?? "attachment" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't attach the file.");
    }
  };

  const removeStaged = (docId: string) => {
    setStaged((prev) => prev.filter((s) => s.document_id !== docId));
  };

  // Handle a CTA tap on an assistant bubble.
  const onAction = async (action: ChatAction) => {
    setError(null);
    try {
      switch (action.kind) {
        case "upload_document": {
          // In-chat upload: open the picker right here and stage the
          // file on the composer — the borrower never leaves the
          // conversation. Only works in a loan-scoped thread (backend
          // rejects attachments on account-wide threads); fall back to
          // the vault deep-link otherwise.
          if (activeThreadId && activeThreadLoanId) {
            await onAttachPress();
            return;
          }
          if (action.document_id) {
            onClose();
            router.push({
              pathname: "/(tabs)/vault",
              params: { fulfill: action.document_id },
            });
            return;
          }
          onClose();
          router.push("/(tabs)/vault");
          return;
        }
        case "confirm_document_routing": {
          if (!action.document_id) return;
          await routeDocument.mutateAsync({
            documentId: action.document_id,
            checklist_key: action.checklist_key ?? null,
          });
          // Refetch the thread so the AI's confirmation message lands.
          activeThreadQ.refetch();
          return;
        }
        case "complete_property_intake": {
          activeThreadQ.refetch();
          return;
        }
        case "open_calendar_event": {
          // No-op for v1 — calendar deep-links land in a follow-up.
          return;
        }
        case "request_prequalification": {
          // Elara path — agent says "Marcus is ready for prequal"
          // → AI emits this action card → tap → fires the same endpoint
          // as the "Ready for prequal" button on /agent/client/[id].
          if (!action.client_id) return;
          await requestPrequal.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        // ── Realtor AI confirm-actions (alembic 0030) ────────────────
        case "send_buyer_agreement": {
          if (!action.client_id) return;
          await sendBuyerAgreement.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        case "send_listing_agreement": {
          if (!action.client_id) return;
          await sendListingAgreement.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        case "mark_client_finance_ready": {
          if (!action.client_id) return;
          await markFinanceReady.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        // Placeholder cards for the rest — backend handlers land in
        // follow-up. Tap is a no-op + thread refetch.
        case "create_buyer_intake":
        case "create_seller_intake":
        case "schedule_showing":
        case "schedule_picture_day":
        case "prepare_cma_task":
        case "create_listing_prep_checklist":
        case "send_property_matches":
        case "draft_follow_up_text":
        case "draft_follow_up_email":
        case "update_realtor_pipeline_stage": {
          activeThreadQ.refetch();
          return;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    }
  };

  const activeTitle = activeThreadQ.data?.title;
  const activeSub = activeThreadQ.data?.loan_deal_id
    ? `${activeThreadQ.data.loan_deal_id}${activeThreadQ.data.loan_address ? ` · ${activeThreadQ.data.loan_address}` : ""}`
    : (context ?? "Cross-loan account context");

  // Swipe-from-left-edge → back. Only fires inside the chat view; the
  // gesture must start within 30px of the left edge and travel >60px
  // right with horizontal-dominant motion so it doesn't fight
  // ScrollView's vertical scroll or in-message taps.
  const swipeBack = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, g) => {
          if (showList) return false;
          const startX = e.nativeEvent.pageX - g.dx;
          return (
            startX < 30 &&
            g.dx > 10 &&
            Math.abs(g.dx) > Math.abs(g.dy) * 1.5
          );
        },
        onPanResponderRelease: (_, g) => {
          // List view is gone; swipe-from-left-edge always closes.
          if (g.dx > 60) onClose();
        },
      }),
    [showList, initialThreadId, onClose]
  );

  return (
    <Modal
      // `transparent` (matching the rest of the app's sheets) so
      // touches route through the existing window on Android.
      // presentationStyle="fullScreen" + nested SafeAreaView would
      // re-create the previously-fixed swallow-touches bug.
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
        }}
      >
        <KeyboardAware excludeTabBar>
          {/* Header bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: t.line,
              backgroundColor: t.bg,
            }}
          >
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={10}
              style={({ pressed }) => ({
                width: 36, height: 36, borderRadius: 999,
                backgroundColor: pressed ? t.chip : "transparent",
                alignItems: "center", justifyContent: "center",
              })}
            >
              {/* Use arrowL — chevL is not in the icon registry. */}
              <Icon name="x" size={18} color={t.ink2} />
            </Pressable>
            <View
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: t.petrolSoft,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon name="chat" size={16} color={t.petrol} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}
              >
                {showList ? "Conversations" : (activeTitle ?? "Elara")}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}
              >
                {showList
                  ? `1 account thread · ${loans.length} loan${loans.length === 1 ? "" : "s"}`
                  : activeSub}
              </Text>
            </View>
          </View>

          {showList ? (
            <ScrollView
              style={{ flex: 1, backgroundColor: t.bg }}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Account / general thread row — always present */}
              <ConversationRow
                t={t}
                title="Account questions"
                subtitle={accountThread?.last_message_preview ?? "General questions about your portfolio."}
                timestamp={accountThread?.last_message_at ?? null}
                accent="petrol"
                empty={!accountThread}
                isActive={!!accountThread && activeThreadId === accountThread.id}
                unread={!!accountThread?.unread}
                onPress={() => openThread(null)}
              />

              {/* (A) Agent threads — one per loan/deal. These are the
                  broker's AI-assisted nurture conversations, kept
                  separate from the lending team's (L) workspace chat
                  on the loan detail page. After promotion both remain
                  available: (A) for the broker's ongoing relationship,
                  (L) for the funding team. */}
              {loans.length > 0 ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: t.ink3,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    marginTop: 14,
                    marginBottom: 4,
                  }}
                >
                  Active Chats
                </Text>
              ) : null}

              {loans.map((loan: Loan) => {
                const th = loanThreadMap.get(loan.id);
                // When BACKEND_HAS_DEAL_CHAT is on AND the loan carries
                // the source_deal_id back-ref, route to the new
                // multi-party deal-chat surface instead of the legacy
                // per-user AI thread.
                const dealChatReady =
                  hasBackend("BACKEND_HAS_DEAL_CHAT") && !!loan.source_deal_id;
                const onPress = dealChatReady
                  ? () => {
                      onClose();
                      router.push({
                        pathname: "/agent/deal/[id]",
                        params: { id: loan.source_deal_id as string, tab: "chat" },
                      } as Href);
                    }
                  : () => openThread(loan.id);
                return (
                  <ConversationRow
                    key={loan.id}
                    t={t}
                    title={`(A) ${loan.deal_id}`}
                    subtitleHeader={loan.address ?? ""}
                    subtitle={th?.last_message_preview ?? "No conversation yet — tap to start."}
                    timestamp={th?.last_message_at ?? null}
                    accent="brand"
                    empty={!th}
                    isActive={!!th && activeThreadId === th.id}
                    unread={!!th?.unread}
                    onPress={onPress}
                  />
                );
              })}

              {threadsLoading && threads.length === 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
                  <ActivityIndicator size="small" color={t.ink3} />
                  <Text style={{ fontSize: 12, color: t.ink3 }}>Loading conversations…</Text>
                </View>
              ) : null}

              {error ? (
                <View style={{ padding: 10, borderRadius: 9, backgroundColor: t.dangerBg, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: t.danger }}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }} {...swipeBack.panHandlers}>
              {/* Thread — fills all the space between header and composer */}
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, gap: 10 }}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1, backgroundColor: t.bg }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
              >
                {!activeThreadId || messages.length === 0 ? (
                  <View style={{ paddingTop: 8 }}>
                    <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 18, marginBottom: 14 }}>
                      Ask me about your pipeline, outstanding documents, what&apos;s
                      next on a deal, or anything else underwriting-related. I see
                      your full account context.
                    </Text>
                    <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                      Try asking
                    </Text>
                    <View style={{ gap: 6 }}>
                      {STARTER_PROMPTS.map((p) => (
                        <Pressable
                          key={p}
                          onPress={() => send(p)}
                          style={({ pressed }) => ({
                            padding: 12,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: t.line,
                            backgroundColor: pressed ? t.surface2 : "transparent",
                          })}
                        >
                          <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 18 }}>{p}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  messages.map((m) => (
                    <View
                      key={m.id}
                      style={{
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "86%",
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          padding: 11,
                          borderRadius: 14,
                          backgroundColor: m.role === "user" ? t.brandSoft : t.surface2,
                        }}
                      >
                        <Text style={{
                          fontSize: 13,
                          color: m.role === "user" ? t.brand : t.ink,
                          lineHeight: 18,
                        }}>
                          {m.body}
                        </Text>
                      </View>
                      {m.attachments && m.attachments.length > 0 ? (
                        <View style={{ flexDirection: "column", gap: 4 }}>
                          {m.attachments.map((att) => (
                            <AttachmentChip key={att.document_id} t={t} attachment={att} />
                          ))}
                        </View>
                      ) : null}
                      {m.role === "assistant" && m.actions && m.actions.length > 0 ? (
                        <View style={{ flexDirection: "column", gap: 6, marginTop: 2 }}>
                          {m.actions.map((a, idx) => (
                            <ActionButton
                              key={idx}
                              t={t}
                              action={a}
                              onPress={() => onAction(a)}
                              busy={routeDocument.isPending}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
                {sendMessage.isPending ? (
                  <View style={{ alignSelf: "flex-start", padding: 11, borderRadius: 14, backgroundColor: t.surface2, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color={t.ink3} />
                    <Text style={{ fontSize: 12, color: t.ink3 }}>Thinking…</Text>
                  </View>
                ) : null}
                {error ? (
                  <View style={{ padding: 10, borderRadius: 9, backgroundColor: t.dangerBg }}>
                    <Text style={{ fontSize: 12, color: t.danger }}>{error}</Text>
                  </View>
                ) : null}
              </ScrollView>

              {/* Staged attachments preview — chips above the composer */}
              {staged.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingTop: 6,
                    backgroundColor: t.bg,
                  }}
                >
                  {staged.map((s) => (
                    <View
                      key={s.document_id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: t.petrolSoft,
                      }}
                    >
                      <Icon name="doc" size={12} color={t.petrol} />
                      <Text style={{ fontSize: 11.5, color: t.petrol, fontWeight: "600", maxWidth: 170 }} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Pressable onPress={() => removeStaged(s.document_id)} hitSlop={8} accessibilityLabel="Remove attachment">
                        <Icon name="x" size={11} color={t.petrol} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Composer */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingTop: 8,
                  paddingBottom: Math.max(8, insets.bottom + 4),
                  borderTopWidth: 1,
                  borderTopColor: t.line,
                  backgroundColor: t.bg,
                }}
              >
                {/* Paperclip — only meaningful in loan-scoped threads */}
                <Pressable
                  onPress={onAttachPress}
                  disabled={!activeThreadLoanId || attachmentInit.isPending}
                  accessibilityLabel="Attach file"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: pressed ? t.surface2 : "transparent",
                    alignItems: "center", justifyContent: "center",
                    opacity: !activeThreadLoanId ? 0.4 : 1,
                  })}
                >
                  {attachmentInit.isPending ? (
                    <ActivityIndicator size="small" color={t.ink3} />
                  ) : (
                    <Icon name="paperclip" size={18} color={activeThreadLoanId ? t.ink2 : t.ink4} />
                  )}
                </Pressable>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder={staged.length > 0 ? "Add a note (optional)…" : "Message…"}
                  placeholderTextColor={t.ink4}
                  onSubmitEditing={() => send(input)}
                  returnKeyType="send"
                  multiline
                  style={{
                    flex: 1,
                    minHeight: 40,
                    maxHeight: 120,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    backgroundColor: t.surface2,
                    borderWidth: 1,
                    borderColor: t.line,
                    color: t.ink,
                    fontSize: 14,
                  }}
                />
                <Pressable
                  onPress={() => send(input)}
                  disabled={(!input.trim() && staged.length === 0) || sendMessage.isPending}
                  accessibilityLabel="Send"
                  style={({ pressed }) => ({
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: (input.trim() || staged.length > 0) && !sendMessage.isPending ? t.petrol : t.chip,
                    alignItems: "center", justifyContent: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Icon name="arrowR" size={18} color={(input.trim() || staged.length > 0) && !sendMessage.isPending ? "#fff" : t.ink4} />
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAware>
      </View>
    </Modal>
  );
}

function ActionButton({
  t,
  action,
  onPress,
  busy,
}: {
  t: ReturnType<typeof useTheme>["t"];
  action: ChatAction;
  onPress: () => void;
  busy: boolean;
}) {
  const isPrimary = action.confirm !== false;
  const iconName =
    action.kind === "upload_document"
      ? "upload"
      : action.kind === "confirm_document_routing"
        ? (isPrimary ? "check" : "x")
        : action.kind === "complete_property_intake"
          ? "check"
          : "chevR";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: isPrimary ? t.petrol : t.surface2,
        borderWidth: isPrimary ? 0 : 1,
        borderColor: t.line,
        opacity: pressed ? 0.85 : busy ? 0.6 : 1,
      })}
    >
      <Icon name={iconName as any} size={14} color={isPrimary ? "#fff" : t.ink2} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 12.5,
          fontWeight: "700",
          color: isPrimary ? "#fff" : t.ink,
          letterSpacing: -0.1,
        }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

function AttachmentChip({
  t,
  attachment,
}: {
  t: ReturnType<typeof useTheme>["t"];
  attachment: ChatAttachment;
}) {
  const status = attachment.status ?? "received";
  const statusColor =
    status === "verified"
      ? t.profit
      : status === "flagged"
        ? t.warn
        : t.ink3;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.line,
      }}
    >
      <Icon name="doc" size={12} color={t.ink2} />
      <Text style={{ fontSize: 11.5, color: t.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
        {attachment.name}
      </Text>
      <Text style={{ fontSize: 10.5, color: statusColor, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {status}
      </Text>
    </View>
  );
}


function ConversationRow({
  t,
  title,
  subtitleHeader,
  subtitle,
  timestamp,
  accent,
  empty,
  isActive,
  unread,
  onPress,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  subtitleHeader?: string;
  subtitle: string;
  timestamp: string | null;
  accent: "petrol" | "brand";
  empty: boolean;
  isActive: boolean;
  unread?: boolean;
  onPress: () => void;
}) {
  const accentColor = accent === "petrol" ? t.petrol : t.brand;
  const accentBg = accent === "petrol" ? t.petrolSoft : t.brandSoft;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isActive ? accentColor : t.line,
        backgroundColor: pressed ? t.surface2 : (isActive ? accentBg : "transparent"),
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: accentBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="chat" size={16} color={accentColor} />
        {unread ? (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: t.danger,
              borderWidth: 2,
              borderColor: t.bg,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: unread ? "900" : "800",
              color: t.ink,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {timestamp ? (
            <Text style={{ fontSize: 10.5, color: t.ink4 }}>
              {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </Text>
          ) : null}
        </View>
        {subtitleHeader ? (
          <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }} numberOfLines={1}>
            {subtitleHeader}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: 12,
            color: empty ? t.ink4 : t.ink2,
            fontStyle: empty ? "italic" : "normal",
            marginTop: 4,
            lineHeight: 17,
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      <Icon name="chevR" size={14} color={t.ink4} />
    </Pressable>
  );
}
