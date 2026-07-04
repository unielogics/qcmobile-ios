// Mobile Dashboard — CLIENT view, mirrors qcdesktop/src/app/page.tsx for the
// borrower experience. Sections (top → bottom):
//   1. Greeting (date · time · name + activity summary)
//   2. KPI strip (funded YTD, pipeline, avg close, pull-through) — /reports/dashboard
//   3. Pro Terms card (CLIENT only, gated on credit lock state)
//   4. Today's Market Rates — /fred/series with sparklines + delta bps
//   5. Pipeline (top-3 borrower-style loan cards) — /loans
//   6. Today's events — /calendar filtered to today
//   7. Portfolio Health — derived from real loans (no fake data)

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import {
  Avatar,
  Card,
  SectionLabel,
  StageBadge,
} from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { FredChart } from "@/components/FredChart";
import { RateDetailModal } from "@/components/RateDetailModal";
import { SharedAnalysisReports } from "@/components/SharedAnalysisReports";
import {
  useAnalysisRuns,
  useCalendar,
  useCurrentUser,
  useDashboardReport,
  useFredSeries,
  useLoans,
  useMyCredit,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { creditDisplayFromCredit } from "@/lib/creditDisplay";
import type { Loan } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { AIChatSheet } from "@/components/sheets/AIChatSheet";

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

// FRED product card mapping — same series IDs desktop uses
const PRODUCT_CARDS = [
  { id: "ff",   label: "Fix & Flip",             term: "12 mo", sub: "90% LTC / 75% ARV", series_id: "DPRIME" },
  { id: "gu",   label: "Ground Up Construction", term: "18 mo", sub: "85% LTC / 70% LTFC", series_id: "DPRIME" },
  { id: "dscr", label: "DSCR Rental",            term: "30 yr", sub: "80% LTV",            series_id: "DGS10" },
  { id: "br",   label: "Bridge",                 term: "24 mo", sub: "75% LTV",            series_id: "SOFR" },
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function greetingPhrase(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(user: { name?: string; email?: string } | null | undefined): string | null {
  if (!user) return null;
  const n = (user.name ?? "").trim();
  if (n && n !== user.email) return n.split(" ")[0];
  if (user.email) return user.email.split("@")[0].split(".")[0];
  return null;
}

export function SelfDirectedHome() {
  const { t, isDark } = useTheme();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: report } = useDashboardReport();
  const { data: events = [] } = useCalendar();
  const { data: credit } = useMyCredit();
  const { data: sharedReports = [] } = useAnalysisRuns({ shared: true });
  // The dashboard FAB now opens Elara chat
  // instead of the new-loan sheet. Per-loan AI chats stay accessible
  // from each loan's detail screen; the dashboard surface is the
  // account-wide entry point. New-loan creation moves to the
  // simulator's flows (already there).
  const [showAIChat, setShowAIChat] = useState(false);
  const [forcedThreadId, setForcedThreadId] = useState<string | null>(null);

  // Notification-tap deep-link: `?openThread=<id>` (set by
  // usePushTapHandler in src/lib/notifications.ts) opens the chat
  // sheet pre-targeted at that thread on next render.
  const params = useLocalSearchParams<{ openThread?: string }>();
  useEffect(() => {
    if (typeof params.openThread === "string" && params.openThread) {
      setForcedThreadId(params.openThread);
      setShowAIChat(true);
      // Clear the param so re-renders don't re-trigger.
      router.setParams({ openThread: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.openThread]);

  const isClient = user?.role === Role.CLIENT;
  const inFlight = useMemo(() => loans.filter((l) => l.stage !== "funded"), [loans]);
  const today = new Date();
  const todayEvents = useMemo(() => events.filter((e) => isSameDay(new Date(e.starts_at), today)), [events]);
  const firstName = firstNameOf(user);

  const datelineDate = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const datelineTime = today.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Dashboard" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 14 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.6, color: t.petrol, textTransform: "uppercase" }} numberOfLines={1}>
              {datelineDate} · {datelineTime}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.6, color: t.ink, marginTop: 2 }}>
              {firstName ? `${greetingPhrase()}, ${firstName}.` : `${greetingPhrase()}.`}
            </Text>
            <Text style={{ fontSize: 12, color: t.ink2, marginTop: 4 }}>
              {todayEvents.length} event{todayEvents.length === 1 ? "" : "s"} today, {inFlight.length} loan{inFlight.length === 1 ? "" : "s"} in flight.
            </Text>
          </View>
          <Avatar
            label={(user?.name?.split(" ").map((p) => p[0]).slice(0, 2).join("") ?? "?").toUpperCase()}
            size={40}
            color={t.brand}
          />
        </View>

        {/* KPI strip — operator-only. CLIENTs don't have funded-YTD,
            avg-close, or pull-through targets to track; the borrower
            view is built around Pro Terms + their pipeline + portfolio
            health + market rates instead. */}
        {!isClient ? (
          <>
            <SectionLabel>This year at a glance</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 6 }}>
              <KpiTile
                label="Funded YTD"
                value={report ? QC_FMT.short(report.funded_ytd) : "—"}
                delta={report?.funded_ytd_delta ?? null}
                sub="vs. prior year"
                accent={t.profit}
                icon="dollar"
              />
              <KpiTile
                label="Pipeline"
                value={report ? QC_FMT.short(report.pipeline_value) : "—"}
                sub={report ? `${report.pipeline_count} loans` : undefined}
                icon="layers"
              />
              <KpiTile
                label="Avg close"
                value={report?.avg_close_days ? `${report.avg_close_days}d` : "—"}
                delta={report?.avg_close_delta ?? null}
                deltaSuffix="d"
                sub="app to wire"
                icon="audit"
              />
              <KpiTile
                label="Pull-through"
                value={report?.pull_through != null ? `${(report.pull_through * 100).toFixed(0)}%` : "—"}
                delta={report?.pull_through_delta != null ? Math.round(report.pull_through_delta * 100) : null}
                sub="last 90d"
                icon="trend"
              />
            </View>
          </>
        ) : null}

        {/* Pro Terms — CLIENT only, mirrors desktop ProTermsCard */}
        {isClient ? (
          <ProTermsCard
            credit={credit}
            onPress={() => {
              const mode = credit?.is_expired
                ? "expired"
                : credit?.fico != null
                  ? "refresh"
                  : undefined;
              router.push({
                pathname: "/credit-pull",
                params: mode ? { mode } : undefined,
              });
            }}
          />
        ) : null}

        {isClient ? <SharedAnalysisReports reports={sharedReports} /> : null}

        {/* Market Rates — operators see them right under Pro Terms. For
            CLIENTs, market rates come AFTER their loans + portfolio
            health (rendered further down) so the focus is on their own
            deals first, market context second. */}
        {!isClient ? (
          <>
            <SectionLabel
              action={
                <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600" }}>FRED · 7d</Text>
              }
            >
              Today's market rates
            </SectionLabel>
            <FredRatesPanel />
          </>
        ) : null}

        {/* Pipeline — borrower style top-3 cards. Header is a Pressable
            that routes to the full Pipeline list (qcmobile/app/pipeline.tsx). */}
        <Pressable
          onPress={() => router.push("/pipeline")}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingHorizontal: 4,
            marginBottom: 10,
            marginTop: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.6, color: t.ink3, textTransform: "uppercase" }}>
              Your pipeline
            </Text>
            <Icon name="chevR" size={11} color={t.ink3} />
          </View>
          <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600" }}>
            {inFlight.length > 0
              ? `${inFlight.length} active · view all`
              : loans.length > 0
                ? `${loans.length} total · view all`
                : "view all"}
          </Text>
        </Pressable>
        <View style={{ gap: 10, marginBottom: 20 }}>
          {loans.length === 0 ? (
            <Card pad={20}>
              <Text style={{ color: t.ink3, fontSize: 13, textAlign: "center" }}>
                No loans yet. Tap the + button to start one.
              </Text>
            </Card>
          ) : (
            loans.slice(0, 3).map((l) => <LoanCard key={l.id} loan={l} />)
          )}
          {loans.length > 3 ? (
            <Pressable
              onPress={() => router.push("/pipeline")}
              style={({ pressed }) => ({
                paddingVertical: 10,
                alignItems: "center",
                borderRadius: 10,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: t.brand }}>
                Open full pipeline ({loans.length}) →
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Today's events */}
        {todayEvents.length > 0 ? (
          <>
            <SectionLabel
              action={
                <Pressable onPress={() => router.push("/(tabs)/calendar")}>
                  <Text style={{ color: t.petrol, fontSize: 12, fontWeight: "700" }}>Calendar →</Text>
                </Pressable>
              }
            >
              Today
            </SectionLabel>
            <Card pad={0} style={{ marginBottom: 20 }}>
              {todayEvents.slice(0, 5).map((ev, i, a) => {
                const k = ev.kind;
                const color = k === "closing" ? t.profit : k === "doc" ? t.warn : k === "ai" ? t.petrol : t.brand;
                const bg = k === "closing" ? t.profitBg : k === "doc" ? t.warnBg : k === "ai" ? t.petrolSoft : t.brandSoft;
                return (
                  <View
                    key={ev.id}
                    style={{
                      flexDirection: "row", alignItems: "flex-start", gap: 10,
                      paddingVertical: 10, paddingHorizontal: 14,
                      borderBottomWidth: i < a.length - 1 ? 1 : 0, borderBottomColor: t.line,
                      backgroundColor: ev.priority === "high" ? bg : "transparent",
                    }}
                  >
                    <Text style={{ minWidth: 56, fontSize: 11, fontWeight: "700", color, fontFamily: "monospace" }}>
                      {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: "700", color: t.ink }}>{ev.title}</Text>
                      <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
                        {ev.who ?? "—"}{ev.duration_min ? ` · ${ev.duration_min}m` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {/* Portfolio Health — derived from real loans */}
        <SectionLabel>Portfolio Health</SectionLabel>
        <PortfolioHealth loans={loans} />

        {/* Market Rates render AFTER portfolio health for CLIENTs — see
            comment above where the operator branch lives. */}
        {isClient ? (
          <View style={{ marginTop: 8 }}>
            <SectionLabel
              action={
                <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600" }}>FRED · 7d</Text>
              }
            >
              Today's market rates
            </SectionLabel>
            <FredRatesPanel />
          </View>
        ) : null}
      </ScrollView>

      <AIChatSheet
        visible={showAIChat}
        onClose={() => {
          setShowAIChat(false);
          setForcedThreadId(null);
        }}
        context="From your dashboard"
        initialThreadId={forcedThreadId}
      />
    </SafeAreaView>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────
function KpiTile({
  label, value, delta, deltaSuffix = "%", sub, accent, icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  const { t } = useTheme();
  const positive = delta != null && delta >= 0;
  return (
    <View style={{ width: "50%", padding: 4 }}>
      <Card pad={12}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }} numberOfLines={1}>{label}</Text>
          {icon ? <Icon name={icon} size={12} color={accent ?? t.ink3} /> : null}
        </View>
        <Text style={{ fontSize: 22, fontWeight: "700", color: t.ink, letterSpacing: -0.5, marginTop: 4 }}>{value}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          {delta != null ? (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 3,
              paddingVertical: 1, paddingHorizontal: 6, borderRadius: 5,
              backgroundColor: positive ? t.profitBg : t.dangerBg,
            }}>
              <Icon name={positive ? "trend" : "trendDn"} size={10} stroke={2.4} color={positive ? t.profit : t.danger} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: positive ? t.profit : t.danger }}>
                {(positive ? "+" : "") + delta}{deltaSuffix}
              </Text>
            </View>
          ) : null}
          {sub ? <Text style={{ fontSize: 11, color: t.ink3 }} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </Card>
    </View>
  );
}

// ── Pro Terms (CLIENT only) ─────────────────────────────────────────────
function ProTermsCard({ credit, onPress }: { credit: { fico: number | null } | null | undefined; onPress: () => void }) {
  const { t, isDark } = useTheme();
  const creditDisplay = creditDisplayFromCredit(credit);
  const unlocked = creditDisplay.verified && creditDisplay.tone !== "danger";
  return (
    <Card pad={14} style={{ marginBottom: 20, backgroundColor: unlocked ? t.profitBg : t.dangerBg, borderColor: unlocked ? `${t.profit}40` : `${t.danger}40` }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: unlocked ? t.profit : t.danger, alignItems: "center", justifyContent: "center" }}>
          <Icon name={unlocked ? "unlock" : "lock"} size={22} color={isDark ? "#06070B" : "#fff"} stroke={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: unlocked ? t.profit : t.danger }}>
            {unlocked ? "Pro Terms Unlocked" : "Pro Terms Locked"}
          </Text>
          <Text style={{ fontSize: 12, color: t.ink2, marginTop: 1, lineHeight: 16 }}>
            {unlocked
              ? `${creditDisplay.label} · valid through ${(credit as any)?.expires_at ? new Date((credit as any).expires_at).toLocaleDateString() : "—"}`
              : "One soft pull unlocks all applications for 90 days · no score impact."}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          marginTop: 12, paddingVertical: 11, borderRadius: 11,
          backgroundColor: unlocked ? t.surface : t.danger,
          borderWidth: unlocked ? 1 : 0, borderColor: t.line,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name={unlocked ? "refresh" : "lock"} size={14} color={unlocked ? t.ink : (isDark ? "#06070B" : "#fff")} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: unlocked ? t.ink : (isDark ? "#06070B" : "#fff") }}>
          {unlocked ? "Re-run pull" : "Unlock Pro Terms · Soft Pull"}
        </Text>
      </Pressable>
    </Card>
  );
}

// ── FRED rates panel ─────────────────────────────────────────────────────
function FredRatesPanel() {
  const { t } = useTheme();
  const { data: series = [], isLoading, error } = useFredSeries();
  const fredNotDeployed = !!error && error instanceof Error && /404/.test(String(error.message));
  const seriesById = new Map(series.map((s) => [s.series_id, s] as const));
  const hasAnyData = series.some((s) => s.current_value != null);

  // Tap a rate card → open fullscreen interactive detail modal. Tracking
  // the open card here (rather than per-RateCard) lets a single Modal
  // mount serve all cards.
  const [openCard, setOpenCard] = useState<{
    series_id: string;
    label: string;
    sub: string;
  } | null>(null);

  if (fredNotDeployed) {
    return (
      <Card pad={14} style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink, marginBottom: 4 }}>Market data not yet enabled</Text>
        <Text style={{ fontSize: 11.5, color: t.ink3, lineHeight: 16 }}>
          The backend doesn't expose <Text style={{ fontFamily: "monospace" }}>/fred/series</Text> at this environment.
        </Text>
      </Card>
    );
  }

  if (isLoading && !hasAnyData) {
    return (
      <Card pad={14} style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 12.5, color: t.ink3 }}>Loading rates…</Text>
      </Card>
    );
  }

  if (!hasAnyData) {
    return (
      <Card pad={14} style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 12.5, color: t.warn, fontWeight: "600" }}>Market data refreshing — check back shortly.</Text>
      </Card>
    );
  }

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 14 }}>
        {PRODUCT_CARDS.map((card) => {
          const s = seriesById.get(card.series_id);
          return (
            <View key={card.id} style={{ width: "50%", padding: 4 }}>
              <RateCard
                card={card}
                series={s}
                onPress={() =>
                  setOpenCard({ series_id: card.series_id, label: card.label, sub: card.sub })
                }
              />
            </View>
          );
        })}
      </View>
      <RateDetailModal
        seriesId={openCard?.series_id ?? null}
        title={openCard?.label}
        productSub={openCard?.sub}
        onClose={() => setOpenCard(null)}
      />
    </>
  );
}

