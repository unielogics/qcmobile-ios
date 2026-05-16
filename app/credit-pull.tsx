// Soft credit pull — flow:
//   form     → editable; pre-filled from user account + client record
//   review   → read-only summary with Edit button
//   consent  → FCRA legal text + "I Authorize" button
//   pulling  → loading state while bureau call runs
//   done     → FICO + expiry shown to borrower
//
// Pre-fill sources: /auth/me (name) + /clients/me (address, city). Phone
// and email aren't part of iSoftPull's required fields, so we skip them
// here — they're already on record from sign-up. Borrower can override
// anything in the form step before committing; review-then-consent gives
// them a chance to spot mismatches before the bureau is hit.

import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, QButton, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useCreditSummary, useCurrentUser, useMyClient, useMyCredit, useStartCreditPull } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";

type Stage = "form" | "review" | "consent" | "pulling" | "done";

// `mode` lets callers customize copy. URL param: /credit-pull?mode=refresh|expired.
//   first   — borrower has no credit on file (default)
//   refresh — borrower has a valid pull and is choosing to re-run
//   expired — borrower's pull is past 90 days; gentle-but-urgent copy
type Mode = "first" | "refresh" | "expired";

const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },        { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },        { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },     { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },    { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },        { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },         { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },       { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },           { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },       { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },          { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },      { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },       { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },       { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },     { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },           { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },         { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },   { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },   { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },          { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },        { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },     { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },      { code: "WY", name: "Wyoming" },
];

// Form fields = exactly what iSoftPull's API requires (per their docs).
// We deliberately don't collect phone/email here — those live on the
// User (Clerk) and Client records and aren't sent to the bureau. SSN
// is the full 9 digits; the backend forwards it to iSoftPull and
// persists only the last 4 to credit_pulls.last4_ssn.
interface Form {
  legal_first_name: string;
  legal_last_name: string;
  dob: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  ssn: string;
}

const EMPTY_FORM: Form = {
  legal_first_name: "",
  legal_last_name: "",
  dob: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  ssn: "",
};

