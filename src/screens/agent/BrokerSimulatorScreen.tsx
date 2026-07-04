import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { Slider } from "@/design-system/Slider";
import { QC_FMT } from "@/design-system/tokens";
import { TopBar } from "@/components/TopBar";
import { ClientSearchPicker } from "@/components/agent/ClientSearchPicker";
import { AnalysisRunFabMenu, AnalysisRunsList } from "@/components/agent/AnalysisRunsList";
import { GoogleAddressInput, formatAddressParts, isAddressLookupReady } from "@/components/property/GoogleAddressInput";
import {
  useAnalysisRuns,
  useClients,
  useConvertAnalysisRunToPrequal,
  useCurrentCredit,
  useCreateAnalysisRun,
  useFredSeries,
  useFreeCalc,
  useLoans,
  usePropertyIntelligenceLookup,
  useRecalc,
  useShareAnalysisRun,
  useUpdateAnalysisRun,
} from "@/hooks/useApi";
import { LoanType, PropertyType } from "@/lib/enums.generated";
import {
  bindingConstraintLabel,
  cappedReasonLabel,
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type SimulatorInputs,
  type TransactionType,
} from "@/lib/eligibility";
import { creditDisplayFromFico, creditDisplayOverrideLabel } from "@/lib/creditDisplay";
import type { AddressParts, AnalysisProduct, Client, FredSeriesSummary, Loan, RecalcResponse } from "@/lib/types";

type Mode = "calculator" | "client";
type CalculatorMode = "free" | "file";
type ProductKey = SimulatorInputs["productKey"];

const LOAN_TYPES: { value: LoanType; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip" },
  { value: LoanType.GROUND_UP, label: "Ground Up" },
  { value: LoanType.BRIDGE, label: "Bridge" },
];

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: PropertyType.SFR, label: "SFR" },
  { value: PropertyType.UNITS_2_4, label: "2-4" },
  { value: PropertyType.UNITS_5_8, label: "5-8" },
  { value: PropertyType.MIXED_USE, label: "Mixed" },
  { value: PropertyType.COMMERCIAL, label: "Commercial" },
];

const CLIENT_PRODUCTS: { value: ProductKey; label: string }[] = [
  { value: "dscr", label: "DSCR" },
  { value: "ff", label: "Fix & Flip" },
  { value: "gu", label: "Ground Up" },
  { value: "br", label: "Bridge" },
];

const LOAN_TYPE_TO_SERIES: Record<LoanType, string> = {
  [LoanType.DSCR]: "DGS10",
  [LoanType.FIX_AND_FLIP]: "DPRIME",
  [LoanType.GROUND_UP]: "DPRIME",
  [LoanType.BRIDGE]: "SOFR",
  [LoanType.PORTFOLIO]: "DGS5",
  [LoanType.CASH_OUT_REFI]: "DGS10",
};

const PRODUCT_TO_SERIES: Record<ProductKey, string> = {
  dscr: "DGS10",
  ff: "DPRIME",
  gu: "DPRIME",
  br: "SOFR",
};

const FALLBACK_RATE_BY_TYPE: Record<LoanType, number> = {
  [LoanType.DSCR]: 0.0775,
  [LoanType.FIX_AND_FLIP]: 0.1075,
  [LoanType.GROUND_UP]: 0.1125,
  [LoanType.BRIDGE]: 0.0925,
  [LoanType.PORTFOLIO]: 0.0825,
  [LoanType.CASH_OUT_REFI]: 0.0825,
};

function isReno(type: LoanType | ProductKey): boolean {
  return type === LoanType.FIX_AND_FLIP || type === LoanType.GROUND_UP || type === "ff" || type === "gu";
}

function pickRate(type: LoanType, fred: FredSeriesSummary[] | undefined) {
  const match = fred?.find((s) => s.series_id === LOAN_TYPE_TO_SERIES[type]);
  if (match?.estimated_rate != null) return { rate: match.estimated_rate / 100, source: "live" as const, series: match };
  return { rate: FALLBACK_RATE_BY_TYPE[type], source: "fallback" as const, series: undefined };
}

function pickProductBaseRate(product: ProductKey, fred: FredSeriesSummary[] | undefined): number | undefined {
  return fred?.find((s) => s.series_id === PRODUCT_TO_SERIES[product])?.estimated_rate ?? undefined;
}

function n(text: string): number {
  return Number(text.replace(/[^0-9.]/g, "")) || 0;
}

function analysisProductForLoanType(type: LoanType): AnalysisProduct | null {
  if (type === LoanType.DSCR) return "dscr_purchase";
  if (type === LoanType.FIX_AND_FLIP) return "fix_flip";
  return null;
}

function analysisProductForSimulator(productKey: ProductKey, transactionType: TransactionType): AnalysisProduct | null {
  if (productKey === "dscr") return transactionType === "refi" ? "dscr_refi" : "dscr_purchase";
  if (productKey === "ff") return "fix_flip";
  return null;
}

function readProviderNumber(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    const numValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numValue) && numValue > 0) return numValue;
  }
  return null;
}

