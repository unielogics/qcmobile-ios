// `<ActionRow>` — icon + label + optional value + chev. The
// workhorse drill-down row used by Conditions, HUD, Pre-Qual,
// AI tasks, lender threads, and the More menu. Replaces ~200
// LOC of duplicated `Pressable + Icon + Text + Icon` blocks.

import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon, type IconName } from "@/design-system/Icon";

interface Props {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  label: string;
  sublabel?: string | null;
  value?: ReactNode;
  // Right-side annotation, e.g. a pill or count. Drawn before the chev.
  trailing?: ReactNode;
  onPress?: () => void;
  // No chevron + non-pressable when undefined-onPress.
  destructive?: boolean;
  // Removes the border-bottom so adjacent rows stack flush.
  noBorder?: boolean;
}

export function ActionRow({
  icon,
  iconColor,
  iconBg,
  label,
  sublabel,
  value,
  trailing,
  onPress,
  destructive = false,
  noBorder = false,
}: Props) {
  const { t } = useTheme();
  const labelColor = destructive ? t.danger : t.ink;
  const inner = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: noBorder ? 0 : 1,
        borderBottomColor: t.line,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 32, height: 32, borderRadius: 9,
            backgroundColor: iconBg ?? t.chip,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name={icon} size={15} color={iconColor ?? t.ink2} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "700", color: labelColor, letterSpacing: -0.1 }}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text
            numberOfLines={2}
            style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, lineHeight: 15 }}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
      {value ? (
        typeof value === "string" || typeof value === "number" ? (
          <Text style={{ fontSize: 12.5, color: t.ink2, fontWeight: "600" }}>{value}</Text>
        ) : (
          value
        )
      ) : null}
      {trailing}
      {onPress ? <Icon name="chevR" size={14} color={t.ink4} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  );
}
