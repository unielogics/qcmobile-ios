import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Pill } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";
import { LoanStageOptions, type LoanStage } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
import { DealHealthPill } from "./DealHealthPill";

const STAGE_LABEL: Record<LoanStage, string> = Object.fromEntries(
  LoanStageOptions.map((o) => [o.value, o.label])
) as Record<LoanStage, string>;

export function AgentLoanCard({
  loan,
  clientName,
  hint,
  onPress,
}: {
  loan: Loan;
  clientName?: string;
  hint?: string;
  onPress?: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: t.surface,
        borderColor: t.line, borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1 }}>
          {clientName ? (
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 0.5 }} numberOfLines={1}>
              {clientName}
            </Text>
          ) : null}
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink, marginTop: clientName ? 2 : 0 }} numberOfLines={1}>
            {loan.address || "Subject property"}
          </Text>
          {loan.city ? (
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{loan.city}</Text>
          ) : null}
        </View>
        <Pill bg={t.brandSoft} color={t.brand}>{STAGE_LABEL[loan.stage]}</Pill>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>
          {QC_FMT.short(loan.amount)}
        </Text>
        <DealHealthPill health={loan.deal_health ?? null} />
      </View>

      {hint ? (
        <Text style={{ fontSize: 12, color: t.ink3, marginTop: 10, lineHeight: 16 }} numberOfLines={2}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}