export function BrokerSimulatorScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string; new?: string; type?: string }>();
  const paramClientId = typeof params.clientId === "string" ? params.clientId : null;
  const wantsNew = params.new === "1";
  const startType = typeof params.type === "string" ? params.type : "";
  const { data: clients = [] } = useClients("mine");
  const { data: loans = [] } = useLoans("mine");
  const [mode, setMode] = useState<Mode>("client");
  const recentSince = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: simulatorRuns = [], isLoading: simulatorRunsLoading } = useAnalysisRuns({
    tool_source: "simulator",
    updated_since: recentSince,
    limit: 50,
  });
  const { data: recalcRuns = [], isLoading: recalcRunsLoading } = useAnalysisRuns({
    tool_source: "loan_recalc",
    updated_since: recentSince,
    limit: 50,
  });
  const recentRuns = useMemo(
    () =>
      [...simulatorRuns, ...recalcRuns]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 50),
    [recalcRuns, simulatorRuns],
  );

  useEffect(() => {
    if (!wantsNew) return;
    setMode(startType === "calculator" || startType === "file" ? "calculator" : "client");
  }, [startType, wantsNew]);

  const openWorkflow = (type: "client" | "calculator" | "file") => {
    const qs = new URLSearchParams();
    qs.set("new", "1");
    qs.set("type", type);
    if (paramClientId) qs.set("clientId", paramClientId);
    router.push(`/agent/simulate?${qs.toString()}` as Href);
  };

  if (!wantsNew) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
        <TopBar title="Simulate" />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 12, color: t.ink3 }}>Previous runs - last 30 days</Text>
        </View>
        <AnalysisRunsList
          runs={recentRuns}
          clients={clients}
          loading={simulatorRunsLoading || recalcRunsLoading}
          emptyText="No saved simulations or file recalculations in the last 30 days."
        />
        <AnalysisRunFabMenu
          actions={[
            {
              label: "Client estimate",
              description: "Link a borrower and estimate terms.",
              icon: "user",
              onPress: () => openWorkflow("client"),
            },
            {
              label: "Broker calculator",
              description: "Run pricing math from scratch.",
              icon: "calc",
              onPress: () => openWorkflow("calculator"),
            },
            {
              label: "From funding file",
              description: "Recalculate an owned funding file.",
              icon: "layers",
              onPress: () => openWorkflow("file"),
            },
          ]}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Simulate" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented
          options={[
            { value: "calculator" as const, label: "Broker calculator" },
            { value: "client" as const, label: "Client estimate" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>
      {mode === "calculator" ? (
        <BrokerCalculator clients={clients} loans={loans} initialMode={startType === "file" ? "file" : "free"} />
      ) : (
        <ClientEstimate clients={clients} loans={loans} initialClientId={paramClientId} />
      )}
    </SafeAreaView>
  );
}

function BrokerCalculator({ clients, loans, initialMode }: { clients: Client[]; loans: Loan[]; initialMode: CalculatorMode }) {
  const { t } = useTheme();
  const [calcMode, setCalcMode] = useState<CalculatorMode>(initialMode);
  useEffect(() => {
    setCalcMode(initialMode);
  }, [initialMode]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 88 }} showsVerticalScrollIndicator={false}>
      <Segmented
        options={[
          { value: "free" as const, label: "Free calculation" },
          { value: "file" as const, label: "From funding file" },
        ]}
        value={calcMode}
        onChange={setCalcMode}
      />
      {calcMode === "free" ? <FreeCalculation clients={clients} loans={loans} /> : <FromFundingFile loans={loans} />}
      <Text style={{ fontSize: 11, color: t.ink4, lineHeight: 16 }}>
        Preliminary estimate. Not a rate lock or commitment to lend.
      </Text>
    </ScrollView>
  );
}

