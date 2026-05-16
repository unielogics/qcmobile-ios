// Borrower-facing pipeline screen — full inventory of the user's loans.
// Reached from the Home tab's "Your pipeline" header (which only shows
// the top-3 cards). Matches the desktop /pipeline interface: search,
// type filter chips, sortable columns, dense rows. Tapping a row opens
// the loan detail screen.
//
// Operators on mobile (rare; they live on desktop) see the same list,
// scoped to whatever loans the backend returns for their role.

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, StageBadge } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { TopBar } from "@/components/TopBar";
import { useLoans } from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const TYPE_ICON: Record<string, string> = {
  fix_and_flip: "hammer",
  ground_up: "building2",
  dscr: "key",
  bridge: "bolt",
  portfolio: "layers",
  cash_out_refi: "refresh",
};
const TYPE_LABEL: Record<string, string> = {
  fix_and_flip: "Fix & Flip",
  ground_up: "Ground Up",
  dscr: "DSCR",
  bridge: "Bridge",
  portfolio: "Portfolio",
  cash_out_refi: "Cash-Out",
};

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "dscr", label: "DSCR" },
  { id: "fix_and_flip", label: "Fix & Flip" },
  { id: "ground_up", label: "Ground Up" },
  { id: "bridge", label: "Bridge" },
] as const;

type FilterId = (typeof TYPE_FILTERS)[number]["id"];

// Same sort keys as desktop so the two screens stay aligned.
type SortKey = "deal_id" | "address" | "type" | "amount" | "stage" | "close_date";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "amount", label: "Amount" },
  { id: "stage", label: "Stage" },
  { id: "close_date", label: "Close date" },
  { id: "deal_id", label: "Deal ID" },
  { id: "address", label: "Address" },
];

