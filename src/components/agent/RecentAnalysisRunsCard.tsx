import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";
import type { AnalysisRun, Client } from "@/lib/types";

const PRODUCT_LABEL: Record<AnalysisRun["product"], string> = {
  dscr_purchase: "DSCR purchase",
  dscr_refi: "DSCR refi",
  fix_flip: "Fix & Flip",
};

const SOURCE_LABEL: Record<AnalysisRun["tool_source"], string> = {
  deal_analyzer: "Analyzer",
  simulator: "Simulator",
  loan_recalc: "File recalc",
};

function dateLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readNumber(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function amountFor(run: AnalysisRun) {
  return (
    readNumber(run.inputs, ["requested_loan_amount", "loan_amount", "amount", "purchase_price", "property_value"]) ??
    readNumber(run.calculator_output, ["loan_amount", "loanAmount", "maxLoan", "requested_loan_amount"])
  );
}

function clientNameFor(run: AnalysisRun, clients: Client[]) {
  if (!run.client_id) return "Unlinked";
  return clients.find((client) => client.id === run.client_id)?.name ?? "Linked client";
}

export function RecentAnalysisRunsCard({
  runs,
  clients,
  title = "Saved runs - last 30 days",
  emptyText = "No saved runs in the last 30 days.",
}: {
  runs: AnalysisRun[];
  clients: Client[];
  title?: string;
  emptyText?: string;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const rows = runs.slice(0, 6);

  return (
    <Card pad={14}>
      <SectionLabel>{title}</SectionLabel>
      {rows.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: t.ink3, lineHeight: 18 }}>{emptyText}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((run) => {
            const amount = amountFor(run);
            const href = run.loan_id
              ? (`/agent/loan/${run.loan_id}` as Href)
              : run.client_id
                ? (`/agent/client/${run.client_id}` as Href)
                : null;
            return (
              <Pressable
                key={run.id}
                onPress={() => href && router.push(href)}
                disabled={!href}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  paddingHorizontal: 11,
                  borderWidth: 1,
                  borderColor: pressed ? t.lineStrong : t.line,
                  borderRadius: 12,
                  backgroundColor: t.surface2,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "800", color: t.ink }} numberOfLines={1}>
                    {run.title || run.target_property_address || "Saved analysis"}
                  </Text>
                  <Text style={{ fontSize: 11, color: t.ink3 }}>{dateLabel(run.updated_at)}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }} numberOfLines={1}>
                  {clientNameFor(run, clients)} - {PRODUCT_LABEL[run.product] ?? run.product}
                  {amount ? ` - ${QC_FMT.usd(amount, 0)}` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  <Pill bg={t.chip} color={t.ink2}>{SOURCE_LABEL[run.tool_source] ?? run.tool_source}</Pill>
                  {run.shared_at ? <Pill bg={t.brandSoft} color={t.brand}>Shared</Pill> : null}
                  {run.prequal_request_id ? <Pill bg={t.profitBg} color={t.profit}>Prequal</Pill> : null}
                  {run.status ? <Pill bg={t.chip} color={t.ink3}>{run.status.replace(/_/g, " ")}</Pill> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
