// Fix & Flip Deal Analyzer — mobile, paginated wizard. Borrower credit
// + experience are DERIVED from the profile (read-only pills), never
// typed. Closing % comes from the SUPER_ADMIN tier table and monthly
// carry is system-generated — neither is a borrower input. Shares the
// pure engine in src/lib/fixFlip with web.

import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";
import {
  useMyClient,
  useCreditCurrent,
  useSaveFixFlipScenario,
  useUpdateFixFlipScenario,
  useClosingCostTiers,
} from "@/hooks/useApi";
import { analyzeFixFlip } from "@/lib/fixFlip/calc";
import { US_STATES } from "@/lib/usStates";
import type { ExperienceTier, FixFlipInputs } from "@/lib/fixFlip/types";

const DISCLAIMER =
  "Estimates only. Final terms, cash to close, and eligibility depend on lender review, credit, title, appraisal, insurance, and the final settlement statement.";
const money = (x: number) => `$${Math.round(x).toLocaleString()}`;
const pctf = (x: number) => `${(x * 100).toFixed(1)}%`;

const EXP_LABEL: Record<ExperienceTier, string> = {
  "0_flips": "First-time investor",
  "1_2_flips": "1-2 completed flips",
  "3_5_flips": "3-5 completed flips",
  "5_plus_flips": "5+ completed flips",
  pro: "Professional operator",
};

function deriveExperienceTier(raw?: string | null): ExperienceTier {
  const s = (raw ?? "").toLowerCase();
  if (/pro\b|professional|operator/.test(s)) return "pro";
  if (/first|brand new|\bnone\b|\b0\b|no experience/.test(s)) return "0_flips";
  if (/\b([5-9]|\d{2,})\b|\b5\s*\+/.test(s)) return "5_plus_flips";
  if (/\b[3-4]\b/.test(s)) return "3_5_flips";
  if (/\b[1-2]\b|\bone\b|\btwo\b/.test(s)) return "1_2_flips";
  return "1_2_flips";
}

const STEPS = ["Property", "Deal Numbers", "Timeline & Cash", "Review", "Results"] as const;
type Step = (typeof STEPS)[number];

const DEFAULTS: FixFlipInputs = {
  address: { street: "", city: "", state: "", zip: "" },
  propertyType: "single_family",
  purchasePrice: 0,
  arv: 0,
  rehabCost: 0,
  rehabContingencyPct: 0.1,
  sellingCostPct: 0.06,
  constructionMonths: 4,
  monthsToSell: 3,
  experience: "1_2_flips",
};

type T = ReturnType<typeof useTheme>["t"];

