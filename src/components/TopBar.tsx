// Sticky top bar — the same on every tab. Branding (logo + 2-line wordmark)
// sits on the left, screen title underneath, account/theme/notification
// chips on the right.

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { QcLogo } from "@/design-system/QcLogo";
import { useMe, useAIChatThreads } from "@/hooks/useApi";
import { useConcierge } from "@/store/concierge";

function initialsOf(name: string | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function TopBar({
  title,
  onAIPress,
  titleAction,
}: {
  title: string;
  // When provided, the bell slot is replaced with an AI-secretary
  // launcher chip. Used by the agent Today tab to surface a global
  // entry point to the account-wide AIChatSheet.
  onAIPress?: () => void;
  titleAction?: ReactNode;
}) {
  const { t, isDark, toggle } = useTheme();
  const router = useRouter();
  const { data: user } = useMe();
  const openConcierge = useConcierge((s) => s.openConcierge);
  const { data: threads = [] } = useAIChatThreads();
  const unreadCount = threads.filter((th) => th.unread).length;

  return (
    <View style={{
      paddingTop: 6,
      paddingHorizontal: 18,
      paddingBottom: 12,
      backgroundColor: t.bg,
    }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        {/* Left: logo + 2-line wordmark */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <QcLogo size={36} />
          <View>
            <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink, letterSpacing: -0.2, lineHeight: 15 }}>
              Qualified
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink, letterSpacing: -0.2, lineHeight: 15 }}>
              Commercial
            </Text>
          </View>
        </View>

        {/* Right: avatar / theme / bell */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            accessibilityLabel="Profile"
            style={{
              width: 36, height: 36, borderRadius: 999,
              backgroundColor: t.brandSoft,
              borderWidth: 1, borderColor: t.line,
              alignItems: "center", justifyContent: "center",
            }}>
            <Text style={{ color: t.brand, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 }}>
              {initialsOf(user?.name)}
            </Text>
          </Pressable>
          <Pressable
            onPress={toggle}
            accessibilityLabel="Toggle theme"
            style={{
              width: 36, height: 36, borderRadius: 11,
              backgroundColor: t.surface,
              borderWidth: 1, borderColor: t.line,
              alignItems: "center", justifyContent: "center",
            }}>
            <Icon name={isDark ? "sun" : "moon"} size={16} color={t.ink2} />
          </Pressable>
          {/* AI Concierge — orange launcher, opens the globally
              mounted AIChatSheet via the concierge store. Sits next
              to notifications with a minimalistic unread badge. */}
          <Pressable
            onPress={() => (onAIPress ? onAIPress() : openConcierge())}
            accessibilityLabel="AI Concierge"
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 11,
              backgroundColor: t.warnBg,
              borderWidth: 1, borderColor: t.warn,
              alignItems: "center", justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}>
            <Icon name="chat" size={16} color={t.warn} />
            {unreadCount > 0 ? (
              <View style={{
                position: "absolute", top: -5, right: -5,
                minWidth: 16, height: 16, borderRadius: 999,
                paddingHorizontal: 4,
                backgroundColor: t.danger,
                borderWidth: 1.5, borderColor: t.bg,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="Notifications"
            style={{
              width: 36, height: 36, borderRadius: 11,
              backgroundColor: t.surface,
              borderWidth: 1, borderColor: t.line,
              alignItems: "center", justifyContent: "center",
            }}>
            <Icon name="bell" size={16} color={t.ink2} />
            <View style={{
              position: "absolute", top: 7, right: 8,
              width: 7, height: 7, borderRadius: 999,
              backgroundColor: t.danger,
              borderWidth: 1.5, borderColor: t.surface,
            }} />
          </Pressable>
        </View>
      </View>

      {/* Screen title — large, on its own row beneath the brand block */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
        <Text style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: "700", letterSpacing: -0.6, color: t.ink }}>
          {title}
        </Text>
        {titleAction}
      </View>
    </View>
  );
}