function FreeCalculation({ clients, loans }: { clients: Client[]; loans: Loan[] }) {
  const { t } = useTheme();
  const calc = useFreeCalc();
  const { data: fred } = useFredSeries();
  const [type, setType] = useState<LoanType>(LoanType.DSCR);
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.SFR);
  const [clientId, setClientId] = useState<string | null>(null);
  const [propertyAddressParts, setPropertyAddressParts] = useState<AddressParts | null>(null);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [marketValue, setMarketValue] = useState("650000");
  const [brv, setBrv] = useState("450000");
  const [arv, setArv] = useState("750000");
  const [amount, setAmount] = useState("500000");
  const [points, setPoints] = useState(0);
  const [annualTaxes, setAnnualTaxes] = useState("6000");
  const [annualInsurance, setAnnualInsurance] = useState("1800");
  const [monthlyHoa, setMonthlyHoa] = useState("0");
  const [monthlyRent, setMonthlyRent] = useState("4500");
  const [overrideFicoText, setOverrideFicoText] = useState("");
  const [propertySnapshotId, setPropertySnapshotId] = useState<string | null>(null);
  const [propertyFlash, setPropertyFlash] = useState<string | null>(null);
  const lastPropertyLookupKey = useRef<string | null>(null);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const { data: credit } = useCurrentCredit(clientId);
  const propertyLookup = usePropertyIntelligenceLookup();

  const reno = isReno(type);
  const amountNum = n(amount);
  const marketNum = n(marketValue);
  const brvNum = n(brv);
  const arvNum = n(arv);
  const { rate: baseRate, source, series } = pickRate(type, fred);
  const finalRate = Math.max(0.04, baseRate - (points * 25) / 10_000);
  const clientLoans = useMemo(() => loans.filter((l) => l.client_id === clientId), [loans, clientId]);
  const propertyCount = clientLoans.length;
  const hasYearOfOwnership = clientLoans.some((l) => {
    if (l.stage !== "funded" || !l.close_date) return false;
    return Date.now() - new Date(l.close_date).getTime() >= 365 * 24 * 60 * 60 * 1000;
  });
  const derivedFico = credit?.fico ?? selectedClient?.fico ?? null;
  const overrideFico = (() => {
    const x = Number(overrideFicoText.replace(/[^0-9]/g, ""));
    return Number.isFinite(x) && x >= 300 && x <= 850 ? x : null;
  })();
  const effectiveFico = derivedFico ?? overrideFico;
  const analysisProduct = analysisProductForLoanType(type);
  const propertyLookupKey = useMemo(() => {
    if (!isAddressLookupReady(propertyAddressParts)) return "";
    return [
      clientId ?? "",
      propertyType,
      formatAddressParts(propertyAddressParts),
      propertyAddressParts.latitude ?? "",
      propertyAddressParts.longitude ?? "",
    ].join("|");
  }, [clientId, propertyAddressParts, propertyType]);

  useEffect(() => {
    setOverrideFicoText("");
    setPropertySnapshotId(null);
  }, [clientId]);

  const submit = () => {
    calc.mutate({
      type,
      property_type: propertyType,
      loan_amount: amountNum,
      base_rate: baseRate,
      discount_points: points,
      annual_taxes: n(annualTaxes),
      annual_insurance: n(annualInsurance),
      monthly_hoa: n(monthlyHoa),
      monthly_rent: type === LoanType.DSCR ? n(monthlyRent) : null,
    });
  };

  const lookupProperty = useCallback(async (parts: AddressParts) => {
    setPropertyFlash(null);
    if (!isAddressLookupReady(parts)) return;
    try {
      const snapshot = await propertyLookup.mutateAsync({
        address: parts,
        client_id: clientId,
        property_type: propertyType,
      });
      setPropertySnapshotId(snapshot.id);
      const value = readProviderNumber(snapshot.rentcast_value, ["value", "price", "estimate", "estimatedValue"]);
      const rent = readProviderNumber(snapshot.rentcast_rent, ["rent", "rentEstimate", "estimatedRent"]);
      if (value && type === LoanType.DSCR) setMarketValue(String(Math.round(value)));
      if (value && reno) setArv(String(Math.round(value)));
      if (rent && type === LoanType.DSCR) setMonthlyRent(String(Math.round(rent)));
      setPropertyFlash(rent ? `Property data attached. Rent estimate ${QC_FMT.usd(rent, 0)}.` : "Property data attached.");
    } catch (e) {
      setPropertyFlash(e instanceof Error ? e.message : "Property lookup failed.");
    }
  }, [clientId, propertyLookup, propertyType, reno, type]);

  useEffect(() => {
    if (!propertyLookupKey || !isAddressLookupReady(propertyAddressParts)) return;
    if (lastPropertyLookupKey.current === propertyLookupKey) return;
    const id = setTimeout(() => {
      lastPropertyLookupKey.current = propertyLookupKey;
      void lookupProperty(propertyAddressParts);
    }, 600);
    return () => clearTimeout(id);
  }, [lookupProperty, propertyAddressParts, propertyLookupKey]);

  return (
    <>
      <Card pad={14}>
        <SectionLabel>Client link</SectionLabel>
        <ClientSearchPicker
          clients={clients}
          value={clientId}
          onChange={setClientId}
          allowUnlinked
          placeholder="Search client for share or prequal"
        />
        {selectedClient ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {derivedFico != null ? (
              <Pill bg={t.brandSoft} color={t.brand}>{creditDisplayFromFico(derivedFico).shortLabel}</Pill>
            ) : overrideFico != null ? (
              <Pill bg={t.warnBg} color={t.warn}>{creditDisplayOverrideLabel(true)}</Pill>
            ) : (
              <Pill bg={t.chip} color={t.ink3}>Credit needed for prequal</Pill>
            )}
            <Pill bg={t.chip} color={t.ink2}>{propertyCount} file{propertyCount === 1 ? "" : "s"}</Pill>
          </View>
        ) : null}
        {selectedClient && derivedFico == null ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Prequal credit override
            </Text>
            <TextInput
              value={overrideFicoText}
              onChangeText={(text) => setOverrideFicoText(text.replace(/[^0-9]/g, ""))}
              placeholder="720"
              placeholderTextColor={t.ink4}
              keyboardType="number-pad"
              style={{ borderWidth: 1, borderColor: t.lineStrong, borderRadius: 11, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 10, color: t.ink }}
            />
          </View>
        ) : null}
      </Card>

      <Card pad={14}>
        <SectionLabel>Loan parameters</SectionLabel>
        <ChipPicker options={LOAN_TYPES} value={type} onChange={setType} />
        <View style={{ height: 12 }} />
        <ChipPicker options={PROPERTY_TYPES} value={propertyType} onChange={setPropertyType} />
      </Card>

      <Card pad={14}>
        <SectionLabel>{reno ? "Property values" : "Property"}</SectionLabel>
        <GoogleAddressInput
          value={propertyAddressParts}
          onChange={(next) => {
            setPropertyAddressParts(next);
            setPropertyAddress(formatAddressParts(next));
            setPropertySnapshotId(null);
            setPropertyFlash(null);
          }}
          helperText="RentCast, Google, and FEMA checks run automatically after a complete address is selected or entered."
        />
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          {propertyLookup.isPending ? (
            <Pill bg={t.brandSoft} color={t.brand}>Checking RentCast / FEMA</Pill>
          ) : propertySnapshotId ? (
            <Pill bg={t.profitBg} color={t.profit}>Property data attached</Pill>
          ) : isAddressLookupReady(propertyAddressParts) ? (
            <Pill bg={t.chip} color={t.ink3}>Property data queued</Pill>
          ) : (
            <Pill bg={t.chip} color={t.ink3}>Waiting for complete address</Pill>
          )}
        </View>
        {propertyFlash ? (
          <Text style={{ fontSize: 12, fontWeight: "700", color: /attached/i.test(propertyFlash) ? t.brand : t.danger, marginBottom: 8 }}>
            {propertyFlash}
          </Text>
        ) : null}
        {reno ? (
          <>
            <MoneyInput label="Before Repair Value" value={brv} onChange={setBrv} />
            <MoneyInput label="After Repair Value" value={arv} onChange={setArv} />
          </>
        ) : (
          <MoneyInput label="Market Value" value={marketValue} onChange={setMarketValue} />
        )}
        <MoneyInput
          label="Loan amount"
          value={amount}
          onChange={setAmount}
          hint={
            reno && arvNum > 0
              ? `${((amountNum / arvNum) * 100).toFixed(1)}% loan-to-ARV`
              : marketNum > 0
                ? `${((amountNum / marketNum) * 100).toFixed(1)}% LTV`
                : undefined
          }
        />
      </Card>

      <Card pad={14}>
        <SectionLabel>Rate and carry</SectionLabel>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <Pill bg={t.brandSoft} color={t.brand}>
            Base {(baseRate * 100).toFixed(3)}% {source === "live" ? "live" : "fallback"}
          </Pill>
          {series ? <Pill bg={t.chip} color={t.ink2}>{series.label}</Pill> : null}
          <Pill bg={t.chip} color={t.ink2}>Final {(finalRate * 100).toFixed(3)}%</Pill>
        </View>
        <SliderHeader label="Discount points" value={`${points.toFixed(2)} pts`} />
        <Slider value={points} min={0} max={3} step={0.5} onChange={setPoints} />
        <MoneyInput label="Annual taxes" value={annualTaxes} onChange={setAnnualTaxes} />
        <MoneyInput label="Annual insurance" value={annualInsurance} onChange={setAnnualInsurance} />
        <MoneyInput label="Monthly HOA" value={monthlyHoa} onChange={setMonthlyHoa} />
        {type === LoanType.DSCR ? (
          <MoneyInput label="Monthly rent" value={monthlyRent} onChange={setMonthlyRent} />
        ) : null}
      </Card>

      <Pressable
        onPress={submit}
        disabled={calc.isPending || amountNum <= 0}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: calc.isPending || amountNum <= 0 ? t.chip : t.brand,
          alignSelf: "flex-end",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="refresh" size={14} color={calc.isPending || amountNum <= 0 ? t.ink4 : "#fff"} />
        <Text style={{ color: calc.isPending || amountNum <= 0 ? t.ink4 : "#fff", fontSize: 13, fontWeight: "800" }}>
          {calc.isPending ? "Calculating..." : "Calculate"}
        </Text>
      </Pressable>

      {calc.error ? (
        <Pill bg={t.dangerBg} color={t.danger}>{calc.error instanceof Error ? calc.error.message : "Calculation failed"}</Pill>
      ) : null}
      {calc.data ? (
        <>
          <ResultsCard result={calc.data} />
          <AnalysisActions
            product={analysisProduct}
            title={`${type === LoanType.DSCR ? "DSCR" : "Fix & Flip"} simulator - ${propertyAddress.trim() || "property TBD"}`}
            clientId={clientId}
            propertySnapshotId={propertySnapshotId}
            targetPropertyAddress={propertyAddress.trim() || null}
            inputs={{
              mode: "broker_calculator",
              loan_type: type,
              property_type: propertyType,
              market_value: marketNum,
              purchase_price: reno ? brvNum : marketNum,
              brv: brvNum,
              arv: arvNum,
              requested_loan_amount: amountNum,
              loan_amount: amountNum,
              annual_taxes: n(annualTaxes),
              annual_insurance: n(annualInsurance),
              monthly_hoa: n(monthlyHoa),
              monthly_rent: type === LoanType.DSCR ? n(monthlyRent) : null,
              base_rate: baseRate,
              final_rate: finalRate,
              discount_points: points,
              fico: effectiveFico,
              sow_items: reno
                ? [{ category: "Rehab / construction", description: "Simulator rehab budget", total_usd: Math.max(0, arvNum - brvNum) }]
                : null,
            }}
            calculatorOutput={calc.data as unknown as Record<string, unknown>}
            manualFico={effectiveFico}
            propertyCount={propertyCount}
            hasYearOfOwnership={hasYearOfOwnership}
          />
        </>
      ) : null}
    </>
  );
}

