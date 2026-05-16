// LoanSimulator — DP-only client view for a started loan.
//
// CLIENTs see the loan's persisted ARV, LTV, product, and base rate as
// read-only chips. The only interactive control is the discount-points
// slider; the rate, monthly P&I, DSCR, and HUD-1 totals re-render live.
//
// Used in two places:
//   • Mobile loan-detail Simulation tab (qcmobile/app/loan/[id].tsx)
//   • Mobile Simulator tab → "My Loans" segment → tap loan
//
// Operator-mode editing of the same fields lives in qcdesktop's TermsTab.
// Mobile is CLIENT-only by construction (operators use desktop).

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { Slider } from "@/design-system/Slider";
import { QC_FMT } from "@/design-system/tokens";
import { useCreditSummary, useFredSeries, useLoans, useMyCredit } from "@/hooks/useApi";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { AmortizationSchedule, HudDonutChart } from "@/components/SimulatorCharts";
import {
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type EligibilityBanner,
  type SimulatorInputs,
} from "@/lib/eligibility";
import type { Loan } from "@/lib/types";

const PRODUCT_LABEL: Record<SimulatorInputs["productKey"], string> = {
  dscr: "DSCR Rental",
  ff:   "Fix & Flip",
  gu:   "Ground Up",
  br:   "Bridge",
};
const PRODUCT_TERM: Record<SimulatorInputs["productKey"], string> = {
  dscr: "30 yr amortized",
  ff:   "12 mo IO",
  gu:   "18 mo IO",
  br:   "24 mo IO",
};
const PRODUCT_TO_FRED: Record<SimulatorInputs["productKey"], string> = {
  dscr: "DGS10",
  ff:   "DPRIME",
  gu:   "DPRIME",
  br:   "SOFR",
};

function productKeyFor(loanType: string): SimulatorInputs["productKey"] {
  if (loanType === "dscr") return "dscr";
  if (loanType === "fix_and_flip") return "ff";
  if (loanType === "ground_up") return "gu";
  return "br";
}

