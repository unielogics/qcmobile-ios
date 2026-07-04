// 4-mode composer for the agent-side of the loan chat surface.
//
// Modes (for BROKER role):
//   - Live Chat    : message is client-visible AND pauses Elara for 60min.
//                    Marquee mode for human takeover.
//   - Ask Elara       : broker-private question, AI answers without notifying client.
//   - Suggest      : drafts a reply that Elara sends after broker approval.
//   - Instruct     : instruction to Elara for future replies on this thread.
//
// Phase 4: matches desktop's DealChatInput exactly so the loan chat
// behaves identically across surfaces. Live Chat is leftmost and
// default — opening the panel during a hand-on moment puts the
// broker in the right mode without an extra tap.

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";
import type { DealChatMode } from "@/lib/mocks";
import { useSendLoanChat, useUploadDocument } from "@/hooks/useApi";

interface Props {
  loanId: string;
  onSent?: (mode: DealChatMode, paused_until: string | null) => void;
  // Drives mode chip visibility. BROKER sees the 4-mode set;
  // SUPER_ADMIN/LOAN_EXEC see Chat (= classic super-admin takeover)
  // + Instruct + Ask Elara.
  viewerRole: "broker" | "super_admin" | "loan_exec";
}

interface ModeChip {
  mode: DealChatMode;
  label: string;
  hint: string;
  icon: IconName;
}

const BROKER_MODES: ModeChip[] = [
  { mode: "live_chat",         label: "Live Chat",     hint: "Reply directly · pauses Elara for 1h", icon: "send" },
  { mode: "broker_question",   label: "Ask Elara",        hint: "Broker-private question to Elara", icon: "spark" },
  { mode: "broker_suggestion", label: "Suggest",       hint: "Draft a reply for Elara to send",  icon: "doc" },
  { mode: "instruct",          label: "Instruct Elara",   hint: "Permanent rule for this thread",    icon: "shield" },
];

const ADMIN_MODES: ModeChip[] = [
  { mode: "chat",     label: "Chat",         hint: "Operator takeover · pauses Elara for 1h", icon: "send" },
  { mode: "instruct", label: "Instruct Elara",  hint: "Permanent rule for this thread",       icon: "shield" },
  { mode: "broker_question", label: "Ask Elara", hint: "Quick question to Elara",            icon: "spark" },
];

export function LoanChatComposer({ loanId, onSent, viewerRole }: Props) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const send = useSendLoanChat();
  const uploadDoc = useUploadDocument();
  const modes = viewerRole === "broker" ? BROKER_MODES : ADMIN_MODES;
  const [mode, setMode] = useState<DealChatMode>(modes[0].mode);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ document_id: string; name: string } | null>(null);

  const pickAttachment = async () => {
    if (uploadDoc.isPending) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const file = picked.assets[0];
      const init = await uploadDoc.mutateAsync({
        loan_id: loanId,
        is_other: true,
        file: {
          uri: file.uri,
          name: file.name ?? "attachment",
          mimeType: file.mimeType ?? "application/octet-stream",
        },
      });
      setStaged({ document_id: init.document_id, name: file.name ?? "attachment" });
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't attach the file.");
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if ((!text && !staged) || send.isPending) return;
    const att = staged;
    setDraft("");
    setStaged(null);
    try {
      const res = await send.mutateAsync({
        loanId,
        body: text || (att ? `Uploaded: ${att.name}` : ""),
        mode,
        attachment_document_id: att?.document_id ?? null,
        optimistic_from_role:
          mode === "broker_question"
            ? "broker_internal"
            : viewerRole === "broker"
              ? "broker"
              : "super_admin",
        optimistic_client_visible: mode !== "broker_question",
      });
      if (res.paused_until) {
        setFlash("Elara paused for ~1h while you reply directly.");
        setTimeout(() => setFlash(null), 4000);
      }
      onSent?.(mode, res.paused_until);
    } catch (e) {
      setDraft(text);
      if (att) setStaged(att);
      setFlash(e instanceof Error ? e.message : "Send failed.");
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const current = modes.find((m) => m.mode === mode) ?? modes[0];

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.line,
        backgroundColor: t.bg,
        paddingTop: 8,
        // Sit above the Android system nav bar / iOS home indicator
        // so the send button isn't clipped by the OS chrome.
        paddingBottom: Math.max(8, insets.bottom + 4),
        gap: 8,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
      >
        {modes.map((m) => {
          const active = mode === m.mode;
          const tint =
            m.mode === "live_chat" || m.mode === "chat"
              ? { bg: t.warnBg, fg: t.warn, border: t.warn }
              : m.mode === "broker_question"
                ? { bg: t.petrolSoft, fg: t.petrol, border: t.petrol }
                : m.mode === "broker_suggestion"
                  ? { bg: t.brandSoft, fg: t.brand, border: t.brand }
                  : { bg: t.chip, fg: t.ink, border: t.lineStrong };
          return (
            <Pressable
              key={m.mode}
              onPress={() => setMode(m.mode)}
              accessibilityLabel={`Mode: ${m.label}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 7,
                paddingHorizontal: 11,
                borderRadius: 999,
                backgroundColor: active ? tint.bg : t.surface2,
                borderWidth: 1,
                borderColor: active ? tint.border : t.line,
              }}
            >
              <Icon name={m.icon} size={12} color={active ? tint.fg : t.ink2} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? tint.fg : t.ink2 }}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={{ fontSize: 11, color: t.ink3, paddingHorizontal: 14, lineHeight: 15 }}>
        {current.hint}
      </Text>

      {flash ? (
        <View style={{ marginHorizontal: 12, padding: 8, borderRadius: 8, backgroundColor: t.warnBg }}>
          <Text style={{ fontSize: 12, color: t.warn, fontWeight: "600" }}>{flash}</Text>
        </View>
      ) : null}

      {staged ? (
        <View style={{ marginHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 10, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }}>
          <Icon name="paperclip" size={13} color={t.ink3} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: t.ink2 }}>{staged.name}</Text>
          <Pressable onPress={() => setStaged(null)} accessibilityLabel="Remove attachment" hitSlop={8}>
            <Icon name="x" size={13} color={t.ink3} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12 }}>
        <Pressable
          onPress={pickAttachment}
          disabled={uploadDoc.isPending}
          accessibilityLabel="Attach a file"
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line,
            alignItems: "center", justifyContent: "center",
            opacity: pressed || uploadDoc.isPending ? 0.6 : 1,
          })}
        >
          {uploadDoc.isPending ? (
            <ActivityIndicator size="small" color={t.ink3} />
          ) : (
            <Icon name="paperclip" size={18} color={t.ink2} />
          )}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={
            mode === "live_chat" || mode === "chat"
              ? "Type a message to the client…"
              : mode === "broker_question"
                ? "Ask Elara…"
                : mode === "broker_suggestion"
                  ? "Draft a reply for Elara to send…"
                  : "Tell Elara how to handle this thread going forward…"
          }
          placeholderTextColor={t.ink4}
          multiline
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 120,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            backgroundColor: t.surface2,
            borderWidth: 1,
            borderColor: t.line,
            color: t.ink,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={submit}
          disabled={(!draft.trim() && !staged) || send.isPending}
          accessibilityLabel="Send"
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: (draft.trim() || staged) && !send.isPending ? t.brand : t.chip,
            alignItems: "center", justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {send.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon name="send" size={18} color={(draft.trim() || staged) && !send.isPending ? "#fff" : t.ink4} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
