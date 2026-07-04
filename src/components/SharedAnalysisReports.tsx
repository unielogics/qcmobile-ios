import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";
import type { AnalysisRun } from "@/lib/types";

const PRODUCT_LABEL: Record<string, string> = {
  dscr_purchase: "DSCR purchase",
  dscr_refi: "DSCR refinance",
  fix_flip: "Fix & Flip",
};

function reportNumber(report: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = report?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rangeLabel(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { estimate?: unknown; low?: unknown; high?: unknown };
  const estimate = typeof value.estimate === "number" ? value.estimate : null;
  const low = typeof value.low === "number" ? value.low : null;
  const high = typeof value.high === "number" ? value.high : null;
  if (low && high) return `${QC_FMT.usd(low, 0)} - ${QC_FMT.usd(high, 0)}`;
  if (estimate) return QC_FMT.usd(estimate, 0);
  return null;
}

export function SharedAnalysisReports({ reports }: { reports: AnalysisRun[] }) {
  const { t } = useTheme();
  const visible = reports.filter((r) => !!r.shared_at).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <Card pad={14}>
      <SectionLabel>Shared deal reports</SectionLabel>
      <View style={{ gap: 10 }}>
        {visible.map((run) => {
          const report = run.sanitized_client_report;
          const dscr = reportNumber(report, "dscr");
          const ltv = reportNumber(report, "ltv");
          const rent = rangeLabel(report?.estimated_rent);
          const value = rangeLabel(report?.estimated_market_value);
          return (
            <View key={run.id} style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, backgroundColor: t.surface2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ flex: 1, minWidth: 180, fontSize: 13.5, fontWeight: "800", color: t.ink }} numberOfLines={1}>
                  {run.title}
                </Text>
                <Pill bg={t.brandSoft} color={t.brand}>{PRODUCT_LABEL[run.product] ?? run.product}</Pill>
              </View>
              <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }} numberOfLines={1}>
                {run.target_property_address ?? "Property analysis"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {dscr != null ? <Pill bg={t.chip} color={t.ink2}>DSCR {dscr.toFixed(2)}x</Pill> : null}
                {ltv != null ? <Pill bg={t.chip} color={t.ink2}>LTV {(ltv * 100).toFixed(1)}%</Pill> : null}
                {rent ? <Pill bg={t.chip} color={t.ink2}>Rent {rent}</Pill> : null}
                {value ? <Pill bg={t.chip} color={t.ink2}>Value {value}</Pill> : null}
              </View>
              {report?.narrative ? (
                <Text style={{ fontSize: 12.5, color: t.ink2, lineHeight: 18, marginTop: 10 }} numberOfLines={3}>
                  {String(report.narrative)}
                </Text>
              ) : null}
              {report?.disclaimer ? (
                <Text style={{ fontSize: 10.5, color: t.ink4, lineHeight: 15, marginTop: 8 }} numberOfLines={2}>
                  {String(report.disclaimer)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
