// Lender thread for a loan. Read messages + send drafts. Connect/
// disconnect lender via a BottomSheet.
// Phase 4 — gated by BACKEND_HAS_LENDER_THREAD.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import {
  useDraftLenderSend,
  useLenderConnection,
  useLenderMessages,
} from "@/hooks/useApi";

export function LenderChatTab({ loanId, bottomPad }: { loanId: string; bottomPad: number }) {
  const { t } = useTheme();
  const { data: connection } = useLenderConnection(loanId);
  const { data: messages = [] } = useLenderMessages(loanId);
  const send = useDraftLenderSend();
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    await send.mutateAsync({ loanId, body: text });
    setDraft("");
  };

  if (!connection || connection.status !== "connected") {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
        <Card pad={18}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}>
              <Icon name="building2" size={16} color={t.ink3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: t.ink }}>No lender connected</Text>
              <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                Connect a lender to unlock the shared thread.
              </Text>
            </View>
            <Pill bg={t.chip} color={t.ink2}>{connection?.status ?? "—"}</Pill>
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <KeyboardAware excludeTabBar>
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <Card pad={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name="building2" size={14} color={t.brand} />
            </View>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "800", color: t.ink }} numberOfLines={1}>
              {connection.lender_name ?? "Lender"}
            </Text>
            <Pill bg={t.profitBg} color={t.profit}>Connected</Pill>
          </View>
        </Card>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: bottomPad - 70 }}>
        {messages.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: t.ink3, textAlign: "center", paddingVertical: 20 }}>
            No lender messages yet. Send a draft below to start the thread.
          </Text>
        ) : (
          messages.map((m) => {
            const isBroker = m.from_role === "broker";
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: isBroker ? "flex-end" : "flex-start",
                  maxWidth: "86%",
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: isBroker ? t.brandSoft : t.surface,
                  borderColor: t.line, borderWidth: isBroker ? 0 : 1,
                }}
              >
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: isBroker ? t.brand : t.ink3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>
                  {m.from_role}
                </Text>
                <Text style={{ fontSize: 14, color: isBroker ? t.brand : t.ink, lineHeight: 19 }}>{m.body}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: t.line,
          backgroundColor: t.bg,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Draft a message to the lender…"
          placeholderTextColor={t.ink4}
          multiline
          editable={!send.isPending}
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
          accessibilityLabel="Send to lender"
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: draft.trim() && !send.isPending ? t.brand : t.chip,
            alignItems: "center", justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {send.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={18} color={draft.trim() && !send.isPending ? "#fff" : t.ink4} />}
        </Pressable>
      </View>
    </KeyboardAware>
  );
}
