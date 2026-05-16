import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";
import type { NextAction, NextActionKind } from "@/lib/types";

const ICON_FOR: Record<NextActionKind, IconName> = {
  call_lead: "user",
  chase_doc: "vault",
  closing_prep: "bolt",
  pending_task: "spark",
};

export function NextActionRow({ action, onPress }: { action: NextAction; onPress?: () => void }) {
  const { t } = useTheme();
  const priorityColor = action.priority === "high" ? t.danger
    : action.priority === "medium" ? t.warn
    : t.ink3;
  const priorityBg = action.priority === "high" ? t.dangerBg
    : action.priority === "medium" ? t.warnBg
    : t.chip;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 12, paddingHorizontal: 14,
        backgroundColor: t.surface,
        borderColor: t.line, borderWidth: 1,
        borderRadius: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: priorityBg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={ICON_FOR[action.kind]} size={18} color={priorityColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }} numberOfLines={1}>{action.title}</Text>
        <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }} numberOfLines={1}>{action.subtitle}</Text>
      </View>
      <Icon name="external" size={14} color={t.ink3} />
    </Pressable>
  );
}
