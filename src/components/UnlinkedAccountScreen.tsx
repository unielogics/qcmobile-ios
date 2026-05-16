import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";

// Shown when /clients/me 404s — the calling user has no linked
// Client row yet. Replaces the previous silent fall-through to
// self_directed which incorrectly started the wrong workflow and
// hid the agent's pre-existing credit / docs / loan history.
//
// Once the backend adopts the orphan Client (deps.get_current_user
// adoption guard), the next refetch will return a real Client and
// this screen disappears.
export function UnlinkedAccountScreen() {
  const { t } = useTheme();
  const { signOut } = useAuth();
  const qc = useQueryClient();

  function retry() {
    qc.invalidateQueries({ queryKey: ["my-client"] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
        <Card pad={24}>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: t.warnBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="alert" size={26} color={t.warn} />
            </View>
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: t.ink,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            Your account isn&apos;t linked yet
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: t.ink2,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 6,
            }}
          >
            We couldn&apos;t find a profile attached to this email. If your agent invited you, the
            link usually completes within a minute of signing in — pull to retry.
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: t.ink3,
              textAlign: "center",
              lineHeight: 18,
              marginBottom: 22,
            }}
          >
            Still stuck after a minute? Contact your agent so they can verify the email on your
            file matches the one you signed in with.
          </Text>
          <Pressable
            onPress={retry}
            style={({ pressed }) => ({
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: t.brand,
              opacity: pressed ? 0.85 : 1,
              marginBottom: 10,
            })}
          >
            <Text style={{ color: t.inverse, fontWeight: "800", fontSize: 14 }}>
              Retry
            </Text>
          </Pressable>
          <Pressable
            onPress={() => signOut()}
            style={({ pressed }) => ({
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: t.line,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: t.ink2, fontWeight: "700", fontSize: 13 }}>
              Sign out
            </Text>
          </Pressable>
        </Card>
      </View>
    </SafeAreaView>
  );
}
