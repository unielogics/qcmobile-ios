// Borrower-facing pre-qualification request sheet (mobile mirror of
// QCDashboard's PreQualRequestModal).
//
// Submitting does NOT spawn a Loan — the request lives standalone until
// the borrower confirms the seller accepted their offer. The LLC field
// has a "TBD — letter to my individual name" toggle for borrowers who
// haven't formed the entity yet.

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { Pill, QButton } from "@/design-system/primitives";
import { QC_FMT } from "@/design-system/tokens";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { useCreditSummary, useMyCredit, useSubmitPrequalRequest } from "@/hooks/useApi";
import {
  PREQUAL_LOAN_TYPE_LABELS,
  PREQUAL_LTV_CAPS,
  type AddressParts,
  type PrequalLoanType,
  type PrequalSowLineItem,
} from "@/lib/types";

const LTV_CAPS = PREQUAL_LTV_CAPS;
const PRODUCT_OPTIONS: PrequalLoanType[] = ["dscr_purchase", "dscr_refi", "fix_flip", "bridge"];

// F&F project-viability cap — keep in sync with desktop.
const FF_LTARV_CAP = 0.75;

function addressStringToParts(address: string): AddressParts {
  return {
    street: null,
    city: null,
    state: null,
    zip: null,
    full: address.trim() || null,
    latitude: null,
    longitude: null,
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  // Optional pre-fills — when opened from a loan-detail context.
  initialAddress?: string;
  initialLoanType?: PrequalLoanType;
}

export function PreQualRequestSheet({
  visible,
  onClose,
  initialAddress,
  initialLoanType,
}: Props) {
  const { t } = useTheme();
  const submit = useSubmitPrequalRequest();
  // Tier-adjusted LTV: pull current credit + summary so we can show the
  // borrower their effective ceiling (program × tier, whichever is
  // tighter). Falls back to program cap when no credit on file.
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);

  const [loanType, setLoanType] = useState<PrequalLoanType>(initialLoanType ?? "dscr_purchase");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [addressParts, setAddressParts] = useState<AddressParts>(() => addressStringToParts(initialAddress ?? ""));
  const [purchaseText, setPurchaseText] = useState("");
  const [loanText, setLoanText] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [entityTBD, setEntityTBD] = useState(true);
  const [entityName, setEntityName] = useState("");
  // F&F-only — ARV (After Repair Value) + scope-of-work line items.
  // Step gating: when loan_type=fix_flip the form switches into a
  // 2-step flow; non-F&F products stay single-step.
  const [arvText, setArvText] = useState("");
  const [sowItems, setSowItems] = useState<PrequalSowLineItem[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoanType(initialLoanType ?? "dscr_purchase");
      setAddress(initialAddress ?? "");
      setAddressParts(addressStringToParts(initialAddress ?? ""));
      setPurchaseText("");
      setLoanText("");
      setClosingDate("");
      setNotes("");
      setEntityTBD(true);
      setEntityName("");
      setArvText("");
      setSowItems([]);
      setStep(1);
      setError(null);
      setDoneFlash(false);
    }
  }, [visible, initialAddress, initialLoanType]);

  const purchaseNum = Number(purchaseText.replace(/[^0-9.]/g, "")) || 0;
  const loanNum = Number(loanText.replace(/[^0-9.]/g, "")) || 0;
  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const isFixFlip = loanType === "fix_flip";
  // F&F sizes the loan against the AFTER-repair value (ARV), not the
  // purchase price — that's the value the lender will appraise to. For
  // every other product (DSCR purchase/refi, Bridge), LTV stays based
  // on the property's purchase / current value.
  const ltvBasis = isFixFlip ? arvNum : purchaseNum;
  const ltv = ltvBasis > 0 ? loanNum / ltvBasis : 0;
  const programCap = LTV_CAPS[loanType];
  const tierMaxLtv = creditSummary?.tier_max_ltv ?? null;
  const tierConstrained = tierMaxLtv != null && tierMaxLtv > 0 && tierMaxLtv < programCap;
  const effectiveCap = tierConstrained ? (tierMaxLtv as number) : programCap;
  const maxLoan = ltvBasis > 0 ? ltvBasis * effectiveCap : 0;
  const ltvOverCap = ltv > effectiveCap + 1e-6;

  // F&F project-viability math.
  const totalConstruction = sowItems.reduce(
    (sum, item) => sum + (Number(item.total_usd) || 0),
    0,
  );
  const allInBasis = purchaseNum + totalConstruction;
  const ltarv = arvNum > 0 ? allInBasis / arvNum : 0;
  const ltarvOverCap = ltarv > FF_LTARV_CAP + 1e-6;

  const step1Valid =
    address.trim().length >= 3 &&
    purchaseNum > 0 &&
    loanNum > 0 &&
    (!isFixFlip || arvNum > 0);
  const formValid = isFixFlip ? step1Valid && sowItems.length > 0 : step1Valid;

  const onSubmit = async () => {
    setError(null);
    if (!formValid) {
      setError(
        isFixFlip
          ? "Please fill in address, purchase price (BRV), ARV, requested loan, and at least one Scope of Work line."
          : "Please fill in property address, purchase price, and requested loan amount.",
      );
      return;
    }
    try {
      await submit.mutateAsync({
        target_property_address: address.trim(),
        purchase_price: purchaseNum,
        requested_loan_amount: loanNum,
        loan_type: loanType,
        // Closing date is optional. Backend expects ISO yyyy-mm-dd or
        // null; if the borrower types something we trust them and pass
        // it through. If the format is bad the backend 422s and we
        // surface it.
        expected_closing_date: closingDate.trim() || null,
        borrower_notes: notes.trim() || null,
        borrower_entity: entityTBD ? null : (entityName.trim() || null),
        // F&F-only fields. Backend ignores them on non-F&F products.
        arv_estimate: isFixFlip ? arvNum : null,
        sow_items: isFixFlip ? sowItems : null,
      });
      setDoneFlash(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // 502 / 504 here usually means the backend wrote the row but
      // timed out during PDF render. The mutation hook invalidates
      // the prequal list on error too, so the request will appear on
      // the borrower's queue. Soften the copy to match.
      const isGatewayTimeout = /\b50[24]\b/.test(msg);
      setError(
        isGatewayTimeout
          ? "Submission likely went through but the server took too long to confirm. Check My Pre-Qual Requests; the row should appear in a moment."
          : msg || "Submission failed — please retry.",
      );
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        // Android also needs an explicit behavior — leaving it undefined
        // means the keyboard overlays the bottom of the sheet and the
        // closing-date / SOW / submit controls disappear under it.
        // "height" pairs with windowSoftInputMode=adjustResize in the
        // manifest so the bottom sheet visibly shrinks; "padding" keeps
        // iOS smooth.
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View
            style={{
              backgroundColor: t.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 24,
              maxHeight: "92%",
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, alignSelf: "center", marginBottom: 14 }} />

            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
                  Underwriter review · async
                </Text>
                <Text style={{ fontSize: 20, fontWeight: "700", color: t.ink, letterSpacing: -0.4, marginTop: 2 }}>
                  Request Pre-Qualification
                </Text>
                <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4, lineHeight: 17 }}>
                  Letters are issued by an underwriter — never auto-generated.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
                accessibilityLabel="Close"
              >
                <Icon name="x" size={16} color={t.ink2} />
              </Pressable>
            </View>

            {doneFlash ? (
              <View style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
                <Pill bg={t.profitBg} color={t.profit}>Submitted</Pill>
                <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink }}>Under review</Text>
                <Text style={{ fontSize: 12.5, color: t.ink3, textAlign: "center", lineHeight: 18, paddingHorizontal: 12 }}>
                  An underwriter will review your request and either approve with a
                  signed letter or send back notes. You&apos;ll see the status update
                  here when they&apos;re done.
                </Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={{ paddingTop: 14, paddingBottom: 24, gap: 14 }}
                showsVerticalScrollIndicator={false}
                // keyboardShouldPersistTaps lets the user tap a button
                // (e.g. Submit, the closing-date field) WHILE the keyboard
                // is open without the first tap being eaten by the
                // dismiss-keyboard gesture. interactive lets a downward
                // drag pull the keyboard back down.
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
              >
                {/* F&F gets a 2-step flow. Step 1 is the deal
                    fundamentals; Step 2 is the SOW. Other products
                    skip the indicator and stay single-step. */}
                {isFixFlip ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: step === 1 ? t.brand : t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
                      1 · Deal
                    </Text>
                    <Text style={{ fontSize: 12, color: t.ink4 }}>›</Text>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: step === 2 ? t.brand : t.ink4, letterSpacing: 1, textTransform: "uppercase" }}>
                      2 · Scope of work
                    </Text>
                  </View>
                ) : null}

                {step === 1 ? (
                <>
                {/* Loan program — 2x2 grid of 4 products */}
                <View>
                  <FieldLabel t={t}>Loan program</FieldLabel>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
                    {PRODUCT_OPTIONS.map((id) => {
                      const meta = PREQUAL_LOAN_TYPE_LABELS[id];
                      const active = loanType === id;
                      const progCap = LTV_CAPS[id];
                      const optEffective = tierConstrained ? Math.min(progCap, tierMaxLtv as number) : progCap;
                      const optTierBound = tierConstrained && (tierMaxLtv as number) < progCap;
                      return (
                        <View key={id} style={{ width: "50%", padding: 4 }}>
                          <Pressable
                            onPress={() => setLoanType(id)}
                            style={({ pressed }) => ({
                              padding: 12,
                              borderRadius: 12,
                              borderWidth: 1.5,
                              borderColor: active ? t.brand : t.line,
                              backgroundColor: active ? t.brandSoft : t.surface2,
                              opacity: pressed ? 0.9 : 1,
                              minHeight: 78,
                            })}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{meta.title}</Text>
                            <Text style={{ fontSize: 10.5, color: t.ink2, marginTop: 2, lineHeight: 14 }}>{meta.sub}</Text>
                            <Text style={{
                              fontSize: 9.5,
                              color: optTierBound ? t.warn : t.ink3,
                              marginTop: 4,
                              fontWeight: "700",
                              letterSpacing: 0.5,
                              textTransform: "uppercase",
                            }}>
                              Max LTV {Math.round(optEffective * 100)}%
                              {optTierBound ? " · tier" : ""}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  {/* Tier hint */}
                  {tierMaxLtv != null && tierMaxLtv > 0 ? (
                    <Text style={{ fontSize: 11, color: t.ink3, marginTop: 8, lineHeight: 15.5 }}>
                      Your credit profile{creditSummary?.tier ? ` (${creditSummary.tier} tier)` : ""}{" "}
                      caps leverage at{" "}
                      <Text style={{ fontWeight: "800", color: t.ink2 }}>
                        {Math.round((tierMaxLtv as number) * 100)}% LTV
                      </Text>
                      . Programs with higher ceilings use this tier number.
                    </Text>
                  ) : tierMaxLtv === 0 ? (
                    <Text style={{ fontSize: 11, color: t.danger, marginTop: 8, lineHeight: 15.5 }}>
                      Your credit profile is currently blocked from new commercial financing.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: t.ink3, marginTop: 8, lineHeight: 15.5 }}>
                      Caps shown are the program ceiling. Once your credit pull is on
                      file we&apos;ll show your tier-adjusted maximum here.
                    </Text>
                  )}
                </View>

                {/* Address */}
                <GoogleAddressInput
                  value={addressParts}
                  onChange={(next) => {
                    setAddressParts(next);
                    setAddress(formatAddressParts(next));
                  }}
                  label="Target property address"
                  helperText="Select the property from Google when available. Manual entry keeps state as a dropdown for consistency."
                />

                {/* Purchase + loan */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <FieldText
                      t={t}
                      label={
                        loanType === "dscr_refi"
                          ? "Property value"
                          : isFixFlip
                            ? "Purchase (BRV)"
                            : "Purchase price"
                      }
                      value={purchaseText}
                      onChange={setPurchaseText}
                      placeholder="400000"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                        Requested loan
                      </Text>
                      {maxLoan > 0 ? (
                        <Pressable onPress={() => setLoanText(String(Math.round(maxLoan)))} hitSlop={6}>
                          <Text style={{ fontSize: 10.5, fontWeight: "800", color: t.petrol }}>
                            Max {QC_FMT.usd(maxLoan, 0)}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <TextInput
                      value={loanText}
                      onChangeText={setLoanText}
                      placeholder="320000"
                      placeholderTextColor={t.ink4}
                      keyboardType="numeric"
                      style={inputStyle(t)}
                    />
                  </View>
                </View>

                {/* Live LTV pill — basis is ARV for F&F, purchase price
                    for everything else. */}
                {ltvBasis > 0 && loanNum > 0 ? (
                  <Pill
                    bg={ltvOverCap ? t.dangerBg : t.profitBg}
                    color={ltvOverCap ? t.danger : t.profit}
                  >
                    {`Requested ${isFixFlip ? "LTARV" : "LTV"} ${(ltv * 100).toFixed(1)}% · ${ltvOverCap
                      ? `over ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier)" : ""} — underwriter will adjust`
                      : `within ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier-adjusted)" : ""}`}`}
                  </Pill>
                ) : null}

                {/* F&F-only: ARV (After Repair Value). Sits on Step 1
                    so the borrower sees the BRV/ARV delta before
                    they're walked into Scope of Work. */}
                {isFixFlip ? (
                  <FieldText
                    t={t}
                    label="Estimated ARV (After Repair Value)"
                    value={arvText}
                    onChange={setArvText}
                    placeholder="600000"
                    keyboardType="numeric"
                  />
                ) : null}

                {/* Closing date — calendar picker capped at 90 days out */}
                <ClosingDateField
                  t={t}
                  value={closingDate}
                  onChange={setClosingDate}
                />

                {/* LLC / entity */}
                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                      LLC / entity name
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 11.5, color: t.ink2 }}>TBD</Text>
                      <Switch
                        value={entityTBD}
                        onValueChange={setEntityTBD}
                        trackColor={{ false: t.line, true: t.brand }}
                      />
                    </View>
                  </View>
                  {!entityTBD ? (
                    <TextInput
                      value={entityName}
                      onChangeText={setEntityName}
                      placeholder="e.g. Riverside Holdings LLC"
                      placeholderTextColor={t.ink4}
                      style={inputStyle(t)}
                    />
                  ) : (
                    <View style={{
                      backgroundColor: t.surface2,
                      borderWidth: 1,
                      borderColor: t.line,
                      borderStyle: "dashed",
                      borderRadius: 9,
                      padding: 10,
                    }}>
                      <Text style={{ fontSize: 11.5, color: t.ink3, lineHeight: 16 }}>
                        Letter will be issued to your individual legal name. The
                        underwriter can re-issue under your LLC once it&apos;s formed.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Borrower notes */}
                <View>
                  <FieldLabel t={t}>Borrower notes (optional)</FieldLabel>
                  <TextInput
                    value={notes}
                    onChangeText={(v) => setNotes(v.slice(0, 500))}
                    placeholder="e.g. Need this letter by Friday EOD to submit my offer."
                    placeholderTextColor={t.ink4}
                    multiline
                    style={[inputStyle(t), { minHeight: 70, textAlignVertical: "top" }]}
                  />
                  <Text style={{ fontSize: 10, color: t.ink4, marginTop: 4, textAlign: "right" }}>
                    {notes.length}/500
                  </Text>
                </View>

                </>
                ) : null}

                {/* Step 2 — F&F Scope of Work editor. */}
                {isFixFlip && step === 2 ? (
                  <View style={{ gap: 10 }}>
                    <FieldLabel t={t}>Scope of work</FieldLabel>
                    <Text style={{ fontSize: 11.5, color: t.ink3, lineHeight: 16 }}>
                      Add a row for each major rehab category. The total
                      drives our project-viability check ({Math.round(FF_LTARV_CAP * 100)}% of ARV
                      cap on BRV + construction). Sellers don&apos;t see this list.
                    </Text>

                    <SowMobileEditor
                      t={t}
                      items={sowItems}
                      onChange={setSowItems}
                    />

                    {arvNum > 0 && allInBasis > 0 ? (
                      <Pill
                        bg={ltarvOverCap ? t.dangerBg : t.profitBg}
                        color={ltarvOverCap ? t.danger : t.profit}
                      >
                        {`All-in ${QC_FMT.usd(allInBasis, 0)} ÷ ARV ${QC_FMT.usd(arvNum, 0)} = ${(ltarv * 100).toFixed(1)}% · ${ltarvOverCap
                          ? `over ${Math.round(FF_LTARV_CAP * 100)}% cap — underwriter will review`
                          : `within ${Math.round(FF_LTARV_CAP * 100)}% project cap`}`}
                      </Pill>
                    ) : null}
                  </View>
                ) : null}

                {error ? (
                  <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill>
                ) : null}

                <View style={{ marginTop: 4, gap: 10 }}>
                  {isFixFlip && step === 1 ? (
                    <QButton
                      label="Continue → Scope of Work"
                      onPress={() => {
                        if (!step1Valid) {
                          setError(
                            "Please fill in address, BRV, ARV, and requested loan amount before continuing.",
                          );
                          return;
                        }
                        setError(null);
                        setStep(2);
                      }}
                      disabled={!step1Valid}
                      icon="arrowR"
                      variant="primary"
                    />
                  ) : (
                    <>
                      {isFixFlip && step === 2 ? (
                        <QButton
                          label="← Back"
                          onPress={() => { setError(null); setStep(1); }}
                          variant="ghost"
                        />
                      ) : null}
                      <QButton
                        label={submit.isPending ? "Submitting…" : "Submit for review"}
                        onPress={onSubmit}
                        disabled={!formValid || submit.isPending}
                        icon="check"
                        variant="primary"
                      />
                    </>
                  )}
                  <Text style={{ fontSize: 11, color: t.ink3, lineHeight: 15.5 }}>
                    Submitting just opens an underwriter review — no loan file is
                    created yet. Once approved, you&apos;ll download the letter, present
                    the offer, and report back here whether the seller accepted.
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Closing-date picker — opens the native date dialog, locked to a
// today-through-+90-day window. Stores the value as ISO yyyy-mm-dd
// (what the backend's PrequalRequestCreate expects) and renders a
// human-readable date in the row.
function ClosingDateField({
  t,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setDate(max.getDate() + 90);

  const parsed = value ? new Date(value) : null;
  const display = parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : null;

  const handleChange = (event: DateTimePickerEvent, picked?: Date) => {
    // On Android the picker is a one-shot dialog — close on dismiss OR
    // set. On iOS we keep the inline spinner open.
    if (Platform.OS === "android") setOpen(false);
    if (event.type !== "set" || !picked) return;
    // Clamp into [today, today+90] in case the OS lets us through.
    const clamped = new Date(
      Math.min(Math.max(picked.getTime(), today.getTime()), max.getTime()),
    );
    const yyyy = clamped.getFullYear();
    const mm = String(clamped.getMonth() + 1).padStart(2, "0");
    const dd = String(clamped.getDate()).padStart(2, "0");
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <View>
      <FieldLabel t={t}>Expected closing date</FieldLabel>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          ...inputStyle(t),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 14, color: display ? t.ink : t.ink4 }}>
          {display ?? "Tap to pick a date"}
        </Text>
        <Icon name="cal" size={14} color={t.ink3} />
      </Pressable>
      <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
        Up to 90 days out · most pre-quals close within 30–45 days
      </Text>
      {open ? (
        <DateTimePicker
          value={parsed && !Number.isNaN(parsed.getTime()) ? parsed : today}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={today}
          maximumDate={max}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

function FieldLabel({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: 10.5, fontWeight: "700", color: t.ink3,
      letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5,
    }}>
      {children}
    </Text>
  );
}

function FieldText({
  t,
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <FieldLabel t={t}>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.ink4}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={inputStyle(t)}
      />
    </View>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: t.ink,
  } as const;
}

// Mobile-native scope-of-work editor. Each row is its own card so the
// touch targets stay big and the editor doesn't fight the on-screen
// keyboard. Add Row materializes the first row; ✕ icon removes a row.
// Total construction running sum sits at the bottom.
function SowMobileEditor({
  t,
  items,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  items: PrequalSowLineItem[];
  onChange: (next: PrequalSowLineItem[]) => void;
}) {
  const total = items.reduce((sum, item) => sum + (Number(item.total_usd) || 0), 0);
  const setItem = (idx: number, patch: Partial<PrequalSowLineItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const addItem = () => {
    onChange([...items, { category: "", description: "", total_usd: 0 }]);
  };

  return (
    <View style={{ gap: 8 }}>
      {items.length === 0 ? (
        <View style={{
          padding: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.line,
          borderStyle: "dashed",
          backgroundColor: t.surface2,
          alignItems: "center",
        }}>
          <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17 }}>
            No scope-of-work lines yet. Tap{" "}
            <Text style={{ fontWeight: "800", color: t.ink2 }}>Add row</Text> below.
          </Text>
        </View>
      ) : (
        items.map((item, idx) => (
          <View
            key={idx}
            style={{
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.surface,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel t={t}>Category</FieldLabel>
                <TextInput
                  value={item.category}
                  onChangeText={(v) => setItem(idx, { category: v })}
                  placeholder="Demo / HVAC / Plumbing"
                  placeholderTextColor={t.ink4}
                  style={inputStyle(t)}
                />
              </View>
              <Pressable
                onPress={() => removeItem(idx)}
                hitSlop={8}
                style={{ padding: 6, marginTop: 18 }}
              >
                <Icon name="x" size={14} color={t.ink3} />
              </Pressable>
            </View>

            <View>
              <FieldLabel t={t}>Description</FieldLabel>
              <TextInput
                value={item.description}
                onChangeText={(v) => setItem(idx, { description: v })}
                placeholder="Brief description"
                placeholderTextColor={t.ink4}
                style={inputStyle(t)}
              />
            </View>

            <View>
              <FieldLabel t={t}>Total $</FieldLabel>
              <TextInput
                value={String(item.total_usd || "")}
                onChangeText={(v) => {
                  const n = Number(v.replace(/[^0-9.]/g, "")) || 0;
                  setItem(idx, { total_usd: n });
                }}
                placeholder="0"
                placeholderTextColor={t.ink4}
                keyboardType="numeric"
                style={inputStyle(t)}
              />
            </View>
          </View>
        ))
      )}

      <Pressable
        onPress={addItem}
        style={({ pressed }) => ({
          marginTop: 4,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.chip,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name="plus" size={14} color={t.ink2} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink2 }}>Add row</Text>
      </Pressable>

      <View style={{
        marginTop: 6, paddingTop: 8,
        borderTopWidth: 1, borderTopColor: t.line,
        flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
          Total construction
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"] }}>
          {QC_FMT.usd(total, 0)}
        </Text>
      </View>
    </View>
  );
}
