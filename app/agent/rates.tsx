import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { FredChart } from "@/components/FredChart";
import { useFredSeries } from "@/hooks/useApi";

const PRODUCT_LABELS: Record<string, { label: string; sub: string }> = {
  DPRIME: { label: "Prime rate", sub: "Fix & Flip / Ground Up" },
  DGS10:  { label: "10-year Treasury", sub: "DSCR pricing" },
  SOFR:   { label: "SOFR", sub: "Bridge pricing" },
};

export default function AgentRatesRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: series = [], isLoading, error } = useFredSeries();
  const notDeployed = !!error && error instanceof Error && /404/.test(error.message);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>Today's market</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}>
        {notDeployed ? (
          <Card pad={18}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink, marginBottom: 4 }}>Market data not yet enabled</Text>
            <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17 }}>
              The backend doesn't expose <Text style={{ fontFamily: "monospace" }}>/fred/series</Text> at this environment.
            </Text>
          </Card>
        ) : isLoading && series.length === 0 ? (
          <Card pad={18}>
            <Text style={{ fontSize: 13, color: t.ink3 }}>Loading rates…</Text>
          </Card>
        ) : (
          series.map((s) => {
            const meta = PRODUCT_LABELS[s.series_id] ?? { label: s.series_id, sub: "" };
            const history = s.history ?? s.history_30d ?? s.history_7d ?? [];
            const points = history.map((h) => ({ date: h.date, value: h.value }));
            return (
              <Card key={s.series_id} pad={16}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }}>{meta.label}</Text>
                    {meta.sub ? <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{meta.sub}</Text> : null}
                    <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, marginTop: 8 }}>
                      {s.current_value != null ? `${s.current_value.toFixed(2)}%` : "—"}
                    </Text>
                  </View>
                  {points.length > 0 ? (
                    <FredChart data={points} width={120} height={48} variant="compact" />
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
