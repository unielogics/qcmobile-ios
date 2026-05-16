import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";
import { LoanStageOptions, type LoanStage } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";

const STAGE_LABEL: Record<LoanStage, string> = Object.fromEntries(
  LoanStageOptions.map((o) => [o.value, o.label])
) as Record<LoanStage, string>;

const STAGE_PROGRESS: Record<LoanStage, number> = {
  prequalified: 0.15,
  collecting_docs: 0.35,
  lender_connected: 0.55,
  processing: 0.75,
  closing: 0.9,
  funded: 1,
};

export function LoanSnapshotCard({ loan, onPress }: { loan: Loan; onPress?: () => void }) {
  const { t } = useTheme();
  const progress = STAGE_PROGRESS[loan.stage] ?? 0;

  const inner = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>
              Active loan
            </Text>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: t.petrolSoft }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: t.petrol }}>
                {loan.deal_id}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 17, fontWeight: "800", color: t.ink, marginTop: 4 }}>
            {loan.address || "Subject property"}
          </Text>
          {loan.city ? (
            <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>{loan.city}</Text>
          ) : null}
        </View>
        <Pill bg={t.brandSoft} color={t.brand}>{STAGE_LABEL[loan.stage]}</Pill>
      </View>

      <View style={{ flexDirection: "row", gap: 24, marginTop: 16 }}>
        <View>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>Amount</Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink, marginTop: 2 }}>{QC_FMT.short(loan.amount)}</Text>
        </View>
        {loan.final_rate != null && (
          <View>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>Rate</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink, marginTop: 2 }}>{(loan.final_rate * 100).toFixed(2)}%</Text>
          </View>
        )}
        {loan.ltv != null && (
          <View>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>LTV</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink, marginTop: 2 }}>{Math.round(loan.ltv * 100)}%</Text>
          </View>
        )}
      </View>

      <View style={{ height: 6, backgroundColor: t.surface2, borderRadius: 3, marginTop: 16, overflow: "hidden" }}>
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: t.brand }} />
      </View>
    </>
  );

  if (onPress) return <Card pad={20} onPress={onPress}>{inner}</Card>;
  return <Card pad={20}>{inner}</Card>;
}
