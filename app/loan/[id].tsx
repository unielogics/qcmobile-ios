import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Stepper, StepperLabels } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { Slider } from "@/design-system/Slider";
import { QC_FMT } from "@/design-system/tokens";
import * as DocumentPicker from "expo-document-picker";
import {
  useLoan,
  useDocuments,
  useLoanChat,
  useLoanWorkspace,
  useSendLoanChat,
  useLoanTodo,
  useCreateCalendarEvent,
  useUploadDocument,
} from "@/hooks/useApi";
import type { Document } from "@/lib/types";
import { LoanSimulator } from "@/components/LoanSimulator";
import { UploadActionSheet, type PickedFile } from "@/components/sheets/UploadActionSheet";
import { LoanChatThread } from "@/components/loan/LoanChatThread";
import { PauseBanner } from "@/components/loan/PauseBanner";
import { KeyboardAware } from "@/components/KeyboardAware";
import { Fab } from "@/components/Fab";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const PIPELINE_STAGES = ["Prequalified", "Processing", "Underwriting", "Closing", "Funded"];
const TYPE_ICON: Record<string, string> = {
  fix_and_flip: "hammer",
  ground_up: "building2",
  dscr: "key",
  bridge: "bolt",
  portfolio: "layers",
  cash_out_refi: "refresh",
};
const TYPE_LABEL: Record<string, string> = {
  fix_and_flip: "Fix & Flip",
  ground_up: "Ground Up",
  dscr: "DSCR",
  bridge: "Bridge",
  portfolio: "Portfolio",
  cash_out_refi: "Cash-Out",
};

const TABS = [
  { id: "todo",     label: "To Do",      icon: "check" },
  { id: "chat",     label: "Chat",       icon: "chat" },
  { id: "docs",     label: "Documents",  icon: "doc" },
  { id: "sim",      label: "Simulation", icon: "sliders" },
] as const;
type TabId = typeof TABS[number]["id"];

export default function LoanFile() {
  const { t, isDark } = useTheme();
  const router = useRouter();
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { data: loan } = useLoan(id);
  const initialTab: TabId = (TABS.find((t) => t.id === tabParam)?.id ?? "todo") as TabId;
  const [tab, setTab] = useState<TabId>(initialTab);

  if (!loan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <Text style={{ color: t.ink3 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const stageIdx = Math.max(0, STAGE_KEYS.indexOf(loan.stage));
  const stagePos = Math.min(4, Math.floor((stageIdx / (STAGE_KEYS.length - 1)) * 4));
  const typeLabel = TYPE_LABEL[loan.type] ?? loan.type.replace("_", " ");
  const iconName = TYPE_ICON[loan.type] ?? "doc";
  const closeStr = loan.close_date
    ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      {/* Slim header — identical on every tab. Address + type · L-id
          on the left, value + close X on the right. No stepper / no
          circle / no Pipeline pill: maximize space for tab content. */}
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
          borderBottomColor: t.line, borderBottomWidth: 1,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "700", color: t.ink, letterSpacing: -0.3 }}>
            {loan.address}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
            {typeLabel} · {loan.deal_id}
          </Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: t.ink, letterSpacing: -0.4 }}>
          {QC_FMT.short(Number(loan.amount))}
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
          <Icon name="x" size={16} color={t.ink2} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: t.chip, borderRadius: 12, padding: 3 }}>
          {TABS.map((opt) => {
            const active = tab === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setTab(opt.id)}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 9,
                  backgroundColor: active ? t.surface : "transparent",
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                <Icon name={opt.icon} size={13} color={active ? t.ink : t.ink3} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? t.ink : t.ink3 }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === "todo" && <ToDoPane loanId={loan.id} />}
      {tab === "chat" && <ChatPane loanId={loan.id} dealId={loan.deal_id} />}
      {tab === "docs" && <DocsPane loanId={loan.id} />}
      {tab === "sim" && <LoanSimulator loan={loan} />}
    </SafeAreaView>
  );
}

