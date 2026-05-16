import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { SectionLabel } from "@/design-system/primitives";

const PROMPTS = [
  "What is blocking this deal?",
  "What should I tell the borrower?",
  "Can this close this month?",
  "Summarize this file.",
] as const;

export function AIPromptPicker({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <SectionLabel>Quick prompts</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
        {PROMPTS.map((p) => (
          <Pressable
            key={p}
            onPress={() => onPick(p)}
            style={({ pressed }) => ({
              backgroundColor: t.surface,
              borderColor: t.line, borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 8, paddingHorizontal: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: t.ink }}>{p}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
