import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";
import { FundingAccessGate } from "@/components/FundingAccessGate";
import { UnlinkedAccountScreen } from "@/components/UnlinkedAccountScreen";
import { useExperienceMode } from "@/hooks/useExperienceMode";
import { useCurrentUser } from "@/hooks/useApi";

function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  return <Icon name={name} size={20} stroke={focused ? 2.4 : 1.8} color={color} />;
}

export default function TabsLayout() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useExperienceMode();
  // /auth/me — gates the "unlinked" branch below. Brokers have no
  // linked Client row by design, so /clients/me 404s for them and
  // useExperienceMode would otherwise mistakenly show
  // UnlinkedAccountScreen here while AuthGate is still in the
  // middle of redirecting them to /agent/today.
  const { data: me, isLoading: meLoading } = useCurrentUser();
  // Bail out before rendering tab routes — the previous code silently
  // fell through to self_directed when the calling user had no linked
  // Client row, which corrupted both the workflow choice and the
  // visibility of the agent's prior data (credit, docs, history).
  // Loading: render nothing for one tick; unlinked: show the support
  // screen with retry + sign-out.
  // Two extra short-circuits below `mode === "loading"`:
  //   1. While /auth/me is still in flight, don't risk rendering the
  //      unlinked screen — wait for the role first.
  //   2. If the user is a broker, declaratively redirect them to
  //      /agent/today instead of rendering the borrower tabs.
  //      Brokers don't have a Client row by design, so /clients/me
  //      404s for them — without this short-circuit the
  //      UnlinkedAccountScreen would flash during the handoff.
  if (mode === "loading") return null;
  if (meLoading) return null;
  if (me?.role === "broker") return <Redirect href="/agent/today" />;
  if (mode === "unlinked") return <UnlinkedAccountScreen />;
  const guided = mode === "guided";

  return (
    <FundingAccessGate>
    <Tabs
      screenOptions={{
        headerShown: false,
        // Add the system nav-bar inset to the tab bar's bottom
        // padding + height so the labels never sit under the S22's
        // on-screen Home/Back/Recents bar (gesture-only phones like
        // the Z Fold report insets.bottom ≈ 16-24px; 3-button-nav
        // phones report ~48-56px — both flow naturally).
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.line,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 6,
          height: 64 + insets.bottom,
        },
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.ink4,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          href: guided ? null : "/(tabs)/calendar",
          tabBarIcon: ({ color, focused }) => <TabIcon name="cal" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="simulator"
        options={{
          // Guided: this tab IS the Deal Analyzer. Self-directed: the
          // classic Simulate tool (Deal Analyzer is its own tab below).
          title: guided ? "Deal Analyzer" : "Simulate",
          tabBarIcon: ({ color, focused }) => <TabIcon name="sliders" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="deal-analyzer"
        options={{
          title: "Deal Analyzer",
          // Self-directed only — takes the old Profile slot and sits
          // before Vault. Guided uses the simulator tab instead.
          href: guided ? null : "/(tabs)/deal-analyzer",
          tabBarIcon: ({ color, focused }) => <TabIcon name="calc" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: guided ? "Documents" : "Vault",
          tabBarIcon: ({ color, focused }) => <TabIcon name="vault" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          // Self-directed reaches Profile via the header avatar, so
          // hide it from the bottom bar there. Guided keeps it.
          href: guided ? "/(tabs)/profile" : null,
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
    </Tabs>
    </FundingAccessGate>
  );
}
