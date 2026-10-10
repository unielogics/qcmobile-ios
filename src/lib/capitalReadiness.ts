export type CapitalReadinessLocale = "en" | "es";

export type CapitalReadinessReviewStatus =
  | "provisional"
  | "awaiting_review"
  | "confirmed"
  | "revised";

export type CapitalReadinessBand =
  | "ready_soon"
  | "three_to_six_months"
  | "six_to_twelve_months"
  | "one_plus_year"
  | "insufficient_evidence";

export type CapitalReadinessMetricStatus =
  | "concerning"
  | "acceptable"
  | "healthy"
  | "very_strong"
  | "unavailable";

export interface CapitalReadinessPillar {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  coverage_pct: number;
  status: string;
}

export interface CapitalReadinessMetricSource {
  not_applicable?: boolean;
  property_policy?: string;
  [key: string]: unknown;
}

export interface CapitalReadinessMetric {
  key: string;
  label: string;
  value: number | string | null;
  numerator?: number | null;
  denominator?: number | null;
  unit?: string | null;
  status: CapitalReadinessMetricStatus;
  source_period_id?: string | null;
  confidence_pct?: number | null;
  source?: CapitalReadinessMetricSource | null;
}

export interface CapitalReadinessSignal {
  key: string;
  label: string;
  detail?: string | null;
  impact: "low" | "medium" | "high" | "critical";
  metric_key?: string | null;
}

export interface CapitalReadinessPhase {
  key: string;
  label: string;
  status: "not_started" | "in_progress" | "ready" | "completed";
  description?: string | null;
  // The backend intentionally keeps actions open-shaped while the initial
  // Capital Readiness policy emits an empty list.
  actions: Record<string, unknown>[];
}

export interface CapitalReadinessProgramOpportunity {
  key?: string;
  program_key?: string;
  title?: string;
  label?: string;
  program_name?: string;
  status?: string;
  detail?: string;
  gaps?: string[];
}

export interface CapitalReadinessSnapshot {
  id: string;
  profile_id: string;
  snapshot_version: number;
  policy_key: string;
  policy_version: number;
  evidence_fingerprint: string;
  as_of: string;
  communication_locale: CapitalReadinessLocale;
  review_status: CapitalReadinessReviewStatus;
  score: number | null;
  band: CapitalReadinessBand;
  evidence_coverage_pct: number;
  confidence_pct: number;
  pillars: CapitalReadinessPillar[];
  metrics: CapitalReadinessMetric[];
  strengths: CapitalReadinessSignal[];
  blockers: CapitalReadinessSignal[];
  phases: CapitalReadinessPhase[];
  program_opportunities: CapitalReadinessProgramOpportunity[];
  // Client/dealer responses are allowed to omit or redact source lineage.
  source_manifest?: Record<string, unknown>[];
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
}

export const CAPITAL_READINESS_PHASES = [
  { key: "baseline_health_check", number: 1 },
  { key: "financial_restructuring", number: 2 },
  { key: "system_tracking", number: 3 },
  { key: "pre_underwriting", number: 4 },
  { key: "prime_capital", number: 5 },
] as const;

const OPERATING_METRICS = ["gross_margin_pct", "net_margin_pct", "current_dscr"];
const PROPERTY_METRICS = ["property_noi", "current_dscr"];

export function capitalReadinessScore(snapshot: CapitalReadinessSnapshot): number | null {
  if (snapshot.evidence_coverage_pct < 60 || typeof snapshot.score !== "number") return null;
  return Math.max(0, Math.min(100, snapshot.score));
}

export function capitalReadinessMetrics(snapshot: CapitalReadinessSnapshot): CapitalReadinessMetric[] {
  const available = snapshot.metrics.filter((metric) =>
    metric.status !== "unavailable" && metric.value != null && metric.source?.not_applicable !== true
  );
  const isPropertyPolicy = snapshot.metrics.some((metric) => metric.source?.property_policy === "noi_dscr");
  const preferred = isPropertyPolicy ? PROPERTY_METRICS : OPERATING_METRICS;
  const byKey = new Map(available.map((metric) => [metric.key, metric]));
  const picked = preferred.map((key) => byKey.get(key)).filter((metric): metric is CapitalReadinessMetric => Boolean(metric));
  if (picked.length >= 2) return picked.slice(0, 3);
  for (const metric of available) {
    if (!picked.includes(metric)) picked.push(metric);
    if (picked.length === 3) break;
  }
  return picked;
}

export function formatCapitalReadinessMetric(
  metric: CapitalReadinessMetric,
  locale: CapitalReadinessLocale,
): string {
  if (metric.value == null || metric.status === "unavailable") return "—";
  if (typeof metric.value === "string") return metric.value;
  const intlLocale = locale === "es" ? "es-US" : "en-US";
  if (metric.unit === "percent" || metric.unit === "%" || metric.key.endsWith("_pct")) {
    return `${metric.value.toLocaleString(intlLocale, { maximumFractionDigits: 1 })}%`;
  }
  if (metric.unit === "currency" || metric.unit === "usd") {
    const currency = metric.source?.currency;
    return metric.value.toLocaleString(intlLocale, {
      ...(typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? { style: "currency", currency } : {}),
      maximumFractionDigits: 0,
    });
  }
  if (metric.unit === "ratio" || metric.key.includes("dscr")) {
    return `${metric.value.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  }
  return metric.value.toLocaleString(intlLocale, { maximumFractionDigits: 2 });
}
