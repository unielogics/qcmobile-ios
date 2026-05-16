// RangeGauge — horizontal cap-vs-current visualization for the simulator.
//
// MIRROR: keep visual + behavior in sync with qcdesktop/src/components/RangeGauge.tsx.
//
// Shows a filled bar from 0 to `current`, the cap at `max`, tier ticks
// (e.g. 0.60, 0.65, 0.70, 0.75) along the track, and optional markers
// (e.g. payoff position on a DSCR refi). Tiers above `lockedAbove` render
// dimmed with a small lock glyph. When `binding` is set, the matching
// tick is recolored with the warn token to highlight the constraint.

import * as React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";

export interface RangeGaugeProps {
  current: number;            // 0..1 — current LTV/utilization
  max: number;                // 0..1 — effective cap (current ≤ max)
  tiers: number[];            // [0.60, 0.65, 0.70, 0.75]
  lockedAbove: number;        // tiers > this are greyed out
  markers?: { at: number; label: string; tone?: "muted" | "warn" }[];
  binding?: "ltv" | "ltc" | "arv" | "refi-cap";
  /** Optional second ceiling line (F&F: shows both LTC and ARV caps). */
  secondaryCap?: { at: number; label: string };
  width?: number;
  height?: number;
  showLabels?: boolean;
}

const TRACK_HEIGHT = 14;
const PAD_X = 12;
const PAD_TOP_LABEL = 18;
const PAD_BOTTOM_TICK = 18;

export function RangeGauge({
  current,
  max,
  tiers,
  lockedAbove,
  markers = [],
  binding,
  secondaryCap,
  width = 320,
  height,
  showLabels = true,
}: RangeGaugeProps) {
  const { t } = useTheme();
  const safeMax = Math.max(0.001, Math.min(1, max));
  const safeCurrent = Math.max(0, Math.min(safeMax, current));

  const maxTier = Math.max(...tiers, secondaryCap?.at ?? 0, safeMax);
  const scaleMax = Math.min(1, Math.ceil(maxTier * 100 + 5) / 100);

  const totalH = height ?? TRACK_HEIGHT + (showLabels ? PAD_TOP_LABEL + PAD_BOTTOM_TICK : 0);
  const trackY = showLabels ? PAD_TOP_LABEL : 0;

  const xFor = (v: number): number => PAD_X + (v / scaleMax) * (width - PAD_X * 2);
  const fillColor = binding ? t.warn : t.brand;

  return (
    <View style={{ width, height: totalH }}>
      <Svg width={width} height={totalH}>
        {/* Track background */}
        <Rect
          x={PAD_X}
          y={trackY}
          width={width - PAD_X * 2}
          height={TRACK_HEIGHT}
          rx={TRACK_HEIGHT / 2}
          fill={t.surface2}
          stroke={t.line}
        />

        {/* Filled portion */}
        {safeCurrent > 0 && (
          <Rect
            x={PAD_X}
            y={trackY}
            width={Math.max(2, xFor(safeCurrent) - PAD_X)}
            height={TRACK_HEIGHT}
            rx={TRACK_HEIGHT / 2}
            fill={fillColor}
          />
        )}

        {/* Cap line */}
        <Line
          x1={xFor(safeMax)}
          x2={xFor(safeMax)}
          y1={trackY - 3}
          y2={trackY + TRACK_HEIGHT + 3}
          stroke={binding ? t.warn : t.ink2}
          strokeWidth={2}
        />

        {/* Optional secondary cap */}
        {secondaryCap && (
          <>
            <Line
              x1={xFor(secondaryCap.at)}
              x2={xFor(secondaryCap.at)}
              y1={trackY - 1}
              y2={trackY + TRACK_HEIGHT + 1}
              stroke={t.ink3}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            {showLabels && (
              <SvgText
                x={xFor(secondaryCap.at)}
                y={trackY + TRACK_HEIGHT + 14}
                fontSize={9}
                fill={t.ink3}
                textAnchor="middle"
                fontWeight="600"
              >
                {secondaryCap.label}
              </SvgText>
            )}
          </>
        )}

        {/* Tier ticks + labels */}
        {tiers.map((tv) => {
          const locked = tv > lockedAbove + 0.0001;
          const tx = xFor(tv);
          return (
            <React.Fragment key={tv}>
              <Line
                x1={tx}
                x2={tx}
                y1={trackY + TRACK_HEIGHT}
                y2={trackY + TRACK_HEIGHT + 4}
                stroke={t.ink3}
                strokeWidth={1}
                opacity={locked ? 0.35 : 1}
              />
              {showLabels && (
                <SvgText
                  x={tx}
                  y={trackY + TRACK_HEIGHT + 14}
                  fontSize={9}
                  fill={t.ink3}
                  textAnchor="middle"
                  fontWeight="600"
                  opacity={locked ? 0.35 : 1}
                >
                  {`${(tv * 100).toFixed(0)}%${locked ? " 🔒" : ""}`}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}

        {/* External markers */}
        {markers.map((m, i) => {
          const tone = m.tone === "warn" ? t.warn : t.ink3;
          const mx = xFor(m.at);
          return (
            <React.Fragment key={i}>
              <Circle cx={mx} cy={trackY + TRACK_HEIGHT / 2} r={4} fill={tone} />
              {showLabels && (
                <SvgText
                  x={mx}
                  y={trackY - 5}
                  fontSize={9}
                  fill={tone}
                  textAnchor="middle"
                  fontWeight="700"
                >
                  {m.label}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}

        {/* Current value needle */}
        <Circle
          cx={xFor(safeCurrent)}
          cy={trackY + TRACK_HEIGHT / 2}
          r={6}
          fill={fillColor}
          stroke={t.surface}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
}