function FromFundingFile({ loans }: { loans: Loan[] }) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const [loanId, setLoanId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const activeLoan = useMemo(() => loans.find((l) => l.id === loanId) ?? null, [loans, loanId]);

  useEffect(() => {
    if (activeLoan) setPoints(Number(activeLoan.discount_points ?? 0));
  }, [activeLoan]);

  const submit = () => {
    if (!activeLoan) return;
    recalc.mutate({ loanId: activeLoan.id, discount_points: points });
  };

  return (
    <>
      <Card pad={14}>
        <SectionLabel>Funding file</SectionLabel>
        {loans.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.ink3 }}>No owned funding files yet.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {loans.map((l) => {
              const active = l.id === loanId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => setLoanId(l.id)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? t.brand : t.line,
                    backgroundColor: active ? t.brandSoft : t.surface2,
                  }}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: "800", color: active ? t.brand : t.ink }} numberOfLines={1}>
                    {l.deal_id} - {l.address || "Subject property"}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                    {l.type.replace(/_/g, " ")} - {QC_FMT.usd(Number(l.amount || 0), 0)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {activeLoan ? (
        <Card pad={14}>
          <SectionLabel>Discount points</SectionLabel>
          <SliderHeader label="Recalculate at" value={`${points.toFixed(2)} pts`} />
          <Slider value={points} min={0} max={3} step={0.5} onChange={setPoints} />
        </Card>
      ) : null}

      {activeLoan ? (
        <Pressable
          onPress={submit}
          disabled={recalc.isPending}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: recalc.isPending ? t.chip : t.brand,
            alignSelf: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="refresh" size={14} color={recalc.isPending ? t.ink4 : "#fff"} />
          <Text style={{ color: recalc.isPending ? t.ink4 : "#fff", fontSize: 13, fontWeight: "800" }}>
            {recalc.isPending ? "Recalculating..." : "Recalculate"}
          </Text>
        </Pressable>
      ) : null}

      {recalc.error ? (
        <Pill bg={t.dangerBg} color={t.danger}>{recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}</Pill>
      ) : null}
      {recalc.data && activeLoan ? (
        <>
          <ResultsCard result={recalc.data} />
          <AnalysisActions
            product={analysisProductForLoanType(activeLoan.type)}
            title={`${activeLoan.type === LoanType.DSCR ? "DSCR" : "Funding file"} recalc - ${activeLoan.address || activeLoan.deal_id}`}
            clientId={activeLoan.client_id}
            loanId={activeLoan.id}
            targetPropertyAddress={activeLoan.address || null}
            inputs={{
              mode: "funding_file_recalc",
              loan_id: activeLoan.id,
              loan_type: activeLoan.type,
              property_type: activeLoan.property_type,
              purchase_price: Number(activeLoan.amount || recalc.data.loan_amount || 0),
              requested_loan_amount: Number(recalc.data.loan_amount || activeLoan.amount || 0),
              loan_amount: Number(recalc.data.loan_amount || activeLoan.amount || 0),
              arv: activeLoan.arv,
              monthly_rent: activeLoan.monthly_rent,
              annual_taxes: activeLoan.annual_taxes,
              annual_insurance: activeLoan.annual_insurance,
              monthly_hoa: activeLoan.monthly_hoa,
              discount_points: points,
            }}
            calculatorOutput={recalc.data as unknown as Record<string, unknown>}
            manualFico={null}
            propertyCount={0}
            hasYearOfOwnership={false}
          />
        </>
      ) : null}
    </>
  );
}

