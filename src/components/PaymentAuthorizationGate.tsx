import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CardField, confirmSetupIntent, initStripe } from "@stripe/stripe-react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, QButton, SectionLabel } from "@/design-system/primitives";
import {
  useCompletePaymentAuthorization,
  useCreateSetupIntent,
  useCurrentUser,
  useMyClient,
  usePaymentAuthorizationStatus,
  useStartPaymentAuthorization,
} from "@/hooks/useApi";
import type { BillingAddress, PaymentAuthorizationStartResponse } from "@/lib/types";

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

export function PaymentAuthorizationGate({ onComplete }: { onComplete?: () => void } = {}) {
  const { t, isDark } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: client } = useMyClient();
  const status = usePaymentAuthorizationStatus();
  const start = useStartPaymentAuthorization();
  const setup = useCreateSetupIntent();
  const complete = useCompletePaymentAuthorization();
  const [started, setStarted] = useState<PaymentAuthorizationStartResponse | null>(null);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [paymentConsent, setPaymentConsent] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef("");
  const [error, setError] = useState<string | null>(null);

  const publishableKey = status.data?.stripe_publishable_key;
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
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          currentPath.current = `M ${Math.round(locationX)} ${Math.round(locationY)}`;
          setPaths((prev) => [...prev, currentPath.current]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          currentPath.current += ` L ${Math.round(locationX)} ${Math.round(locationY)}`;
          setPaths((prev) => [...prev.slice(0, -1), currentPath.current]);
        },
      }),
    [],
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

  const submit = async () => {
    setError(null);
    const active = started ?? (await start.mutateAsync());
    if (!started) setStarted(active);
    if (!publishableKey && !status.data?.stripe_publishable_key) {
      setError("Stripe is not configured yet. Contact Qualified Commercial.");
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
      const setupIntent = await setup.mutateAsync({
        authorization_id: active.authorization.id,
        billing,
      });
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
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 14 }}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: t.ink4, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>
          Credit access
        </Text>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 }}>
          Payment authorization required
        </Text>
        <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20 }}>
          The app is available now. Credit pulls and credit-derived terms unlock after you sign the authorization and save a card securely through Stripe.
        </Text>
      </View>

      {!started ? (
        <Card pad={18} style={{ gap: 12 }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>What this covers</Text>
          <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 20 }}>
            Expenses can include soft pulls, hard pulls, inspections, appraisals, vendor hard costs, and third-party services needed to build your funding file. Charges appear as QC - Qualified Commercial LLC and require approval before billing.
          </Text>
          <QButton label="Begin authorization" onPress={begin} disabled={start.isPending} />
        </Card>
      ) : (
        <>
          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Authorization terms</SectionLabel>
            <Text style={{ color: t.ink3, fontSize: 12, lineHeight: 18 }} numberOfLines={8}>
              {started.document.text}
            </Text>
            <ConsentRow label="I consent to electronic records and signatures under E-SIGN/UETA." value={esignConsent} onPress={() => setEsignConsent((v) => !v)} />
            <ConsentRow label="I authorize QC - Qualified Commercial LLC to keep this payment method on file for approved funding-file expenses." value={paymentConsent} onPress={() => setPaymentConsent((v) => !v)} />
          </Card>

          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Signer</SectionLabel>
            <Field label="Legal name" value={typedName} onChangeText={setTypedName} placeholder="Full legal name" />
            <Text style={{ color: t.ink4, fontSize: 12, fontWeight: "700" }}>Draw signature</Text>
            <View
              {...signatureResponder.panHandlers}
              style={{ height: 150, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: isDark ? "#080A10" : "#F8FAFC", overflow: "hidden" }}
            >
              <Svg width="100%" height="100%">
                {paths.map((path, index) => (
                  <Path key={`${index}-${path.length}`} d={path} stroke={t.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </Svg>
            </View>
            <QButton label="Clear signature" variant="secondary" onPress={() => setPaths([])} />
          </Card>

          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Billing address</SectionLabel>
            <Field label="Billing name" value={billing.name} onChangeText={(v) => setBilling((p) => ({ ...p, name: v }))} />
            <Field label="Email" value={billing.email ?? ""} onChangeText={(v) => setBilling((p) => ({ ...p, email: v }))} keyboardType="email-address" />
            <Field label="Address" value={billing.line1} onChangeText={(v) => setBilling((p) => ({ ...p, line1: v }))} />
            <Field label="Unit optional" value={billing.line2 ?? ""} onChangeText={(v) => setBilling((p) => ({ ...p, line2: v }))} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="City" value={billing.city} onChangeText={(v) => setBilling((p) => ({ ...p, city: v }))} /></View>
              <View style={{ width: 86 }}><Field label="State" value={billing.state} onChangeText={(v) => setBilling((p) => ({ ...p, state: v.toUpperCase().slice(0, 2) }))} /></View>
            </View>
            <Field label="ZIP" value={billing.postal_code} onChangeText={(v) => setBilling((p) => ({ ...p, postal_code: v }))} keyboardType="number-pad" />
          </Card>

          <Card pad={18} style={{ gap: 10 }}>
            <SectionLabel>Secure card</SectionLabel>
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 19 }}>
              Card details are collected by Stripe. Qualified Commercial stores only the token, brand, last four, expiration, and billing snapshot.
            </Text>
            {publishableKey ? (
              <CardField
                postalCodeEnabled={false}
                onCardChange={(card) => setCardComplete(Boolean(card.complete))}
                cardStyle={{ backgroundColor: isDark ? "#0B0D14" : "#FFFFFF", textColor: t.ink, placeholderColor: t.ink4 }}
                style={{ height: 52, marginVertical: 6 }}
              />
            ) : (
              <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700" }}>Stripe is not configured yet.</Text>
            )}
          </Card>

          {error ? (
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>{error}</Text>
          ) : null}
          <QButton label="Complete authorization" onPress={submit} disabled={setup.isPending || complete.isPending || start.isPending} />
        </>
      )}
    </ScrollView>
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
        <Text style={{ color: value ? "#06110E" : "transparent", fontWeight: "900" }}>✓</Text>
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
