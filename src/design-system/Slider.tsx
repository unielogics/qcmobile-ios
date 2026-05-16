// Tap + drag slider — built on PanResponder so we don't need a new dep.
// Supports a `gatedMax` value that visually splits the track into available
// (left) and locked (right) regions.

import { useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useTheme } from "./ThemeProvider";

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  gatedMax,
  markers,
  formatValue,
  height = 48,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Hard cap below which the user can move the thumb. Anything above is locked. */
  gatedMax?: number;
  /** Optional snap-marker values shown on the track. */
  markers?: { value: number; label?: string }[];
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const effectiveMax = gatedMax != null ? Math.min(gatedMax, max) : max;
  const range = max - min;

  function clampToStep(v: number): number {
    const clamped = Math.max(min, Math.min(effectiveMax, v));
    const stepped = Math.round((clamped - min) / step) * step + min;
    return +stepped.toFixed(6);
  }

  function valueFromX(x: number): number {
    if (widthRef.current <= 0) return value;
    const ratio = Math.max(0, Math.min(1, x / widthRef.current));
    return clampToStep(min + ratio * range);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => onChange(valueFromX(evt.nativeEvent.locationX)),
      onPanResponderMove: (evt) => onChange(valueFromX(evt.nativeEvent.locationX)),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthRef.current = w;
  };

  const valueRatio = range > 0 ? (value - min) / range : 0;
  const gatedRatio = range > 0 ? (effectiveMax - min) / range : 1;
  const thumbX = valueRatio * width;

  return (
    <View style={{ height, justifyContent: "center" }} onLayout={onLayout} {...panResponder.panHandlers}>
      {/* Track background — locked portion (right) */}
      <View
        style={{
          position: "absolute", left: 0, right: 0,
          height: 6, borderRadius: 999, backgroundColor: t.chip,
        }}
      />
      {/* Available (unlocked) portion */}
      {gatedMax != null && gatedMax < max ? (
        <View
          style={{
            position: "absolute", left: 0, width: `${gatedRatio * 100}%`,
            height: 6, borderRadius: 999, backgroundColor: t.lineStrong,
          }}
        />
      ) : null}
      {/* Filled (selected) portion */}
      <View
        style={{
          position: "absolute", left: 0, width: thumbX,
          height: 6, borderRadius: 999, backgroundColor: t.ink,
        }}
      />
      {/* Snap markers */}
      {markers?.map((m) => {
        if (m.value < min || m.value > max) return null;
        const ratio = range > 0 ? (m.value - min) / range : 0;
        const x = ratio * width;
        const locked = gatedMax != null && m.value > gatedMax + 1e-6;
        return (
          <View
            key={m.value}
            pointerEvents="none"
            style={{ position: "absolute", left: x - 1, top: height / 2 - 8, alignItems: "center" }}
          >
            <View style={{ width: 2, height: 12, backgroundColor: locked ? t.ink4 : t.surface }} />
            {m.label ? (
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: locked ? t.ink4 : t.ink3, marginTop: 4 }}>
                {m.label}
              </Text>
            ) : null}
          </View>
        );
      })}
      {/* Thumb */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute", left: thumbX - 12,
          width: 24, height: 24, borderRadius: 999,
          backgroundColor: t.surface,
          borderWidth: 2, borderColor: t.ink,
          shadowColor: "#0B1629", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      />
    </View>
  );
}
