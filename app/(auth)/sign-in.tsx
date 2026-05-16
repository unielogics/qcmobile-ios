import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, useSignIn } from "@clerk/clerk-expo";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, QButton, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";

type Stage = "credentials" | "two-factor";
type SecondStrategy = "totp" | "phone_code" | "email_code" | "backup_code";

const STRATEGY_LABEL: Record<SecondStrategy, string> = {
  totp: "Authenticator app",
  phone_code: "Text message",
  email_code: "Email code",
  backup_code: "Backup code",
};

export default function SignInScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn, signOut } = useAuth();
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [strategy, setStrategy] = useState<SecondStrategy | null>(null);
  const [strategyHint, setStrategyHint] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Reveal toggle for the password field — tap the eye glyph to flip
  // `secureTextEntry`. Starts hidden; resets to hidden after any
  // re-mount of this screen (no need to persist).
  const [showPassword, setShowPassword] = useState(false);

  // If a session is already alive (cached in secure-store), bounce to the app.
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, router]);

  function describeError(e: unknown): string {
    if (e && typeof e === "object" && "errors" in e) {
      const arr = (e as { errors?: { message?: string; longMessage?: string }[] }).errors;
      const first = arr?.[0];
      if (first) return first.longMessage ?? first.message ?? String(e);
    }
    return String(e);
  }

  const submitCredentials = async () => {
    if (!isLoaded) {
      setError("Clerk SDK not loaded yet — wait a moment then try again.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      if (attempt.status === "needs_second_factor") {
        const factors = attempt.supportedSecondFactors ?? [];
        // Prefer TOTP (no extra round-trip), then phone, then email, then backup code.
        const totp = factors.find((f) => f.strategy === "totp");
        const phone = factors.find((f) => f.strategy === "phone_code");
        const emailCode = factors.find((f) => f.strategy === "email_code");
        const backup = factors.find((f) => f.strategy === "backup_code");

        if (totp) {
          setStrategy("totp");
          setStrategyHint("Open your authenticator app and enter the 6-digit code.");
        } else if (phone) {
          await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: phone.phoneNumberId });
          setStrategy("phone_code");
          setStrategyHint(`Enter the code we just sent to ${phone.safeIdentifier ?? "your phone"}.`);
        } else if (emailCode) {
          await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: emailCode.emailAddressId });
          setStrategy("email_code");
          setStrategyHint(`Enter the code we just sent to ${emailCode.safeIdentifier ?? "your email"}.`);
        } else if (backup) {
          setStrategy("backup_code");
          setStrategyHint("Enter one of your saved backup codes.");
        } else {
          setError(`No supported 2FA strategy available. Options: ${factors.map((f) => f.strategy).join(", ") || "none"}`);
          return;
        }
        setStage("two-factor");
        return;
      }
      setError(`Sign-in incomplete: ${attempt.status}`);
    } catch (e: unknown) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitSecondFactor = async () => {
    if (!isLoaded || !strategy) return;
    if (!code.trim()) {
      setError("Enter the verification code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const attempt = await signIn.attemptSecondFactor({ strategy, code: code.trim() } as Parameters<typeof signIn.attemptSecondFactor>[0]);
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      setError(`Sign-in incomplete: ${attempt.status}`);
    } catch (e: unknown) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setStage("credentials");
    setStrategy(null);
    setStrategyHint(null);
    setCode("");
    setError(null);
  };

  // If still rendering this screen while Clerk has an active session,
  // give the user explicit controls (auto-redirect runs from the effect above).
  if (isSignedIn) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16, justifyContent: "center" }}>
        <Card pad={20}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, marginBottom: 4 }}>Already signed in</Text>
          <Text style={{ fontSize: 13, color: t.ink3, marginBottom: 20 }}>
            Your previous session is still active. Continue to the app, or sign out and start fresh.
          </Text>
          <View style={{ gap: 10 }}>
            <QButton label="Continue to app" onPress={() => router.replace("/(tabs)")} />
            <QButton
              label="Sign out"
              variant="ghost"
              onPress={async () => {
                try {
                  await signOut();
                } catch {
                  // ignore — even if it fails, the screen will show error UI on next attempt
                }
              }}
            />
          </View>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* KeyboardAvoidingView pushes the form up when the soft keyboard
          opens so the password input + button never get hidden. iOS
          uses padding, Android uses height — these are the
          documented behaviors that actually work in each runtime.
          Wrapped ScrollView makes the form scrollable on tiny screens
          and `keyboardShouldPersistTaps="handled"` keeps the eye-toggle
          tappable even while the keyboard is up. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 16, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card pad={20}>
            {stage === "credentials" ? (
              <>
                <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, marginBottom: 4 }}>Welcome back</Text>
                <Text style={{ fontSize: 13, color: t.ink3, marginBottom: 20 }}>Sign in to Qualified Commercial.</Text>

                <SectionLabel>Email</SectionLabel>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={t.ink4}
                  style={{ backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, color: t.ink, marginBottom: 12 }}
                />

                <SectionLabel>Password</SectionLabel>
                {/* Wrapper holds the input + an absolutely-positioned
                    eye glyph that toggles `secureTextEntry`. Right
                    padding reserved on the input so the typed value
                    never collides with the icon. */}
                <View style={{ position: "relative", marginBottom: 16 }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder="••••••••"
                    placeholderTextColor={t.ink4}
                    style={{ backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingLeft: 12, paddingRight: 44, fontSize: 14, color: t.ink }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      position: "absolute",
                      right: 4,
                      top: 0,
                      bottom: 0,
                      width: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.55 : 1,
                    })}
                  >
                    <Icon name={showPassword ? "eyeOff" : "eye"} size={18} color={t.ink3} />
                  </Pressable>
                </View>

            {error && (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: t.dangerBg, marginBottom: 12 }}>
                <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
              </View>
            )}

            {!isLoaded && (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: t.warnBg, marginBottom: 12 }}>
                <Text style={{ color: t.warn, fontSize: 12 }}>Clerk SDK still loading… (button is disabled)</Text>
              </View>
            )}

            <QButton label={!isLoaded ? "Loading…" : loading ? "Signing in…" : "Sign in"} onPress={submitCredentials} />

            <Pressable onPress={() => router.push("/(auth)/sign-up")} style={{ marginTop: 16, alignItems: "center" }}>
              <Text style={{ color: t.brand, fontSize: 13, fontWeight: "700" }}>
                New here? Create an account
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink, marginBottom: 4 }}>Two-factor verification</Text>
            <Text style={{ fontSize: 13, color: t.ink3, marginBottom: 16 }}>
              {strategy ? STRATEGY_LABEL[strategy] : ""}
              {strategyHint ? `\n${strategyHint}` : ""}
            </Text>

            <SectionLabel>Verification code</SectionLabel>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType={strategy === "backup_code" ? "default" : "number-pad"}
              autoCapitalize="none"
              autoComplete={strategy === "totp" ? "one-time-code" : "off"}
              placeholder={strategy === "backup_code" ? "xxxx-xxxx" : "123456"}
              placeholderTextColor={t.ink4}
              style={{ backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 4, fontWeight: "700", color: t.ink, marginBottom: 16, textAlign: "center" }}
            />

            {error && (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: t.dangerBg, marginBottom: 12 }}>
                <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
              </View>
            )}

            <QButton label={loading ? "Verifying…" : "Verify"} onPress={submitSecondFactor} />

            <Pressable onPress={backToCredentials} style={{ marginTop: 16, alignItems: "center" }}>
              <Text style={{ color: t.brand, fontSize: 13, fontWeight: "700" }}>← Back to sign in</Text>
            </Pressable>
          </>
        )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
