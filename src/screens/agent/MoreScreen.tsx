import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon, type IconName } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { useCurrentUser } from "@/hooks/useApi";

interface Row {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}

export function MoreScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: user } = useCurrentUser();

  const goSignOut = () => {
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try { await signOut(); } catch { /* swallow */ }
        },
      },
    ]);
  };

  const rows: Row[] = [
    { icon: "user", label: "Profile", detail: user?.email ?? undefined, onPress: () => router.push("/agent/profile" as Href) },
    { icon: "calc", label: "Deal Analyzer", detail: "Fix & flip decisions", onPress: () => router.push("/agent/deal-analyzer" as Href) },
    { icon: "sliders", label: "Simulate", detail: "Pricing what-ifs", onPress: () => router.push("/agent/simulate" as Href) },
    { icon: "docCheck", label: "Prequalifications", detail: "Pending + approved requests", onPress: () => router.push("/agent/prequalifications" as Href) },
    { icon: "bell", label: "Inbox", detail: "AI tasks + alerts", onPress: () => router.push("/agent/(tabs)/inbox" as Href) },
    { icon: "trend", label: "Performance", detail: "Funnel + velocity", onPress: () => router.push("/agent/performance" as Href) },
    { icon: "trend", label: "Rates", detail: "Today's market", onPress: () => router.push("/agent/rates" as Href) },
    { icon: "gear", label: "Settings", onPress: () => router.push("/agent/settings" as Href) },
    { icon: "x", label: "Sign out", onPress: goSignOut, destructive: true },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="More" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}>
        {user ? (
          <Card pad={16}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
              Signed in as
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink, marginTop: 4 }}>{user.name || user.email}</Text>
            <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>Agent</Text>
          </Card>
        ) : null}

        {rows.map((r) => (
          <Pressable
            key={r.label}
            onPress={r.onPress}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 14,
              paddingVertical: 13, paddingHorizontal: 14,
              backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
              borderRadius: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: r.destructive ? t.dangerBg : t.surface2, alignItems: "center", justifyContent: "center" }}>
              <Icon name={r.icon} size={16} color={r.destructive ? t.danger : t.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: r.destructive ? t.danger : t.ink }}>{r.label}</Text>
              {r.detail ? <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{r.detail}</Text> : null}
            </View>
            <Icon name="external" size={14} color={t.ink3} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