function splitName(full: string | undefined | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function CreditPull() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const start = useStartCreditPull();
  const { data: user } = useCurrentUser();
  const { data: client } = useMyClient();
  const { data: existingCredit } = useMyCredit();

  // Derive the effective mode from the URL param OR from observed state:
  // a valid (non-expired) pull on file becomes "refresh"; an expired pull
  // becomes "expired"; nothing on file stays "first".
  const mode: Mode = (() => {
    if (params.mode === "refresh" || params.mode === "expired" || params.mode === "first") {
      return params.mode;
    }
    if (existingCredit?.is_expired) return "expired";
    if (existingCredit?.fico != null) return "refresh";
    return "first";
  })();

  // Short-circuit: if the borrower already has a valid pull and didn't
  // explicitly arrive in refresh/expired mode, show a confirmation gate
  // before re-running. Re-runs cost the bureau a request and reset the
  // 90-day expiry, so we don't trigger them by accident.
  const hasValidPull = !!existingCredit && existingCredit.fico != null && !existingCredit.is_expired;
  const showsValidPullGate = hasValidPull && params.mode !== "refresh" && params.mode !== "expired";

  // Separate gate for the "we pulled but the bureau returned no usable
  // score" case (thin file, no recent activity). Without this the form
  // would render as if the user had never pulled, prompting them to
  // re-pull the same identity and burn another bureau request.
  const hasNoScorePull = !!existingCredit && existingCredit.fico == null && !existingCredit.is_expired;
  const showsNoScoreGate = hasNoScorePull && params.mode !== "refresh";

  const [stage, setStage] = useState<Stage>("form");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  // SSN starts hidden; it's only required if the bureau can't match
  // on name+address+DOB alone. Backend signals that with a structured
  // 422 carrying `code: "no_hit_provide_ssn"`.
  const [ssnRequired, setSsnRequired] = useState(false);

  // Pre-fill from account + client record once both are loaded. We only
  // overwrite fields the borrower hasn't already typed, so reopening the
  // screen mid-edit doesn't clobber their corrections.
  const accountFingerprint = `${user?.id ?? ""}:${client?.id ?? ""}`;
  useEffect(() => {
    if (!user && !client) return;
    setForm((prev) => {
      const next = { ...prev };
      const split = splitName(user?.name);
      if (!next.legal_first_name && split.first) next.legal_first_name = split.first;
      if (!next.legal_last_name && split.last) next.legal_last_name = split.last;
      if (!next.street && client?.address) next.street = client.address;
      if (!next.city && client?.city) next.city = client.city;
      return next;
    });
  }, [accountFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Required-field validity for the Continue button. SSN is only
  // required after the bureau told us it couldn't match without it.
  const formValid = useMemo(() => {
    return (
      form.legal_first_name.trim().length > 0 &&
      form.legal_last_name.trim().length > 0 &&
      isValidDob(form.dob) &&
      form.street.trim().length > 0 &&
      form.city.trim().length > 0 &&
      form.state.length === 2 &&
      /^\d{5}(-\d{4})?$/.test(form.zip) &&
      (!ssnRequired || form.ssn.length === 9)
    );
  }, [form, ssnRequired]);

  const submit = async () => {
    setStage("pulling");
    setErrorMsg(null);
    try {
      // Only forward SSN when the borrower actually entered one.
      // Pydantic rejects empty-string SSN, so coerce to undefined.
      const payload: Record<string, unknown> = {
        legal_first_name: form.legal_first_name,
        legal_last_name: form.legal_last_name,
        dob: form.dob,
        street: form.street,
        city: form.city,
        state: form.state,
        zip: form.zip,
        fcra_consent: true,
      };
      if (form.ssn.length === 9) payload.ssn = form.ssn;

      await start.mutateAsync(payload);
      setStage("done");
    } catch (err) {
      // Backend signals structured deny outcomes via 422 + detail.code.
      //   no_hit_provide_ssn  → reveal SSN field, retry
      //   bureau_freeze       → user must lift their freeze with the bureau
      // The api wrapper attaches the parsed body to ApiError; pluck the code.
      const code = readErrorCode(err);
      const detailMsg = readErrorMessage(err);
      if (code === "no_hit_provide_ssn") {
        setSsnRequired(true);
        setErrorMsg(
          detailMsg ||
            "We couldn't find your file with name + address + DOB alone. Add your SSN below and try again.",
        );
        setStage("form");
        return;
      }
      if (code === "bureau_freeze") {
        setErrorMsg(
          detailMsg ||
            "Your credit file is frozen at the bureau. Please lift the freeze with Experian, Equifax, or TransUnion and try again.",
        );
        setStage("form");
        return;
      }
      setErrorMsg(
        detailMsg || (err instanceof Error ? err.message : "Pull failed — please retry."),
      );
      setStage("consent");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: t.brand, fontWeight: "700" }}>✕ Cancel</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, flex: 1 }}>
              {mode === "expired"
                ? "Refresh Your Credit"
                : mode === "refresh"
                  ? "Re-run Soft Pull"
                  : "Soft Credit Pull"}
            </Text>
            {mode === "expired" ? (
              <Pill bg={t.dangerBg} color={t.danger}>90-day expired</Pill>
            ) : mode === "refresh" ? (
              <Pill bg={t.warnBg} color={t.warn}>Resets expiry</Pill>
            ) : null}
          </View>
          <Text style={{ fontSize: 13, color: t.ink2 }}>
            {mode === "expired"
              ? "Soft pulls are valid for 90 days. We'll run a fresh check now to keep your rates accurate. No score impact."
              : "We capture only what the bureaus require. No score impact. Valid for 90 days."}
          </Text>

          {showsValidPullGate ? (
            <Card pad={16}>
              <SectionLabel>You already have a valid pull</SectionLabel>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 32, fontWeight: "800", color: t.ink, fontVariant: ["tabular-nums"] }}>
                  {existingCredit?.fico ?? "—"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: t.ink2 }}>
                    Pulled{" "}
                    {existingCredit?.pulled_at
                      ? new Date(existingCredit.pulled_at).toLocaleDateString()
                      : "—"}
                  </Text>
                  <Text style={{ fontSize: 11, color: t.ink3 }}>
                    Expires{" "}
                    {existingCredit?.expires_at
                      ? new Date(existingCredit.expires_at).toLocaleDateString()
                      : "—"}
                    {existingCredit?.days_until_expiry != null
                      ? ` · ${existingCredit.days_until_expiry} days left`
                      : ""}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: t.ink2, marginTop: 12 }}>
                Re-running will replace this pull and reset the 90-day clock. Most borrowers
                don't need to refresh until close to expiry.
              </Text>
              <View style={{ marginTop: 14, gap: 8 }}>
                <QButton label="Use my current pull" onPress={() => router.back()} />
                <QButton
                  label="Re-run anyway"
                  variant="secondary"
                  onPress={() => router.setParams({ mode: "refresh" })}
                />
              </View>
            </Card>
          ) : showsNoScoreGate ? (
            <Card pad={16}>
              <SectionLabel>We pulled your credit, but…</SectionLabel>
              <Text style={{ fontSize: 16, fontWeight: "700", color: t.ink, marginTop: 6 }}>
                The bureau didn't return a usable score
              </Text>
              <Text style={{ fontSize: 12, color: t.ink2, marginTop: 8, lineHeight: 17 }}>
                This usually means a thin or stale credit file. Re-running on the same
                identity won't change the result — please contact support if you believe
                this is an error.
              </Text>
              <Text style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
                Pulled{" "}
                {existingCredit?.pulled_at
                  ? new Date(existingCredit.pulled_at).toLocaleDateString()
                  : "—"}
              </Text>
              <View style={{ marginTop: 14, gap: 8 }}>
                <QButton label="Done" onPress={() => router.back()} />
                <QButton
                  label="Re-run anyway"
                  variant="secondary"
                  onPress={() => router.setParams({ mode: "refresh" })}
                />
              </View>
            </Card>
          ) : (
            <ProgressBar stage={stage} />
          )}

          {!showsValidPullGate && !showsNoScoreGate && stage === "form" && (
            <FormStage
              form={form}
              onChange={setForm}
              onContinue={() => setStage("review")}
              onPickState={() => setStatePickerOpen(true)}
              valid={formValid}
              ssnRequired={ssnRequired}
              ssnPrompt={ssnRequired ? errorMsg : null}
            />
          )}

          {!showsValidPullGate && !showsNoScoreGate && stage === "review" && (
            <ReviewStage
              form={form}
              onEdit={() => setStage("form")}
              onContinue={() => setStage("consent")}
            />
          )}

          {!showsValidPullGate && !showsNoScoreGate && stage === "consent" && (
            <ConsentStage
              form={form}
              errorMsg={errorMsg}
              onAuthorize={submit}
              onBack={() => setStage("review")}
            />
          )}

          {!showsValidPullGate && !showsNoScoreGate && stage === "pulling" && (
            <Card pad={24}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700", textAlign: "center" }}>
                Pulling… Experian → TransUnion → Equifax
              </Text>
            </Card>
          )}

          {!showsValidPullGate && !showsNoScoreGate && stage === "done" && (
            <DoneStage data={start.data ?? null} onClose={() => router.back()} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <StatePickerModal
        visible={statePickerOpen}
        currentCode={form.state}
        onClose={() => setStatePickerOpen(false)}
        onPick={(code) => {
          setForm((f) => ({ ...f, state: code }));
          setStatePickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function ProgressBar({ stage }: { stage: Stage }) {
  const { t } = useTheme();
  const order: Stage[] = ["form", "review", "consent", "pulling", "done"];
  const idx = Math.max(0, order.indexOf(stage));
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[
        { id: "form", label: "Details" },
        { id: "review", label: "Review" },
        { id: "consent", label: "Consent" },
        { id: "done", label: "Result" },
      ].map((step, i) => {
        const stepIdx = step.id === "done" ? 3 : i;
        const reached = (idx >= 4 && step.id === "done") || idx >= stepIdx;
        const active =
          (stage === step.id) ||
          (stage === "pulling" && step.id === "consent") ||
          (stage === "done" && step.id === "done");
        return (
          <View
            key={step.id}
            style={{
              flex: 1,
              gap: 4,
            }}
          >
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor: reached ? t.brand : t.line,
              }}
            />
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "700",
                color: active ? t.ink : t.ink3,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function FormStage({
  form,
  onChange,
  onContinue,
  onPickState,
  valid,
  ssnRequired,
  ssnPrompt,
}: {
  form: Form;
  onChange: (f: Form) => void;
  onContinue: () => void;
  onPickState: () => void;
  valid: boolean;
  ssnRequired: boolean;
  ssnPrompt: string | null;
}) {
  const { t } = useTheme();
  const stateName = US_STATES.find((s) => s.code === form.state)?.name;
  return (
    <Card pad={16}>
      <SectionLabel>Legal Name</SectionLabel>
      <Field
        label="First name"
        value={form.legal_first_name}
        onChangeText={(v) => onChange({ ...form, legal_first_name: v })}
        autoCapitalize="words"
      />
      <Field
        label="Last name"
        value={form.legal_last_name}
        onChangeText={(v) => onChange({ ...form, legal_last_name: v })}
        autoCapitalize="words"
      />
      <DobField
        valueIso={form.dob}
        onChangeIso={(iso) => onChange({ ...form, dob: iso })}
      />

      <SectionLabel>Address Used for Credit</SectionLabel>
      <Field
        label="Street"
        value={form.street}
        onChangeText={(v) => onChange({ ...form, street: v })}
        autoCapitalize="words"
      />
      <Field
        label="City"
        value={form.city}
        onChangeText={(v) => onChange({ ...form, city: v })}
        autoCapitalize="words"
      />

      {/* State picker — opens a modal of US states to keep state codes valid. */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{
            fontSize: 11,
            color: t.ink3,
            fontWeight: "700",
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          State
        </Text>
        <Pressable
          onPress={onPickState}
          style={{
            backgroundColor: t.surface2,
            borderColor: t.line,
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              color: form.state ? t.ink : t.ink4,
            }}
          >
            {form.state ? `${form.state} — ${stateName}` : "Select state…"}
          </Text>
          <Icon name="chevD" size={14} color={t.ink3} />
        </Pressable>
      </View>

      <Field
        label="ZIP"
        value={form.zip}
        onChangeText={(v) => onChange({ ...form, zip: v.replace(/[^0-9-]/g, "").slice(0, 10) })}
        keyboardType="number-pad"
        placeholder="12345"
      />

      {ssnRequired ? (
        <>
          <SectionLabel>Identity verification</SectionLabel>
          {ssnPrompt ? (
            <View style={{ marginBottom: 10, padding: 10, borderRadius: 9, backgroundColor: t.warnBg }}>
              <Text style={{ fontSize: 12, color: t.warn, fontWeight: "600", lineHeight: 17 }}>
                {ssnPrompt}
              </Text>
            </View>
          ) : null}
          <Field
            label="Social Security Number"
            placeholder="9 digits, no dashes"
            value={form.ssn}
            onChangeText={(v) =>
              onChange({ ...form, ssn: v.replace(/\D/g, "").slice(0, 9) })
            }
            keyboardType="number-pad"
            secureTextEntry
          />
          <Text style={{ fontSize: 11, color: t.ink3, marginTop: -6, marginBottom: 4, lineHeight: 15 }}>
            Sent to the bureau over TLS. Only the last 4 digits are saved on file.
          </Text>
        </>
      ) : (
        <View style={{ marginTop: 4, marginBottom: 8, padding: 10, borderRadius: 9, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }}>
          <Text style={{ fontSize: 11.5, color: t.ink2, lineHeight: 17 }}>
            We try to match your credit file using name, address, and date of birth. We only ask for your SSN if the bureau can't find your file without it.
          </Text>
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        <QButton
          label="Review →"
          onPress={onContinue}
          disabled={!valid}
        />
        {!valid ? (
          <Text style={{ fontSize: 11, color: t.ink3, marginTop: 8, textAlign: "center" }}>
            All fields are required to proceed.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function ReviewStage({
  form,
  onEdit,
  onContinue,
}: {
  form: Form;
  onEdit: () => void;
  onContinue: () => void;
}) {
  const { t } = useTheme();
  const stateName = US_STATES.find((s) => s.code === form.state)?.name;
  return (
    <Card pad={16}>
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}
      >
        <SectionLabel>Review your info</SectionLabel>
        <Pressable onPress={onEdit} hitSlop={10}>
          <Text style={{ color: t.brand, fontSize: 12, fontWeight: "700" }}>Edit</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: t.ink3, marginBottom: 12, lineHeight: 17 }}>
        Confirm everything matches your government-issued ID. Mismatches are the most common reason a
        bureau pull fails.
      </Text>

      <ReviewRow label="Legal name" value={`${form.legal_first_name} ${form.legal_last_name}`.trim()} />
      <ReviewRow label="Date of birth" value={isoToMmDdYyyy(form.dob)} />
      <ReviewRow label="Street" value={form.street} />
      <ReviewRow label="City" value={form.city} />
      <ReviewRow
        label="State"
        value={stateName ? `${form.state} — ${stateName}` : form.state}
      />
      <ReviewRow
        label="ZIP"
        value={form.zip}
        last={form.ssn.length !== 9}
      />
      {form.ssn.length === 9 ? (
        <ReviewRow label="SSN" value={`•••-••-${form.ssn.slice(-4)}`} last />
      ) : null}

      <View style={{ marginTop: 14, gap: 8 }}>
        <QButton label="Continue to Consent" onPress={onContinue} />
        <QButton label="Edit details" variant="secondary" onPress={onEdit} />
      </View>
    </Card>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { t } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.line,
      }}
    >
      <Text style={{ fontSize: 12, color: t.ink3, fontWeight: "600" }}>{label}</Text>
      <Text style={{ fontSize: 13, color: t.ink, fontWeight: "700", maxWidth: "65%", textAlign: "right" }}>
        {value || "—"}
      </Text>
    </View>
  );
}

function ConsentStage({
  form,
  errorMsg,
  onAuthorize,
  onBack,
}: {
  form: Form;
  errorMsg: string | null;
  onAuthorize: () => void;
  onBack: () => void;
}) {
  const { t } = useTheme();
  return (
    <Card pad={16}>
      <SectionLabel>FCRA Consent</SectionLabel>
      <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 20 }}>
        I, {form.legal_first_name} {form.legal_last_name}, authorize Qualified Commercial to obtain my
        consumer credit report from Experian, TransUnion, and Equifax for the purpose of evaluating
        loan products. I understand this is a soft pull and will not affect my credit score.
      </Text>
      {errorMsg ? (
        <View
          style={{ marginTop: 12, padding: 10, borderRadius: 9, backgroundColor: t.dangerBg }}
        >
          <Text style={{ color: t.danger, fontSize: 12, fontWeight: "700" }}>{errorMsg}</Text>
        </View>
      ) : null}
      <View style={{ marginTop: 12, gap: 8 }}>
        <QButton label="I Authorize · Run Soft Pull" onPress={onAuthorize} />
        <QButton label="Back to Review" variant="secondary" onPress={onBack} />
      </View>
    </Card>
  );
}

function DoneStage({
  data,
  onClose,
}: {
  data: { id?: string; fico?: number | null; expires_at?: string | null } | null;
  onClose: () => void;
}) {
  const { t } = useTheme();
  // The bureau can return 200-OK with a null FICO when the file is too
  // thin or stale to score. Surface that explicitly so the borrower
  // doesn't think the pull is still loading or that it failed silently.
  if (data && data.fico == null) {
    return (
      <Card pad={24}>
        <Text style={{ color: t.warn, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
          No score available
        </Text>
        <Text
          style={{
            color: t.ink,
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          The bureau didn't return a usable score
        </Text>
        <Text style={{ color: t.ink2, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 18 }}>
          This usually means a thin or stale credit file. Re-running on the same
          identity won't change the result — please contact support if you believe
          this is an error.
        </Text>
        <View style={{ marginTop: 18 }}>
          <QButton label="Done" onPress={onClose} />
        </View>
      </Card>
    );
  }
  return (
    <Card pad={24}>
      <Text style={{ color: t.profit, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
        Verified
      </Text>
      <Text
        style={{
          color: t.ink,
          fontSize: 36,
          fontWeight: "800",
          textAlign: "center",
          marginTop: 8,
        }}
      >
        {data?.fico ?? "—"}
      </Text>
      <Text style={{ color: t.ink3, fontSize: 12, textAlign: "center", marginTop: 4 }}>
        Valid through {data?.expires_at ? new Date(data.expires_at).toLocaleDateString() : "—"}
      </Text>
      {data?.id ? <CreditBriefing pullId={data.id} /> : null}
      <Text style={{ color: t.ink3, fontSize: 12, textAlign: "center", marginTop: 14, lineHeight: 17 }}>
        Soft pull — no impact on your credit. We'll use this score to surface accurate rates and LTV
        tiers across the simulator.
      </Text>
      <View style={{ marginTop: 16 }}>
        <QButton label="Done" onPress={onClose} />
      </View>
    </Card>
  );
}

// Brief "what's good vs what's a concern" summary for the done stage.
// Mirrors qcdesktop CreditBriefing — label-only, max 3 of each kind.
function CreditBriefing({ pullId }: { pullId: string }) {
  const { t } = useTheme();
  const { data: summary, isLoading } = useCreditSummary(pullId);

  if (isLoading) {
    return (
      <Text style={{ color: t.ink3, fontSize: 12, textAlign: "center", marginTop: 14 }}>
        Loading briefing…
      </Text>
    );
  }
  if (!summary) return null;

  const positives = summary.bullets.filter((b) => b.kind === "positive").slice(0, 3);
  const warns = summary.bullets.filter((b) => b.kind === "warn").slice(0, 3);
  if (positives.length === 0 && warns.length === 0) return null;

  return (
    <View style={{ marginTop: 16, gap: 12 }}>
      {positives.length > 0 && (
        <View>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.profit, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            What's good
          </Text>
          {positives.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.profit, marginTop: 6 }} />
              <Text style={{ flex: 1, fontSize: 13, color: t.ink2, lineHeight: 18 }}>{b.label}</Text>
            </View>
          ))}
        </View>
      )}
      {warns.length > 0 && (
        <View>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.warn, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            Things to watch
          </Text>
          {warns.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.warn, marginTop: 6 }} />
              <Text style={{ flex: 1, fontSize: 13, color: t.ink2, lineHeight: 18 }}>{b.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatePickerModal({
  visible,
  currentCode,
  onClose,
  onPick,
}: {
  visible: boolean;
  currentCode: string;
  onClose: () => void;
  onPick: (code: string) => void;
}) {
  const { t } = useTheme();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 28,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.lineStrong,
              alignSelf: "center",
              marginBottom: 12,
            }}
          />
          <Text
            style={{ fontSize: 16, fontWeight: "800", color: t.ink, marginBottom: 8, paddingHorizontal: 8 }}
          >
            Select State
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {US_STATES.map((s) => {
              const active = s.code === currentCode;
              return (
                <Pressable
                  key={s.code}
                  onPress={() => onPick(s.code)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: t.line,
                    backgroundColor: pressed ? t.chip : "transparent",
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: active ? t.brand : t.ink3,
                        width: 32,
                      }}
                    >
                      {s.code}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: active ? t.brand : t.ink,
                        fontWeight: active ? "700" : "500",
                      }}
                    >
                      {s.name}
                    </Text>
                  </View>
                  {active ? <Icon name="check" size={16} color={t.brand} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// US-format DOB input: displays MM / DD / YYYY with auto-slashes; stores
// the canonical ISO YYYY-MM-DD upstream so the bureau payload doesn't
// change. We render the slashes as a static overlay so the input mask
// reads naturally even before the borrower starts typing.
function DobField({
  valueIso,
  onChangeIso,
}: {
  valueIso: string;
  onChangeIso: (iso: string) => void;
}) {
  const { t } = useTheme();
  const [display, setDisplay] = useState(() => isoToMmDdYyyy(valueIso));

  // Keep the visible input in sync when the parent pushes a new ISO value
  // (e.g. account pre-fill arriving after first render).
  useEffect(() => {
    const formatted = isoToMmDdYyyy(valueIso);
    if (formatted !== display) setDisplay(formatted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIso]);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setDisplay(formatted);

    if (digits.length === 8) {
      const mm = digits.slice(0, 2);
      const dd = digits.slice(2, 4);
      const yyyy = digits.slice(4);
      onChangeIso(`${yyyy}-${mm}-${dd}`);
    } else {
      // Partial entry — invalidate the ISO so formValid blocks Continue.
      onChangeIso("");
    }
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          fontSize: 11,
          color: t.ink3,
          fontWeight: "700",
          marginBottom: 4,
          textTransform: "uppercase",
        }}
      >
        Date of birth
      </Text>
      <TextInput
        value={display}
        onChangeText={handleChange}
        placeholder="MM / DD / YYYY"
        placeholderTextColor={t.ink4}
        keyboardType="number-pad"
        maxLength={10}
        style={{
          backgroundColor: t.surface2,
          borderColor: t.line,
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          fontSize: 16,
          color: t.ink,
          letterSpacing: 1,
          fontVariant: ["tabular-nums"],
        }}
      />
      <Text style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>US format · MM / DD / YYYY</Text>
    </View>
  );
}

function isoToMmDdYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function isValidDob(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Month-aware day check via Date round-trip (catches Feb 30, etc.)
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return false;
  }
  // Sanity bounds — must be in the past, and a reasonable adult age range.
  const now = new Date();
  if (d.getTime() > now.getTime()) return false;
  if (year < 1900) return false;
  return true;
}

// FastAPI returns 422s as either:
//   { detail: "string-message" }                                — plain
//   { detail: { code, message } }                               — structured
// Pluck out the code / message from either shape.
function readErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const code = (detail as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function readErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: unknown }).message;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}

function Field({ label, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { t } = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700", marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </Text>
      <TextInput
        {...rest}
        placeholderTextColor={t.ink4}
        style={{
          backgroundColor: t.surface2,
          borderColor: t.line,
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          color: t.ink,
        }}
      />
    </View>
  );
}
