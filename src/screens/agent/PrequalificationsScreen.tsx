import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { TopBar } from "@/components/TopBar";
import { useAdminPrequalRequests } from "@/hooks/useApi";
import { PREQUAL_LOAN_TYPE_LABELS, type PrequalRequest, type PrequalStatus } from "@/lib/types";

type PrequalSort = "newest" | "oldest" | "amount_desc" | "close_date";

const SORTS: { value: PrequalSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "amount_desc", label: "Amount" },
  { value: "close_date", label: "Close" },
];

function dateLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusInfo(status: PrequalStatus, t: ReturnType<typeof useTheme>["t"]) {
  if (status === "approved") return { label: "Approved", bg: t.profitBg, fg: t.profit };
  if (status === "rejected") return { label: "Rejected", bg: t.dangerBg, fg: t.danger };
  if (status === "offer_accepted") return { label: "Loan opened", bg: t.brandSoft, fg: t.brand };
  if (status === "offer_declined") return { label: "Declined", bg: t.chip, fg: t.ink3 };
  return { label: "Pending", bg: t.warnBg, fg: t.warn };
}

function requestedAmount(req: PrequalRequest) {
  const approved = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  return approved != null && req.status === "approved" ? approved : Number(req.requested_loan_amount);
}

export function PrequalificationsScreen() {
  const { t } = useTheme();
  const { data: allRows = [], isLoading } = useAdminPrequalRequests(null);
  const rows = useMemo(
    () => allRows.filter((row) => row.status === "pending" || row.status === "approved"),
    [allRows],
  );

  const counts = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending").length,
    approved: rows.filter((row) => row.status === "approved").length,
  }), [rows]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Prequalifications" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Card pad={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel>Funding review</SectionLabel>
              <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17 }}>
                Pending and approved prequalification requests tied to your client book.
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: t.ink, lineHeight: 32 }}>{counts.total}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: "800", color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
                Active
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
            <CountLine label="Pending" value={counts.pending} color={counts.pending ? t.warn : t.ink3} />
            <CountLine label="Approved" value={counts.approved} color={counts.approved ? t.profit : t.ink3} />
          </View>
        </Card>

        <PrequalRequestTable
          title="Funding review and approvals"
          rows={rows}
          isLoading={isLoading}
          emptyText="No pending or approved prequalification requests for your clients."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CountLine({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 7 }}>
      <Text style={{ fontSize: 18, fontWeight: "900", color }}>{value}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: "800", color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </Text>
    </View>
  );
}

function PrequalRequestTable({
  title,
  rows,
  isLoading,
  emptyText,
}: {
  title: string;
  rows: PrequalRequest[];
  isLoading: boolean;
  emptyText: string;
}) {
  const { t } = useTheme();
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState<PrequalSort>("newest");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = parseDateBoundary(startDate, "start");
    const end = parseDateBoundary(endDate, "end");
    return rows
      .filter((row) => {
        const created = Date.parse(row.created_at);
        if (start != null && created < start) return false;
        if (end != null && created > end) return false;
        if (!q) return true;
        const programLabel = PREQUAL_LOAN_TYPE_LABELS[row.loan_type]?.title ?? row.loan_type.replace(/_/g, " ");
        return [
          row.client_name,
          row.target_property_address,
          programLabel,
          row.quote_number,
          row.borrower_entity,
          row.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (sort === "oldest") return Date.parse(a.created_at) - Date.parse(b.created_at);
        if (sort === "amount_desc") return requestedAmount(b) - requestedAmount(a);
        if (sort === "close_date") {
          const av = a.expected_closing_date ? Date.parse(a.expected_closing_date) : Number.POSITIVE_INFINITY;
          const bv = b.expected_closing_date ? Date.parse(b.expected_closing_date) : Number.POSITIVE_INFINITY;
          return av - bv;
        }
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });
  }, [endDate, query, rows, sort, startDate]);

  return (
    <Card pad={12}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <SectionLabel>{title}</SectionLabel>
          <Text style={{ fontSize: 11.5, color: t.ink3 }}>{filteredRows.length} shown</Text>
        </View>
      </View>

      <View style={{ marginTop: 10, borderWidth: 1, borderColor: t.line, borderRadius: 10, backgroundColor: t.surface2, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="search" size={14} color={t.ink3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search client, address, program..."
          placeholderTextColor={t.ink4}
          style={{ flex: 1, paddingVertical: 9, color: t.ink, fontSize: 12.5 }}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <DateInput label="From" value={startDate} onChange={setStartDate} />
        <DateInput label="To" value={endDate} onChange={setEndDate} />
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
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

      {isLoading ? (
        <Text style={{ fontSize: 12.5, color: t.ink3, marginTop: 12 }}>Loading prequalifications...</Text>
      ) : filteredRows.length === 0 ? (
        <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19, marginTop: 12 }}>{emptyText}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 12 }}>
          {filteredRows.map((row) => (
            <PrequalQueueRow key={row.id} req={row} />
          ))}
        </View>
      )}
    </Card>
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

function PrequalQueueRow({ req }: { req: PrequalRequest }) {
  const { t } = useTheme();
  const router = useRouter();
  const status = statusInfo(req.status, t);
  const programLabel = PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type.replace(/_/g, " ");
  const closeDate = dateLabel(req.expected_closing_date);
  const created = dateLabel(req.created_at);
  const href = req.client_id
    ? (`/agent/client/${req.client_id}` as Href)
    : req.loan_id
      ? (`/agent/loan/${req.loan_id}` as Href)
      : null;

  return (
    <Pressable
      onPress={() => href && router.push(href)}
      disabled={!href}
      style={({ pressed }) => ({
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: pressed ? t.lineStrong : t.line,
        backgroundColor: t.surface,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill bg={status.bg} color={status.fg}>{status.label}</Pill>
        <Pill bg={t.chip} color={t.ink2}>{programLabel}</Pill>
        {req.source_analysis_run_id ? <Pill bg={t.brandSoft} color={t.brand}>From analysis</Pill> : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: "900", color: t.ink, marginTop: 10 }} numberOfLines={2}>
        {req.client_name ?? "Client linked"}
      </Text>
      <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 3 }} numberOfLines={2}>
        {req.target_property_address || "Target property TBD"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 9 }}>
        <Meta label={req.status === "approved" ? "Amount" : "Requested"} value={QC_FMT.usd(requestedAmount(req), 0)} />
        {closeDate ? <Meta label="Close" value={closeDate} /> : null}
        {created ? <Meta label="Created" value={created} /> : null}
      </View>
    </Pressable>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: 10, fontWeight: "800", color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.ink, marginTop: 1 }}>{value}</Text>
    </View>
  );
}
