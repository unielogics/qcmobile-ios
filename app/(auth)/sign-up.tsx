import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSignUp } from "@clerk/clerk-expo";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, QButton, SectionLabel } from "@/design-system/primitives";

export default function SignUpScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const [stage, setStage] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startSignUp = async () => {
    if (!isLoaded) return;
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStage("verify");
    } catch (e: unknown) {
      setError(toMessage(e));
    }
  };

  const verify = async () => {
    if (!isLoaded) return;
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/(tabs)");
      } else {
        setError(`Verification incomplete: ${attempt.status}`);
      }
    } catch (e: unknown) {
      setError(toMessage(e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16, justifyContent: "center" }}>
      <Card pad={20}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, marginBottom: 16 }}>
          {stage === "form" ? "Create your account" : "Verify your email"}
        </Text>

        {stage === "form" && (
          <>
            <SectionLabel>Email</SectionLabel>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
              placeholder="you@example.com" placeholderTextColor={t.ink4}
              style={fieldStyle(t)} />
            <SectionLabel>Password</SectionLabel>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry
              placeholder="••••••••" placeholderTextColor={t.ink4}
              style={fieldStyle(t)} />
            {error && <Err msg={error} t={t} />}
            <QButton label="Send verification code" onPress={startSignUp} />
          </>
        )}

        {stage === "verify" && (
          <>
            <Text style={{ fontSize: 13, color: t.ink3, marginBottom: 12 }}>
              We sent a code to {email}. Paste it below.
            </Text>
            <SectionLabel>Verification code</SectionLabel>
            <TextInput value={code} onChangeText={setCode} keyboardType="number-pad"
              placeholder="123456" placeholderTextColor={t.ink4}
              style={fieldStyle(t)} />
            {error && <Err msg={error} t={t} />}
            <QButton label="Verify & sign in" onPress={verify} />
          </>
        )}

        <Pressable onPress={() => router.push("/(auth)/sign-in")} style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={{ color: t.brand, fontSize: 13, fontWeight: "700" }}>Back to sign in</Text>
        </Pressable>
      </Card>
    </SafeAreaView>
  );
}

function fieldStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1,
    borderRadius: 10, padding: 12, fontSize: 14, color: t.ink, marginBottom: 12,
  };
}

function Err({ msg, t }: { msg: string; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <View style={{ padding: 10, borderRadius: 8, backgroundColor: t.dangerBg, marginBottom: 12 }}>
      <Text style={{ color: t.danger, fontSize: 12 }}>{msg}</Text>
    </View>
  );
}

function toMessage(e: unknown): string {
  if (e && typeof e === "object" && "errors" in e) {
    return String((e as { errors: { message: string }[] }).errors[0]?.message ?? e);
  }
  return String(e);
}
