import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, Text, TextInput, View } from "react-native";
import { CardField, confirmSetupIntent, initStripe } from "@stripe/stripe-react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, QButton, SectionLabel } from "@/design-system/primitives";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";
import {
  useCompletePaymentAuthorization,
  useCreateSetupIntent,
  useCurrentUser,
  useMyClient,
  usePaymentAuthorizationStatus,
  useStartPaymentAuthorization,
} from "@/hooks/useApi";
import type { AddressParts, BillingAddress, PaymentAuthorizationStartResponse, SetupIntentResponse } from "@/lib/types";

type AuthorizationStep = "esign" | "billing" | "card";

const EMPTY_BILLING: BillingAddress = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
};

function billingToAddressParts(billing: BillingAddress): AddressParts {
  return {
    street: billing.line1 || null,
    city: billing.city || null,
    state: billing.state || null,
    zip: billing.postal_code || null,
    full: [billing.line1, billing.city, [billing.state, billing.postal_code].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ") || null,
    latitude: null,
    longitude: null,
  };
}

function applyAddressToBilling(prev: BillingAddress, address: AddressParts): BillingAddress {
  return {
    ...prev,
    line1: address.street || address.full || prev.line1,
    city: address.city || prev.city,
    state: (address.state || prev.state || "").toUpperCase().slice(0, 2),
    postal_code: address.zip || prev.postal_code,
    country: "US",
  };
}

export function PaymentAuthorizationGate({
  onComplete,
  onStepChange,
  onSignatureActiveChange,
}: {
  onComplete?: () => void;
  onStepChange?: (step: AuthorizationStep) => void;
  onSignatureActiveChange?: (active: boolean) => void;
} = {}) {
  const { t, isDark } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: client } = useMyClient();
  const status = usePaymentAuthorizationStatus();
  const start = useStartPaymentAuthorization();
  const setup = useCreateSetupIntent();
  const complete = useCompletePaymentAuthorization();
  const [started, setStarted] = useState<PaymentAuthorizationStartResponse | null>(null);
  const [setupIntent, setSetupIntent] = useState<SetupIntentResponse | null>(null);
  const [step, setStep] = useState<AuthorizationStep>("esign");
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [paymentConsent, setPaymentConsent] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef("");
  const startAttempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  const publishableKey = setupIntent?.stripe_publishable_key || status.data?.stripe_publishable_key;
  useEffect(() => {
    if (publishableKey) {
      initStripe({ publishableKey }).catch(() => undefined);
    }
  }, [publishableKey]);

  useEffect(() => {
    setBilling((prev) => ({
      ...prev,
      name: prev.name || user?.name || client?.name || "",
      email: prev.email || user?.email || client?.email || "",
      line1: prev.line1 || client?.address || "",
      city: prev.city || client?.city || "",
    }));
    if (!typedName && user?.name) setTypedName(user.name);
  }, [client?.address, client?.city, client?.email, client?.name, typedName, user?.email, user?.name]);

  const signatureResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          onSignatureActiveChange?.(true);
          const { locationX, locationY } = event.nativeEvent;
          currentPath.current = `M ${Math.round(locationX)} ${Math.round(locationY)}`;
          setPaths((prev) => [...prev, currentPath.current]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          currentPath.current += ` L ${Math.round(locationX)} ${Math.round(locationY)}`;
          setPaths((prev) => [...prev.slice(0, -1), currentPath.current]);
        },
        onPanResponderRelease: () => {
          onSignatureActiveChange?.(false);
        },
        onPanResponderTerminate: () => {
          onSignatureActiveChange?.(false);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [onSignatureActiveChange],
  );

  const begin = async () => {
    setError(null);
    try {
      const res = await start.mutateAsync();
      setStarted(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start authorization.");
    }
  };

  useEffect(() => {
    if (started || start.isPending || startAttempted.current) return;
    startAttempted.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, start.isPending]);

  const continueToBilling = () => {
    setError(null);
    if (!started) {
      setError("Authorization terms are still loading. Please retry in a moment.");
      return;
    }
    if (!typedName.trim() || !esignConsent || !paymentConsent || paths.length === 0) {
      setError("Complete the consents, legal name, and drawn signature before continuing.");
      return;
    }
    setStep("billing");
  };

  const continueToCard = async () => {
    setError(null);
    const active = started;
    if (!active) {
      setError("Authorization terms are still loading. Please retry in a moment.");
      return;
    }
    if (!billing.name || !billing.line1 || !billing.city || !billing.state || !billing.postal_code) {
      setError("Complete the billing address before continuing.");
      return;
    }
    try {
      setCardComplete(false);
      setSetupIntent(null);
      const res = await setup.mutateAsync({
        authorization_id: active.authorization.id,
        billing,
      });
      await initStripe({ publishableKey: res.stripe_publishable_key });
      setSetupIntent(res);
      setStep("card");
    } catch (err) {
      setError(readErrorMessage(err));
    }
  };

  const submit = async () => {
    setError(null);
    const active = started;
    if (!active) {
      setError("Authorization terms are still loading. Please retry in a moment.");
      return;
    }
    if (!setupIntent) {
      setError("Secure card setup is still loading. Please retry in a moment.");
      return;
    }
    if (!typedName.trim() || !esignConsent || !paymentConsent || paths.length === 0) {
      setError("Complete the consents, legal name, and drawn signature.");
      return;
    }
    if (!billing.name || !billing.line1 || !billing.city || !billing.state || !billing.postal_code) {
      setError("Complete the billing address.");
      return;
    }
    if (!cardComplete) {
      setError("Enter and validate the card details.");
      return;
    }
    try {
      await initStripe({ publishableKey: setupIntent.stripe_publishable_key });
      const result = await confirmSetupIntent(setupIntent.client_secret, {
        paymentMethodType: "Card",
        paymentMethodData: {
          billingDetails: {
            name: billing.name,
            email: billing.email || undefined,
            phone: billing.phone || undefined,
            address: {
              line1: billing.line1,
              line2: billing.line2 || undefined,
              city: billing.city,
              state: billing.state,
              postalCode: billing.postal_code,
              country: billing.country || "US",
            },
          },
        },
      });
      if (result.error) {
        setError(result.error.message || "Stripe card setup failed.");
        return;
      }
      await complete.mutateAsync({
        authorization_id: active.authorization.id,
        setup_intent_id: setupIntent.setup_intent_id,
        typed_name: typedName,
        esign_consent: esignConsent,
        payment_terms_consent: paymentConsent,
        signature_data_url: signatureDataUrl(paths, typedName),
        billing,
        device_metadata: { platform: Platform.OS, flow: "mobile_credit_gate" },
      });
      await status.refetch();
      onComplete?.();
    } catch (err) {
      setError(readErrorMessage(err));
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: t.ink4, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>
          Credit & Pre-Authorization
        </Text>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 }}>
          E-sign first, then billing
        </Text>
        <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20 }}>
          Credit pulls and credit-derived terms unlock after you sign the authorization,
          save a card securely through Stripe, and complete the credit consent.
        </Text>
      </View>

      {!started && step === "esign" ? (
        <Card pad={18} style={{ gap: 12 }}>
          <SectionLabel>E-sign authorization</SectionLabel>
          <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 20 }}>
            Loading the authorization terms before we collect any credit information.
          </Text>
          {error ? (
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>{error}</Text>
          ) : null}
          <QButton label={start.isPending ? "Loading…" : "Retry"} onPress={begin} disabled={start.isPending} />
        </Card>
      ) : null}

      {started && step === "esign" ? (
        <>
          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Authorization terms</SectionLabel>
            <Text style={{ color: t.ink3, fontSize: 12, lineHeight: 18 }}>
              {started.document.text}
            </Text>
            <ConsentRow label="I consent to electronic records and signatures under E-SIGN/UETA." value={esignConsent} onPress={() => setEsignConsent((v) => !v)} />
            <ConsentRow label="I authorize QC - Qualified Commercial LLC to keep this payment method on file for approved funding-file expenses." value={paymentConsent} onPress={() => setPaymentConsent((v) => !v)} />
          </Card>

          <Card pad={18} style={{ gap: 8 }}>
            <SectionLabel>Secure payment handling</SectionLabel>
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19 }}>
              Qualified Commercial does not store raw card numbers, CVC, or sensitive card
              data. Card details are collected and tokenized by Stripe. We store only Stripe
              references, card brand, last four, expiration, billing snapshot, and audit records.
            </Text>
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19 }}>
              Future approved funding-file expenses may include soft pulls, hard pulls,
              inspections, appraisals, vendor hard costs, and third-party services. Charges
              appear as QC - Qualified Commercial LLC. You agree not to dispute or charge
              back properly authorized expenses that were incurred for your file, including
              third-party costs, even if the loan does not close.
            </Text>
          </Card>

          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Signer</SectionLabel>
            <Field label="Legal name" value={typedName} onChangeText={setTypedName} placeholder="Full legal name" />
            <Text style={{ color: t.ink4, fontSize: 12, fontWeight: "700" }}>Draw signature</Text>
            <View
              {...signatureResponder.panHandlers}
              collapsable={false}
              style={{ height: 150, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: isDark ? "#080A10" : "#F8FAFC", overflow: "hidden" }}
            >
              <Svg width="100%" height="100%" pointerEvents="none">
                {paths.map((path, index) => (
                  <Path key={`${index}-${path.length}`} d={path} stroke={t.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </Svg>
            </View>
            <QButton label="Clear signature" variant="secondary" onPress={() => setPaths([])} />
          </Card>

          {error ? (
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>{error}</Text>
          ) : null}
          <QButton label="Continue to billing" onPress={continueToBilling} disabled={start.isPending} />
        </>
      ) : null}

      {started && step === "billing" ? (
        <>
          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Billing address</SectionLabel>
            <Field label="Billing name" value={billing.name} onChangeText={(v) => setBilling((p) => ({ ...p, name: v }))} />
            <Field label="Email" value={billing.email ?? ""} onChangeText={(v) => setBilling((p) => ({ ...p, email: v }))} keyboardType="email-address" />
            <GoogleAddressInput
              value={billingToAddressParts(billing)}
              onChange={(next) => setBilling((p) => applyAddressToBilling(p, next))}
              label="Billing address"
              helperText="Start typing and select the Google result. Use manual entry only if the address is not listed."
            />
            <Field label="Unit optional" value={billing.line2 ?? ""} onChangeText={(v) => setBilling((p) => ({ ...p, line2: v }))} />
          </Card>

          {error ? (
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>{error}</Text>
          ) : null}
          <QButton
            label={setup.isPending ? "Preparing secure card…" : "Continue to secure card"}
            onPress={continueToCard}
            disabled={setup.isPending}
          />
          <QButton label="Back to e-sign" variant="secondary" onPress={() => setStep("esign")} />
        </>
      ) : null}

      {started && step === "card" ? (
        <>
          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Secure card</SectionLabel>
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19 }}>
              Card details are collected by Stripe. Qualified Commercial stores only Stripe
              references, card brand, last four, expiration, and the billing snapshot.
            </Text>
            {publishableKey && setupIntent ? (
              <CardField
                postalCodeEnabled={false}
                onCardChange={(card) => setCardComplete(Boolean(card.complete))}
                cardStyle={{ backgroundColor: isDark ? "#0B0D14" : "#FFFFFF", textColor: t.ink, placeholderColor: t.ink4 }}
                style={{ height: 52, marginVertical: 6 }}
              />
            ) : (
              <Text style={{ color: t.ink3, fontSize: 13, fontWeight: "700" }}>Preparing secure Stripe card entry…</Text>
            )}
          </Card>

          {error ? (
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>{error}</Text>
          ) : null}
          <QButton label="Complete Credit & Pre-Authorization" onPress={submit} disabled={setup.isPending || complete.isPending || start.isPending} />
          <QButton label="Back to billing" variant="secondary" onPress={() => setStep("billing")} />
        </>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "number-pad";
}) {
  const { t } = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: t.ink4, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.ink4}
        keyboardType={keyboardType}
        style={{ borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2, color: t.ink, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 }}
      />
    </View>
  );
}

function ConsentRow({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: value ? t.petrol : t.lineStrong, backgroundColor: value ? t.petrol : "transparent", alignItems: "center", justifyContent: "center" }}>
        {value ? <Text style={{ color: "#06110E", fontWeight: "900" }}>✓</Text> : null}
      </View>
      <Text style={{ color: t.ink2, flex: 1, fontSize: 13, lineHeight: 19 }}>{label}</Text>
    </Pressable>
  );
}

function signatureDataUrl(paths: string[], typedName: string): string {
  const payload = JSON.stringify({
    kind: "vector_signature",
    typed_name: typedName,
    signed_at: new Date().toISOString(),
    paths,
  });
  return `data:application/json;base64,${base64EncodeUtf8(payload)}`;
}

function base64EncodeUtf8(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      i += 1;
      const pair = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (pair >> 18), 0x80 | ((pair >> 12) & 0x3f), 0x80 | ((pair >> 6) & 0x3f), 0x80 | (pair & 0x3f));
    }
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : chars[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : chars[c & 63];
  }
  return out;
}

function readErrorMessage(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return err instanceof Error ? err.message : "Authorization failed. Please retry.";
}
