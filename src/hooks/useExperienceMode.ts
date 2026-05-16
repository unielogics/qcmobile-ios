import { useMyClient } from "./useApi";
import { deriveExperienceMode, type EffectiveExperienceMode } from "@/lib/experienceMode";

// "unlinked" — the calling user has no Client row attached (the
// /clients/me endpoint 404'd). Caused by a borrower signing into the
// mobile app before the backend has linked their User to a Client
// the agent pre-created. The Clerk auto-provision path on the backend
// now adopts the orphan by email, so this state only fires on the
// first request before the adoption flush (or when there's genuinely
// no matching Client). Either way, do NOT silently fall through to
// self_directed — that's the bug that corrupted franco@unielogics.com's
// experience.
export type ExperienceModeState = EffectiveExperienceMode | "loading" | "unlinked";

export function useExperienceMode(): ExperienceModeState {
  const { data: client, isLoading, isError } = useMyClient();
  if (isLoading) return "loading";
  if (client) return deriveExperienceMode(client);
  // Either an error (treated as unlinked for UX) or genuinely no row.
  if (isError) return "unlinked";
  return "unlinked";
}
