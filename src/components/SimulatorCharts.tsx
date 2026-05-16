// Visual extensions for the mobile simulator:
//   - AmortizationSchedule  table + balance/equity line chart
//   - HudDonutChart         pie of HUD-1 closing fees
//
// All SVG drawing uses react-native-svg, which is already a dep
// (used by QcLogo). No native rebuild required.

import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";

// ── Amortization schedule ─────────────────────────────────────────────────
// Mirror of qcdesktop/src/app/simulator/page.tsx AmortizationSchedule plus
// a small SVG line chart so the borrower can see at a glance how the
// balance falls and equity builds over the life of the loan.
//
// For amortizing products (DSCR rental, term=360), full month-by-month
// table with equity %; for interest-only products (F&F, GU, Bridge) we
// show a single recurring-interest row + balloon-at-maturity callout
// instead of a 360-row table that doesn't apply.

interface AmortizationRow {
  n: number;
  principal: number;
  interest: number;
  balance: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
}

export function AmortizationSchedule({
  loanAmount,
  annualRate,
  termMonths,
  monthlyPI,
}: {
  loanAmount: number;
  annualRate: number;
  termMonths: number;
  monthlyPI: number;
}) {
  const { t } = useTheme();
  const [showAll, setShowAll] = useState(false);

  const isIO = termMonths === 0;
  const r = annualRate / 12;

  const rows = useMemo<AmortizationRow[]>(() => {
    if (isIO) return [];
    let balance = loanAmount;
    let cumPrin = 0;
    let cumInt = 0;
    const out: AmortizationRow[] = [];
    for (let n = 1; n <= termMonths; n++) {
      const interest = balance * r;
      const principal = Math.max(0, monthlyPI - interest);
      balance = Math.max(0, balance - principal);
      cumPrin += principal;
      cumInt += interest;
      out.push({ n, principal, interest, balance, cumulativePrincipal: cumPrin, cumulativeInterest: cumInt });
    }
    return out;
  }, [isIO, loanAmount, r, termMonths, monthlyPI]);

  const totalInterest = isIO ? loanAmount * r * 12 : rows[rows.length - 1]?.cumulativeInterest ?? 0;
  const totalPaid = isIO ? loanAmount + totalInterest : monthlyPI * termMonths;
  const visible: AmortizationRow[] = showAll ? rows : [...rows.slice(0, 4), ...rows.slice(-4)];
  const splitAfter = showAll ? -1 : 3; // separator after index 3 when collapsed

  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <View
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: t.surface2,
          borderBottomWidth: 1,
          borderBottomColor: t.line,
        }}
      >
        <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>
          {isIO ? "Interest-only schedule" : "Amortization schedule"}
        </Text>
        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
          {isIO
            ? "Pay interest monthly · principal balloon at term"
            : `Month-by-month over ${termMonths} months`}
        </Text>
      </View>

      {/* Totals */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
        <Stat label="Total interest" value={QC_FMT.usd(totalInterest, 0)} accent={t.warn} />
        <Stat label="Total paid" value={QC_FMT.usd(totalPaid, 0)} />
      </View>

      {isIO ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 12,
              borderRadius: 10,
              backgroundColor: t.surface2,
              borderWidth: 1,
              borderColor: t.line,
            }}
          >
            <View>
              <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Monthly interest
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink, marginTop: 2 }}>
                {QC_FMT.usd(loanAmount * r, 0)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Balloon at maturity
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: t.warn, marginTop: 2 }}>
                {QC_FMT.usd(loanAmount, 0)}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Line chart — balance descending, equity rising, interest accumulating */}
          <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            <BalanceChart rows={rows} loanAmount={loanAmount} />
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 6 }}>
              <Legend color={t.ink} label="Balance" />
              <Legend color={t.profit} label="Equity" />
              <Legend color={t.warn} label="Interest paid" />
            </View>
          </View>

          {/* Table — head + tail rows when collapsed */}
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: t.surface2,
              borderTopWidth: 1,
              borderTopColor: t.line,
            }}
          >
            <Text style={{ flex: 0.5, fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Mo</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase", textAlign: "right" }}>Prin</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase", textAlign: "right" }}>Int</Text>
            <Text style={{ flex: 0.7, fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase", textAlign: "right" }}>Eq %</Text>
            <Text style={{ flex: 1.1, fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase", textAlign: "right" }}>Balance</Text>
          </View>
          {visible.map((row, idx) => {
            const equityPct = loanAmount > 0 ? (row.cumulativePrincipal / loanAmount) * 100 : 0;
            const showSeparator = !showAll && idx === splitAfter + 1;
            return (
              <View key={row.n}>
                {showSeparator ? (
                  <View style={{ paddingVertical: 6, alignItems: "center", backgroundColor: t.surface2 }}>
                    <Text style={{ fontSize: 10, color: t.ink4, fontWeight: "700", letterSpacing: 0.8 }}>
                      ··· {rows.length - 8} months hidden ···
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: t.line,
                  }}
                >
                  <Text style={{ flex: 0.5, fontSize: 12, color: t.ink2, fontVariant: ["tabular-nums"] }}>{row.n}</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: t.ink, fontVariant: ["tabular-nums"], textAlign: "right" }}>
                    {QC_FMT.usd(row.principal, 0)}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 12, color: t.warn, fontVariant: ["tabular-nums"], textAlign: "right" }}>
                    {QC_FMT.usd(row.interest, 0)}
                  </Text>
                  <Text style={{ flex: 0.7, fontSize: 12, color: t.profit, fontVariant: ["tabular-nums"], textAlign: "right", fontWeight: "600" }}>
                    {equityPct.toFixed(1)}%
                  </Text>
                  <Text style={{ flex: 1.1, fontSize: 12, color: t.ink, fontVariant: ["tabular-nums"], textAlign: "right" }}>
                    {QC_FMT.usd(row.balance, 0)}
                  </Text>
                </View>
              </View>
            );
          })}
          <Pressable
            onPress={() => setShowAll((s) => !s)}
            style={({ pressed }) => ({
              paddingVertical: 12,
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: t.line,
              backgroundColor: t.surface2,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: t.brand }}>
              {showAll ? "Collapse to summary" : `Show all ${rows.length} months`}
            </Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}

