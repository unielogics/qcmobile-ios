import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import { useAIChatThread, useMarkThreadSeen, useSendAIChatMessage } from "@/hooks/useApi";

export default function AgentThreadRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { data: thread } = useAIChatThread(threadId);
  const send = useSendAIChatMessage();
  const markSeen = useMarkThreadSeen();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (threadId) markSeen.mutate(threadId);
    // markSeen ref-stable; intentionally only fire once per threadId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (thread?.messages?.length) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [thread?.messages?.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft("");
    try {
      await send.mutateAsync({ threadId, body, loan_id: thread?.loan_id ?? null });
    } catch {
      setDraft(body);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }} numberOfLines={1}>
            {thread?.title || thread?.loan_address || "AI assistant"}
          </Text>
          {thread?.loan_deal_id ? (
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{thread.loan_deal_id}</Text>
          ) : null}
        </View>
      </View>

      <KeyboardAware excludeTabBar>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          keyboardShouldPersistTaps="handled"
        >
          {(thread?.messages ?? []).map((m) => {
            const mine = m.role === "user";
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  backgroundColor: mine ? t.brand : t.surface,
                  borderColor: t.line, borderWidth: mine ? 0 : 1,
                  borderRadius: 14,
                  paddingVertical: 10, paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: mine ? "#fff" : t.ink, fontSize: 14, lineHeight: 19 }}>{m.body}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: Math.max(12, insets.bottom + 4), borderTopColor: t.line, borderTopWidth: 1, backgroundColor: t.surface }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Reply…"
            placeholderTextColor={t.ink4}
            multiline
            style={{
              flex: 1, color: t.ink, fontSize: 14,
              backgroundColor: t.surface2, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9, minHeight: 38, maxHeight: 120,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || send.isPending}
            style={({ pressed }) => ({
              backgroundColor: t.brand,
              paddingHorizontal: 14, borderRadius: 10,
              alignItems: "center", justifyContent: "center",
              opacity: !draft.trim() || send.isPending ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Icon name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAware>
    </SafeAreaView>
  );
}
