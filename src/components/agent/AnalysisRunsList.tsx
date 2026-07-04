import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { Fab } from "@/components/Fab";
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
  if (Number.isNaN(date.getTime())) return "Unknown";
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
    readNumber(run.inputs, ["requested_loan_amount", "loan_amount", "amount", "purchase_price", "property_value", "market_value"]) ??
    readNumber(run.calculator_output, ["loan_amount", "loanAmount", "maxLoan", "requested_loan_amount"])
  );
}

function metricFor(run: AnalysisRun) {
  const dscr = readNumber(run.calculator_output, ["dscr"]);
  if (dscr) return `${dscr.toFixed(2)}x DSCR`;
  const rate = readNumber(run.calculator_output, ["final_rate", "rate"]);
  if (rate) return `${(rate * 100).toFixed(3)}%`;
  const cash = readNumber(run.calculator_output, ["cash_to_close_pricing", "total_cash_to_close", "estimatedCashToClose", "cashToClose"]);
  if (cash) return `${QC_FMT.usd(cash, 0)} cash`;
  return "-";
}

function titleFor(run: AnalysisRun) {
  return run.title || run.target_property_address || "Saved run";
}

function clientNameFor(run: AnalysisRun, clients: Client[]) {
  if (!run.client_id) return "Unlinked";
  return clients.find((client) => client.id === run.client_id)?.name ?? "Linked client";
}

export type AnalysisLaunchAction = {
  label: string;
  description: string;
  icon: string;
  onPress: () => void;
};

type RunSort = "newest" | "oldest" | "amount_desc" | "client";

const SORTS: { value: RunSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "amount_desc", label: "Amount" },
  { value: "client", label: "Client" },
];

