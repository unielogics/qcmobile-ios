// Mobile Simulator (tab) — mirrors the loan-detail Simulation pane but stands
// alone. Lets a borrower model what an ARV-driven loan looks like for any
// product, gated by their credit + experience tier.

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { Slider } from "@/design-system/Slider";
import { QC_FMT } from "@/design-system/tokens";
import { TopBar } from "@/components/TopBar";
import { useCreditSummary, useFredSeries, useLoans, useMyCredit, useMyPrequalRequests } from "@/hooks/useApi";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { PreQualRequestList } from "@/components/PreQualRequestList";
import { PreQualRequestSheet } from "@/components/sheets/PreQualRequestSheet";
import {
  bindingConstraintLabel,
  cappedReasonLabel,
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type EligibilityBanner,
  type SimulatorInputs,
  type TransactionType,
} from "@/lib/eligibility";
import { isProductKeyEnabled } from "@/lib/products";
import { creditDisplayFromFico, creditDisplayFromSummary } from "@/lib/creditDisplay";
import { RangeGauge } from "@/components/RangeGauge";
import { LoanSimulator } from "@/components/LoanSimulator";
import { AmortizationSchedule, HudDonutChart } from "@/components/SimulatorCharts";
import type { Loan } from "@/lib/types";

const ALL_PRODUCTS: { id: SimulatorInputs["productKey"]; label: string; sub: string }[] = [
  { id: "dscr", label: "DSCR Rental",   sub: "30 yr" },
  { id: "ff",   label: "Fix & Flip",    sub: "12 mo" },
  { id: "gu",   label: "Ground Up",     sub: "18 mo" },
  { id: "br",   label: "Bridge",        sub: "24 mo" },
];
const PRODUCTS = ALL_PRODUCTS.filter((p) => isProductKeyEnabled(p.id));

// Mirrors qcdesktop's LOAN_TYPE_TO_SERIES — keep in sync. Maps the
// client-facing product key to the FRED benchmark used to price it.
const PRODUCT_TO_SERIES: Record<SimulatorInputs["productKey"], string> = {
  dscr: "DGS10",
  ff:   "DPRIME",
  gu:   "DPRIME",
  br:   "SOFR",
};

type SimTab = "free" | "started";

