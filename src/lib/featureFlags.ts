// Mirror of QCDashboard's NEXT_PUBLIC_BACKEND_HAS_* flag pattern.
// Use `hasBackend(flag)` to gate hooks whose backend endpoint
// hasn't shipped yet, falling back to the mock layer under
// `src/lib/mocks/`. When the flag flips on in EAS / dev .env, the
// real fetch path runs.
//
// Flags are EXPO_PUBLIC_* so they're inlined at build time by
// Expo's metro config. Set them in EAS env or `.env.local`.

const FLAGS = {
  BACKEND_HAS_FUNDING_METRICS: process.env.EXPO_PUBLIC_BACKEND_HAS_FUNDING_METRICS,
  BACKEND_HAS_DEAL_SECRETARY: process.env.EXPO_PUBLIC_BACKEND_HAS_DEAL_SECRETARY,
  BACKEND_HAS_REASSIGN: process.env.EXPO_PUBLIC_BACKEND_HAS_REASSIGN,
  BACKEND_HAS_CONDITIONS: process.env.EXPO_PUBLIC_BACKEND_HAS_CONDITIONS,
  BACKEND_HAS_HUD: process.env.EXPO_PUBLIC_BACKEND_HAS_HUD,
  BACKEND_HAS_LENDER_THREAD: process.env.EXPO_PUBLIC_BACKEND_HAS_LENDER_THREAD,
  BACKEND_HAS_CREDIT_PARSED: process.env.EXPO_PUBLIC_BACKEND_HAS_CREDIT_PARSED,
  BACKEND_HAS_CLIENT_VAULT: process.env.EXPO_PUBLIC_BACKEND_HAS_CLIENT_VAULT,
  BACKEND_HAS_AI_SECRETARY: process.env.EXPO_PUBLIC_BACKEND_HAS_AI_SECRETARY,
  BACKEND_HAS_EXPERIENCE_MODE: process.env.EXPO_PUBLIC_BACKEND_HAS_EXPERIENCE_MODE,
  BACKEND_HAS_LIVE_CHAT: process.env.EXPO_PUBLIC_BACKEND_HAS_LIVE_CHAT,
  BACKEND_HAS_LOAN_WORKSPACE: process.env.EXPO_PUBLIC_BACKEND_HAS_LOAN_WORKSPACE,
  BACKEND_HAS_LOAN_CRITERIA: process.env.EXPO_PUBLIC_BACKEND_HAS_LOAN_CRITERIA,
  // (A) Agent deal-chat — multi-party broker + client + AI thread per
  // Deal. Backed by the qcbackend patch under /tmp/qcbackend-patch.
  // Until the patch is applied + container redeployed, leave this OFF
  // so AIChatSheet keeps falling back to per-user ai_chat_threads.
  BACKEND_HAS_DEAL_CHAT: process.env.EXPO_PUBLIC_BACKEND_HAS_DEAL_CHAT,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

// "true" / "1" / "yes" → on. Anything else (undefined, empty, "0",
// "false") → off. Defaulting OFF keeps dev / preview builds quiet
// while a backend endpoint is being plumbed.
export function hasBackend(flag: FeatureFlag): boolean {
  const v = FLAGS[flag];
  if (!v) return false;
  const norm = String(v).toLowerCase();
  return norm === "true" || norm === "1" || norm === "yes";
}
