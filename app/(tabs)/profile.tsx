import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useTheme } from "@/design-system/ThemeProvider";
import { Avatar, Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useCreditCurrent, useMe } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { TopBar } from "@/components/TopBar";
import { openSystemNotificationSettings, usePushRegistration } from "@/lib/notifications";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Account Exec",
  loan_exec: "Underwriter",
  client: "Tier II Investor",
};

function initialsOf(name: string | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type AccountRow = { label: string; desc: string; icon: string; onPress?: () => void };

export default function Profile() {
  const { t, isDark, mode, setMode, toggle: _toggle } = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: user } = useMe();
  const { data: credit } = useCreditCurrent();
  const push = usePushRegistration();
  const isClient = user?.role === Role.CLIENT;
  void _toggle;

  // Notifications status pulled from the live registration hook so the
  // borrower can confirm whether the OS-level permission is granted and
  // see the device's push token (used by support for diagnostics until
  // we wire POST /devices/push-tokens to persist it). Tap the row to
  // open Android system settings for our app.
  const notifDesc = push.unsupported
    ? "Not supported on this device"
    : push.error
      ? "Tap to open system settings"
      : push.status === "granted"
        ? push.token
          ? `On · ${push.provider === "expo" ? "expo" : "fcm"}…${push.token.slice(-6)}`
          : "On · token pending setup"
        : push.status === "denied"
          ? "Off · tap to enable"
          : "Awaiting permission…";

  const ACCOUNT_ROWS: AccountRow[] = [
    { label: "Linked Banks · Plaid", desc: "3 connected", icon: "shield" },
    { label: "Investor Profile", desc: "Tier II · LLC structures", icon: "user" },
    { label: "Notifications", desc: notifDesc, icon: "bell", onPress: openSystemNotificationSettings },
    { label: "Two-Factor Auth", desc: "On · Authenticator app", icon: "key" },
    { label: "Tax Documents", desc: "2025 K-1 ready", icon: "doc" },
  ];

  const handleSignOut = () => {
    Alert.alert(
      "Sign out?",
      "You'll need to sign in again to access your account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              router.replace("/(auth)/sign-in");
            } catch (e) {
              Alert.alert("Sign out failed", e instanceof Error ? e.message : "Try again.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const themeOptions: { id: "light" | "system" | "dark"; label: string; icon: string }[] = [
    { id: "light",  label: "Light", icon: "sun" },
    { id: "system", label: "Auto",  icon: "device" },
    { id: "dark",   label: "Dark",  icon: "moon" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Profile" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <Card pad={18} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar label={initialsOf(user?.name)} size={56} color={t.brand} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "700", letterSpacing: -0.3, color: t.ink }}>
                {user?.name ?? "Loading…"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <View style={{ backgroundColor: t.petrolSoft, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 0.4 }}>
                    {user?.role ? (ROLE_LABEL[user.role] ?? user.role) : "—"}
                  </Text>
                </View>
                {user?.email ? <Text style={{ fontSize: 11, color: t.ink3 }} numberOfLines={1}>· {user.email}</Text> : null}
              </View>
            </View>
          </View>
        </Card>

        {/* Credit status (client only) */}
        {isClient ? (
          <>
            <SectionLabel>Credit</SectionLabel>
            {credit ? (
              <Card pad={14} style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.profitBg, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="shieldChk" size={22} color={t.profit} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                      <Text style={{ fontSize: 17, fontWeight: "700", letterSpacing: -0.3, color: t.ink }}>{credit.fico ?? "—"}</Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: t.profit, letterSpacing: 0.4, textTransform: "uppercase" }}>Verified</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {credit.pulled_at ? `Soft pull on ${new Date(credit.pulled_at).toLocaleDateString()}` : "Soft pull on file"}
                      {credit.expires_at ? ` · expires ${new Date(credit.expires_at).toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: isDark ? "rgba(245,158,11,0.10)" : "#FFF7E6", borderWidth: 1, borderColor: t.warn + "40", flexDirection: "row", gap: 8 }}>
                  <Icon name="bell" size={14} color={t.warn} />
                  <Text style={{ flex: 1, fontSize: 11.5, color: t.ink2, lineHeight: 17 }}>
                    Re-running will replace your existing pull and reset the 90-day window. Use only if your file has materially changed.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/credit-pull",
                        params: { mode: credit?.is_expired ? "expired" : "refresh" },
                      })
                    }
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.lineStrong, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: t.ink }}>Re-Run Soft Pull</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: t.danger + "40", alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: t.danger }}>Revoke Authorization</Text>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <Card pad={14} style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.petrolSoft, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="lock" size={22} color={t.petrol} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>Credit Not Yet Verified</Text>
                    <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, lineHeight: 16 }}>
                      One soft pull unlocks all applications for 3 months · no score impact.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push("/credit-pull")}
                  style={({ pressed }) => ({
                    marginTop: 12, paddingVertical: 11, borderRadius: 11,
                    backgroundColor: t.petrol,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Icon name="unlock" size={14} color={isDark ? "#06070B" : "#fff"} />
                  <Text style={{ color: isDark ? "#06070B" : "#fff", fontSize: 13, fontWeight: "700" }}>Start Soft Pull</Text>
                </Pressable>
              </Card>
            )}
          </>
        ) : null}

        {/* Theme */}
        <SectionLabel>Appearance</SectionLabel>
        <Card pad={14} style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: t.ink2, marginBottom: 10 }}>Theme</Text>
          <View style={{ flexDirection: "row", gap: 6, backgroundColor: t.chip, borderRadius: 11, padding: 3 }}>
            {themeOptions.map((opt) => {
              const active = mode === opt.id || (opt.id === "system" && mode !== "light" && mode !== "dark");
              const isSelected = mode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    if (opt.id === "system") {
                      // Without a system-detect, keep manual: just stay in current
                      return;
                    }
                    setMode(opt.id);
                  }}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8,
                    backgroundColor: isSelected ? t.surface : "transparent",
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Icon name={opt.icon} size={14} color={isSelected ? t.ink : t.ink3} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? t.ink : t.ink3 }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Account list */}
        <SectionLabel>Account</SectionLabel>
        <Card pad={0} style={{ marginBottom: 18 }}>
          {ACCOUNT_ROWS.map((row, i) => (
            <Pressable
              key={row.label}
              onPress={row.onPress}
              disabled={!row.onPress}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 12,
                paddingVertical: 13, paddingHorizontal: 14,
                borderBottomWidth: i < ACCOUNT_ROWS.length - 1 ? 1 : 0,
                borderBottomColor: t.line,
                backgroundColor: pressed && row.onPress ? t.surface2 : "transparent",
              })}
            >
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
                <Icon name={row.icon} size={15} color={t.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>{row.label}</Text>
                <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{row.desc}</Text>
              </View>
              <Icon name="chevR" size={14} color={t.ink4} />
            </Pressable>
          ))}
        </Card>

        {/* Sign out — destructive, full-width */}
        <Pressable
          onPress={handleSignOut}
          accessibilityLabel="Sign out"
          style={({ pressed }) => ({
            paddingVertical: 14, paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: t.danger,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="lock" size={16} color={isDark ? "#06070B" : "#fff"} />
          <Text style={{ fontSize: 15, fontWeight: "800", color: isDark ? "#06070B" : "#fff", letterSpacing: 0.3 }}>
            Sign out
          </Text>
        </Pressable>
        {user?.email ? (
          <Text style={{ fontSize: 11, color: t.ink3, textAlign: "center", marginTop: 8 }}>
            Signed in as {user.email}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
