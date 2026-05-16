// Interactive FRED chart for React Native — mirror of qcdesktop's FredChart.
// Touch-and-drag (instead of mouse-hover) reveals a vertical crosshair and
// a tooltip pinned above the touched point showing the value, date, and
// delta-vs-prior in basis points.
//
// Two variants:
//   "compact"  — dashboard rate cards (~140×40, no axes, area fill, dot at
//                last point). Tap-and-drag overlays the crosshair + tooltip.
//   "expanded" — explorer / detail screens (~360×220, gridlines, value/date
//                axis labels, larger tooltip). Same touch interaction.
//
// Pure react-native-svg, no chart library — keeps bundle small and matches
// the visual language of the existing Sparkline.
//
// Mirrors qcdesktop/src/components/FredChart.tsx — keep visual + behavior
// in sync. The key difference is touch instead of hover; otherwise the
// math, layout, and styling intent are identical.

import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";

export interface FredChartPoint {
  date: string; // ISO date
  value: number | null;
}

interface Props {
  data: FredChartPoint[];
  width?: number;
  height?: number;
  variant?: "compact" | "expanded";
  /** Override the line color. Defaults to t.spark. */
  color?: string;
  /** Show the area fill below the line. */
  fill?: boolean;
}

interface PlottedPoint {
  iso: string;
  date: Date;
  value: number;
  x: number;
  y: number;
  index: number;
}

export function FredChart({
  data,
  width = 140,
  height = 40,
  variant = "compact",
  color,
  fill,
}: Props) {
  const { t } = useTheme();
  const lineColor = color ?? t.spark;
  const fillEnabled = fill ?? variant === "compact";

  const points: PlottedPoint[] = useMemo(() => {
    const valid = data.filter((p) => p.value != null) as { date: string; value: number }[];
    if (valid.length === 0) return [];
    const min = Math.min(...valid.map((p) => p.value));
    const max = Math.max(...valid.map((p) => p.value));
    const range = max - min || 1;
    const padX = variant === "expanded" ? 36 : 0;
    const padTop = variant === "expanded" ? 14 : height * 0.12;
    const padBottom = variant === "expanded" ? 22 : height * 0.12;
    const innerW = Math.max(width - padX - 8, 1);
    const innerH = Math.max(height - padTop - padBottom, 1);
    return valid.map((p, i) => {
      const x = padX + (i / Math.max(valid.length - 1, 1)) * innerW;
      const y = padTop + (1 - (p.value - min) / range) * innerH;
      return { iso: p.date, date: new Date(p.date), value: p.value, x, y, index: i };
    });
  }, [data, width, height, variant]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Track the SVG's left edge so touch coords (which arrive in screen-space)
  // can be mapped back into chart-space. Updated on layout.
  const svgLeftRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    e.target?.measureInWindow?.((x: number) => {
      svgLeftRef.current = x;
    });
  };

  // Find the nearest x-aligned point to a screen-x. Same algorithm as
  // desktop's onMouseMove handler.
  const findNearest = (screenX: number): number | null => {
    if (points.length === 0) return null;
    const localX = screenX - svgLeftRef.current;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - localX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    return nearest;
  };

  // PanResponder gives us touch-down / touch-move / touch-up. We want all
  // three to update the crosshair so a tap behaves the same as a drag,
  // and lifting the finger clears the tooltip.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          setHoverIdx(findNearest(e.nativeEvent.pageX));
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          setHoverIdx(findNearest(e.nativeEvent.pageX));
        },
        onPanResponderRelease: () => setHoverIdx(null),
        onPanResponderTerminate: () => setHoverIdx(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points.length, width, height]
  );

  if (points.length === 0) {
    return (
      <View
        style={{
          width,
          height,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 11, color: t.ink4, fontStyle: "italic" }}>no data</Text>
      </View>
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const minVal = Math.min(...points.map((p) => p.value));
  const maxVal = Math.max(...points.map((p) => p.value));
  const midVal = (minVal + maxVal) / 2;
  const padX = variant === "expanded" ? 36 : 0;
  const padTop = variant === "expanded" ? 14 : 0;
  const innerH = height - padTop - (variant === "expanded" ? 22 : 0);
  const yFor = (v: number) =>
    padTop + (1 - (v - minVal) / (maxVal - minVal || 1)) * innerH;

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const prevValue =
    hovered && hovered.index > 0 ? points[hovered.index - 1].value : null;
  const deltaBps =
    hovered && prevValue != null ? Math.round((hovered.value - prevValue) * 100) : null;

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;

  return (
    <View
      style={{ width, height }}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <Svg width={width} height={height}>
        {variant === "expanded" && (
          <G>
            {[maxVal, midVal, minVal].map((v, i) => (
              <G key={i}>
                <Line
                  x1={padX}
                  x2={width - 8}
                  y1={yFor(v)}
                  y2={yFor(v)}
                  stroke={t.line}
                  strokeWidth={1}
                />
                <SvgText
                  x={padX - 6}
                  y={yFor(v) + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={t.ink3}
                >
                  {v.toFixed(2)}%
                </SvgText>
              </G>
            ))}
            <SvgText x={padX} y={height - 6} fontSize={10} fill={t.ink3}>
              {firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </SvgText>
            <SvgText
              x={width - 8}
              y={height - 6}
              textAnchor="end"
              fontSize={10}
              fill={t.ink3}
            >
              {lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </SvgText>
          </G>
        )}

        {fillEnabled && <Path d={areaPath} fill={lineColor} opacity={0.12} />}
        <Path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={variant === "expanded" ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {variant === "compact" && (
          <Circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={2.4}
            fill={lineColor}
          />
        )}

        {hovered && (
          <G>
            <Line
              x1={hovered.x}
              x2={hovered.x}
              y1={0}
              y2={height}
              stroke={t.ink3}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <Circle cx={hovered.x} cy={hovered.y} r={3.5} fill={lineColor} />
            <Circle cx={hovered.x} cy={hovered.y} r={6} fill={lineColor} opacity={0.2} />
          </G>
        )}
      </Svg>

      {hovered && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: Math.min(Math.max(hovered.x - 60, 0), Math.max(width - 120, 0)),
            top: Math.max(hovered.y - (variant === "expanded" ? 60 : 42), 0),
            backgroundColor: t.ink,
            paddingHorizontal: variant === "expanded" ? 11 : 8,
            paddingVertical: variant === "expanded" ? 8 : 5,
            borderRadius: 7,
            minWidth: 110,
          }}
        >
          <Text
            style={{
              color: t.inverse,
              fontWeight: "800",
              fontSize: variant === "expanded" ? 12 : 11,
              fontVariant: ["tabular-nums"],
            }}
          >
            {hovered.value.toFixed(3)}%
          </Text>
          <Text
            style={{
              color: t.inverse,
              opacity: 0.75,
              fontWeight: "600",
              fontSize: variant === "expanded" ? 10.5 : 9.5,
            }}
          >
            {hovered.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: variant === "expanded" ? "numeric" : undefined,
            })}
            {deltaBps != null && (
              <>
                {" · "}
                <Text
                  style={{
                    color:
                      deltaBps > 0
                        ? "#fca5a5"
                        : deltaBps < 0
                          ? "#86efac"
                          : t.inverse,
                  }}
                >
                  {deltaBps > 0 ? "+" : ""}
                  {deltaBps} bps
                </Text>
              </>
            )}
          </Text>
        </View>
      )}
    </View>
  );
}
