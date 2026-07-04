export type CreditDisplayTone = "success" | "warning" | "danger" | "muted";

export interface CreditDisplay {
  label: string;
  shortLabel: string;
  tone: CreditDisplayTone;
  verified: boolean;
}

const NOT_VERIFIED: CreditDisplay = {
  label: "Credit Not Verified",
  shortLabel: "Not Verified",
  tone: "muted",
  verified: false,
};

const EXPIRED: CreditDisplay = {
  label: "Credit Expired",
  shortLabel: "Expired",
  tone: "warning",
  verified: false,
};

const BELOW_THRESHOLD: CreditDisplay = {
  label: "Below Threshold",
  shortLabel: "Below Threshold",
  tone: "danger",
  verified: true,
};

const MID_CREDIT: CreditDisplay = {
  label: "Mid Credit",
  shortLabel: "Mid Credit",
  tone: "warning",
  verified: true,
};

const STRONG_CREDIT: CreditDisplay = {
  label: "Strong Credit",
  shortLabel: "Strong Credit",
  tone: "success",
  verified: true,
};

export function creditDisplayFromFico(
  fico: number | null | undefined,
  options: { expired?: boolean } = {},
): CreditDisplay {
  if (options.expired) return EXPIRED;
  if (fico == null) return NOT_VERIFIED;
  if (fico < 620) return BELOW_THRESHOLD;
  if (fico < 720) return MID_CREDIT;
  return STRONG_CREDIT;
}

export function creditDisplayFromTier(
  tier: string | null | undefined,
  options: { hasPull?: boolean; expired?: boolean } = {},
): CreditDisplay {
  if (options.expired) return EXPIRED;
  const normalized = tier?.toLowerCase();
  if (normalized === "pro") return STRONG_CREDIT;
  if (normalized === "basic" || normalized === "warn") return MID_CREDIT;
  if (normalized === "blocked") return options.hasPull === false ? NOT_VERIFIED : BELOW_THRESHOLD;
  return options.hasPull ? MID_CREDIT : NOT_VERIFIED;
}

export function creditDisplayFromCredit(
  credit: { fico?: number | null; is_expired?: boolean } | null | undefined,
): CreditDisplay {
  return creditDisplayFromFico(credit?.fico, { expired: credit?.is_expired });
}

export function creditDisplayFromSummary(
  summary: { fico?: number | null; tier?: string | null } | null | undefined,
): CreditDisplay {
  if (!summary) return NOT_VERIFIED;
  if (summary.tier) return creditDisplayFromTier(summary.tier, { hasPull: summary.fico != null });
  return creditDisplayFromFico(summary.fico);
}

export function creditDisplayOverrideLabel(hasOverride: boolean): string {
  return hasOverride ? "Credit override applied" : "Credit needed";
}