function ToDoPane({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<"pending" | "completed" | "all">("pending");
  const { data: items = [], isLoading } = useLoanTodo(loanId, filter);
  const [picker, setPicker] = useState(false);

  const groups: { key: string; label: string; kind: "document" | "call" | "task" }[] = [
    { key: "document", label: "Documents", kind: "document" },
    { key: "call", label: "Calls", kind: "call" },
    { key: "task", label: "Asks", kind: "task" },
  ];
  const iconFor = (k: string) => (k === "document" ? "doc" : k === "call" ? "cal" : "check");
  const filters: { key: "pending" | "completed" | "all"; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: t.chip, borderRadius: 10, padding: 3 }}>
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  flex: 1, paddingVertical: 7, borderRadius: 8,
                  backgroundColor: active ? t.surface : "transparent",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.ink : t.ink3 }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96, gap: 14 }} showsVerticalScrollIndicator={false}>
        {isLoading ? <Text style={{ color: t.ink3, fontSize: 13 }}>Loading your to-do…</Text> : null}
        {!isLoading && items.length === 0 ? (
          <Card pad={16}>
            <Text style={{ color: t.ink3, fontSize: 13 }}>
              You're all caught up — nothing outstanding on this loan.
            </Text>
          </Card>
        ) : null}
        {groups.map((g) => {
          const rows = items.filter((i) => i.kind === g.kind);
          if (rows.length === 0) return null;
          return (
            <View key={g.key} style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                {g.label}
              </Text>
              {rows.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() => { if (it.deeplink) router.push(it.deeplink as never); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <Card pad={14} style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                        <Icon name={iconFor(it.kind)} size={15} color={t.brand} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{it.title}</Text>
                        {it.subtitle ? (
                          <Text numberOfLines={1} style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>{it.subtitle}</Text>
                        ) : null}
                      </View>
                      <Icon name="chevR" size={14} color={t.ink4} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <Fab icon="plus" onPress={() => setPicker(true)} />
      <RequestSheet
        visible={picker}
        loanId={loanId}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}

// Bottom action chooser → Request a call (calendar event) or Send a
// note (loan workspace chat + optional attachment).
function RequestSheet({
  visible,
  loanId,
  onClose,
}: {
  visible: boolean;
  loanId: string;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"menu" | "call" | "note">("menu");
  const [callWhen, setCallWhen] = useState("");
  const [noteText, setNoteText] = useState("");
  const [file, setFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const createEvent = useCreateCalendarEvent();
  const upload = useUploadDocument();
  const sendChat = useSendLoanChat();

  const reset = () => { setMode("menu"); setCallWhen(""); setNoteText(""); setFile(null); setFlash(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const submitCall = async () => {
    setBusy(true);
    try {
      // Default start = tomorrow 10:00 local; the agent adjusts. The
      // borrower's preferred window rides along in the description.
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      await createEvent.mutateAsync({
        loan_id: loanId,
        kind: "call",
        title: "Call requested by borrower",
        description: callWhen.trim() ? `Preferred: ${callWhen.trim()}` : "Borrower requested a call.",
        who: "Agent",
        starts_at: d.toISOString(),
        duration_min: 30,
      });
      setFlash("Call request sent. Your agent will confirm a time.");
      setTimeout(close, 1400);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't send the request.");
      setBusy(false);
    }
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream" });
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) { setFlash("Add a note message first."); return; }
    setBusy(true);
    try {
      let attachment_document_id: string | null = null;
      if (file) {
        const up = await upload.mutateAsync({ loan_id: loanId, file, is_other: true });
        attachment_document_id = up.document_id;
      }
      await sendChat.mutateAsync({
        loanId,
        body: noteText.trim(),
        mode: "chat",
        attachment_document_id,
      });
      setFlash("Note sent to your team.");
      setTimeout(close, 1200);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't send the note.");
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <Pressable
      onPress={close}
      style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
    >
      <Pressable
        onPress={() => {}}
        style={{
          backgroundColor: t.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: 18, paddingBottom: Math.max(18, insets.bottom + 12), gap: 12,
        }}
      >
        {flash ? (
          <Text style={{ fontSize: 12.5, color: flash.includes("Couldn") ? t.danger : t.brand, fontWeight: "600" }}>
            {flash}
          </Text>
        ) : null}

        {mode === "menu" ? (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>What do you need?</Text>
            <Pressable onPress={() => setMode("call")} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
              <Icon name="cal" size={18} color={t.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>Request a call</Text>
                <Text style={{ fontSize: 12, color: t.ink3 }}>Your agent or loan rep will reach out.</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setMode("note")} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
              <Icon name="chat" size={18} color={t.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>Send a note</Text>
                <Text style={{ fontSize: 12, color: t.ink3 }}>Message your team, attach a file.</Text>
              </View>
            </Pressable>
          </>
        ) : mode === "call" ? (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>Request a call</Text>
            <TextInput
              value={callWhen}
              onChangeText={setCallWhen}
              placeholder="When works for you? (e.g. Tue afternoon)"
              placeholderTextColor={t.ink4}
              style={{ borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12, color: t.ink, fontSize: 14, backgroundColor: t.surface2 }}
            />
            <Pressable
              onPress={submitCall}
              disabled={busy}
              style={{ backgroundColor: busy ? t.chip : t.brand, paddingVertical: 13, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ color: busy ? t.ink4 : "#fff", fontWeight: "800", fontSize: 14 }}>
                {busy ? "Sending…" : "Send request"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>Send a note</Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Type your message…"
              placeholderTextColor={t.ink4}
              multiline
              style={{ minHeight: 80, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12, color: t.ink, fontSize: 14, backgroundColor: t.surface2 }}
            />
            <Pressable onPress={pickFile} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
              <Icon name="paperclip" size={14} color={t.ink2} />
              <Text numberOfLines={1} style={{ fontSize: 12, color: t.ink2, maxWidth: 200 }}>
                {file ? file.name : "Attach a file"}
              </Text>
            </Pressable>
            <Pressable
              onPress={submitNote}
              disabled={busy}
              style={{ backgroundColor: busy ? t.chip : t.brand, paddingVertical: 13, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ color: busy ? t.ink4 : "#fff", fontWeight: "800", fontSize: 14 }}>
                {busy ? "Sending…" : "Send note"}
              </Text>
            </Pressable>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

// Borrower's view of the loan chat. CRITICAL: this MUST read from
// /loans/{id}/chat (the workspace thread) — the same surface the
// broker writes to via Live Chat and the same one super_admin uses
// for operator takeover. Previously this pane talked to /ai/chat
// (a per-user one-shot AI thread), which meant broker Live-Chat
// messages were persisted in loan_chat_messages but the borrower
// never saw them. Wiring both sides to the workspace chat is the
// fix that makes operator-takeover actually reach the customer.
function ChatPane({ loanId, dealId }: { loanId: string; dealId: string }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: chat = [] } = useLoanChat(loanId);
  // Workspace is queried separately so the PauseBanner stays in sync
  // even when the loan tab isn't open.
  useLoanWorkspace(loanId);
  const send = useSendLoanChat();
  const upload = useUploadDocument();
  const [draft, setDraft] = useState("");
  const [staged, setStaged] = useState<{ document_id: string; name: string } | null>(null);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  // Bottom sheet that offers Camera / Photos / File.
  const [showUpload, setShowUpload] = useState(false);

  const onPicked = async (file: PickedFile) => {
    setShowUpload(false);
    try {
      const init = await upload.mutateAsync({
        loan_id: loanId,
        is_other: true,
        file: {
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || "application/octet-stream",
        },
      });
      setStaged({ document_id: init.document_id, name: file.name });
    } catch (e) {
      setAttachErr(e instanceof Error ? e.message : "Couldn't attach the file.");
      setTimeout(() => setAttachErr(null), 4000);
    }
  };

  const onSend = async () => {
    const text = draft.trim();
    if ((!text && !staged) || send.isPending) return;
    const att = staged;
    setDraft("");
    setStaged(null);
    try {
      // CLIENT can only send mode=chat per backend _MODE_ALLOWED_ROLES.
      // Backend auto-replies with AI unless the loan is paused — in
      // which case the message is persisted and the AI stays quiet,
      // letting the broker/operator reply directly.
      await send.mutateAsync({
        loanId,
        body: text || (att ? `Uploaded: ${att.name}` : ""),
        mode: "chat",
        attachment_document_id: att?.document_id ?? null,
        optimistic_from_role: "client",
        optimistic_client_visible: true,
      });
    } catch (err) {
      // Restore the draft + attachment so the user can retry.
      setDraft(text);
      if (att) setStaged(att);
    }
  };

  return (
    <KeyboardAware excludeTabBar>
      {/* Sticky deal-id strip so the borrower always knows which loan
          this thread is for, even after they've scrolled the messages. */}
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
          Loan chat thread
        </Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <PauseBanner
          loanId={loanId}
          message="Your operator is replying directly. The AI will resume shortly."
        />
      </View>
      {chat.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          <Card pad={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Icon name="spark" size={14} color={t.petrol} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.2, textTransform: "uppercase" }}>
                Loan chat · {dealId}
              </Text>
            </View>
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18 }}>
              Ask anything about your loan — pricing, missing docs, next steps. Your agent and the AI are on this thread together.
            </Text>
          </Card>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <LoanChatThread messages={chat} viewerRole="client" />
        </View>
      )}
      {staged || attachErr ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          {attachErr ? (
            <Text style={{ fontSize: 12, color: t.danger, marginBottom: 6 }}>{attachErr}</Text>
          ) : null}
          {staged ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 10, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }}>
              <Icon name="paperclip" size={13} color={t.ink3} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: t.ink2 }}>{staged.name}</Text>
              <Pressable onPress={() => setStaged(null)} accessibilityLabel="Remove attachment" hitSlop={8}>
                <Icon name="x" size={13} color={t.ink3} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          // Reserve the system-bar inset so the send button doesn't
          // sit behind the Android nav bar / iOS home indicator.
          paddingBottom: Math.max(8, insets.bottom + 4),
          borderTopWidth: 1,
          borderTopColor: t.line,
          backgroundColor: t.surface,
        }}
      >
        <Pressable
          onPress={() => setShowUpload(true)}
          disabled={upload.isPending}
          accessibilityLabel="Attach a file"
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line,
            alignItems: "center", justifyContent: "center",
            opacity: pressed || upload.isPending ? 0.6 : 1,
          })}
        >
          {upload.isPending ? (
            <ActivityIndicator color={t.ink3} size="small" />
          ) : (
            <Icon name="paperclip" size={18} color={t.ink2} />
          )}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about this loan…"
          placeholderTextColor={t.ink3}
          multiline
          style={{
            flex: 1, fontSize: 14, color: t.ink,
            backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line,
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120,
          }}
        />
        <Pressable
          onPress={onSend}
          disabled={send.isPending || (!draft.trim() && !staged)}
          accessibilityLabel="Send"
          style={({ pressed }) => ({
            paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
            backgroundColor: send.isPending || (!draft.trim() && !staged) ? t.chip : t.ink,
            alignItems: "center", justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {send.isPending ? (
            <ActivityIndicator color={t.inverse} size="small" />
          ) : (
            <Icon name="send" size={16} color={!draft.trim() && !staged ? t.ink4 : t.inverse} />
          )}
        </Pressable>
      </View>
      <UploadActionSheet
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onPicked={onPicked}
      />
    </KeyboardAware>
  );
}

function DocsPane({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocuments(loanId);

  const counts = useMemo(() => ({
    received:  docs.filter((d) => d.status === "received" || d.status === "verified").length,
    requested: docs.filter((d) => d.status === "requested").length,
    pending:   docs.filter((d) => d.status === "pending").length,
    flagged:   docs.filter((d) => d.status === "flagged").length,
  }), [docs]);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }} showsVerticalScrollIndicator={false}>
      <Card pad={14}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Document Vault · {docs.length} items
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
          <Counter label="Received" count={counts.received} color={t.profit} />
          <Counter label="Requested" count={counts.requested} color={t.brand} />
          <Counter label="Pending" count={counts.pending} color={t.warn} />
          <Counter label="Flagged" count={counts.flagged} color={t.danger} />
        </View>
      </Card>
      {isLoading ? <Text style={{ color: t.ink3, fontSize: 13 }}>Loading documents…</Text> : null}
      {!isLoading && docs.length === 0 ? (
        <Card pad={16}>
          <Text style={{ color: t.ink3, fontSize: 13 }}>No documents on file yet.</Text>
        </Card>
      ) : null}
      {docs.map((d) => <DocRow key={d.id} doc={d} />)}
    </ScrollView>
  );
}

function DocRow({ doc }: { doc: Document }) {
  const { t } = useTheme();
  const statusBg = doc.status === "verified" ? t.profitBg : doc.status === "received" ? t.brandSoft : doc.status === "flagged" ? t.dangerBg : t.warnBg;
  const statusFg = doc.status === "verified" ? t.profit : doc.status === "received" ? t.brand : doc.status === "flagged" ? t.danger : t.warn;
  return (
    <Card pad={12}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="doc" size={16} color={t.ink3} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{doc.name}</Text>
          <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
            {doc.category ?? "uncategorized"}
            {doc.requested_on ? ` · requested ${new Date(doc.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            {doc.received_on ? ` · received ${new Date(doc.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          </Text>
        </View>
        <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: statusBg }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: statusFg, textTransform: "uppercase", letterSpacing: 0.4 }}>{doc.status}</Text>
        </View>
      </View>
    </Card>
  );
}

function Counter({ label, count, color }: { label: string; count: number; color: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: t.ink3, fontWeight: "600" }}>{label}</Text>
      <Text style={{ fontSize: 13, color: t.ink, fontWeight: "800" }}>{count}</Text>
    </View>
  );
}

