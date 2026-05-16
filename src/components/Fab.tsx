import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";

export function Fab({
  onPress,
  icon = "plus",
  unread = false,
}: {
  onPress?: () => void;
  icon?: string;
  // When true, render a small red dot in the top-right corner.
  // Used by the AI-chat FAB on the dashboard to signal unseen
  // assistant messages.
  unread?: boolean;
}) {
  const { t, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    // 28 lifts the FAB clear of the bottom tab bar; insets.bottom
    // accounts for the system nav bar on phones that show it
    // (S22 ≈ 48-56px; Z Fold gesture-nav ≈ 16-24px).
    <View pointerEvents="box-none" style={{ position: "absolute", right: 16, bottom: 28 + insets.bottom, zIndex: 40 }}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={unread ? "Quick action — new message" : "Quick action"}
        style={({ pressed }) => ({
          width: 56, height: 56, borderRadius: 18,
          backgroundColor: t.petrol,
          alignItems: "center", justifyContent: "center",
          shadowColor: t.petrol,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name={icon} size={26} stroke={2.5} color={isDark ? "#06070B" : "#fff"} />
        {unread ? (
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: t.danger,
              borderWidth: 2,
              borderColor: t.petrol,
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}