function ClientEstimate({
  clients,
  loans,
  initialClientId,
}: {
  clients: Client[];
  loans: Loan[];
  initialClientId: string | null;
}) {
  const { t } = useTheme();
  const { data: fred } = useFredSeries();
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [overrideFicoText, setOverrideFicoText] = useState("");
  const [propertyAddressParts, setPropertyAddressParts] = useState<AddressParts | null>(null);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertySnapshotId, setPropertySnapshotId] = useState<string | null>(null);
  const [propertyFlash, setPropertyFlash] = useState<string | null>(null);
  const lastPropertyLookupKey = useRef<string | null>(null);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const { data: credit } = useCurrentCredit(clientId);
  const propertyLookup = usePropertyIntelligenceLookup();
  const clientLoans = useMemo(() => loans.filter((l) => l.client_id === clientId), [loans, clientId]);

  useEffect(() => {
    if (initialClientId) setClientId(initialClientId);
  }, [initialClientId]);

  useEffect(() => {
    setOverrideFicoText("");
    setPropertySnapshotId(null);
  }, [clientId]);

  const derivedFico = credit?.fico ?? selectedClient?.fico ?? null;
  const overrideFico = (() => {
    const x = Number(overrideFicoText.replace(/[^0-9]/g, ""));
    return Number.isFinite(x) && x >= 300 && x <= 850 ? x : null;
  })();
  const effectiveFico = derivedFico ?? overrideFico;
  const propertyCount = clientLoans.length;
  const hasYearOfOwnership = clientLoans.some((l) => {
    if (l.stage !== "funded" || !l.close_date) return false;
    return Date.now() - new Date(l.close_date).getTime() >= 365 * 24 * 60 * 60 * 1000;
  });
  const eligibility = computeEligibility({
    fico: effectiveFico,
    propertyCount,
    hasYearOfOwnership,
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const [productKey, setProductKey] = useState<ProductKey>("dscr");
  const [transactionType, setTransactionType] = useState<TransactionType>("purchase");
  const [arvText, setArvText] = useState("500000");
  const [brvText, setBrvText] = useState("400000");
  const [rehabText, setRehabText] = useState("80000");
  const [payoffText, setPayoffText] = useState("0");
  const [monthlyRentText, setMonthlyRentText] = useState("4250");
  const [requestedLoanText, setRequestedLoanText] = useState<string | null>(null);
  const [points, setPoints] = useState(1);
  const [ltvPct, setLtvPct] = useState(65);

  const reno = isReno(productKey);
  const isRefi = productKey === "dscr" && transactionType === "refi";
  const arvNum = n(arvText);
  const brvNum = n(brvText);
  const rehabNum = n(rehabText);
  const payoffNum = n(payoffText);
  const monthlyRentNum = n(monthlyRentText);
  const requestedLoanNum = requestedLoanText != null ? n(requestedLoanText) : null;
  const baseRatePct = pickProductBaseRate(productKey, fred);
  const isBlocked = eligibility.tier === "blocked";
  const analysisProduct = analysisProductForSimulator(productKey, transactionType);
  const propertyLookupKey = useMemo(() => {
    if (!isAddressLookupReady(propertyAddressParts)) return "";
    return [
      clientId ?? "",
      productKey,
      transactionType,
      formatAddressParts(propertyAddressParts),
      propertyAddressParts.latitude ?? "",
      propertyAddressParts.longitude ?? "",
    ].join("|");
  }, [clientId, productKey, propertyAddressParts, transactionType]);

  useEffect(() => {
    if (eligibility.maxLTV > 0 && ltvPct > eligibility.maxLTV * 100) {
      setLtvPct(Math.round(eligibility.maxLTV * 100));
    }
  }, [eligibility.maxLTV, ltvPct]);

  const result = useMemo(() => {
    if (!clientId || isBlocked || arvNum <= 0) return null;
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
    clientId,
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

  const lookupProperty = useCallback(async (parts: AddressParts) => {
    setPropertyFlash(null);
    if (!isAddressLookupReady(parts)) return;
    try {
      const snapshot = await propertyLookup.mutateAsync({
        address: parts,
        client_id: clientId,
        property_type: productKey === "dscr" ? "dscr" : productKey,
      });
      setPropertySnapshotId(snapshot.id);
      const value = readProviderNumber(snapshot.rentcast_value, ["value", "price", "estimate", "estimatedValue"]);
      const rent = readProviderNumber(snapshot.rentcast_rent, ["rent", "rentEstimate", "estimatedRent"]);
      if (value) setArvText(String(Math.round(value)));
      if (rent && productKey === "dscr") setMonthlyRentText(String(Math.round(rent)));
      setPropertyFlash(rent ? `Property data attached. Rent estimate ${QC_FMT.usd(rent, 0)}.` : "Property data attached.");
    } catch (e) {
      setPropertyFlash(e instanceof Error ? e.message : "Property lookup failed.");
    }
  }, [clientId, productKey, propertyLookup]);

  useEffect(() => {
    if (!propertyLookupKey || !isAddressLookupReady(propertyAddressParts)) return;
    if (lastPropertyLookupKey.current === propertyLookupKey) return;
    const id = setTimeout(() => {
      lastPropertyLookupKey.current = propertyLookupKey;
      void lookupProperty(propertyAddressParts);
    }, 600);
    return () => clearTimeout(id);
  }, [lookupProperty, propertyAddressParts, propertyLookupKey]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 88 }} showsVerticalScrollIndicator={false}>
      <Card pad={14}>
        <SectionLabel>Client</SectionLabel>
        <ClientSearchPicker clients={clients} value={clientId} onChange={setClientId} />
        {selectedClient ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {derivedFico != null ? (
              <Pill bg={t.brandSoft} color={t.brand}>{creditDisplayFromFico(derivedFico).shortLabel}</Pill>
            ) : overrideFico != null ? (
              <Pill bg={t.warnBg} color={t.warn}>{creditDisplayOverrideLabel(true)}</Pill>
            ) : (
              <Pill bg={t.chip} color={t.ink3}>Credit needed</Pill>
            )}
            <Pill bg={t.chip} color={t.ink2}>{propertyCount} file{propertyCount === 1 ? "" : "s"}</Pill>
          </View>
        ) : null}
        {selectedClient && derivedFico == null ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Estimate credit override
            </Text>
            <TextInput
              value={overrideFicoText}
              onChangeText={setOverrideFicoText}
              placeholder="720"
              placeholderTextColor={t.ink4}
              keyboardType="number-pad"
              style={{ marginTop: 4, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: t.ink, fontSize: 14, backgroundColor: t.surface2 }}
            />
          </View>
        ) : null}
      </Card>

      <Card pad={14}>
        <SectionLabel>Product</SectionLabel>
        <ChipPicker options={CLIENT_PRODUCTS} value={productKey} onChange={setProductKey} />
        {productKey === "dscr" ? (
          <View style={{ marginTop: 12 }}>
            <Segmented
              options={[
                { value: "purchase" as const, label: "Purchase" },
                { value: "refi" as const, label: "Refinance" },
              ]}
              value={transactionType}
              onChange={setTransactionType}
            />
          </View>
        ) : null}
      </Card>

      <Card pad={14}>
        <SectionLabel>{reno ? "Property values" : "Property and loan sizing"}</SectionLabel>
        <GoogleAddressInput
          value={propertyAddressParts}
          onChange={(next) => {
            setPropertyAddressParts(next);
            setPropertyAddress(formatAddressParts(next));
            setPropertySnapshotId(null);
            setPropertyFlash(null);
          }}
          helperText="RentCast, Google, and FEMA checks run automatically after a complete address is selected or entered."
        />
        <View style={{ marginTop: 8, marginBottom: 8 }}>
          {propertyLookup.isPending ? (
            <Pill bg={t.brandSoft} color={t.brand}>Checking RentCast / FEMA</Pill>
          ) : propertySnapshotId ? (
            <Pill bg={t.profitBg} color={t.profit}>Property data attached</Pill>
          ) : isAddressLookupReady(propertyAddressParts) ? (
            <Pill bg={t.chip} color={t.ink3}>Property data queued</Pill>
          ) : (
            <Pill bg={t.chip} color={t.ink3}>Waiting for complete address</Pill>
          )}
        </View>
        {propertyFlash ? (
          <Text style={{ fontSize: 12, fontWeight: "700", color: /attached/i.test(propertyFlash) ? t.brand : t.danger, marginBottom: 8 }}>
            {propertyFlash}
          </Text>
        ) : null}
        {reno ? (
          <>
            <MoneyInput label="Purchase price (BRV)" value={brvText} onChange={setBrvText} />
            <MoneyInput label="Rehab budget" value={rehabText} onChange={setRehabText} />
            <MoneyInput label="ARV" value={arvText} onChange={setArvText} />
          </>
        ) : (
          <>
            <MoneyInput label={isRefi ? "Property value" : "Market value"} value={arvText} onChange={setArvText} />
            {isRefi ? <MoneyInput label="Existing payoff" value={payoffText} onChange={setPayoffText} /> : null}
            {productKey === "dscr" ? <MoneyInput label="Monthly rent" value={monthlyRentText} onChange={setMonthlyRentText} /> : null}
          </>
        )}
        <MoneyInput
          label={result ? `Loan amount - max ${QC_FMT.usd(result.maxLoan, 0)}` : "Loan amount"}
          value={requestedLoanText ?? (result ? Math.round(result.loanAmount).toString() : "")}
          onChange={setRequestedLoanText}
          hint={result?.clamped ? cappedReasonLabel(result.bindingConstraint, result.maxLoan) : "Optional override; clamps to cap."}
        />
      </Card>

      <Card pad={14}>
        <SectionLabel>Leverage and points</SectionLabel>
        <SliderHeader label={reno ? "Loan sizing" : "Loan-to-value"} value={result ? `${(result.effectiveLtv * 100).toFixed(0)}%` : `${ltvPct}%`} hint={result ? bindingConstraintLabel(result.bindingConstraint) : ltvLabel(ltvPct / 100)} />
        {!reno ? (
          <Slider
            value={ltvPct}
            min={60}
            max={isRefi ? 75 : 80}
            step={1}
            onChange={(v) => {
              setLtvPct(v);
              setRequestedLoanText(null);
            }}
            gatedMax={isBlocked ? 60 : Math.min(eligibility.maxLTV * 100, isRefi ? 75 : 80)}
          />
        ) : null}
        <SliderHeader label="Discount points" value={`${points.toFixed(2)} pts`} />
        <Slider value={points} min={0} max={2} step={0.25} onChange={setPoints} />
      </Card>

      {!selectedClient ? (
        <Card pad={14}><Text style={{ fontSize: 13, color: t.ink3 }}>Select a client to run a client-linked estimate.</Text></Card>
      ) : isBlocked ? (
        <Card pad={14}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }}>{eligibility.banner?.title ?? "Estimate blocked"}</Text>
          <Text style={{ fontSize: 12.5, color: t.ink3, lineHeight: 18, marginTop: 4 }}>
            {eligibility.banner?.body ?? "Add borrower credit verification or a valid override to estimate terms."}
          </Text>
        </Card>
      ) : result ? (
        <>
          <EstimateResults result={result} />
          <AnalysisActions
            product={analysisProduct}
            title={`${productKey === "dscr" ? "DSCR" : "Fix & Flip"} estimate - ${propertyAddress.trim() || selectedClient.name}`}
            clientId={clientId}
            propertySnapshotId={propertySnapshotId}
            targetPropertyAddress={propertyAddress.trim() || null}
            inputs={{
              mode: "client_estimate",
              product_key: productKey,
              transaction_type: productKey === "dscr" ? transactionType : null,
              purchase_price: reno ? brvNum : arvNum,
              property_value: arvNum,
              brv: brvNum,
              arv: arvNum,
              rehab_cost: rehabNum,
              payoff: isRefi ? payoffNum : null,
              monthly_rent: productKey === "dscr" ? monthlyRentNum : null,
              requested_loan_amount: result.loanAmount,
              loan_amount: result.loanAmount,
              discount_points: points,
              ltv: result.effectiveLtv,
              fico: effectiveFico,
              property_count: propertyCount,
              has_year_of_ownership: hasYearOfOwnership,
              sow_items: reno
                ? [{ category: "Rehab / construction", description: "Simulator rehab budget", total_usd: rehabNum }]
                : null,
            }}
            calculatorOutput={result as unknown as Record<string, unknown>}
            manualFico={effectiveFico}
            propertyCount={propertyCount}
            hasYearOfOwnership={hasYearOfOwnership}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function AnalysisActions({
  product,
  title,
  clientId,
  loanId,
  propertySnapshotId,
  targetPropertyAddress,
  inputs,
  calculatorOutput,
  manualFico,
  propertyCount,
  hasYearOfOwnership,
}: {
  product: AnalysisProduct | null;
  title: string;
  clientId: string | null;
  loanId?: string | null;
  propertySnapshotId?: string | null;
  targetPropertyAddress?: string | null;
  inputs: Record<string, unknown>;
  calculatorOutput: Record<string, unknown>;
  manualFico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
}) {
  const { t } = useTheme();
  const createAnalysis = useCreateAnalysisRun();
  const updateAnalysis = useUpdateAnalysisRun();
  const shareAnalysis = useShareAnalysisRun();
  const convertAnalysis = useConvertAnalysisRunToPrequal();
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const busy =
    createAnalysis.isPending ||
    updateAnalysis.isPending ||
    shareAnalysis.isPending ||
    convertAnalysis.isPending;

  useEffect(() => {
    setAnalysisRunId(null);
    setFlash(null);
  }, [clientId, loanId, product, propertySnapshotId]);

  const ensureRun = async () => {
    if (!product) throw new Error("Save/share is enabled for DSCR and Fix & Flip only.");
    if (!clientId) throw new Error("Link an owned client before saving, sharing, or creating a prequalification.");
    const payload = {
      product,
      tool_source: loanId ? ("loan_recalc" as const) : ("simulator" as const),
      title,
      client_id: clientId,
      loan_id: loanId ?? null,
      property_snapshot_id: propertySnapshotId ?? null,
      target_property_address: targetPropertyAddress ?? null,
      inputs,
      calculator_output: calculatorOutput,
    };
    const row = analysisRunId
      ? await updateAnalysis.mutateAsync({ id: analysisRunId, patch: payload })
      : await createAnalysis.mutateAsync(payload);
    setAnalysisRunId(row.id);
    return row;
  };

  const save = async () => {
    setFlash(null);
    try {
      await ensureRun();
      setFlash("Saved as an analysis report.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not save analysis.");
    }
  };

  const share = async () => {
    setFlash(null);
    try {
      const row = await ensureRun();
      const shared = await shareAnalysis.mutateAsync(row.id);
      setAnalysisRunId(shared.analysis_run.id);
      setFlash("Shared to the client portal.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not share analysis.");
    }
  };

  const prequal = async () => {
    setFlash(null);
    try {
      const row = await ensureRun();
      const converted = await convertAnalysis.mutateAsync({
        runId: row.id,
        payload: {
          notes: "Created from mobile broker simulator.",
          manual_credit_override:
            manualFico != null
              ? {
                  fico: manualFico,
                  property_count: propertyCount,
                  has_year_of_ownership: hasYearOfOwnership,
                }
              : null,
        },
      });
      setAnalysisRunId(converted.analysis_run.id);
      setFlash("Pending prequalification created for funding review.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not create prequalification.");
    }
  };

  return (
    <Card pad={14}>
      <SectionLabel>Report workflow</SectionLabel>
      <Text style={{ fontSize: 12.5, color: t.ink3, lineHeight: 18 }}>
        Save this estimate, share a sanitized client report, or create a pending funding-review request.
      </Text>
      {!product ? (
        <Pill bg={t.warnBg} color={t.warn}>DSCR and Fix & Flip only</Pill>
      ) : !clientId ? (
        <Pill bg={t.chip} color={t.ink3}>Link a client to share or prequalify</Pill>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <ActionButton label={busy ? "Saving..." : "Save"} onPress={save} disabled={busy || !product || !clientId} variant="secondary" />
        <ActionButton label={shareAnalysis.isPending ? "Sharing..." : "Share to client"} onPress={share} disabled={busy || !product || !clientId} variant="secondary" />
        <ActionButton label={convertAnalysis.isPending ? "Creating..." : "Create pending prequal"} onPress={prequal} disabled={busy || !product || !clientId} />
      </View>
      {flash ? (
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: /saved|shared|created/i.test(flash) ? t.brand : t.danger, marginTop: 10 }}>
          {flash}
        </Text>
      ) : null}
    </Card>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const { t } = useTheme();
  const secondary = variant === "secondary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 13,
        borderRadius: 11,
        borderWidth: secondary ? 1 : 0,
        borderColor: t.line,
        backgroundColor: disabled ? t.chip : secondary ? t.surface2 : t.brand,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "800", color: disabled ? t.ink4 : secondary ? t.ink : "#fff" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ResultsCard({ result }: { result: RecalcResponse }) {
  const { t } = useTheme();
  return (
    <Card pad={14}>
      <SectionLabel>Results</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Final rate" value={`${(result.final_rate * 100).toFixed(3)}%`} />
        <Stat label="Monthly P&I" value={QC_FMT.usd(result.monthly_pi, 0)} />
        <Stat label="DSCR" value={result.dscr != null ? result.dscr.toFixed(2) : "-"} />
        <Stat label="Cash to close" value={QC_FMT.usd(result.cash_to_close_pricing, 0)} />
        <Stat label="HUD total" value={QC_FMT.usd(result.hud_total, 0)} />
      </View>
      {result.warnings?.length ? (
        <View style={{ gap: 6, marginTop: 12 }}>
          {result.warnings.map((w, idx) => (
            <Pill key={`${w.code}-${idx}`} bg={w.severity === "block" ? t.dangerBg : t.warnBg} color={w.severity === "block" ? t.danger : t.warn}>
              {w.message}
            </Pill>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function EstimateResults({ result }: { result: NonNullable<ReturnType<typeof computeSimulator>> }) {
  return (
    <Card pad={14}>
      <SectionLabel>Estimate</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Rate" value={`${(result.rate * 100).toFixed(3)}%`} />
        <Stat label="Loan amount" value={QC_FMT.usd(result.loanAmount, 0)} />
        <Stat label="Monthly P&I" value={QC_FMT.usd(result.monthlyPI, 0)} />
        <Stat label="DSCR" value={result.dscr != null ? result.dscr.toFixed(2) : "-"} />
        <Stat label="Cash to close" value={result.cashToClose != null ? QC_FMT.usd(result.cashToClose, 0) : "-"} />
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={{ width: "47%", minWidth: 140, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2 }}>
      <Text style={{ fontSize: 10.5, fontWeight: "800", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: "900", color: t.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function ChipPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? t.brand : t.line,
              backgroundColor: active ? t.brandSoft : t.surface2,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: active ? t.brand : t.ink2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: t.line }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: 9,
              backgroundColor: active ? t.surface : "transparent",
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: active ? t.ink : t.ink3 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const { t } = useTheme();
  const num = n(value);
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.lineStrong, borderRadius: 11, backgroundColor: t.surface2, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "900", color: t.ink3, marginRight: 4 }}>$</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          placeholderTextColor={t.ink4}
          keyboardType="numbers-and-punctuation"
          style={{ flex: 1, paddingVertical: 10, color: t.ink, fontSize: 16, fontWeight: "800" }}
        />
        {num >= 1000 ? <Text style={{ fontSize: 11, color: t.ink3 }}>{QC_FMT.short(num)}</Text> : null}
      </View>
      {hint ? <Text style={{ fontSize: 11, color: t.ink3, marginTop: 5 }}>{hint}</Text> : null}
    </View>
  );
}

function SliderHeader({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11, color: t.ink4, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Text style={{ fontSize: 16, fontWeight: "900", color: t.ink, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}