export function DealAnalyzerScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: client } = useMyClient();
  const { data: credit } = useCreditCurrent();
  const { data: closingTiers } = useClosingCostTiers();
  const save = useSaveFixFlipScenario();
  const update = useUpdateFixFlipScenario();

  const [i, setI] = useState<FixFlipInputs>(DEFAULTS);
  const [stepIdx, setStepIdx] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [stateOpen, setStateOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Which construction coverage the Results view reflects. The whole
  // output (summary, visuals, HUD, programs) follows this toggle.
  const [coverage, setCoverage] = useState<"financed" | "self">("financed");
  const step: Step = STEPS[stepIdx];

  const derivedCredit =
    (credit as { fico?: number } | null)?.fico ?? client?.fico ?? undefined;
  const derivedExperience = deriveExperienceTier(client?.experience);

  const inputs = useMemo<FixFlipInputs>(
    () => ({ ...i, creditScore: derivedCredit, experience: derivedExperience }),
    [i, derivedCredit, derivedExperience],
  );
  const resultFinanced = useMemo(
    () => analyzeFixFlip(inputs, { closingTiers }),
    [inputs, closingTiers],
  );
  const resultSelf = useMemo(
    () => analyzeFixFlip(inputs, { closingTiers, selfFundRehab: true }),
    [inputs, closingTiers],
  );
  // `result` drives everything the user sees in Results; financed is
  // the canonical one we persist.
  const result = coverage === "financed" ? resultFinanced : resultSelf;

  const set = <K extends keyof FixFlipInputs>(k: K, v: FixFlipInputs[K]) =>
    setI((p) => ({ ...p, [k]: v }));
  const setAddr = (k: "street" | "city" | "state" | "zip", v: string) =>
    setI((p) => ({ ...p, address: { ...p.address, [k]: v } }));
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const stepValid = (s: Step): boolean => {
    if (s === "Property") return !!(inputs.address.street && inputs.address.city && inputs.address.state && inputs.address.zip);
    if (s === "Deal Numbers") return inputs.purchasePrice > 0 && inputs.arv > 0 && inputs.rehabCost >= 0;
    if (s === "Timeline & Cash") return inputs.constructionMonths > 0 && inputs.monthsToSell > 0;
    return true;
  };

  const fld = (
    label: string,
    value: number | string,
    on: (s: string) => void,
    ph?: string,
    tip?: string,
  ) => (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
        {tip ? <InfoTip t={t} text={tip} /> : null}
      </View>
      <TextInput
        value={value === 0 ? "" : String(value)}
        onChangeText={on}
        placeholder={ph}
        placeholderTextColor={t.ink4}
        keyboardType="numbers-and-punctuation"
        style={{ marginTop: 4, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: t.ink, fontSize: 14, backgroundColor: t.surface2 }}
      />
    </View>
  );

  // Auto-save on "Analyze Deal". First analyze creates the run;
  // editing inputs and re-analyzing PATCHes the same row so we never
  // pile up duplicates.
  const autoSave = async () => {
    if (resultFinanced.validationErrors.length) return;
    const body = {
      status: "saved",
      payload: { inputs, result: resultFinanced } as unknown as Record<string, unknown>,
      deal_score: resultFinanced.dealScore,
      deal_grade: resultFinanced.dealGrade,
    };
    try {
      if (savedId) {
        await update.mutateAsync({ id: savedId, ...body });
      } else {
        const row = await save.mutateAsync({
          client_id: client?.id ?? undefined,
          ...body,
        });
        setSavedId(row.id);
      }
      setFlash("Saved.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't save.");
    }
    setTimeout(() => setFlash(null), 2500);
  };

  const gradeC = (g: string) =>
    g === "Excellent" || g === "Good" ? t.brand : g === "Fair" || g === "Thin" ? t.warn : t.danger;
  const selectedState = US_STATES.find((s) => s.code === inputs.address.state);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomColor: t.line, borderBottomWidth: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>Deal Analyzer</Text>
        <Text style={{ fontSize: 12, color: t.ink3 }}>{stepIdx + 1}/{STEPS.length} · {step}</Text>
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 14 }}>
          {step === "Results" ? (
            <Pressable
              onPress={() => setStepIdx(STEPS.indexOf("Deal Numbers"))}
              hitSlop={8}
              accessibilityLabel="Edit inputs"
            >
              <Icon name="sliders" size={18} color={t.ink2} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close">
            <Icon name="x" size={18} color={t.ink} />
          </Pressable>
        </View>
      </View>

      <KeyboardAware excludeTabBar>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {flash ? <Text style={{ fontSize: 12.5, color: flash.includes("Couldn") ? t.danger : t.brand, fontWeight: "600" }}>{flash}</Text> : null}

          {step === "Property" ? (
            <Card pad={14}>
              <SectionLabel>Property</SectionLabel>
              {fld("Street", inputs.address.street, (s) => setAddr("street", s))}
              {fld("City", inputs.address.city, (s) => setAddr("city", s))}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>State</Text>
                <Pressable
                  onPress={() => setStateOpen((o) => !o)}
                  style={{ marginTop: 4, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: t.surface2, flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={{ flex: 1, fontSize: 14, color: selectedState ? t.ink : t.ink4 }}>
                    {selectedState ? `${selectedState.code} — ${selectedState.name}` : "Select a state…"}
                  </Text>
                  <Icon name={stateOpen ? "chevU" : "chevD"} size={14} color={t.ink3} />
                </Pressable>
                {stateOpen ? (
                  <View style={{ marginTop: 4, borderWidth: 1, borderColor: t.line, borderRadius: 10, maxHeight: 220, overflow: "hidden" }}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {US_STATES.map((s) => (
                        <Pressable
                          key={s.code}
                          onPress={() => { setAddr("state", s.code); setStateOpen(false); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: t.line, borderBottomWidth: 1, backgroundColor: s.code === inputs.address.state ? t.brandSoft : t.surface }}
                        >
                          <Text style={{ fontSize: 13.5, color: t.ink }}>{s.code} — {s.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              {fld("ZIP", inputs.address.zip, (s) => setAddr("zip", s))}
            </Card>
          ) : null}

          {step === "Deal Numbers" ? (
            <Card pad={14}>
              <SectionLabel>Deal numbers</SectionLabel>
              {fld("Purchase price / BRV", inputs.purchasePrice, (s) => set("purchasePrice", num(s)))}
              {fld("After repair value (ARV)", inputs.arv, (s) => set("arv", num(s)))}
              {fld("Rehab budget", inputs.rehabCost, (s) => set("rehabCost", num(s)))}
              {fld(
                "Rehab Safety Buffer (%)",
                inputs.rehabContingencyPct * 100,
                (s) => set("rehabContingencyPct", num(s) / 100),
                "10",
                "Extra cushion (as a % of the rehab budget) in case the rehab runs over budget. 10% is a common starting point.",
              )}
              {fld(
                "Realtor Fees (%)",
                inputs.sellingCostPct * 100,
                (s) => set("sellingCostPct", num(s) / 100),
                "6",
                "What you'll pay agents/closing when you sell, as a % of the sale price. Usually about 5–6%.",
              )}
              <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                Closing costs and monthly carry are calculated for you from current program settings — you don't enter them.
              </Text>
            </Card>
          ) : null}

          {step === "Timeline & Cash" ? (
            <Card pad={14}>
              <SectionLabel>Timeline &amp; cash</SectionLabel>
              {fld("Construction months", inputs.constructionMonths, (s) => set("constructionMonths", num(s)))}
              {fld("Months to sell", inputs.monthsToSell, (s) => set("monthsToSell", num(s)))}
              {fld("Cash to work available", inputs.liquidity ?? 0, (s) => set("liquidity", num(s) || undefined))}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: t.ink3 }}>Total hold</Text>
                <Text style={{ fontSize: 12, color: t.ink, fontWeight: "700" }}>{result.holdMonths} mo</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: t.ink3 }}>Estimated monthly carry</Text>
                <Text style={{ fontSize: 12, color: t.ink, fontWeight: "700" }}>{money(result.estimatedMonthlyCarry)}/mo</Text>
              </View>
              <Text style={{ fontSize: 11, color: t.ink4, marginTop: 6 }}>
                Carry = loan interest + estimated property taxes + insurance. Calculated for you.
              </Text>
            </Card>
          ) : null}

          {step === "Review" ? (
            <Card pad={14}>
              <SectionLabel>Borrower profile</SectionLabel>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: t.ink3 }}>Credit score</Text>
                {derivedCredit != null
                  ? <Pill bg={t.brandSoft} color={t.brand}>{String(derivedCredit)}</Pill>
                  : <Pill bg={t.chip} color={t.ink3}>Not on file</Pill>}
                <Text style={{ fontSize: 12, color: t.ink3, marginLeft: 8 }}>Experience</Text>
                <Pill bg={t.chip} color={t.ink2}>{EXP_LABEL[derivedExperience]}</Pill>
              </View>
              <Text style={{ fontSize: 11.5, color: t.ink3, marginBottom: 12 }}>
                Credit &amp; experience come from your profile, not entered here.
              </Text>
              <SectionLabel>Recap</SectionLabel>
              <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 20 }}>
                {inputs.address.street}, {inputs.address.city} {inputs.address.state} {inputs.address.zip}{"\n"}
                Purchase {money(inputs.purchasePrice)} · ARV {money(inputs.arv)} · Rehab {money(inputs.rehabCost)}{"\n"}
                Hold {result.holdMonths} mo · Carry {money(result.estimatedMonthlyCarry)}/mo · Cash to work {money(inputs.liquidity ?? 0)}
              </Text>
            </Card>
          ) : null}

          {step === "Results" ? (
            result.validationErrors.length ? (
              <Card pad={16}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }}>Missing information</Text>
                {result.validationErrors.map((e) => (
                  <Text key={e} style={{ fontSize: 12.5, color: t.warn, marginTop: 4 }}>• {e}</Text>
                ))}
              </Card>
            ) : (
              <>
                {/* ── Impactful summary (always visible) ── */}
                <Card pad={16}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.8 }}>Deal grade</Text>
                    <Pill bg={t.chip} color={gradeC(result.dealGrade)}>{result.dealGrade} · {result.dealScore}/100</Pill>
                  </View>
                  <View style={{ marginTop: 10, borderRadius: 10, padding: 10, backgroundColor: result.withinArvEnvelope ? t.brandSoft : t.dangerBg }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: result.withinArvEnvelope ? t.brand : t.danger }}>
                      You're at {(result.arvUsedPct * 100).toFixed(1)}% of ARV
                      <Text style={{ fontWeight: "600" }}> (lenders cap at 75%)</Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: result.withinArvEnvelope ? t.brand : t.danger, marginTop: 3 }}>
                      {result.withinArvEnvelope
                        ? `Borrower protected — you could still pull up to ${money(result.arvHeadroom)} more and stay under 75%.`
                        : `Over the 75% ceiling by ${money(result.arvEnvelopeOverflow)} — that amount is your liability outside the loan.`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", marginTop: 14, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Net profit</Text>
                      <Text style={{ fontSize: 24, fontWeight: "900", color: result.projectedNetProfit > 0 ? t.brand : t.danger, marginTop: 2 }}>
                        {money(result.projectedNetProfit)}
                      </Text>
                      <Text style={{ fontSize: 11, color: t.ink3 }}>{pctf(result.profitMargin)} margin</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: t.line }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Cash to close</Text>
                      <Text style={{ fontSize: 24, fontWeight: "900", color: t.ink, marginTop: 2 }}>
                        {money(result.estimatedCashToClose)}
                      </Text>
                      <Text style={{ fontSize: 11, color: t.ink3 }}>{money(result.loanAmount)} loan</Text>
                    </View>
                  </View>
                </Card>

                {/* ── Construction: financed vs self-funded ──
                    Tapping a card switches EVERYTHING below (summary,
                    visuals, HUD, programs) to that scenario. */}
                <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Construction coverage · tap to switch the whole view
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <ScenarioCard
                    t={t}
                    title="Construction financed"
                    sub="Lender draws rehab (≤75% ARV)"
                    s={result.constructionScenarios.financed}
                    accent={t.brand}
                    active={coverage === "financed"}
                    onPress={() => setCoverage("financed")}
                  />
                  <ScenarioCard
                    t={t}
                    title="You fund construction"
                    sub="Construction stays outside the loan"
                    s={result.constructionScenarios.selfFunded}
                    accent={t.ink2}
                    active={coverage === "self"}
                    onPress={() => setCoverage("self")}
                  />
                </View>
                <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: -2 }}>
                  Showing: <Text style={{ fontWeight: "800", color: t.ink }}>
                    {coverage === "financed" ? "Construction financed" : "You fund construction"}
                  </Text>. Everything below reflects this case.
                </Text>

                {/* ── Fund-flow visuals ── */}
                <Card pad={14}>
                  <SectionLabel>Where the money comes from</SectionLabel>
                  <CapitalStackBar t={t} result={result} />
                  <View style={{ height: 16 }} />
                  <SectionLabel>From sale price to your profit</SectionLabel>
                  <ProfitWaterfall t={t} inputs={inputs} result={result} />
                </Card>

                {/* ── HUD: prominent, header always visible ── */}
                <HudBlock t={t} result={result} arv={inputs.arv} />

                {/* ── Collapsible detail ── */}
                <Collapsible t={t} title="Why this result">
                  <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19 }}>{result.explanation}</Text>
                  {result.warnings.map((w) => <Text key={w} style={{ fontSize: 12.5, color: t.warn, marginTop: 6 }}>⚠ {w}</Text>)}
                </Collapsible>

                <Collapsible t={t} title={`Loan programs (${result.eligiblePrograms.length})`}>
                  {result.eligiblePrograms.length === 0 ? (
                    <Text style={{ fontSize: 13, color: t.ink3 }}>No clear fit under current rules.</Text>
                  ) : result.eligiblePrograms.map((f) => (
                    <View key={f.program.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomColor: t.line, borderBottomWidth: 1 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: "700", color: t.ink }}>{f.program.name}</Text>
                        <Text style={{ fontSize: 11.5, color: t.ink3 }}>{(f.program.interestRate * 100).toFixed(2)}% · {f.program.points} pts · {f.program.termMonths}mo</Text>
                      </View>
                      {result.bestProgram?.id === f.program.id ? <Pill bg={t.brandSoft} color={t.brand}>Best</Pill> : null}
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink }}>Cash to close: {money(f.estimatedCashToClose)}</Text>
                        <Text style={{ fontSize: 11.5, color: t.ink3 }}>{money(f.loanAmount)} loan</Text>
                        {f.constructionOutsideLoan > 0 ? (
                          <Text style={{ fontSize: 11, color: t.ink4 }}>+ {money(f.constructionOutsideLoan)} outside loan</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                  {result.eligiblePrograms.length > 1 ? (
                    <Collapsible t={t} title="Compare all" nested>
                      <CompareTable t={t} result={result} />
                    </Collapsible>
                  ) : null}
                  {result.ineligiblePrograms.map((f) => (
                    <View key={f.program.id} style={{ paddingVertical: 6 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink2 }}>{f.program.name}</Text>
                      <Text style={{ fontSize: 11.5, color: t.danger }}>{(f.reasons ?? []).join(" · ")}</Text>
                    </View>
                  ))}
                </Collapsible>

                <Collapsible t={t} title="What if things change">
                  {result.sensitivity.map((s) => (
                    <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomColor: t.line, borderBottomWidth: 1 }}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: t.ink2 }}>{s.label}</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: s.netProfit > 0 ? t.ink : t.danger }}>{money(s.netProfit)}</Text>
                      <Pill bg={t.chip} color={gradeC(s.grade)}>{s.grade}</Pill>
                    </View>
                  ))}
                </Collapsible>

                <Collapsible t={t} title="Make this deal work">
                  {result.recommendations.map((r) => (
                    <Text key={r} style={{ fontSize: 13, color: t.ink2, marginTop: 4, lineHeight: 18 }}>• {r}</Text>
                  ))}
                </Collapsible>

                <Text style={{ fontSize: 11, color: t.ink3 }}>{DISCLAIMER}</Text>
              </>
            )
          ) : null}

          {/* Wizard nav — forward only; edits from Results are via the
              header pencil (→ Deal Numbers). */}
          {step !== "Results" ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
              <Pressable
                onPress={() => {
                  if (!stepValid(step)) return;
                  if (step === "Review") autoSave();
                  setStepIdx((x) => Math.min(STEPS.length - 1, x + 1));
                }}
                disabled={!stepValid(step)}
                style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: stepValid(step) ? t.brand : t.chip }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: stepValid(step) ? "#fff" : t.ink4 }}>
                  {step === "Review" ? "Analyze Deal" : "Next"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAware>
    </SafeAreaView>
  );
}