// Balance/equity/interest line chart. Chart renders ~140px tall, full
// width of the card. We sample one row per month for the SVG path; for
// 360-month loans that's still cheap.
function BalanceChart({ rows, loanAmount }: { rows: AmortizationRow[]; loanAmount: number }) {
  const { t } = useTheme();
  const W = 320;
  const H = 120;
  const padL = 4;
  const padR = 4;
  const padT = 4;
  const padB = 4;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = rows.length;
  if (n === 0 || loanAmount <= 0) return null;

  // Cumulative interest can exceed loanAmount on long-term loans, so the
  // chart's Y-axis is the max of (loanAmount, cumulativeInterest at end)
  // to keep both curves on-screen.
  const lastInterest = rows[n - 1].cumulativeInterest;
  const yMax = Math.max(loanAmount, lastInterest);

  const x = (i: number) => padL + (i / (n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;

  const balancePts = rows.map((r, i) => `${x(i)},${y(r.balance)}`).join(" ");
  const equityPts = rows.map((r, i) => `${x(i)},${y(r.cumulativePrincipal)}`).join(" ");
  const interestPts = rows.map((r, i) => `${x(i)},${y(r.cumulativeInterest)}`).join(" ");
  const equityArea = `${padL},${y(0)} ${equityPts} ${x(n - 1)},${y(0)}`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {/* Filled area for equity build-up */}
      <Polygon points={equityArea} fill={t.profit} fillOpacity={0.12} />
      {/* Lines */}
      <Polyline points={balancePts} fill="none" stroke={t.ink} strokeWidth={1.5} />
      <Polyline points={equityPts} fill="none" stroke={t.profit} strokeWidth={1.5} />
      <Polyline points={interestPts} fill="none" stroke={t.warn} strokeWidth={1.5} />
    </Svg>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, color: t.ink3, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: "800", color: accent ?? t.ink, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 10, height: 2, backgroundColor: color, borderRadius: 1 }} />
      <Text style={{ fontSize: 10, color: t.ink3, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// ── HUD-1 donut chart ─────────────────────────────────────────────────────
// Visualizes the closing-cost split. Donut rather than pie so the total
// can sit in the middle. Slice colors come from the theme palette so it
// matches the rest of the app in dark/light mode.

interface HudSlice {
  label: string;
  value: number;
  color: string;
}

export function HudDonutChart({
  origination,
  pointsCost,
  appraisal,
  fixedFees,
  titleIns,
  recording,
  total,
}: {
  origination: number;
  pointsCost: number;
  appraisal: number;
  fixedFees: number;
  titleIns: number;
  recording: number;
  total: number;
}) {
  const { t } = useTheme();
  const slices: HudSlice[] = [
    { label: "Origination", value: origination, color: t.brand },
    { label: "Discount points", value: pointsCost, color: t.petrol },
    { label: "Appraisal", value: appraisal, color: t.warn },
    { label: "Processing+UW", value: fixedFees, color: t.profit },
    { label: "Title insurance", value: titleIns, color: t.ink2 },
    { label: "Recording", value: recording, color: t.ink3 },
  ].filter((s) => s.value > 0);

  const sum = slices.reduce((s, x) => s + x.value, 0);
  if (sum <= 0) return null;

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 64;
  const stroke = 22;

  // Build arc paths
  let cursor = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map((s) => {
    const angle = (s.value / sum) * Math.PI * 2;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    return { d, color: s.color };
  });

  return (
    <Card pad={16}>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: 1.2,
          color: t.ink3,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Closing cost breakdown
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        {/* Donut */}
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {/* Background ring */}
            <Circle cx={cx} cy={cy} r={r} stroke={t.line} strokeWidth={stroke} fill="none" />
            <G>
              {arcs.map((a, i) => (
                <Path key={i} d={a.d} stroke={a.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />
              ))}
            </G>
            <SvgText
              x={cx}
              y={cy - 4}
              fontSize="10"
              fontWeight="700"
              fill={t.ink3}
              textAnchor="middle"
            >
              TOTAL
            </SvgText>
            <SvgText
              x={cx}
              y={cy + 12}
              fontSize="14"
              fontWeight="800"
              fill={t.ink}
              textAnchor="middle"
            >
              {QC_FMT.short(total)}
            </SvgText>
          </Svg>
        </View>
        {/* Legend with values */}
        <View style={{ flex: 1, gap: 6 }}>
          {slices.map((s) => {
            const pct = (s.value / sum) * 100;
            return (
              <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                <Text style={{ flex: 1, fontSize: 11, color: t.ink2 }} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: t.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {QC_FMT.usd(s.value, 0)}
                </Text>
                <Text style={{ fontSize: 9, color: t.ink3, width: 30, textAlign: "right" }}>
                  {pct.toFixed(0)}%
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

// Suppress unused imports — keeps the file portable if we later add bar
// charts that need Line / Rect.
const _unused = { Line, Rect };
void _unused;
