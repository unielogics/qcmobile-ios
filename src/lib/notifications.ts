// Push notifications setup for Android (and iOS, when we ship it).
//
// On first launch we:
//   1. Set up the Android `default` notification channel (required for
//      Android 8+ — without it, system trays mute every push silently)
//   2. Ask the user for POST_NOTIFICATIONS permission (Android 13+)
//   3. Fetch the Expo push token (FCM under the hood) and surface it via
//      the returned hook so the Profile screen can render diagnostics +
//      a future POST /devices/push-tokens call can register it server-side
//
// We also configure a foreground handler so notifications received while
// the app is open render as banners + play sound (default Expo behavior
// hides them otherwise).
//
// This file is safe to import on iOS too — Device.isDevice / Platform
// guards keep the Android-specific calls from firing.

import { useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

// Foreground notification behavior — show the banner + play the sound
// even when the app is open. Without this, foreground pushes are
// dropped silently on iOS and queued-but-invisible on Android.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface PushRegistrationState {
  /** Native push token. null while in flight or denied. */
  token: string | null;
  /** Where the token came from — "expo" (via Expo Push Service) or
   *  "device" (raw FCM/APNs). null when token is null. */
  provider: "expo" | "device" | null;
  /** "undetermined" before we ask, then "granted" / "denied". */
  status: Notifications.PermissionStatus | null;
  /** True on simulators / emulators where push isn't available. */
  unsupported: boolean;
  /** Last error message, surfaced for debugging. */
  error: string | null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0B1D3A",
    sound: "default",
    enableVibrate: true,
    enableLights: true,
  });
}

async function requestPermission(): Promise<Notifications.PermissionStatus> {
  // Check the existing status first to avoid the "request again on every
  // launch" anti-pattern. The OS denies subsequent prompts after the
  // user has already explicitly answered once.
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return existing.status;
  if (existing.status === "denied" && !existing.canAskAgain) return existing.status;
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return next.status;
}

// We try the Expo push token first (via Expo Push Service), but it
// requires a configured EAS projectId. If we don't have one yet, fall
// back to the raw native token (FCM on Android, APNs on iOS). Either
// works — backends just need to know which provider to send via.
async function fetchToken(): Promise<{ token: string; provider: "expo" | "device" } | null> {
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (projectId) {
    try {
      const r = await Notifications.getExpoPushTokenAsync({ projectId });
      return { token: r.data, provider: "expo" };
    } catch {
      // fall through to device token
    }
  }
  try {
    const r = await Notifications.getDevicePushTokenAsync();
    if (typeof r.data === "string") return { token: r.data, provider: "device" };
    // iOS APNs returns { type: 'apns', data: <hex string> }; some shapes
    // wrap data in an object — coerce to string for storage.
    return { token: JSON.stringify(r.data), provider: "device" };
  } catch {
    return null;
  }
}

// Caller-facing helper to bounce the user to the OS notification
// settings page for our app. Useful from the Profile row when permission
// is denied or the borrower wants to tweak channels.
export async function openSystemNotificationSettings(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Linking.openSettings();
    } else {
      await Linking.openURL("app-settings:");
    }
  } catch {
    // best-effort — no-op if the OS rejects the deep link
  }
}

