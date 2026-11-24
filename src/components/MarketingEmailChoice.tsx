import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";

const label = "Email me financing education and lending updates from Qualified Commercial at my account email. I can unsubscribe at any time.";

export function MarketingEmailChoice({ checked, onChange, disabled = false }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 }}
    >
      <View style={{ width: 20, height: 20, borderWidth: 1, borderColor: t.ink3, borderRadius: 3, alignItems: "center" }}>
        <Text style={{ color: t.brand, fontWeight: "700" }}>{checked ? "✓" : ""}</Text>
      </View>
      <Text style={{ flex: 1, color: t.ink, fontSize: 13, lineHeight: 19 }}>{label}</Text>
    </Pressable>
  );
}
