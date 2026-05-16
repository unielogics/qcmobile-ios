import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";

export interface StageChipOption<V extends string> {
  value: V;
  label: string;
}

export function StageFilterChips<V extends string>({
  options,
  selected,
  onChange,
  allLabel = "All",
}: {
  options: ReadonlyArray<StageChipOption<V>>;
  selected: V | null;
  onChange: (next: V | null) => void;
  allLabel?: string;
}) {
  const { t } = useTheme();
  const renderChip = (label: string, isActive: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: isActive ? t.brand : t.surface2,
        borderColor: isActive ? t.brand : t.line,
        borderWidth: 1,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? "#fff" : t.ink2 }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        {renderChip(allLabel, selected === null, () => onChange(null))}
        {options.map((o) => renderChip(o.label, selected === o.value, () => onChange(o.value)))}
      </View>
    </ScrollView>
  );
}
