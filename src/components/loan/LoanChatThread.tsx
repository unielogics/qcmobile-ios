// Renders the SAME chat thread the client sees (and the operator
// sees on desktop). Bubble styling matches desktop DealChatThread:
//   - AI            : surface bubble, default text
//   - SUPER_ADMIN   : petrol-tinted (operator takeover)
//   - BROKER        : gold-tinted   (broker takeover via Live Chat)
//   - BROKER_INTERNAL: dashed border, visible only to broker / super_admin
//   - CLIENT        : right-aligned, brand-tinted
//
// Hidden filter: `viewerRole` controls whether BROKER_INTERNAL
// messages render at all (clients never see them).

import { useEffect, useRef } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import type { LoanChatMessage, DealChatRole } from "@/lib/mocks";

interface Props {
  messages: LoanChatMessage[];
  viewerRole: "broker" | "super_admin" | "loan_exec" | "client";
}

export function LoanChatThread({ messages, viewerRole }: Props) {
  const { t } = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  const filtered = messages.filter((m) => {
    if (m.from_role === "broker_internal") {
      return viewerRole === "broker" || viewerRole === "super_admin" || viewerRole === "loan_exec";
    }
    return true;
  });

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 14, gap: 10 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {filtered.length === 0 ? (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 12.5, color: t.ink3, textAlign: "center", lineHeight: 18 }}>
            No messages yet. Start with a Live Chat to pause the AI and reply directly, or use
            Ask AI to keep the AI working on this thread.
          </Text>
        </View>
      ) : (
        filtered.map((m) => <Bubble key={m.id} m={m} viewerRole={viewerRole} />)
      )}
    </ScrollView>
  );
}

function Bubble({ m, viewerRole }: { m: LoanChatMessage; viewerRole: Props["viewerRole"] }) {
  const { t } = useTheme();
  const isClient = m.from_role === "client";
  const isInternal = m.from_role === "broker_internal";

  const tone = bubbleTone(m.from_role, t);
  const ownSide =
    (viewerRole === "client" && isClient) ||
    ((viewerRole === "broker" || viewerRole === "super_admin" || viewerRole === "loan_exec") &&
      !isClient);

  return (
    <View style={{ alignSelf: ownSide ? "flex-end" : "flex-start", maxWidth: "86%", gap: 4 }}>
      {!isClient ? (
        <Text style={{ fontSize: 10.5, fontWeight: "700", color: tone.label, letterSpacing: 0.6, textTransform: "uppercase" }}>
          {roleLabel(m)}
          {isInternal ? " · internal" : ""}
        </Text>
      ) : null}
      <View
        style={{
          padding: 12,
          borderRadius: 14,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderWidth: tone.borderWidth,
          borderStyle: isInternal ? "dashed" : "solid",
        }}
      >
        <Text style={{ fontSize: 14, color: tone.text, lineHeight: 19 }}>{m.body}</Text>
        {m.attachment ? (
          <Pressable
            onPress={() => { if (m.attachment?.url) Linking.openURL(m.attachment.url); }}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              marginTop: 8, paddingVertical: 6, paddingHorizontal: 10,
              borderRadius: 8, backgroundColor: t.surface2,
              borderWidth: 1, borderColor: t.line,
            }}
          >
            <Icon name="doc" size={13} color={tone.text} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: tone.text }}>
              {m.attachment.name}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={{ fontSize: 10.5, color: t.ink4 }}>
        {new Date(m.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </Text>
    </View>
  );
}

function bubbleTone(role: DealChatRole, t: ReturnType<typeof useTheme>["t"]) {
  if (role === "client") return { bg: t.brandSoft, border: "transparent", borderWidth: 0, text: t.brand, label: t.brand };
  if (role === "super_admin") return { bg: t.petrolSoft, border: t.petrol, borderWidth: 1, text: t.ink, label: t.petrol };
  if (role === "broker") return { bg: t.warnBg, border: t.warn, borderWidth: 1, text: t.ink, label: t.warn };
  if (role === "broker_internal") return { bg: t.surface2, border: t.line, borderWidth: 1, text: t.ink2, label: t.ink3 };
  return { bg: t.surface, border: t.line, borderWidth: 1, text: t.ink, label: t.ink3 };
}

function roleLabel(m: LoanChatMessage): string {
  if (m.from_role === "ai") return "Smart Assistant";
  const roleWord =
    m.from_role === "super_admin" ? "Operator"
    : m.from_role === "broker" ? "Agent"
    : m.from_role === "broker_internal" ? "Agent note"
    : m.from_role === "client" ? "Client"
    : String(m.from_role);
  return m.from_name ? `${m.from_name} (${roleWord})` : roleWord;
}
