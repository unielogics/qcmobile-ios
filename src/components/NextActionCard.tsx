import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon, type IconName } from "@/design-system/Icon";
import type { NextAction } from "@/lib/nextAction";

const ICON_FOR: Record<NextAction["kind"], IconName> = {
  credit: "bolt",
  documents: "vault",
  profile: "user",
  review_terms: "sliders",
  all_clear: "check",
};

export function NextActionCard({ action, onCtaOverride }: { action: NextAction; onCtaOverride?: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const accent = action.kind === "all_clear" ? t.profit : t.brand;
  const accentBg = action.kind === "all_clear" ? t.profitBg : t.brandSoft;

  const onPress = () => {
    if (onCtaOverride) return onCtaOverride();
    if (action.route) router.push(action.route as Href);
  };

  return (
    <Card pad={20}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accentBg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={ICON_FOR[action.kind]} size={20} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>
            Next action
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "800", color: t.ink, marginTop: 4 }}>{action.title}</Text>
          <Text style={{ fontSize: 13, color: t.ink2, marginTop: 6, lineHeight: 18 }}>{action.body}</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          backgroundColor: accent,
          paddingVertical: 12, paddingHorizontal: 18,
          borderRadius: 10, alignItems: "center", marginTop: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{action.ctaLabel}</Text>
      </Pressable>
    </Card>
  );
}
