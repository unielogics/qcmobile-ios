import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";

export function KpiTile({
  label, value, accent, onPress, style,
}: {
  label: string;
  value: string | number;
  accent?: "neutral" | "warn" | "danger" | "profit";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, isDark } = useTheme();
  const accentColor = accent === "warn" ? t.warn
    : accent === "danger" ? t.danger
    : accent === "profit" ? t.profit
    : t.ink;

  const inner = (
    <>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "800", color: accentColor, marginTop: 6 }}>{value}</Text>
    </>
  );

  const baseStyle: StyleProp<ViewStyle> = {
    flex: 1,
    minWidth: 130,
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    shadowColor: isDark ? "transparent" : "#0B1629",
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[baseStyle, style]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={[baseStyle, style]}>{inner}</View>;
}
