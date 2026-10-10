import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import type { CapitalReadinessSnapshot } from "@/lib/capitalReadiness";
import { useAuthedFetch } from "./useAuthedFetch";

export interface CapitalReadinessSource {
  profileId?: string | null;
  dealerId?: string | null;
  initialSnapshot?: CapitalReadinessSnapshot | null;
}

/**
 * Read-only Capital Readiness lookup. Callers must supply exactly one canonical
 * application-profile or dealer id. This hook never resolves/creates a profile
 * from a client or loan id because one client may own multiple files and the
 * existing resolve endpoint is intentionally mutating.
 */
export function useCapitalReadiness({
  profileId,
  dealerId,
  initialSnapshot,
}: CapitalReadinessSource) {
  const fetcher = useAuthedFetch();
  const hasSingleSource = Boolean(profileId) !== Boolean(dealerId);
  const sourceKind = profileId ? "profile" : dealerId ? "dealer" : "none";
  const sourceId = profileId ?? dealerId ?? "";
  const path = profileId
    ? `/application-profiles/${encodeURIComponent(profileId)}/capital-readiness`
    : `/dealer-os/dealers/${encodeURIComponent(dealerId ?? "")}/capital-readiness`;

  return useQuery({
    queryKey: ["capital-readiness", sourceKind, sourceId],
    queryFn: async () => {
      try {
        return await fetcher<CapitalReadinessSnapshot>(path);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: hasSingleSource && initialSnapshot === undefined,
    initialData: initialSnapshot,
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });
}
