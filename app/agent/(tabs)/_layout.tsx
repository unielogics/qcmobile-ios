import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";

function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  return <Icon name={name} size={20} stroke={focused ? 2.4 : 1.8} color={color} />;
}

export default function AgentTabsLayout() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Add insets.bottom so the tab labels never sit under the
        // S22's on-screen Home/Back/Recents bar. Gesture-nav phones
        // (Z Fold) report ~16-24px; 3-button-nav phones (S22) report
        // ~48-56px — both flow naturally.
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
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused }) => <TabIcon name="bolt" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pipeline"
        options={{
          title: "Pipeline",
          tabBarIcon: ({ color, focused }) => <TabIcon name="layers" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, focused }) => <TabIcon name="cal" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          // Moved into "More" — hidden from the bar (Calendar takes
          // this slot) but the route stays valid.
          href: null,
          tabBarIcon: ({ color, focused }) => <TabIcon name="bell" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => <TabIcon name="more" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