function InfoTip({ t, text }: { t: T; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        hitSlop={10}
        style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 10, fontWeight: "900", color: t.ink3 }}>?</Text>
      </Pressable>
      {open ? (
        <View style={{ position: "absolute", top: 22, left: -4, width: 240, zIndex: 20, backgroundColor: t.ink, borderRadius: 10, padding: 10 }}>
          <Text style={{ fontSize: 12, color: t.bg, lineHeight: 17 }}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Collapsible({
  t,
  title,
  children,
  nested,
}: {
  t: T;
  title: string;
  children: ReactNode;
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center", paddingVertical: nested ? 10 : 2 }}
      >
        <Text style={{ flex: 1, fontSize: nested ? 12.5 : 13, fontWeight: "800", color: t.ink2, textTransform: nested ? "none" : "uppercase", letterSpacing: nested ? 0 : 0.6 }}>
          {title}
        </Text>
        <Icon name={open ? "chevU" : "chevD"} size={14} color={t.ink3} />
      </Pressable>
      {open ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </>
  );
  if (nested) return <View style={{ borderTopColor: t.line, borderTopWidth: 1, marginTop: 4 }}>{body}</View>;
  return <Card pad={14}>{body}</Card>;
}

function ScenarioCard({
  t,
  title,
  sub,
  s,
  accent,
  active,
  onPress,
}: {
  t: T;
  title: string;
  sub: string;
  s: {
    loanAmount: number;
    estimatedCashToClose: number;
    constructionOutsideLoan: number;
    projectedNetProfit: number;
    holdMonths: number;
  };
  accent: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 14,
        borderTopColor: accent,
        borderTopWidth: 3,
        borderColor: active ? accent : t.line,
        borderWidth: active ? 2 : 1,
        backgroundColor: active ? t.surface : t.surface2,
        padding: 12,
        opacity: active ? 1 : 0.7,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: t.ink }}>{title}</Text>
        {active ? <Icon name="check" size={14} color={accent} /> : null}
      </View>
      <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 8 }}>{sub}</Text>
      <Row t={t} k="Cash to close" v={money(s.estimatedCashToClose)} strong />
      <Row t={t} k="Construction you fund" v={money(s.constructionOutsideLoan)} />
      <Row t={t} k="Loan amount" v={money(s.loanAmount)} />
      <Row t={t} k="Net profit" v={money(s.projectedNetProfit)} color={s.projectedNetProfit > 0 ? t.brand : t.danger} />
    </Pressable>
  );
}

