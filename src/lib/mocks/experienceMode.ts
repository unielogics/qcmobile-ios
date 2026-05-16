export type ExperienceMode = "guided" | "self_directed" | "unlinked";

export interface ExperienceModeState {
  mode: ExperienceMode;
  locked: boolean;
  reason: string | null;
}

export function mockExperienceMode(_clientId: string): ExperienceModeState {
  return { mode: "guided", locked: false, reason: null };
}