export function AnalysisRunsList({
  runs,
  clients,
  loading,
  emptyText,
}: {
  runs: AnalysisRun[];
  clients: Client[];
  loading?: boolean;
  emptyText: string;
}) {
  const { t } = useTheme();
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState<RunSort>("newest");
  const [selectedRun, setSelectedRun] = useState<AnalysisRun | null>(null);
  const q = query.trim().toLowerCase();
  const summary = useMemo(() => ({
    saved: runs.length,
    shared: runs.filter((run) => !!run.shared_at).length,
    prequal: runs.filter((run) => !!run.prequal_request_id).length,
  }), [runs]);
  const filtered = useMemo(
    () => {
      const start = parseDateBoundary(startDate, "start");
      const end = parseDateBoundary(endDate, "end");
      return runs
        .slice()
        .filter((run) => {
          const updated = Date.parse(run.updated_at);
          if (start != null && updated < start) return false;
          if (end != null && updated > end) return false;
          if (!q) return true;
          return [
            titleFor(run),
            run.target_property_address,
            clientNameFor(run, clients),
            PRODUCT_LABEL[run.product],
            SOURCE_LABEL[run.tool_source],
            run.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q);
        })
        .sort((a, b) => {
          if (sort === "oldest") return Date.parse(a.updated_at) - Date.parse(b.updated_at);
          if (sort === "amount_desc") return (amountFor(b) ?? 0) - (amountFor(a) ?? 0);
          if (sort === "client") return clientNameFor(a, clients).localeCompare(clientNameFor(b, clients));
          return Date.parse(b.updated_at) - Date.parse(a.updated_at);
        });
    },
    [clients, endDate, q, runs, sort, startDate],
  );

  if (selectedRun) {
    return <AnalysisRunDetail run={selectedRun} clients={clients} onBack={() => setSelectedRun(null)} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 112, gap: 10 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", gap: 8 }}>
        <RunSummaryBox label="Saved" value={summary.saved} sub="last 30 days" tone="neutral" />
        <RunSummaryBox label="Shared" value={summary.shared} sub="client reports" tone="brand" />
        <RunSummaryBox label="Prequal" value={summary.prequal} sub="handoffs" tone="profit" />
      </View>

      <Card pad={10}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="search" size={15} color={t.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search runs..."
            placeholderTextColor={t.ink4}
            style={{ flex: 1, paddingVertical: 4, color: t.ink, fontSize: 13 }}
          />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <DateInput label="From" value={startDate} onChange={setStartDate} />
        <DateInput label="To" value={endDate} onChange={setEndDate} />
      </View>

      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {SORTS.map((item) => {
          const active = sort === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => setSort(item.value)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: active ? t.brand : t.line,
                backgroundColor: active ? t.brandSoft : t.surface,
              }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: "800", color: active ? t.brand : t.ink2 }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <Text style={{ fontSize: 12.5, color: t.ink3 }}>Loading runs...</Text>
      ) : filtered.length === 0 ? (
        <Card pad={16}>
          <Text style={{ fontSize: 13, color: t.ink3, lineHeight: 18 }}>{emptyText}</Text>
        </Card>
      ) : (
        <View style={{ gap: 7 }}>
          {filtered.map((run) => {
            const amount = amountFor(run);
            return (
              <Pressable
                key={run.id}
                onPress={() => setSelectedRun(run)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: pressed ? t.lineStrong : t.line,
                  borderRadius: 10,
                  backgroundColor: t.surface,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "900", color: t.ink }}>
                      {titleFor(run)}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                      {clientNameFor(run, clients)} - {PRODUCT_LABEL[run.product] ?? run.product}
                      {amount ? ` - ${QC_FMT.usd(amount, 0)}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink2 }}>{dateLabel(run.updated_at)}</Text>
                    <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 2 }}>{metricFor(run)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
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
    </ScrollView>
  );
}

function RunSummaryBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "brand" | "profit";
}) {
  const { t } = useTheme();
  const color = tone === "brand" ? t.brand : tone === "profit" ? t.profit : t.ink;
  const bg = tone === "brand" ? t.brandSoft : tone === "profit" ? t.profitBg : t.surface;
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 10, backgroundColor: bg, padding: 10, minWidth: 0 }}>
      <Text style={{ fontSize: 10, fontWeight: "900", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7 }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "900", color, marginTop: 2 }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: "800", color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9-]/g, "").slice(0, 10))}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={t.ink4}
        keyboardType="numbers-and-punctuation"
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 9, backgroundColor: t.surface2, paddingHorizontal: 10, paddingVertical: 8, color: t.ink, fontSize: 12 }}
      />
    </View>
  );
}

function parseDateBoundary(raw: string, mode: "start" | "end") {
  if (!raw.trim()) return null;
  const parsed = Date.parse(mode === "end" ? `${raw}T23:59:59` : `${raw}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function AnalysisRunDetail({ run, clients, onBack }: { run: AnalysisRun; clients: Client[]; onBack: () => void }) {
  const { t } = useTheme();
  const amount = amountFor(run);
  const report = run.ai_report ?? run.sanitized_client_report;
  const narrative = report ? String(report.narrative ?? report.summary ?? "") : "";
  const bullets = report
    ? [
        ...(Array.isArray(report.strengths) ? report.strengths.slice(0, 3) : []),
        ...(Array.isArray(report.weaknesses) ? report.weaknesses.slice(0, 3) : []),
      ]
    : [];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96, gap: 12 }}>
      <Pressable onPress={onBack} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}>
        <Icon name="arrowL" size={14} color={t.brand} />
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.brand }}>Previous runs</Text>
      </Pressable>

      <Card pad={14}>
        <Text style={{ fontSize: 18, fontWeight: "900", color: t.ink }} numberOfLines={2}>{titleFor(run)}</Text>
        <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
          {clientNameFor(run, clients)} - {PRODUCT_LABEL[run.product] ?? run.product} - updated {dateLabel(run.updated_at)}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Mini label="Amount" value={amount ? QC_FMT.usd(amount, 0) : "-"} />
          <Mini label="Metric" value={metricFor(run)} />
          <Mini label="Status" value={run.status.replace(/_/g, " ")} />
          <Mini label="Shared" value={run.shared_at ? "Yes" : "No"} />
        </View>
      </Card>

      <Card pad={14}>
        <SectionLabel>Saved report</SectionLabel>
        {narrative ? <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19 }}>{narrative}</Text> : null}
        {bullets.length ? (
          <View style={{ gap: 6, marginTop: narrative ? 10 : 0 }}>
            {bullets.map((item, idx) => (
              <View key={idx} style={{ flexDirection: "row", gap: 7, alignItems: "flex-start" }}>
                <Icon name="check" size={12} color={t.brand} />
                <Text style={{ flex: 1, fontSize: 12.5, color: t.ink2, lineHeight: 18 }}>{String(item)}</Text>
              </View>
            ))}
          </View>
        ) : !narrative ? (
          <Text style={{ fontSize: 13, color: t.ink3 }}>No generated report is attached to this run yet.</Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={{ width: "47%", minWidth: 130, borderWidth: 1, borderColor: t.line, borderRadius: 10, backgroundColor: t.surface2, padding: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: "900", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: "900", color: t.ink, marginTop: 3 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function AnalysisRunFabMenu({ actions }: { actions: AnalysisLaunchAction[] }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? (
        <View pointerEvents="box-none" style={{ position: "absolute", right: 16, bottom: 96 + insets.bottom, zIndex: 41 }}>
          <View style={{ width: 276, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 6, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 9 }}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  setOpen(false);
                  action.onPress();
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 10,
                  padding: 10,
                  backgroundColor: pressed ? t.surface2 : "transparent",
                })}
              >
                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={action.icon} size={15} color={t.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: t.ink }}>{action.label}</Text>
                  <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }} numberOfLines={2}>{action.description}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Fab onPress={() => setOpen((v) => !v)} icon={open ? "x" : "plus"} />
    </>
  );
}
