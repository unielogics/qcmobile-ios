import { Fragment, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "./ThemeProvider";
import { Icon } from "./Icon";

export function Card({
  children,
  pad = 18,
  onPress,
  style,
}: {
  children: ReactNode;
  pad?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, isDark } = useTheme();
  const baseStyle: ViewStyle = {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: pad,
    shadowColor: isDark ? "transparent" : "#0B1629",
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          baseStyle,
          pressed ? { borderColor: t.lineStrong, opacity: 0.92 } : null,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[baseStyle, style]}>{children}</View>;
}

// Tappable container with a chevron affordance — replaces ad-hoc
// `<Pressable><Card>` pairs across the cockpit. Use this wherever
// a card is supposed to drill down into something. The chevron
// shows up by default; pass `trailing={null}` to suppress it (e.g.
// when the card already has its own trailing action).
export function TappableCard({
  children,
  onPress,
  pad = 18,
  trailing,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  pad?: number;
  trailing?: ReactNode | null;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, isDark } = useTheme();
  const baseStyle: ViewStyle = {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: pad,
    shadowColor: isDark ? "transparent" : "#0B1629",
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  };
  const showChev = trailing === undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => [
        baseStyle,
        pressed ? { borderColor: t.lineStrong, opacity: 0.92 } : null,
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {trailing === null ? null : showChev ? (
        <Icon name="chevR" size={16} color={t.ink4} />
      ) : (
        trailing
      )}
    </Pressable>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.6, color: t.ink3, textTransform: "uppercase" }}>
        {children}
      </Text>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

export function Pill({ children, color, bg, style }: { children: ReactNode; color?: string; bg?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return (
    <View style={[{
      paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999,
      backgroundColor: bg ?? t.chip,
      alignSelf: "flex-start",
      flexDirection: "row", alignItems: "center", gap: 5,
    }, style]}>
      <Text style={{ fontSize: 11.5, fontWeight: "600", color: color ?? t.ink2 }}>
        {children}
      </Text>
    </View>
  );
}

export function Avatar({ label, color, size = 32, textColor }: { label: string; color?: string; size?: number; textColor?: string }) {
  const { t } = useTheme();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color ?? t.brand,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: textColor ?? t.inverse, fontWeight: "700", fontSize: size * 0.4 }}>{label}</Text>
    </View>
  );
}

export function Sparkline({
  data,
  color,
  width = 120,
  height = 36,
  fill = false,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
    return [x, y] as [number, number];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  return (
    <Svg width={width} height={height}>
      {fill && <Path d={area} fill={color} opacity={0.12} />}
      <Path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.4} fill={color} />
    </Svg>
  );
}

export function StageBadge({ stage, label }: { stage: number; label?: string }) {
  const { t } = useTheme();
  const map = [
    { bg: t.chip, fg: t.ink2 },
    { bg: t.warnBg, fg: t.warn },
    { bg: t.petrolSoft, fg: t.petrol },
    { bg: t.brandSoft, fg: t.brand },
    { bg: t.warnBg, fg: t.warn },
    { bg: t.profitBg, fg: t.profit },
  ];
  const labels = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];
  const { bg, fg } = map[stage] ?? map[0];
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label ?? labels[stage]}
      </Text>
    </View>
  );
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "petrol" | "ghost" | "soft";

export function QButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: string;
  disabled?: boolean;
  full?: boolean;
}) {
  const { t, isDark } = useTheme();
  const styles: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary:   { bg: t.ink,     fg: t.inverse, border: "transparent" },
    secondary: { bg: t.surface2, fg: t.ink,    border: t.line },
    danger:    { bg: t.danger,  fg: isDark ? "#06070B" : "#fff", border: "transparent" },
    petrol:    { bg: t.petrol,  fg: isDark ? "#06070B" : "#fff", border: "transparent" },
    ghost:     { bg: "transparent", fg: t.ink, border: t.lineStrong },
    soft:      { bg: t.chip,    fg: t.ink,    border: "transparent" },
  };
  const s = styles[variant];
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({
      paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12,
      backgroundColor: disabled ? t.chip : s.bg,
      borderColor: s.border, borderWidth: 1,
      alignSelf: full ? "stretch" : "flex-start",
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      opacity: pressed ? 0.85 : 1,
    })}>
      {icon ? <Icon name={icon} size={16} color={disabled ? t.ink4 : s.fg} /> : null}
      <Text style={{ color: disabled ? t.ink4 : s.fg, fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: color }} />;
}

export function VerifiedBadge({ kind = "verified" }: { kind?: "verified" | "pending" | "flagged" }) {
  const { t } = useTheme();
  if (kind === "pending") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: t.warnBg, alignSelf: "flex-start" }}>
        <Dot color={t.warn} size={5} />
        <Text style={{ color: t.warn, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Pending</Text>
      </View>
    );
  }
  if (kind === "flagged") {
    return (
      <View style={{ paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: t.dangerBg, alignSelf: "flex-start" }}>
        <Text style={{ color: t.danger, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Flagged</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: t.petrolSoft, alignSelf: "flex-start" }}>
      <Icon name="shieldChk" size={9} stroke={2.5} color={t.petrol} />
      <Text style={{ color: t.petrol, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Verified</Text>
    </View>
  );
}

// Multi-step pipeline progress (Prequalified → Funded)
export function Stepper({ stages, current, accent }: { stages: string[]; current: number; accent?: string }) {
  const { t } = useTheme();
  const ac = accent ?? t.brand;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {stages.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const filled = done || active;
        return (
          <Fragment key={s}>
            <View style={{
              width: active ? 26 : 18, height: active ? 26 : 18, borderRadius: 999,
              backgroundColor: filled ? ac : "transparent",
              borderColor: filled ? ac : t.lineStrong,
              borderWidth: 1.5,
              alignItems: "center", justifyContent: "center",
            }}>
              {done ? <Icon name="check" size={11} stroke={3} color={t.inverse} /> : null}
              {active ? <Dot color={t.inverse} size={8} /> : null}
            </View>
            {i < stages.length - 1 ? (
              <View style={{ flex: 1, height: 2, borderRadius: 2, backgroundColor: i < current ? ac : t.line }} />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

export function StepperLabels({ stages, current }: { stages: string[]; current: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
      {stages.map((s, i) => (
        <Text key={s} style={{
          color: i === current ? t.ink : t.ink4,
          flex: 1,
          fontSize: 9.5,
          fontWeight: "600",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          textAlign: i === 0 ? "left" : i === stages.length - 1 ? "right" : "center",
        }}>{s}</Text>
      ))}
    </View>
  );
}
