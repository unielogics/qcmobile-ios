// `usePauseBanner(loanId)` — single read-side for "is the AI
// paused on this loan?". Phase 4 wires it to the real loan
// workspace query. Until then it returns isPaused=false constants
// so screens can render the <PauseBanner> slot without crashing.
//
// We import the workspace hook lazily-via-default so the module
// works even before useApi.ts gains useLoanWorkspace — once that
// hook exists, the import below resolves to the real query.

import { useLoanWorkspace } from "./useApi";
import type { DealChatRole } from "@/lib/mocks/loanChat";

export interface PauseBannerState {
  isPaused: boolean;
  pausedBy: DealChatRole | null;
  pausedUntilIso: string | null;
  minutesRemaining: number;
}

export function usePauseBanner(loanId: string | null | undefined): PauseBannerState {
  const ws = useLoanWorkspace(loanId);
  const data = ws.data;
  if (!data || !data.ai_paused_until) {
    return { isPaused: false, pausedBy: null, pausedUntilIso: null, minutesRemaining: 0 };
  }
  const until = new Date(data.ai_paused_until).getTime();
  const now = Date.now();
  if (until <= now) {
    return { isPaused: false, pausedBy: null, pausedUntilIso: null, minutesRemaining: 0 };
  }
  return {
    isPaused: true,
    pausedBy: data.ai_paused_by ?? null,
    pausedUntilIso: data.ai_paused_until,
    minutesRemaining: Math.max(1, Math.round((until - now) / 60000)),
  };
}
