import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";

const LABEL: Record<NonNullable<DealHealth>, string> = {
  on_track: "On track",
  at_risk: "At risk",
  stuck: "Stuck",
};

type DealHealth = "on_track" | "at_risk" | "stuck" | null | undefined;

export function DealHealthPill({ health }: { health: DealHealth }) {
  const { t } = useTheme();
  if (!health) return null;
  const map = {
    on_track: { bg: t.profitBg, fg: t.profit },
    at_risk: { bg: t.warnBg, fg: t.warn },
    stuck: { bg: t.dangerBg, fg: t.danger },
  } as const;
  const { bg, fg } = map[health];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: fg }} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: fg }}>{LABEL[health]}</Text>
    </View>
  );
}