function RateCard({
  card,
  series,
  onPress,
}: {
  card: { id: string; label: string; term: string; sub: string; series_id: string };
  series:
    | {
        current_value: number | null;
        estimated_rate: number | null;
        spread_bps: number;
        delta_bps: number | null;
        history_7d: { date: string; value: number | null }[];
        history_30d?: { date: string; value: number | null }[];
      }
    | undefined;
  onPress?: () => void;
}) {
  const { t } = useTheme();
  const hasData = !!series && series.current_value != null;
  const estimated = series?.estimated_rate;
  const indexValue = series?.current_value;
  const spreadBps = series?.spread_bps ?? 0;
  const delta = series?.delta_bps ?? null;
  const deltaColor = delta == null ? t.ink3 : delta < 0 ? t.profit : delta > 0 ? t.danger : t.ink3;
  // Inline chart points. DPRIME (Fix & Flip + Ground Up) publishes
  // weekly so its history_7d is empty most days — fall back to the
  // most recent valid points from history_30d so sparse series like
  // those still render.
  const chartPoints = (() => {
    const seven = (series?.history_7d ?? []).filter((p) => p.value != null);
    if (seven.length >= 2) return seven;
    const thirty = (series?.history_30d ?? []).filter((p) => p.value != null);
    return thirty.slice(-7);
  })();

  return (
    <Card pad={12} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: t.ink }}>
            {card.label} <Text style={{ color: t.ink3, fontWeight: "600" }}>· {card.term}</Text>
          </Text>
          <Text style={{ fontSize: 10, color: t.ink3, marginTop: 2 }}>{card.sub}</Text>
        </View>
        {/* Subtle "expand" affordance so the borrower knows the card opens
            a detail view. The chart itself stays scrubbable via PanResponder. */}
        <Icon name="external" size={11} color={t.ink4} />
      </View>
      {chartPoints.length >= 2 ? (
        <View style={{ height: 36, marginTop: 4 }}>
          <FredChart data={chartPoints} color={t.spark} width={140} height={36} fill />
        </View>
      ) : (
        <View style={{ height: 36, marginTop: 4, justifyContent: "center" }}>
          <Text style={{ fontSize: 10, color: t.ink4, fontStyle: "italic" }}>
            {hasData ? "Building history…" : "Awaiting first FRED pull"}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink, letterSpacing: -0.4 }}>
          {estimated != null ? estimated.toFixed(3) : "—"}
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3 }}>%</Text>
        </Text>
        <Text style={{ fontSize: 10.5, fontWeight: "800", color: deltaColor }}>
          {delta == null ? "—" : QC_FMT.bps(delta)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>{card.series_id}</Text>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>{indexValue != null ? `${indexValue.toFixed(2)}%` : "—"}</Text>
        <Text style={{ fontSize: 9.5, color: t.ink3 }}>+ {(spreadBps / 100).toFixed(2)}%</Text>
      </View>
    </Card>
  );
}

