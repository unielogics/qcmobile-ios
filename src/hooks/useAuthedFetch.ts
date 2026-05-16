import { useAuth } from "@clerk/clerk-expo";
import { useCallback } from "react";
import { api, type ApiOptions } from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * Authenticated fetch wrapper. Mirrors qcdesktop/src/hooks/useApi.ts
 * `useAuthedApi` so both apps speak to the backend the same way.
 *
 * - Auth-readiness gate: while Clerk is still loading we return a never-
 *   resolving promise so React Query stays in `pending`. Without this gate
 *   the first wave of queries fires before getToken() is wired and every
 *   one 401s.
 * - Headers: send BOTH the Clerk Bearer token AND the X-Dev-User header
 *   on every request. The backend ignores X-Dev-User whenever Clerk auth
 *   verifies, but keeping it as a fallback lets local-dev flows work
 *   without a Clerk key.
 */
export function useAuthedFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const devUser = useSession((s) => s.devUser);

  return useCallback(
    async <T>(path: string, opts: Omit<ApiOptions, "authToken" | "devUser"> = {}): Promise<T> => {
      if (!isLoaded) {
        return new Promise<T>(() => {
          /* never resolves — useCallback dep change replaces this fn the
             moment isLoaded flips, and react-query refetches with the
             real Bearer token. */
        });
      }
      let token: string | null = null;
      if (isSignedIn) {
        try {
          token = await getToken();
        } catch {
          token = null;
        }
      }
      return api<T>(path, {
        ...opts,
        devUser,
        authToken: token ?? undefined,
      });
    },
    [getToken, isLoaded, isSignedIn, devUser]
  );
}