export function LoanSimulator({ loan }: { loan: Loan }) {
  const { t, isDark } = useTheme();
  const router = useRouter();
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

  const propertyCount = loans.length;
  const hasYearOfOwnership = useMemo(() => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return loans.some(
      (l) => l.stage === "funded" && l.close_date && now - new Date(l.close_date).getTime() >= oneYearMs,
    );
  }, [loans]);

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount,
    hasYearOfOwnership,
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const productKey = productKeyFor(loan.type);
  const arvNum = loan.arv != null ? Number(loan.arv) : 0;
  const ltvFraction = loan.ltv != null ? Number(loan.ltv) : 0.65;
  const ltvPct = Math.round(ltvFraction * 100);

  // DP is the only interactive input. Initial value comes from the loan.
  const [points, setPoints] = useState(Math.min(2, Math.max(0, loan.discount_points || 0)));

  // Live base rate from FRED for this product (when available).
  const liveRate = fred?.find((s) => s.series_id === PRODUCT_TO_FRED[productKey]);
  const baseRatePct =
    loan.base_rate != null ? Number(loan.base_rate) * 100 : liveRate?.estimated_rate ?? undefined;

  const sim = useMemo(() => {
    if (arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvFraction,
      discountPoints: points,
      productKey,
      baseRatePct,
    });
  }, [arvNum, ltvFraction, points, productKey, baseRatePct]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {eligibility.banner ? (
        <EligibilityBannerCard
          banner={eligibility.banner}
          onCta={(target) => {
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
      ) : null}

      {credit && creditSummary ? <CreditSummaryCard summary={creditSummary} /> : null}

      {/* Hero rate display */}
      <View
        style={{
          borderRadius: 18,
          padding: 20,
          backgroundColor: isDark ? t.surface : t.brand,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            opacity: 0.7,
            color: isDark ? t.ink3 : "#fff",
            textTransform: "uppercase",
          }}
        >
          Your Rate
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <Text
            style={{
              fontSize: 44,
              fontWeight: "700",
              letterSpacing: -1.5,
              color: isDark ? t.ink : "#fff",
              lineHeight: 48,
            }}
          >
            {sim ? (sim.rate * 100).toFixed(3) : "—"}
            <Text style={{ fontSize: 22, opacity: 0.8 }}>%</Text>
          </Text>
          <Text style={{ fontSize: 11, opacity: 0.7, fontWeight: "600", color: isDark ? t.ink2 : "#fff" }}>
            {points > 0 ? `−${(points * 25).toFixed(0)} bps` : "no discount"}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: isDark ? t.line : "rgba(255,255,255,0.15)",
          }}
        >
          <HeroStat label="Loan amount" value={sim ? QC_FMT.short(sim.loanAmount) : "—"} />
          <HeroStat label="Monthly P&I" value={sim ? QC_FMT.usd(sim.monthlyPI, 0) : "—"} />
          {productKey === "dscr" ? (
            <HeroStat
              label="DSCR"
              value={sim?.dscr != null ? sim.dscr.toFixed(2) : "—"}
              accent={
                sim?.dscr != null
                  ? sim.dscr > 1.25
                    ? t.profit
                    : sim.dscr > 1
                      ? t.warn
                      : t.danger
                  : undefined
              }
            />
          ) : null}
        </View>
      </View>

      {/* Locked terms — read-only chips that mirror the loan record */}
      <Card pad={14}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            color: t.ink3,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Locked terms
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <LockedChip label="Product" value={PRODUCT_LABEL[productKey]} sub={PRODUCT_TERM[productKey]} />
          <LockedChip label="ARV" value={QC_FMT.usd(arvNum, 0)} />
          <LockedChip
            label="LTV"
            value={`${ltvPct}%`}
            sub={ltvLabel(ltvFraction)}
          />
          <LockedChip
            label="Base rate"
            value={baseRatePct != null ? `${baseRatePct.toFixed(3)}%` : "—"}
            sub={liveRate ? `${liveRate.label} +${liveRate.spread_bps} bps` : "Locked at intake"}
          />
        </View>
        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 10, lineHeight: 16 }}>
          These were set when this loan was started. Your loan executive can adjust them — you'll see
          updates here automatically.
        </Text>
      </Card>

      {/* Discount points — the only interactive input */}
      <Card pad={14}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <View>
            <Text style={{ fontSize: 12, fontWeight: "600", color: t.ink2 }}>Discount Points</Text>
            <Text style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>
              {points > 0 ? `−${Math.round(points * 25)} bps off base rate` : "No buy-down · base rate"}
            </Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "800", color: t.ink, letterSpacing: -0.3 }}>
            {points.toFixed(2)} pts
          </Text>
        </View>
        <Slider
          value={points}
          min={0}
          max={2}
          step={0.25}
          onChange={setPoints}
          markers={[
            { value: 0, label: "0" },
            { value: 0.5, label: "0.5" },
            { value: 1, label: "1" },
            { value: 1.5, label: "1.5" },
            { value: 2, label: "2" },
          ]}
        />
        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
          Buying points reduces your rate but adds upfront cost.
        </Text>
      </Card>

      {/* HUD-1 estimated closing */}
      {sim ? (
        <Card pad={0} style={{ overflow: "hidden" }}>
          <View
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: t.surface2,
              borderBottomWidth: 1,
              borderBottomColor: t.line,
            }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "700",
                letterSpacing: 1.2,
                color: t.ink3,
                textTransform: "uppercase",
              }}
            >
              HUD-1 estimated closing
            </Text>
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
              Estimate · subject to verification
            </Text>
          </View>
          {[
            { l: "801 · Origination Fee", sub: "0.75% of loan amount", v: sim.origination },
            { l: "802 · Discount Points", sub: `${points.toFixed(2)} pts`, v: sim.pointsCost, hl: true },
            { l: "804 · Appraisal", sub: "Standard residential", v: sim.appraisal },
            { l: "811/812 · Processing + UW", sub: "", v: sim.fixedFees },
            { l: "1108 · Title Insurance", sub: "Lender + owner", v: sim.titleIns },
            { l: "1201 · Recording Fees", sub: "", v: sim.recording },
          ].map((row, i, arr) => (
            <View
              key={row.l}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 11,
                paddingHorizontal: 16,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: t.line,
                backgroundColor: row.hl ? t.brandSoft : "transparent",
              }}
            >
              <View>
                <Text style={{ fontSize: 12.5, fontWeight: row.hl ? "700" : "500", color: t.ink }}>
                  {row.l}
                </Text>
                {row.sub ? (
                  <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>{row.sub}</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>
                {QC_FMT.usd(row.v, 0)}
              </Text>
            </View>
          ))}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: t.surface2,
              borderTopWidth: 1,
              borderTopColor: t.lineStrong,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.4,
                color: t.ink,
                textTransform: "uppercase",
              }}
            >
              Total to close
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "700", letterSpacing: -0.3, color: t.ink }}>
              {QC_FMT.usd(sim.totalToClose, 0)}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Closing-cost donut + amortization line chart. Always shown for
          started loans — the borrower wants to see the shape of their
          loan, not just the rate. */}
      {sim ? (
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

      {sim && sim.loanAmount > 0 && sim.rate > 0 ? (
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
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { isDark, t } = useTheme();
  const fg = accent ?? (isDark ? t.ink : "#fff");
  const subFg = isDark ? t.ink3 : "rgba(255,255,255,0.7)";
  return (
    <View>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: "600",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: subFg,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: fg, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function LockedChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { t } = useTheme();
  return (
    <View
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 11,
        padding: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="lock" size={10} color={t.ink4} />
        <Text
          style={{
            fontSize: 9.5,
            fontWeight: "700",
            letterSpacing: 0.8,
            color: t.ink3,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "700", color: t.ink, marginTop: 4, letterSpacing: -0.2 }}>
        {value}
      </Text>
      {sub ? <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>{sub}</Text> : null}
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
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: palette.fg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={palette.icon} size={18} color={isDark ? "#06070B" : "#fff"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "800",
              color: palette.fg,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {banner.title}
          </Text>
          <Text style={{ fontSize: 12, color: t.ink2, marginTop: 4, lineHeight: 17 }}>
            {banner.body}
          </Text>
          {banner.ctaLabel && banner.ctaTarget ? (
            <Pressable
              onPress={() => onCta(banner.ctaTarget!)}
              style={({ pressed }) => ({
                marginTop: 10,
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: 9,
                backgroundColor: palette.fg,
                alignSelf: "flex-start",
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