export function SelfDirectedSimulatorScreen() {
  const { t, isDark } = useTheme();
  const router = useRouter();
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

  // Segmented-control state — Free Simulate | My Loans.
  const [simTab, setSimTab] = useState<SimTab>("free");
  const [pickedLoanId, setPickedLoanId] = useState<string | null>(null);
  const pickedLoan = pickedLoanId ? loans.find((l) => l.id === pickedLoanId) ?? null : null;

  const propertyCount = loans.length;
  const hasYearOfOwnership = useMemo(() => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return loans.some((l) => l.stage === "funded" && l.close_date && (now - new Date(l.close_date).getTime()) >= oneYearMs);
  }, [loans]);

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount,
    hasYearOfOwnership,
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const [productKey, setProductKey] = useState<SimulatorInputs["productKey"]>("dscr");
  const [transactionType, setTransactionType] = useState<TransactionType>("purchase");
  const [arvText, setArvText] = useState("500000");
  const [brvText, setBrvText] = useState("400000");
  const [rehabText, setRehabText] = useState("80000");
  const [payoffText, setPayoffText] = useState("0");
  const [monthlyRentText, setMonthlyRentText] = useState("");
  const [points, setPoints] = useState(1);
  // HUD breakdown is opt-in — keeps the calculator + hero rate at the top
  // of the screen on phones instead of pushing them above the fold.
  const [hudOpen, setHudOpen] = useState(false);
  const initialLtv = Math.min(eligibility.maxLTV * 100 || 65, 65);
  const [ltvPct, setLtvPct] = useState(initialLtv);
  const [requestedLoanText, setRequestedLoanText] = useState<string | null>(null);

  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const brvNum = Number(brvText.replace(/[^0-9.]/g, "")) || 0;
  const rehabNum = Number(rehabText.replace(/[^0-9.]/g, "")) || 0;
  const payoffNum = Number(payoffText.replace(/[^0-9.]/g, "")) || 0;
  const monthlyRentNum = Number(monthlyRentText.replace(/[^0-9.]/g, "")) || 0;
  const requestedLoanNum =
    requestedLoanText != null ? Number(requestedLoanText.replace(/[^0-9.]/g, "")) || 0 : null;
  const isBlocked = eligibility.tier === "blocked";
  const reno = productKey === "ff" || productKey === "gu";
  const isRefi = productKey === "dscr" && transactionType === "refi";
  const propertyLabel = reno
    ? "ARV (After Repair Value)"
    : isRefi
      ? "Property Value"
      : "Market Value";

  // Pull today's rate from FRED for the selected product. Falls through to
  // the hardcoded table inside computeSimulator when FRED isn't available.
  const liveRate = fred?.find((s) => s.series_id === PRODUCT_TO_SERIES[productKey]);
  const baseRatePct = liveRate?.estimated_rate ?? undefined;

  const sim = useMemo(() => {
    if (isBlocked || arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvPct / 100,
      discountPoints: points,
      productKey,
      baseRatePct,
      transactionType: productKey === "dscr" ? transactionType : undefined,
      payoff: isRefi ? payoffNum : undefined,
      brv: reno ? brvNum : undefined,
      rehabBudget: reno ? rehabNum : undefined,
      requestedLoanAmount: requestedLoanNum ?? undefined,
      ltvTierCap: eligibility.maxLTV > 0 ? eligibility.maxLTV : undefined,
      monthlyRent: productKey === "dscr" && monthlyRentNum > 0 ? monthlyRentNum : undefined,
    });
  }, [
    isBlocked,
    arvNum,
    ltvPct,
    points,
    productKey,
    baseRatePct,
    transactionType,
    isRefi,
    payoffNum,
    reno,
    brvNum,
    rehabNum,
    requestedLoanNum,
    monthlyRentNum,
    eligibility.maxLTV,
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Simulator" />

      {/* Segmented control — Free Simulate | My Loans */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: t.chip, borderRadius: 12, padding: 3 }}>
          {(
            [
              { id: "free" as const, label: "Free Simulate" },
              { id: "started" as const, label: `My Loans${loans.length ? ` (${loans.length})` : ""}` },
            ]
          ).map((opt) => {
            const active = simTab === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  setSimTab(opt.id);
                  setPickedLoanId(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 9,
                  backgroundColor: active ? t.surface : "transparent",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? t.ink : t.ink3 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {simTab === "started" ? (
        pickedLoan ? (
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => setPickedLoanId(null)}
              hitSlop={12}
              style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text style={{ color: t.brand, fontWeight: "700", fontSize: 14 }}>‹ My Loans</Text>
            </Pressable>
            <LoanSimulator loan={pickedLoan} />
          </View>
        ) : (
          <MyLoansList loans={loans} onPick={setPickedLoanId} onSwitchToFree={() => setSimTab("free")} />
        )
      ) : (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Compact credit + experience header. Collapsed by default so
            the calculator sits at the top of the screen. Tap to expand
            the full summary + any eligibility banner. */}
        <View style={{ marginBottom: 12 }}>
          <CompactCreditHeader
            summary={creditSummary ?? null}
            fico={credit?.fico ?? null}
            propertyCount={propertyCount}
            hasYearOfOwnership={hasYearOfOwnership}
            banner={eligibility.banner ?? null}
            onBannerCta={(target) => {
              if (target === "credit-pull") {
                const mode =
                  eligibility.banner?.kind === "credit-expired"
                    ? "expired"
                    : eligibility.banner?.kind === "credit-expiring"
                      ? "refresh"
                      : undefined;
                router.push({ pathname: "/credit-pull", params: mode ? { mode } : undefined });
              }
              if (target === "vault") router.push("/(tabs)/vault");
              if (target === "new-loan") router.push("/(tabs)");
            }}
          />
        </View>

        {/* Product selector */}
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: t.chip, borderRadius: 12, padding: 3, marginBottom: 14 }}>
          {PRODUCTS.map((p) => {
            const active = productKey === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setProductKey(p.id)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: active ? t.surface : "transparent", alignItems: "center" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.ink : t.ink3 }}>{p.label}</Text>
                <Text style={{ fontSize: 9.5, fontWeight: "600", color: active ? t.ink3 : t.ink4, marginTop: 2 }}>{p.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hero rate display */}
        <View style={{ borderRadius: 18, padding: 20, backgroundColor: isDark ? t.surface : t.brand, marginBottom: 14 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.4, opacity: 0.7, color: isDark ? t.ink3 : "#fff", textTransform: "uppercase" }}>Your Rate</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 }}>
            <Text style={{ fontSize: 44, fontWeight: "700", letterSpacing: -1.5, color: isDark ? t.ink : "#fff", lineHeight: 48 }}>
              {sim ? (sim.rate * 100).toFixed(3) : "—"}
              <Text style={{ fontSize: 22, opacity: 0.8 }}>%</Text>
            </Text>
            <Text style={{ fontSize: 11, opacity: 0.7, fontWeight: "600", color: isDark ? t.ink2 : "#fff" }}>
              {points > 0 ? `−${(points * 25).toFixed(0)} bps` : "no discount"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: isDark ? t.line : "rgba(255,255,255,0.15)" }}>
            <HeroStat label="Loan amount" value={sim ? QC_FMT.short(sim.loanAmount) : "—"} />
            <HeroStat
              label="Monthly P&I"
              value={sim ? QC_FMT.usd(sim.monthlyPI, 0) : "—"}
            />
            {productKey === "dscr" ? (
              <HeroStat
                label="DSCR"
                value={sim?.dscr != null ? sim.dscr.toFixed(2) : "—"}
                accent={sim?.dscr != null ? (sim.dscr > 1.25 ? t.profit : sim.dscr > 1 ? t.warn : t.danger) : undefined}
              />
            ) : null}
          </View>
        </View>

        {/* Property value(s) — reno shows BRV + Rehab + ARV;
            DSCR refi shows Property Value + Payoff;
            DSCR purchase shows Market Value only. */}
        <Card pad={14} style={{ marginBottom: 12 }}>
          {productKey === "dscr" ? (
            <View style={{ flexDirection: "row", gap: 4, backgroundColor: t.chip, borderRadius: 11, padding: 3, marginBottom: 12 }}>
              {(["purchase", "refi"] as const).map((tx) => {
                const active = transactionType === tx;
                return (
                  <Pressable
                    key={tx}
                    onPress={() => setTransactionType(tx)}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: 9, backgroundColor: active ? t.surface : "transparent", alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? t.ink : t.ink3 }}>
                      {tx === "purchase" ? "Purchase" : "Refinance"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {reno ? (
            <>
              <ValueInput
                label="Purchase price (BRV)"
                hint="As-is purchase value"
                value={brvText}
                onChange={setBrvText}
                num={brvNum}
                placeholder="400000"
              />
              <View style={{ height: 12 }} />
              <ValueInput
                label="Rehab budget"
                hint="Construction / repair cost"
                value={rehabText}
                onChange={setRehabText}
                num={rehabNum}
                placeholder="80000"
              />
              <View style={{ height: 12 }} />
              <ValueInput
                label={propertyLabel}
                hint="After repair value (cap basis)"
                value={arvText}
                onChange={setArvText}
                num={arvNum}
                placeholder="600000"
              />
            </>
          ) : (
            <>
              <ValueInput
                label={propertyLabel}
                hint={isRefi ? "Today's appraised value" : "Loan = Market Value × LTV"}
                value={arvText}
                onChange={setArvText}
                num={arvNum}
                placeholder="500000"
              />
              {isRefi ? (
                <>
                  <View style={{ height: 12 }} />
                  <ValueInput
                    label="Existing payoff"
                    hint="Mortgage balance to pay off"
                    value={payoffText}
                    onChange={setPayoffText}
                    num={payoffNum}
                    placeholder="0"
                  />
                </>
              ) : null}
              {productKey === "dscr" ? (
                <>
                  <View style={{ height: 12 }} />
                  <ValueInput
                    label="Monthly rent"
                    hint={
                      monthlyRentNum > 0
                        ? "Drives DSCR + cash flow"
                        : "Auto ≈ 0.85% of loan if blank"
                    }
                    value={monthlyRentText}
                    onChange={setMonthlyRentText}
                    num={monthlyRentNum}
                    placeholder="4250"
                  />
                </>
              ) : null}
            </>
          )}
          {liveRate?.estimated_rate != null ? (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.line }}>
              <Text style={{ fontSize: 10.5, color: t.ink3, fontWeight: "600" }}>
                Today's base rate · {liveRate.label} +{liveRate.spread_bps} bps
              </Text>
              <Text style={{ fontSize: 13, color: t.ink, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }}>
                {liveRate.estimated_rate.toFixed(3)}%
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Discount points slider */}
        <Card pad={14} style={{ marginBottom: 12 }}>
          <SliderHeader
            label="Discount Points"
            value={`${points.toFixed(2)} pts`}
            hint={points > 0 ? `−${Math.round(points * 25)} bps off base rate` : "No buy-down · base rate"}
            disabled={isBlocked}
          />
          <Slider
            value={points}
            min={0}
            max={2}
            step={0.25}
            onChange={isBlocked ? () => {} : setPoints}
            markers={[
              { value: 0, label: "0" },
              { value: 0.5, label: "0.5" },
              { value: 1, label: "1" },
              { value: 1.5, label: "1.5" },
              { value: 2, label: "2" },
            ]}
          />
        </Card>

        {/* RangeGauge — visual cap-vs-current */}
        {sim && arvNum > 0 ? (
          <Card pad={14} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
              Purchase power
            </Text>
            <RangeGauge
              current={sim.effectiveLtv}
              max={reno ? Math.max(0.001, sim.maxLoan / Math.max(arvNum, 1)) : sim.effectiveLtvCap ?? eligibility.maxLTV}
              tiers={[0.6, 0.65, 0.7, 0.75]}
              lockedAbove={eligibility.maxLTV}
              binding={sim.clamped ? (sim.bindingConstraint as "ltv" | "ltc" | "arv" | "refi-cap") : undefined}
              markers={
                isRefi && payoffNum > 0 && arvNum > 0
                  ? [{ at: payoffNum / arvNum, label: "payoff", tone: "muted" }]
                  : undefined
              }
              secondaryCap={reno ? { at: 0.7, label: "ARV cap" } : undefined}
            />
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
              Loan {QC_FMT.usd(sim.loanAmount, 0)} · max {QC_FMT.usd(sim.maxLoan, 0)} · {bindingConstraintLabel(sim.bindingConstraint)}
            </Text>
          </Card>
        ) : null}

        {/* LTV slider — hidden for reno products (sized off LTC, not LTV) */}
        {!reno ? (
          <Card pad={14} style={{ marginBottom: 12 }}>
            <SliderHeader
              label="Loan-to-value (LTV)"
              value={`${ltvPct}%`}
              hint={ltvLabel(ltvPct / 100)}
              disabled={isBlocked}
            />
            <Slider
              value={ltvPct}
              min={60}
              max={isRefi ? 75 : 80}
              step={1}
              onChange={
                isBlocked
                  ? () => {}
                  : (v) => {
                      setLtvPct(v);
                      setRequestedLoanText(null);
                    }
              }
              gatedMax={isBlocked ? 60 : Math.min(eligibility.maxLTV * 100, isRefi ? 75 : 80)}
              markers={eligibility.allLTVs.map((v) => ({
                value: Math.round(v * 100),
                label: `${Math.round(v * 100)}%`,
              }))}
            />
            {!isBlocked && eligibility.maxLTV < 0.75 ? (
              <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
                70% and 75% locked at this tier.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Manual loan amount — clamped to the cap */}
        {sim ? (
          <Card pad={14} style={{ marginBottom: 12 }}>
            <ValueInput
              label={`Loan amount · max ${QC_FMT.usd(sim.maxLoan, 0)}`}
              hint={
                sim.clamped
                  ? cappedReasonLabel(sim.bindingConstraint, sim.maxLoan)
                  : "Type to override; clamps to cap on blur"
              }
              value={requestedLoanText ?? Math.round(sim.loanAmount).toString()}
              onChange={(v) => setRequestedLoanText(v)}
              num={requestedLoanNum ?? sim.loanAmount}
              placeholder={Math.round(sim.maxLoan).toString()}
            />
          </Card>
        ) : null}

        {/* HUD-1 breakdown — collapsed by default. Tap the header to
            expand. The Total + Cash-to-borrower / equity rows always
            show so the borrower sees the headline figures. */}
        {sim ? (
          <Card pad={0} style={{ overflow: "hidden", marginBottom: 12 }}>
            <Pressable
              onPress={() => setHudOpen((v) => !v)}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: t.surface2,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                opacity: pressed ? 0.85 : 1,
                borderBottomWidth: hudOpen ? 1 : 0,
                borderBottomColor: t.line,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>
                  Closing details
                </Text>
                <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
                  Total to close · {QC_FMT.usd(sim.totalToClose, 0)} · tap to {hudOpen ? "hide" : "see HUD-1"}
                </Text>
              </View>
              <Icon name={hudOpen ? "chevU" : "chevD"} size={14} color={t.ink3} />
            </Pressable>
            {hudOpen ? (
            <>
            {[
              { l: "801 · Origination Fee", sub: "0.75% of loan amount", v: sim.origination },
              { l: "802 · Discount Points", sub: `${points.toFixed(2)} pts`, v: sim.pointsCost, hl: true },
              { l: "804 · Appraisal",       sub: "Standard residential", v: sim.appraisal },
              { l: "811/812 · Processing + UW", sub: "",                  v: sim.fixedFees },
              { l: "1108 · Title Insurance", sub: "Lender + owner",       v: sim.titleIns },
              { l: "1201 · Recording Fees",  sub: "",                     v: sim.recording },
            ].map((row, i, arr) => (
              <View
                key={row.l}
                style={{
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  paddingVertical: 11, paddingHorizontal: 16,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: t.line,
                  backgroundColor: row.hl ? t.brandSoft : "transparent",
                }}
              >
                <View>
                  <Text style={{ fontSize: 12.5, fontWeight: row.hl ? "700" : "500", color: t.ink }}>{row.l}</Text>
                  {row.sub ? <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>{row.sub}</Text> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>{QC_FMT.usd(row.v, 0)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, backgroundColor: t.surface2, borderTopWidth: 1, borderTopColor: t.lineStrong }}>
              <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: t.ink, textTransform: "uppercase" }}>Total to close</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", letterSpacing: -0.3, color: t.ink }}>{QC_FMT.usd(sim.totalToClose, 0)}</Text>
            </View>
            {sim.cashToBorrower != null ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: t.ink2 }}>
                  {sim.cashToBorrower >= 0 ? "Cash to borrower" : "Cash to close (refi gap)"}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: sim.cashToBorrower >= 0 ? t.profit : t.danger }}>
                  {sim.cashToBorrower >= 0 ? "+" : ""}{QC_FMT.usd(sim.cashToBorrower, 0)}
                </Text>
              </View>
            ) : null}
            {sim.cashToClose != null ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: t.ink2 }}>Borrower equity (cash to close)</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: t.ink }}>{QC_FMT.usd(sim.cashToClose, 0)}</Text>
              </View>
            ) : null}
            </>
            ) : null}
          </Card>
        ) : null}

        {/* Closing-cost donut + amortization chart — also behind hudOpen so
            we don't push the calculator off-screen on first paint. */}
        {sim && hudOpen ? (
          <HudDonutChart
            origination={sim.origination}
            pointsCost={sim.pointsCost}
            appraisal={sim.appraisal}
            fixedFees={sim.fixedFees}
            titleIns={sim.titleIns}
            recording={sim.recording}
            total={sim.totalToClose}
          />
        ) : null}

        {sim && hudOpen && sim.loanAmount > 0 && sim.rate > 0 ? (
          <AmortizationSchedule
            loanAmount={sim.loanAmount}
            annualRate={sim.rate}
            // DSCR amortizes 30y; F&F / GU / Bridge are interest-only with
            // a balloon at maturity (termMonths=0 triggers the IO branch).
            termMonths={productKey === "dscr" ? 360 : 0}
            monthlyPI={sim.monthlyPI}
          />
        ) : null}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MyLoansList({
  loans,
  onPick,
  onSwitchToFree,
}: {
  loans: Loan[];
  onPick: (loanId: string) => void;
  onSwitchToFree: () => void;
}) {
  const { t } = useTheme();
  // Pre-qualification letter requests — borrower's own list across all
  // their deals. Mirrors the desktop simulator's My Loans tab. The
  // sheet opens on tap of "Request Pre-Qualification" and the list
  // shows status / Download Letter / seller-outcome buttons inline.
  const { data: prequalRequests = [], isLoading: prequalLoading } = useMyPrequalRequests();
  const [prequalSheetOpen, setPrequalSheetOpen] = useState(false);

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 80, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Pre-qualification letters ──────────────────────────────── */}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Pre-qualification letters
          </Text>
          <Pressable
            onPress={() => setPrequalSheetOpen(true)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: t.brand,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="plus" size={12} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              Request
            </Text>
          </Pressable>
        </View>
        <PreQualRequestList
          requests={prequalRequests}
          isLoading={prequalLoading}
          emptyState={
            <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19 }}>
              No requests yet. Tap{" "}
              <Text style={{ fontWeight: "800", color: t.ink }}>Request</Text> to
              ask an underwriter for a pre-qualification letter on a property
              you&apos;re bidding on.
            </Text>
          }
        />
      </View>

      {/* ── Started loans ──────────────────────────────────────────── */}
      <View>
        <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.6, textTransform: "uppercase" }}>
            My loans
          </Text>
        </View>
        {loans.length === 0 ? (
          <Card pad={20}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink, letterSpacing: -0.3 }}>
              No started loans yet
            </Text>
            <Text style={{ fontSize: 13, color: t.ink3, marginTop: 6, lineHeight: 19 }}>
              Once you confirm a seller accepted your offer on an approved
              pre-qualification, the loan opens here. Until then, use Free
              Simulate to model what a deal could look like.
            </Text>
            <Pressable
              onPress={onSwitchToFree}
              style={({ pressed }) => ({
                marginTop: 14,
                paddingVertical: 11,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: t.brand,
                alignSelf: "flex-start",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                Open Free Simulate
              </Text>
            </Pressable>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {loans.map((loan) => {
              const arvNum = loan.arv != null ? Number(loan.arv) : 0;
              const ltvPct = loan.ltv != null ? Math.round(Number(loan.ltv) * 100) : null;
              return (
                <Pressable
                  key={loan.id}
                  onPress={() => onPick(loan.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Card pad={14}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.3 }}>
                          {loan.address || "Unnamed loan"}
                        </Text>
                        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                          {loan.type.replace(/_/g, " ")} · {loan.stage.replace(/_/g, " ")}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"] }}>
                          {arvNum > 0 ? QC_FMT.short(arvNum) : "—"}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>
                          {ltvPct != null ? `${ltvPct}% LTV` : "—"}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <PreQualRequestSheet
        visible={prequalSheetOpen}
        onClose={() => setPrequalSheetOpen(false)}
      />
    </ScrollView>
  );
}

function ValueInput({
  label,
  hint,
  value,
  onChange,
  num,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  num: number;
  placeholder: string;
}) {
  const { t } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.lineStrong, borderRadius: 11, backgroundColor: t.surface2, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: t.ink3, marginRight: 4 }}>$</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={t.ink4}
          style={{ flex: 1, paddingVertical: 12, fontSize: 18, fontWeight: "700", color: t.ink }}
        />
        <Text style={{ fontSize: 12, color: t.ink3, marginLeft: 8 }}>{num >= 1000 ? QC_FMT.short(num) : ""}</Text>
      </View>
      <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>{hint}</Text>
    </View>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { isDark, t } = useTheme();
  const fg = accent ?? (isDark ? t.ink : "#fff");
  const subFg = isDark ? t.ink3 : "rgba(255,255,255,0.7)";
  return (
    <View>
      <Text style={{ fontSize: 9.5, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: subFg }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: fg, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function SliderHeader({ label, value, hint, disabled }: { label: string; value: string; hint?: string; disabled?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <View>
        <Text style={{ fontSize: 12, fontWeight: "600", color: disabled ? t.ink4 : t.ink2 }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>{hint}</Text> : null}
      </View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: disabled ? t.ink4 : t.ink, letterSpacing: -0.3 }}>
        {value}
      </Text>
    </View>
  );
}

function EligibilityBannerCard({
  banner,
  onCta,
}: {
  banner: EligibilityBanner;
  onCta: (target: NonNullable<EligibilityBanner["ctaTarget"]>) => void;
}) {
  const { t, isDark } = useTheme();
  const palette = (() => {
    switch (banner.kind) {
      case "credit-blocked":
        return { bg: t.dangerBg, fg: t.danger, icon: "lock" as const };
      case "credit-warn":
        return { bg: t.warnBg, fg: t.warn, icon: "alert" as const };
      case "experience":
        return { bg: t.petrolSoft, fg: t.petrol, icon: "trend" as const };
      case "no-credit":
        return { bg: t.brandSoft, fg: t.brand, icon: "shield" as const };
      case "credit-expired":
        return { bg: t.dangerBg, fg: t.danger, icon: "refresh" as const };
      case "credit-expiring":
        return { bg: t.warnBg, fg: t.warn, icon: "refresh" as const };
    }
  })();

  return (
    <Card pad={14} style={{ backgroundColor: palette.bg, borderColor: `${palette.fg}40` }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.fg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={palette.icon} size={18} color={isDark ? "#06070B" : "#fff"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: palette.fg, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {banner.title}
          </Text>
          <Text style={{ fontSize: 12, color: t.ink2, marginTop: 4, lineHeight: 17 }}>{banner.body}</Text>
          {banner.ctaLabel && banner.ctaTarget ? (
            <Pressable
              onPress={() => onCta(banner.ctaTarget!)}
              style={({ pressed }) => ({
                marginTop: 10, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9,
                backgroundColor: palette.fg, alignSelf: "flex-start",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? "#06070B" : "#fff" }}>
                {banner.ctaLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

// ── Compact credit + experience header ───────────────────────────────────
// Borrower's vital stats — credit tier, properties owned, any eligibility
// banner — all in one tappable card. Collapsed by default so the
// calculator dominates the screen. Mirrors qcdesktop CollapsibleCreditSummary.
function CompactCreditHeader({
  summary,
  fico,
  propertyCount,
  hasYearOfOwnership,
  banner,
  onBannerCta,
}: {
  summary: import("@/lib/types").CreditSummary | null;
  fico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
  banner: EligibilityBanner | null;
  onBannerCta: (target: NonNullable<EligibilityBanner["ctaTarget"]>) => void;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);

  const expLabel =
    propertyCount === 0
      ? "no experience yet"
      : `${propertyCount} ${propertyCount === 1 ? "property" : "properties"}${
          hasYearOfOwnership ? " · 1+ yr held" : ""
        }`;

  const creditDisplay = summary ? creditDisplayFromSummary(summary) : creditDisplayFromFico(fico);
  const creditColors = creditDisplay.tone === "success"
    ? { bg: t.profitBg, fg: t.profit }
    : creditDisplay.tone === "danger"
      ? { bg: t.dangerBg, fg: t.danger }
      : creditDisplay.tone === "warning"
        ? { bg: t.warnBg, fg: t.warn }
        : { bg: t.chip, fg: t.ink3 };
  const hasBanner = banner != null;

  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            minWidth: 92,
            borderRadius: 999,
            backgroundColor: creditColors.bg,
            paddingHorizontal: 9,
            paddingVertical: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: creditColors.fg, textAlign: "center" }}>
            {creditDisplay.shortLabel}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: t.ink3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
            numberOfLines={1}
          >
            Credit · {creditDisplay.label}
          </Text>
          <Text
            style={{ fontSize: 12, color: t.ink2, marginTop: 2 }}
            numberOfLines={1}
          >
            {expLabel}
            {hasBanner ? (
              <Text style={{ color: t.warn, fontWeight: "700" }}>  ·  ⚠ action</Text>
            ) : null}
          </Text>
        </View>
        <Icon name={open ? "chevU" : "chevD"} size={14} color={t.ink3} />
      </Pressable>
      {open ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.line,
            padding: 14,
            gap: 12,
          }}
        >
          {hasBanner ? (
            <EligibilityBannerCard banner={banner} onCta={onBannerCta} />
          ) : null}
          {summary ? (
            <CreditSummaryCard summary={summary} />
          ) : (
            <Text style={{ fontSize: 12, color: t.ink3 }}>
              No credit summary yet. Run a soft pull to see your file.
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}
