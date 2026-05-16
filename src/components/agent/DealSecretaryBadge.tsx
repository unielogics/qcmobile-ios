import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Dot } from "@/design-system/primitives";
import type { DealSecretarySummary } from "@/lib/mocks";

// Compact AI Deal-Secretary status dot for a loan card. Shown
// inline next to the deal-health pill on every pipeline row.
export function DealSecretaryBadge({ summary }: { summary: DealSecretarySummary | undefined }) {
  const { t } = useTheme();
  if (!summary) return null;
  const tone =
    summary.ai_blocked
      ? { dot: t.danger, label: "AI blocked", fg: t.danger, bg: t.dangerBg }
      : summary.state === "needs_input"
        ? { dot: t.warn, label: "AI needs input", fg: t.warn, bg: t.warnBg }
        : summary.state === "running"
          ? { dot: t.petrol, label: "AI working", fg: t.petrol, bg: t.petrolSoft }
          : summary.state === "complete"
            ? { dot: t.profit, label: "AI ready", fg: t.profit, bg: t.profitBg }
            : { dot: t.ink4, label: "AI idle", fg: t.ink3, bg: t.chip };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: tone.bg,
      }}
    >
      <Dot color={tone.dot} size={6} />
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: tone.fg, letterSpacing: 0.5 }}>
        {tone.label}
      </Text>
    </View>
  );
}
