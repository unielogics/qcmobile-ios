// 4-mode composer for the agent-side of the loan chat surface.
//
// Modes (for BROKER role):
//   - Live Chat    : message is client-visible AND pauses the AI for 60min.
//                    Marquee mode for human takeover.
//   - Ask AI       : broker-private question, AI answers without notifying client.
//   - Suggest      : drafts a reply that the AI sends after broker approval.
//   - Instruct     : instruction to the AI for future replies on this thread.
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";
import type { DealChatMode } from "@/lib/mocks";
import { useSendLoanChat } from "@/hooks/useApi";

interface Props {
  loanId: string;
  onSent?: (mode: DealChatMode, paused_until: string | null) => void;
  // Drives mode chip visibility. BROKER sees the 4-mode set;
  // SUPER_ADMIN/LOAN_EXEC see Chat (= classic super-admin takeover)
  // + Instruct + Ask AI.
  viewerRole: "broker" | "super_admin" | "loan_exec";
}

interface ModeChip {
  mode: DealChatMode;
  label: string;
  hint: string;
  icon: IconName;
}

const BROKER_MODES: ModeChip[] = [
  { mode: "live_chat",         label: "Live Chat",     hint: "Reply directly · pauses AI for 1h", icon: "send" },
  { mode: "broker_question",   label: "Ask AI",        hint: "Broker-private question to the AI", icon: "spark" },
  { mode: "broker_suggestion", label: "Suggest",       hint: "Draft a reply for the AI to send",  icon: "doc" },
  { mode: "instruct",          label: "Instruct AI",   hint: "Permanent rule for this thread",    icon: "shield" },
];

const ADMIN_MODES: ModeChip[] = [
  { mode: "chat",     label: "Chat",         hint: "Operator takeover · pauses AI for 1h", icon: "send" },
  { mode: "instruct", label: "Instruct AI",  hint: "Permanent rule for this thread",       icon: "shield" },
  { mode: "broker_question", label: "Ask AI", hint: "Quick question to the AI",            icon: "spark" },
];

export function LoanChatComposer({ loanId, onSent, viewerRole }: Props) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const send = useSendLoanChat();
  const modes = viewerRole === "broker" ? BROKER_MODES : ADMIN_MODES;
  const [mode, setMode] = useState<DealChatMode>(modes[0].mode);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const submit = async () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    try {
      const res = await send.mutateAsync({ loanId, body: text, mode });
      setDraft("");
      if (res.paused_until) {
        setFlash("AI paused for ~1h while you reply directly.");
        setTimeout(() => setFlash(null), 4000);
      }
      onSent?.(mode, res.paused_until);
    } catch (e) {
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

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={
            mode === "live_chat" || mode === "chat"
              ? "Type a message to the client…"
              : mode === "broker_question"
                ? "Ask the AI…"
                : mode === "broker_suggestion"
                  ? "Draft a reply for the AI to send…"
                  : "Tell the AI how to handle this thread going forward…"
          }
          placeholderTextColor={t.ink4}
          multiline
          editable={!send.isPending}
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
    </View>
  );
}
