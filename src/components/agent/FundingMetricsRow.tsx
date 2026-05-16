import { ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { KpiTile } from "@/components/agent/KpiTile";
import { useFundingMetrics } from "@/hooks/useApi";

// Compact horizontal row of funding-stage KPIs across the top of
// the Pipeline screen. Each tile deep-links to a filtered pipeline
// view so the agent can drill in from the metric.
export function FundingMetricsRow() {
  const { t } = useTheme();
  const router = useRouter();
  const { data, isLoading } = useFundingMetrics();
  const tiles: Array<{
    label: string;
    value: string | number;
    accent?: "neutral" | "warn" | "danger" | "profit";
    onPress: () => void;
  }> = [
    {
      label: "UW ready",
      value: data?.uw_ready ?? 0,
      accent: "profit",
      onPress: () => router.push("/agent/(tabs)/pipeline?filter=uw_ready" as Href),
    },
    {
      label: "Needs structure",
      value: data?.needs_structure ?? 0,
      accent: "warn",
      onPress: () => router.push("/agent/(tabs)/pipeline?filter=needs_structure" as Href),
    },
    {
      label: "Open conditions",
      value: data?.open_conditions ?? 0,
      onPress: () => router.push("/agent/(tabs)/pipeline?filter=open_conditions" as Href),
    },
    {
      label: "AI blocked",
      value: data?.ai_blocked ?? 0,
      accent: "danger",
      onPress: () => router.push("/agent/(tabs)/pipeline?filter=ai_blocked" as Href),
    },
    {
      label: "Next closing",
      value: data?.next_closing_date
        ? new Date(data.next_closing_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "—",
      onPress: () => router.push("/agent/(tabs)/pipeline?filter=closing30" as Href),
    },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {tiles.map((tile) => (
        <View key={tile.label} style={{ width: 138 }}>
          <KpiTile
            label={tile.label}
            value={isLoading ? "…" : tile.value}
            accent={tile.accent}
            onPress={tile.onPress}
          />
        </View>
      ))}
    </ScrollView>
  );
}
