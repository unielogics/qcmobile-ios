// Fullscreen interactive detail for a FRED rate series. Triggered by
// tapping a market-rate card on Home. Lets the borrower:
//   - scrub the chart with a finger to read date + bps delta
//   - flip between 7 / 30 / 90 day windows
//   - see the indexed value vs the offered (index + spread) rate
//
// Rendered as a slide-up bottom sheet so it can be dismissed by tapping
// outside or the explicit close button. Uses the existing FredChart
// component's "expanded" variant for the actual drawing.
//
// Mirrors the desktop /rates/[id] detail page in spirit — without the
// extra navigation, since on a phone an inline modal is faster.

import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { useFredSeriesDetail } from "@/hooks/useApi";
import { FredChart } from "@/components/FredChart";
import { QC_FMT } from "@/design-system/tokens";

interface Props {
  // Caller passes the series_id (e.g. "DGS10", "DPRIME", "SOFR") to open;
  // null closes the modal. Decoupling open-state from series-state keeps
  // the parent's render logic simple.
  seriesId: string | null;
  // What to show as the human-friendly label when the modal title.
  // Falls back to seriesId when omitted.
  title?: string;
  productSub?: string;
  onClose: () => void;
}

const PERIODS = [
  { id: 7, label: "7d" },
  { id: 30, label: "30d" },
  { id: 90, label: "90d" },
] as const;

export function RateDetailModal({ seriesId, title, productSub, onClose }: Props) {
  const { t, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { data: series, isLoading } = useFredSeriesDetail(seriesId, days);

  const visible = seriesId != null;
  const points = (series?.history_7d ?? []).filter((p) => p.value != null);
  const indexValue = series?.current_value;
  const offered = series?.estimated_rate;
  const spreadBps = series?.spread_bps ?? 0;
  const delta = series?.delta_bps ?? null;
  const deltaColor = delta == null ? t.ink3 : delta < 0 ? t.profit : delta > 0 ? t.danger : t.ink3;

  // Chart fills the available width minus 32px page padding.
  const chartW = Math.max(winW - 32, 200);
  const chartH = 280;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)" }}>
        {/* Tap the dimmed area to dismiss */}
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: t.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
            {/* Drag handle */}
            <View
              style={{
                width: 36, height: 4, borderRadius: 2,
                backgroundColor: t.lineStrong,
                alignSelf: "center", marginBottom: 12,
              }}
            />
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", letterSpacing: 1.0, textTransform: "uppercase" }}>
                  {seriesId ?? "—"} · Market detail
                </Text>
                <Text style={{ fontSize: 19, fontWeight: "800", color: t.ink, letterSpacing: -0.3, marginTop: 2 }}>
                  {title ?? seriesId ?? "—"}
                </Text>
                {productSub ? (
                  <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{productSub}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
                accessibilityLabel="Close"
              >
                <Icon name="x" size={16} color={t.ink2} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero rate display */}
            <View
              style={{
                flexDirection: "row",
                gap: 14,
                paddingVertical: 14,
                marginTop: 4,
                borderRadius: 14,
                backgroundColor: isDark ? t.surface : t.brandSoft,
                paddingHorizontal: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9.5, color: t.ink3, fontWeight: "700", letterSpacing: 1.0, textTransform: "uppercase" }}>
                  Offered rate
                </Text>
                <Text style={{ fontSize: 28, fontWeight: "800", color: t.ink, marginTop: 2, letterSpacing: -0.4, fontVariant: ["tabular-nums"] }}>
                  {offered != null ? `${offered.toFixed(3)}%` : "—"}
                </Text>
                <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 2 }}>
                  index + {(spreadBps / 100).toFixed(2)}%
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={{ fontSize: 9.5, color: t.ink3, fontWeight: "700", letterSpacing: 1.0, textTransform: "uppercase" }}>
                  Index value
                </Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: t.ink2, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                  {indexValue != null ? `${indexValue.toFixed(3)}%` : "—"}
                </Text>
                <Text style={{ fontSize: 11, color: deltaColor, fontWeight: "700", marginTop: 2 }}>
                  {delta == null ? "" : `${QC_FMT.bps(delta)} vs prior day`}
                </Text>
              </View>
            </View>

            {/* Period selector */}
            <View
              style={{
                flexDirection: "row",
                gap: 4,
                backgroundColor: t.chip,
                borderRadius: 11,
                padding: 3,
                marginTop: 14,
              }}
            >
              {PERIODS.map((p) => {
                const active = days === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setDays(p.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: active ? t.surface : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? t.ink : t.ink3 }}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Expanded interactive chart */}
            <View style={{ marginTop: 14 }}>
              {points.length >= 2 ? (
                <FredChart
                  data={points}
                  variant="expanded"
                  width={chartW}
                  height={chartH}
                  fill
                />
              ) : isLoading ? (
                <View style={{ height: chartH, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, color: t.ink3 }}>Loading {days}-day history…</Text>
                </View>
              ) : (
                <View style={{ height: chartH, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, color: t.ink4, fontStyle: "italic" }}>
                    Not enough history for this window.
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 10, lineHeight: 16 }}>
              Drag your finger across the chart to read date + bps change at any point.
              Series sourced from FRED · index + lender spread = offered rate.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