export default function PipelinePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: loans = [], isLoading } = useLoans();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterId>("all");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const inFlight = useMemo(() => loans.filter((l) => l.stage !== "funded"), [loans]);
  const funded = useMemo(() => loans.filter((l) => l.stage === "funded"), [loans]);

  const visibleLoans = useMemo(() => {
    let out = loans;
    if (typeFilter !== "all") out = out.filter((l) => l.type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (l) =>
          l.deal_id.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          (l.city ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      // SortKey is constrained to a small set of Loan fields; index
      // through `unknown` to satisfy TS without a Record cast.
      const av = (a as unknown as { [k in SortKey]: unknown })[sortKey];
      const bv = (b as unknown as { [k in SortKey]: unknown })[sortKey];
      const an = av == null ? "" : av;
      const bn = bv == null ? "" : bv;
      if (typeof an === "number" && typeof bn === "number") return (an - bn) * dir;
      return String(an).localeCompare(String(bn)) * dir;
    });
  }, [loans, search, typeFilter, sortKey, sortDir]);

  const totalValue = visibleLoans.reduce((acc, l) => acc + Number(l.amount || 0), 0);

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Numeric / date keys default to descending (largest / soonest
      // first); strings default to ascending. Mirrors desktop.
      setSortDir(["amount", "close_date"].includes(k) ? "desc" : "asc");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Pipeline" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginTop: 4, marginBottom: 8 }}>
          <Text style={{ color: t.brand, fontWeight: "700", fontSize: 14 }}>‹ Back</Text>
        </Pressable>

        {/* Header — title + summary line, matching desktop's
            "Pipeline · N loans · $X.YM value" header. */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, letterSpacing: -0.4 }}>
            Pipeline
          </Text>
          <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
            {loans.length === 0
              ? "No loans on file yet."
              : `${visibleLoans.length} shown · ${inFlight.length} active · ${funded.length} funded · ${QC_FMT.short(totalValue)} value`}
          </Text>
        </View>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.line,
            marginBottom: 12,
          }}
        >
          <Icon name="search" size={14} color={t.ink3} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search address or deal ID…"
            placeholderTextColor={t.ink4}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, fontSize: 13, color: t.ink, padding: 0 }}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={6}>
              <Icon name="x" size={14} color={t.ink3} />
            </Pressable>
          ) : null}
        </View>

        {/* Type filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 4, paddingLeft: 4 }}
          style={{ marginHorizontal: -4, marginBottom: 8 }}
        >
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setTypeFilter(f.id)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: active ? t.ink : t.chip,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.inverse : t.ink2 }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sort row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 4, paddingLeft: 4 }}
          style={{ marginHorizontal: -4, marginBottom: 14 }}
        >
          <Text style={{
            fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase",
            paddingVertical: 8, paddingRight: 6,
          }}>
            Sort
          </Text>
          {SORT_OPTIONS.map((s) => {
            const active = sortKey === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => onSort(s.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: active ? t.brandSoft : "transparent",
                  borderWidth: 1,
                  borderColor: active ? t.brand : t.line,
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: active ? t.brand : t.ink3 }}>
                  {s.label}
                </Text>
                {active ? (
                  <Text style={{ fontSize: 9, color: t.brand }}>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Loan rows */}
        {isLoading && loans.length === 0 ? (
          <Card pad={20}>
            <Text style={{ fontSize: 13, color: t.ink3 }}>Loading…</Text>
          </Card>
        ) : visibleLoans.length === 0 ? (
          <Card pad={20}>
            <Text style={{ fontSize: 13, color: t.ink3, textAlign: "center" }}>
              {loans.length === 0
                ? "No loans yet. Start one from Home."
                : "No loans match this filter / search."}
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {visibleLoans.map((loan) => (
              <PipelineRow key={loan.id} loan={loan} onPress={() => router.push(`/loan/${loan.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Pipeline row — desktop renders these in a CSS grid with columns
// (ID / Property / Type / Amount / DSCR / Risk / Close). Mobile
// stacks the same fields into a Card with the icon on the left and
// secondary metrics (DSCR, risk, close date) in a small footer row.
function PipelineRow({ loan, onPress }: { loan: Loan; onPress: () => void }) {
  const { t } = useTheme();
  const stageIdx = Math.max(0, STAGE_KEYS.indexOf(loan.stage));
  const typeLabel = TYPE_LABEL[loan.type] ?? loan.type.replace(/_/g, " ");
  const iconName = TYPE_ICON[loan.type] ?? "doc";
  const dscrColor =
    loan.dscr && loan.dscr >= 1.25 ? t.profit
    : loan.dscr && loan.dscr >= 1.0 ? t.warn
    : t.ink3;
  const closeStr = loan.close_date
    ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  return (
    <Card pad={14} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View
          style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name={iconName} size={18} color={t.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: t.ink3 }}>
              {loan.deal_id}
            </Text>
            <StageBadge stage={stageIdx} />
            <View style={{ marginLeft: "auto" }}>
              <Pill>{typeLabel}</Pill>
            </View>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: t.ink, letterSpacing: -0.2, marginTop: 6 }}>
            {loan.address}
          </Text>
          {loan.city ? (
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{loan.city}</Text>
          ) : null}

          {/* Metrics row — mirrors desktop columns: Amount / DSCR / Risk / Close */}
          <View style={{ flexDirection: "row", gap: 14, marginTop: 8, alignItems: "baseline" }}>
            <View>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: t.ink4, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Amount
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"], marginTop: 1 }}>
                {QC_FMT.short(Number(loan.amount || 0))}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: t.ink4, letterSpacing: 0.6, textTransform: "uppercase" }}>
                DSCR
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: dscrColor, fontVariant: ["tabular-nums"], marginTop: 1 }}>
                {loan.dscr ? loan.dscr.toFixed(2) : "—"}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: t.ink4, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Risk
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"], marginTop: 1 }}>
                {loan.risk_score ?? "—"}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 9.5, fontWeight: "700", color: t.ink4, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Close
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"], marginTop: 1 }}>
                {closeStr}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 4 }}>
          <Icon name="chevR" size={14} color={t.ink4} />
        </View>
      </View>
    </Card>
  );
}
