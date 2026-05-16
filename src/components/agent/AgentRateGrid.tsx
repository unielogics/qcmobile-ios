// 2×2 product-rate grid for the agent's Today tab.
//
// Mirrors the borrower-side RateCard (SelfDirectedHome.tsx) one-to-one
// — same FRED series IDs, same sparkline, same delta and index/spread
// breakdown — and taps open the same RateDetailModal so the broker's
// drill-down experience matches what their borrower sees.
//
// Self-contained instead of importing RateCard from SelfDirectedHome
// because that file churns heavily in operator-side rewrites; this
// component is local to the agent surface and won't get clobbered.

import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { useFredSeries } from "@/hooks/useApi";
import { FredChart } from "@/components/FredChart";
import { RateDetailModal } from "@/components/RateDetailModal";

const PRODUCT_CARDS = [
  { id: "ff",   label: "Fix & Flip",  term: "12 mo", sub: "90% LTC / 75% ARV",  series_id: "DPRIME" },
  { id: "gu",   label: "Ground Up",   term: "18 mo", sub: "85% LTC / 70% LTFC", series_id: "DPRIME" },
  { id: "dscr", label: "DSCR Rental", term: "30 yr", sub: "80% LTV",            series_id: "DGS10" },
  { id: "br",   label: "Bridge",      term: "24 mo", sub: "75% LTV",            series_id: "SOFR" },
];

type ProductCard = (typeof PRODUCT_CARDS)[number];

export function AgentRateGrid() {
  const { data: seriesList = [] } = useFredSeries();
  const seriesById = useMemo(
    () => new Map(seriesList.map((s) => [s.series_id, s])),
    [seriesList]
  );
  const [openCard, setOpenCard] = useState<{ series_id: string; label: string; sub: string } | null>(null);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
        {PRODUCT_CARDS.map((card) => {
          const s = seriesById.get(card.series_id);
          return (
            <View key={card.id} style={{ width: "50%", padding: 4 }}>
              <RateCard
                card={card}
                series={s}
                onPress={() =>
                  setOpenCard({ series_id: card.series_id, label: card.label, sub: card.sub })
                }
              />
            </View>
          );
        })}
      </View>
      <RateDetailModal
        seriesId={openCard?.series_id ?? null}
        title={openCard?.label}
        productSub={openCard?.sub}
        onClose={() => setOpenCard(null)}
      />
    </>
  );
}

function RateCard({
  card,
  series,
  onPress,
}: {
  card: ProductCard;
  series:
    | {
        current_value: number | null;
        estimated_rate: number | null;
        spread_bps: number;
        delta_bps: number | null;
        history_7d: { date: string; value: number | null }[];
        history_30d?: { date: string; value: number | null }[];
      }
    | undefined;
  onPress?: () => void;
}) {
  const { t } = useTheme();
  const hasData = !!series && series.current_value != null;
  const estimated = series?.estimated_rate;
  const indexValue = series?.current_value;
  const spreadBps = series?.spread_bps ?? 0;
  const delta = series?.delta_bps ?? null;
  const deltaColor = delta == null ? t.ink3 : delta < 0 ? t.profit : delta > 0 ? t.danger : t.ink3;
  // DPRIME publishes weekly so history_7d is empty most days — fall
  // back to the most recent valid points from history_30d so sparse
  // series still render. Same logic as the borrower-side card.
  const chartPoints = (() => {
    const seven = (series?.history_7d ?? []).filter((p) => p.value != null);
    if (seven.length >= 2) return seven;
    const thirty = (series?.history_30d ?? []).filter((p) => p.value != null);
    return thirty.slice(-7);
  })();

  return (
    <Card pad={12} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: t.ink }}>
            {card.label} <Text style={{ color: t.ink3, fontWeight: "600" }}>· {card.term}</Text>
          </Text>
          <Text style={{ fontSize: 10, color: t.ink3, marginTop: 2 }}>{card.sub}</Text>
        </View>
        <Icon name="external" size={11} color={t.ink4} />
      </View>
      {chartPoints.length >= 2 ? (
        <View style={{ height: 36, marginTop: 4 }}>
          <FredChart data={chartPoints} color={t.spark} width={140} height={36} fill />
        </View>
      ) : (
        <View style={{ height: 36, marginTop: 4, justifyContent: "center" }}>
          <Text style={{ fontSize: 10, color: t.ink4, fontStyle: "italic" }}>
            {hasData ? "Building history…" : "Awaiting first FRED pull"}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink, letterSpacing: -0.4 }}>
          {estimated != null ? estimated.toFixed(3) : "—"}
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3 }}>%</Text>
        </Text>
        <Text style={{ fontSize: 10.5, fontWeight: "800", color: deltaColor }}>
          {delta == null ? "—" : QC_FMT.bps(delta)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>{card.series_id}</Text>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>{indexValue != null ? `${indexValue.toFixed(2)}%` : "—"}</Text>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>+ {(spreadBps / 100).toFixed(2)}%</Text>
      </View>
    </Card>
  );
}