// ── Loan card ────────────────────────────────────────────────────────────
function LoanCard({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const router = useRouter();
  const stageIdx = Math.max(0, STAGE_KEYS.indexOf(loan.stage));
  const typeLabel = TYPE_LABEL[loan.type] ?? loan.type.replace("_", " ");
  const iconName = TYPE_ICON[loan.type] ?? "doc";

  return (
    <Card pad={14} onPress={() => router.push(`/loan/${loan.id}`)}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={iconName} size={18} color={t.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: t.ink3 }}>{loan.deal_id}</Text>
            <StageBadge stage={stageIdx} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: t.ink, letterSpacing: -0.2, marginTop: 4 }}>{loan.address}</Text>
          <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
            {QC_FMT.short(Number(loan.amount))} · {typeLabel}{loan.city ? ` · ${loan.city}` : ""}
          </Text>
        </View>
        <Icon name="chevR" size={14} color={t.ink4} />
      </View>
    </Card>
  );
}

// ── Portfolio Health ────────────────────────────────────────────────────
function PortfolioHealth({ loans }: { loans: Loan[] }) {
  const { t } = useTheme();
  const equityUnlocked = loans.reduce((s, l) => s + Number(l.amount) * 0.3, 0);
  const dscrLoans = loans.filter((l) => l.dscr != null);
  const globalDSCR = dscrLoans.length > 0 ? dscrLoans.reduce((s, l) => s + Number(l.dscr ?? 0), 0) / dscrLoans.length : null;
  const activeLoans = loans.filter((l) => l.stage !== "funded").length;
  const fundedLoans = loans.length - activeLoans;
  return (
    <Card pad={14}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
        <Stat label="Equity Unlocked" value={QC_FMT.short(equityUnlocked)} sub="estimated 30%" />
        <Stat label="Global DSCR" value={globalDSCR != null ? globalDSCR.toFixed(2) : "—"} sub={dscrLoans.length > 0 ? `${dscrLoans.length} loans` : "no DSCR"} accent={globalDSCR != null && globalDSCR > 1.25 ? t.profit : globalDSCR != null && globalDSCR > 1 ? t.warn : undefined} />
        <Stat label="Active" value={String(activeLoans)} sub={`${fundedLoans} funded`} />
      </View>
    </Card>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ width: "33.333%", padding: 4 }}>
      <View style={{ backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: 9.5, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: accent ?? t.ink, marginTop: 4, letterSpacing: -0.4 }}>{value}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 10, color: t.ink3, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}