function Row({ t, k, v, strong, color }: { t: T; k: string; v: string; strong?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 3, gap: 6 }}>
      <Text style={{ flex: 1, fontSize: 11.5, color: t.ink3 }}>{k}</Text>
      <Text style={{ flexShrink: 0, textAlign: "right", fontSize: 12, fontWeight: strong ? "800" : "600", color: color ?? t.ink }}>{v}</Text>
    </View>
  );
}

function Bar({ segs }: { segs: { w: number; color: string; label: string }[] }) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.w), 0) || 1;
  return (
    <View style={{ flexDirection: "row", height: 22, borderRadius: 6, overflow: "hidden", marginTop: 6 }}>
      {segs.map((s, idx) => (
        <View key={idx} style={{ flex: Math.max(0.0001, s.w) / total, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

function Legend({ t, items }: { t: T; items: { color: string; label: string; value: string }[] }) {
  return (
    <View style={{ marginTop: 8, gap: 4 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: it.color }} />
          <Text style={{ flex: 1, fontSize: 12, color: t.ink3 }}>{it.label}</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: t.ink }}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

function CapitalStackBar({ t, result }: { t: T; result: ReturnType<typeof analyzeFixFlip> }) {
  const lender = result.loanAmount;
  const cash = result.estimatedCashToClose;
  const reserve = result.rehabContingencyAmount;
  return (
    <View>
      <Bar
        segs={[
          { w: lender, color: t.brand, label: "Lender" },
          { w: cash, color: t.ink2, label: "You" },
          { w: reserve, color: t.warn, label: "Reserve" },
        ]}
      />
      <Legend
        t={t}
        items={[
          { color: t.brand, label: "Lender funds", value: money(lender) },
          { color: t.ink2, label: "Your cash to close", value: money(cash) },
          { color: t.warn, label: "Rehab safety buffer", value: money(reserve) },
        ]}
      />
    </View>
  );
}

function ProfitWaterfall({
  t,
  inputs,
  result,
}: {
  t: T;
  inputs: FixFlipInputs;
  result: ReturnType<typeof analyzeFixFlip>;
}) {
  const arv = inputs.arv;
  const costs =
    inputs.purchasePrice +
    inputs.rehabCost +
    result.rehabContingencyAmount +
    result.estimatedClosingCosts +
    result.estimatedInterestPaid +
    result.estimatedHoldingCosts +
    result.estimatedSellingCosts;
  const profit = Math.max(0, result.projectedNetProfit);
  return (
    <View>
      <Bar
        segs={[
          { w: costs, color: t.danger, label: "Costs" },
          { w: profit, color: t.brand, label: "Profit" },
        ]}
      />
      <Legend
        t={t}
        items={[
          { color: t.ink3, label: "Sale price (ARV)", value: money(arv) },
          { color: t.danger, label: "All-in costs", value: money(costs) },
          { color: t.brand, label: "Net profit", value: money(result.projectedNetProfit) },
        ]}
      />
    </View>
  );
}

type HudLine = { k: string; v: number; kind?: "cost" | "total" | "credit" | "final" };

function HudRow({ t, l, arv }: { t: T; l: HudLine; arv: number }) {
  const isTotal = l.kind === "total" || l.kind === "final";
  const credit = l.kind === "credit";
  const pct = arv > 0 ? (Math.abs(l.v) / arv) * 100 : 0;
  const amount = credit ? `(${money(Math.abs(l.v))})` : money(l.v);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: l.kind === "final" ? 8 : 4,
        borderTopColor: t.line,
        borderTopWidth: l.kind === "final" ? 1 : 0,
        marginTop: l.kind === "final" ? 4 : 0,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: isTotal ? "800" : "400",
          color: isTotal ? t.ink : t.ink3,
        }}
      >
        {l.k}
      </Text>
      <Text
        style={{
          width: 104,
          textAlign: "right",
          fontSize: 12.5,
          fontWeight: isTotal ? "900" : "700",
          color: credit ? t.brand : isTotal ? t.ink : t.ink2,
        }}
      >
        {amount}
      </Text>
      <Text
        style={{
          width: 54,
          textAlign: "right",
          fontSize: 11.5,
          color: t.ink3,
        }}
      >
        ({pct.toFixed(1)}%)
      </Text>
    </View>
  );
}

function HudBlock({
  t,
  result,
  arv,
}: {
  t: T;
  result: ReturnType<typeof analyzeFixFlip>;
  arv: number;
}) {
  const [open, setOpen] = useState(false);
  const lines: HudLine[] = [
    { k: "Purchase price", v: result.totalProjectCost - result.rehabContingencyAmount, kind: "cost" },
    { k: "Closing costs", v: result.estimatedClosingCosts, kind: "cost" },
    { k: "Lender points", v: result.lenderPointsCost, kind: "cost" },
    { k: "Rehab safety buffer", v: result.rehabContingencyAmount, kind: "cost" },
    { k: "Holding / carry", v: result.estimatedHoldingCosts, kind: "cost" },
    { k: "Interest paid", v: result.estimatedInterestPaid, kind: "cost" },
    { k: "Selling costs (realtor)", v: result.estimatedSellingCosts, kind: "cost" },
    { k: "Total fees & costs", v: result.totalFeesAndCosts, kind: "total" },
    { k: "Loan amount (credit)", v: -result.loanAmount, kind: "credit" },
    { k: "Estimated cash to close", v: result.estimatedCashToClose, kind: "final" },
  ];
  return (
    <Card pad={14} style={{ borderColor: t.brand, borderWidth: 1 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: t.brand, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Closing estimate (HUD)
          </Text>
          <Text style={{ fontSize: 18, fontWeight: "900", color: t.ink, marginTop: 2 }}>
            Cash to close {money(result.estimatedCashToClose)}
          </Text>
          <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
            Total fees & costs {money(result.totalFeesAndCosts)} — cash to close is only the
            money due at the table, not the whole project.
          </Text>
        </View>
        <Icon name={open ? "chevU" : "chevD"} size={16} color={t.brand} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 10, borderTopColor: t.line, borderTopWidth: 1, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", paddingBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 10.5, fontWeight: "700", color: t.ink4, textTransform: "uppercase", letterSpacing: 0.6 }}>Item</Text>
            <Text style={{ width: 104, textAlign: "right", fontSize: 10.5, fontWeight: "700", color: t.ink4, textTransform: "uppercase", letterSpacing: 0.6 }}>Amount</Text>
            <Text style={{ width: 54, textAlign: "right", fontSize: 10.5, fontWeight: "700", color: t.ink4, textTransform: "uppercase", letterSpacing: 0.6 }}>% ARV</Text>
          </View>
          {lines.map((l) => (
            <HudRow key={l.k} t={t} l={l} arv={arv} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function CompareTable({ t, result }: { t: T; result: ReturnType<typeof analyzeFixFlip> }) {
  const progs = result.eligiblePrograms;
  const rows: { label: string; cell: (f: (typeof progs)[number]) => string }[] = [
    { label: "Loan", cell: (f) => money(f.loanAmount) },
    { label: "Cash to close", cell: (f) => money(f.estimatedCashToClose) },
    { label: "Construction outside loan", cell: (f) => money(f.constructionOutsideLoan) },
    { label: "Rate", cell: (f) => `${(f.program.interestRate * 100).toFixed(2)}%` },
    { label: "Points", cell: (f) => `${f.program.points}` },
    { label: "Term", cell: (f) => `${f.program.termMonths}mo` },
    { label: "Net profit", cell: (f) => money(f.projectedNetProfit) },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: 4 }}>
      <View>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 110 }} />
          {progs.map((f) => (
            <View key={f.program.id} style={{ width: 120, paddingHorizontal: 6, paddingVertical: 6 }}>
              <Text numberOfLines={2} style={{ fontSize: 11.5, fontWeight: "800", color: result.bestProgram?.id === f.program.id ? t.brand : t.ink }}>
                {f.program.name}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: "row", borderTopColor: t.line, borderTopWidth: 1 }}>
            <View style={{ width: 110, paddingHorizontal: 4, paddingVertical: 7 }}>
              <Text style={{ fontSize: 11.5, color: t.ink3 }}>{r.label}</Text>
            </View>
            {progs.map((f) => (
              <View key={f.program.id} style={{ width: 120, paddingHorizontal: 6, paddingVertical: 7 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: t.ink }}>{r.cell(f)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
