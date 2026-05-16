import { useState, useEffect } from "react";
import { AppState, LogBox, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useCurrentUser } from "@/hooks/useApi";
import { AIChatSheet } from "@/components/sheets/AIChatSheet";
import { useConcierge } from "@/store/concierge";
import {
  usePushRegistration,
  useRegisterPushToken,
  usePushTapHandler,
} from "@/lib/notifications";

// Dev-client race: expo-dev-launcher calls activateKeepAwake during
// cold launch before MainActivity is registered with the Expo
// activity provider, so the first call throws
// CurrentActivityNotFoundException → LogBox red-screens it on every
// boot. Production builds don't hit this. Suppress only this exact
// message so other warnings still surface.
LogBox.ignoreLogs([/Unable to activate keep awake/]);

// React Query's `refetchOnWindowFocus` does nothing in React Native unless
// focusManager is told what counts as "focus". Hook it up to AppState so
// foregrounding the app re-validates queries — this is what makes a freshly
// demoted user (e.g. via demote_to_client.py) stop seeing super-admin chrome
// the next time they reopen the app instead of waiting for staleTime.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
    handleFocus(status === "active");
  });
  return () => sub.remove();
});

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  // Loud at boot — silent failure leaves users stuck on a blank screen.
  throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add it to .env.");
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Role drives the post-sign-in destination: brokers land on the agent
  // experience, everyone else (clients + operators) lands on the borrower
  // tabs. We hold the redirect until /auth/me resolves so we don't flash
  // the wrong group.
  const { data: user } = useCurrentUser();

  // Kick off push-notification registration on first mount. Permission
  // prompt fires once; the resulting Expo push token is registered with
  // the backend via `useRegisterPushToken` so AI chat messages can fire
  // pushes. `usePushTapHandler` wires notification taps to deep-link
  // into the right loan thread.
  const push = usePushRegistration();
  useRegisterPushToken(push);
  usePushTapHandler();

  useEffect(() => {
    if (!isLoaded) return;
    const top = segments[0];
    const inAuthGroup = top === "(auth)";
    const inTabsGroup = top === "(tabs)";
    const inAgentGroup = top === "agent";

    if (!isSignedIn) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }
    // Signed in. Wait for /auth/me before picking a leg, otherwise we
    // flash the wrong group on cold-start.
    if (!user) return;

    if (user.role === "broker") {
      if (inAuthGroup || inTabsGroup) router.replace("/agent/today");
    } else {
      if (inAuthGroup || inAgentGroup) router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, segments, router, user]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agent" />
        <Stack.Screen name="loan/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="pipeline" options={{ presentation: "card" }} />
        <Stack.Screen name="credit-pull" options={{ presentation: "modal" }} />
      </Stack>
      {/* One globally-mounted AI Concierge, opened from the TopBar
          icon via the concierge store. Lives here so it overlays
          every screen regardless of the active navigator. */}
      {isSignedIn ? <ConciergeHost /> : null}
    </>
  );
}

function ConciergeHost() {
  const open = useConcierge((s) => s.open);
  const close = useConcierge((s) => s.closeConcierge);
  return <AIChatSheet visible={open} onClose={close} context="Concierge" />;
}

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  return (
    // GestureHandlerRootView is required by react-native-gesture-handler
    // for the Swipeable on the AI Secretary screen to receive gestures.
    // SafeAreaProvider ensures useSafeAreaInsets() returns real values
    // everywhere (Android edge-to-edge fix).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <QueryClientProvider client={qc}>
            <ThemeProvider>
              <AuthGate />
            </ThemeProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
