// Loan criteria viewer (LTV, DSCR, rate target, amortization).
// Phase 3 — read-only on mobile for now; full edit lives in a
// follow-up BottomSheet. Backend gated by BACKEND_HAS_LOAN_CRITERIA.

import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { useLoanCriteriaQ } from "@/hooks/useApi";
import { QC_FMT } from "@/design-system/tokens";

export function CriteriaTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data, isLoading } = useLoanCriteriaQ(loanId);
  if (isLoading) {
    return (
      <Card pad={18}>
        <Text style={{ color: t.ink3, fontSize: 13 }}>Loading criteria…</Text>
      </Card>
    );
  }
  if (!data) {
    // No criteria written yet for this loan. Show an explicit empty
    // state instead of rendering nothing — otherwise the tab body
    // looks blank and brokers wonder if it's broken.
    return (
      <Card pad={18}>
        <SectionLabel>Loan criteria</SectionLabel>
        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
          No criteria set on this loan yet. Underwriting will fill these in once the file is in
          progress.
        </Text>
      </Card>
    );
  }
  const rows: Array<[string, string]> = [
    ["Loan amount", data.loan_amount != null ? QC_FMT.short(data.loan_amount) : "—"],
    ["LTV", data.ltv != null ? `${(data.ltv * 100).toFixed(1)}%` : "—"],
    ["DSCR", data.dscr != null ? data.dscr.toFixed(2) : "—"],
    ["Rate target", data.rate_target != null ? `${(data.rate_target * 100).toFixed(2)}%` : "—"],
    ["Amortization", data.amortization_years != null ? `${data.amortization_years} yr` : "—"],
    ["Product", data.product ?? "—"],
  ];
  return (
    <Card pad={18}>
      <SectionLabel>Loan criteria</SectionLabel>
      <View style={{ gap: 12, marginTop: 4 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12.5, color: t.ink3 }}>{k}</Text>
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: t.ink }}>{v}</Text>
          </View>
        ))}
      </View>
      {data.notes ? (
        <Text style={{ fontSize: 12, color: t.ink2, marginTop: 16, lineHeight: 17 }}>{data.notes}</Text>
      ) : null}
    </Card>
  );
}