// Registers the Expo push token with the backend (POST
// /devices/push-tokens) once the borrower is signed in and the
// permission flow has produced a token. Idempotent on the server
// side — calling again with the same token just refreshes the row.
//
// Errors are swallowed; a failed register doesn't block the app and
// the next reopen will retry. We re-fire when the token rotates
// (Expo sometimes regenerates) or when the user signs in.
export function useRegisterPushToken(state: PushRegistrationState): void {
  const { isSignedIn } = useAuth();
  const fetcher = useAuthedFetch();
  useEffect(() => {
    if (!isSignedIn || !state.token) return;
    let cancelled = false;
    (async () => {
      try {
        await fetcher("/devices/push-tokens", {
          method: "POST",
          body: JSON.stringify({
            token: state.token,
            platform: state.provider ?? "expo",
          }),
        });
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.log("[push] token registered with backend");
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[push] register failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, state.token, state.provider, fetcher]);
}

// Listens for tap-on-notification events and routes the user into
// the right loan thread. Notifications carry
// `data: { kind, thread_id?, loan_id? }` from the backend
// (see app/services/push.py + loan_workspace._notify_client).
//
// Two launch modes both need to deep-link:
//   - Warm: app already running → `addNotificationResponseReceivedListener`
//   - Cold: app killed, user taps push → `getLastNotificationResponseAsync()`
//     surfaces the response that started the process. We poll it on mount
//     (gated by a ref so re-mounts don't re-route).
//
// Role matters: brokers live at /agent/loan/[id] (chat tab id = "messages"),
// clients at /loan/[id] (chat tab id = "chat"). Same payload, different
// destination.
export function usePushTapHandler(): void {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const coldHandled = useRef(false);

  const routeFromData = (
    data: { kind?: string; thread_id?: string; loan_id?: string | null; deal_id?: string | null } | undefined,
  ) => {
    if (!data) return;
    const isOperator = me?.role === Role.BROKER || me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
    // (L) Loan workspace message — the funding-team thread, multi-party.
    if (data.kind === "loan_chat_message" && data.loan_id) {
      if (isOperator) {
        router.push({
          pathname: "/agent/loan/[id]",
          params: { id: data.loan_id, tab: "messages" },
        });
      } else {
        router.push({
          pathname: "/loan/[id]",
          params: { id: data.loan_id, tab: "chat" },
        });
      }
      return;
    }
    // (A) Agent deal-chat message — pre-funding (and ongoing) nurture
    // thread, also multi-party. Brokers land on the deal page; clients
    // don't have a dedicated deal-detail page yet so they fall back to
    // their home (the AI Concierge picker covers it).
    if (data.kind === "deal_chat_message" && data.deal_id) {
      if (isOperator) {
        router.push({
          pathname: "/agent/deal/[id]",
          params: { id: data.deal_id, tab: "chat" },
        });
      } else {
        router.push({ pathname: "/(tabs)" });
      }
      return;
    }
    // Legacy: ai_chat_message pushes from the per-user AI thread system
    // still deep-link into the AIChatSheet via the dashboard tab's
    // `openThread` param.
    if (data.kind === "ai_chat_message" && data.thread_id) {
      router.push({
        pathname: "/(tabs)",
        params: { openThread: data.thread_id },
      });
    }
  };

  useEffect(() => {
    // Cold launch — replay the response that started the process.
    // Wait until `me` resolves so role-aware routing picks the right path.
    if (!coldHandled.current && me) {
      coldHandled.current = true;
      Notifications.getLastNotificationResponseAsync().then((resp: Notifications.NotificationResponse | null) => {
        try {
          routeFromData(resp?.notification?.request?.content?.data as any);
        } catch {
          // best-effort
        }
      });
    }
    // Warm launch — fires on every subsequent tap while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener((resp: Notifications.NotificationResponse) => {
      try {
        routeFromData(resp?.notification?.request?.content?.data as any);
      } catch {
        // best-effort
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, me?.role]);
}

export function usePushRegistration(): PushRegistrationState {
  const [state, setState] = useState<PushRegistrationState>({
    token: null,
    provider: null,
    status: null,
    unsupported: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!Device.isDevice) {
          if (!cancelled) {
            setState({ token: null, provider: null, status: null, unsupported: true, error: null });
          }
          return;
        }
        await ensureAndroidChannel();
        const status = await requestPermission();
        if (cancelled) return;
        if (status !== "granted") {
          setState({ token: null, provider: null, status, unsupported: false, error: null });
          return;
        }
        const result = await fetchToken();
        if (cancelled) return;
        if (result) {
          setState({ token: result.token, provider: result.provider, status, unsupported: false, error: null });
        } else {
          // Permission is granted but the token-fetch path was unavailable
          // (no EAS projectId AND FCM not configured). Treat as success-
          // partial: the OS will still show local notifications, but
          // remote push won't reach this device until the projectId or
          // google-services.json is set up.
          setState({ token: null, provider: null, status, unsupported: false, error: null });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, error: message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
