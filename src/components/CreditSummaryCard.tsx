// Mobile credit summary card. Mirrors qcdesktop/src/components/CreditSummaryCard.tsx —
// FICO + tier + bullet list + the products the borrower currently qualifies for.
//
// Mounted on the simulator screen so the borrower sees their headline credit
// state alongside the rate they're modeling.

import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill } from "@/design-system/primitives";
import type { CreditSummary } from "@/lib/types";

const TIER_LABEL: Record<string, string> = {
  pro: "Pro",
  basic: "Standard",
  warn: "Caution",
  blocked: "Blocked",
};

export function CreditSummaryCard({ summary }: { summary: CreditSummary | undefined }) {
  const { t } = useTheme();
  if (!summary || summary.fico == null) return null;

  const tier = summary.tier ?? "blocked";
  const tierFg = tier === "pro" ? t.profit : tier === "basic" ? t.brand : tier === "warn" ? t.warn : t.danger;
  const tierBg = tier === "pro" ? t.profitBg : tier === "basic" ? t.brandSoft : tier === "warn" ? t.warnBg : t.dangerBg;
  const maxLtv = summary.tier_max_ltv != null ? `${Math.round(summary.tier_max_ltv * 100)}%` : "—";

  return (
    <Card pad={14} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ minWidth: 100 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Credit
          </Text>
          <Text
            style={{
              fontSize: 38, fontWeight: "800", color: t.ink, lineHeight: 42,
              fontVariant: ["tabular-nums"], marginTop: 2,
            }}
          >
            {summary.fico}
          </Text>
          <Text style={{ fontSize: 10, color: t.ink3, marginTop: 2 }}>
            {summary.fico_model
              ? summary.fico_model.toUpperCase().replace("_", " ")
              : "FICO"}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Pill bg={tierBg} color={tierFg}>{TIER_LABEL[tier] ?? tier}</Pill>
          <Text style={{ fontSize: 12, color: t.ink2 }}>
            Up to <Text style={{ fontWeight: "700", color: t.ink }}>{maxLtv}</Text> LTV available
          </Text>
          {summary.fraud_flag ? (
            <View style={{ marginTop: 4 }}>
              <Pill bg={t.dangerBg} color={t.danger}>{summary.fraud_flag}</Pill>
            </View>
          ) : null}
        </View>
      </View>

      {summary.bullets.length > 0 ? (
        <View style={{ marginTop: 14, gap: 6 }}>
          {summary.bullets.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View
                style={{
                  width: 7, height: 7, borderRadius: 4, marginTop: 6,
                  backgroundColor:
                    b.kind === "positive" ? t.profit : b.kind === "warn" ? t.warn : t.ink3,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12.5, color: t.ink, fontWeight: "600" }}>{b.label}</Text>
                {b.detail ? (
                  <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{b.detail}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {summary.available_products.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            Available programs
          </Text>
          <View style={{ gap: 6 }}>
            {summary.available_products.map((p) => (
              <View
                key={p.id}
                style={{
                  borderWidth: 1, borderColor: t.line, borderRadius: 9,
                  padding: 10, backgroundColor: t.surface2,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink }}>{p.label}</Text>
                <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  {p.rate != null ? `${p.rate}% ` : ""}
                  {p.max_ltv != null ? `· max ${Math.round(p.max_ltv * 100)}% ` : ""}
                  {p.term ? `· ${p.term}` : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {summary.note ? (
        <Text style={{ marginTop: 10, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
          {summary.note}
        </Text>
      ) : null}
    </Card>
  );
}
