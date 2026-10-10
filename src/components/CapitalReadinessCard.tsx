import { ActivityIndicator, Text, View } from "react-native";
import { Card, Pill } from "@/design-system/primitives";
import { useTheme } from "@/design-system/ThemeProvider";
import { useCapitalReadiness } from "@/hooks/useCapitalReadiness";
import {
  CAPITAL_READINESS_PHASES,
  capitalReadinessMetrics,
  capitalReadinessScore,
  formatCapitalReadinessMetric,
  type CapitalReadinessBand,
  type CapitalReadinessLocale,
  type CapitalReadinessMetricStatus,
  type CapitalReadinessPhase,
  type CapitalReadinessReviewStatus,
  type CapitalReadinessSnapshot,
} from "@/lib/capitalReadiness";

interface Props {
  profileId?: string | null;
  dealerId?: string | null;
  initialSnapshot?: CapitalReadinessSnapshot | null;
  fallbackLocale?: CapitalReadinessLocale;
  uiLocale?: CapitalReadinessLocale;
}

const COPY = {
  en: {
    title: "Capital Readiness",
    lede: "Financial preparation and the path to an underwriter-ready file.",
    loading: "Loading Capital Readiness…",
    error: "Capital Readiness is temporarily unavailable.",
    score: "Readiness score",
    hidden: "Hidden",
    hiddenDetail: "Score appears after evidence coverage reaches 60%.",
    coverage: "Evidence coverage",
    confidence: "Confidence",
    metrics: "Financial health",
    blockers: "Highest-impact blockers",
    noBlockers: "No blocker is recorded in this snapshot.",
    phases: "Five-phase plan",
    advisory: "Educational and strategic guidance—not a financing approval, offer, or guarantee.",
  },
  es: {
    title: "Preparación de capital",
    lede: "Preparación financiera y el camino hacia un expediente listo para suscripción.",
    loading: "Cargando la preparación de capital…",
    error: "La preparación de capital no está disponible temporalmente.",
    score: "Puntuación de preparación",
    hidden: "Oculta",
    hiddenDetail: "La puntuación aparece cuando la cobertura de evidencia alcanza el 60 %.",
    coverage: "Cobertura de evidencia",
    confidence: "Confianza",
    metrics: "Salud financiera",
    blockers: "Bloqueos de mayor impacto",
    noBlockers: "No hay bloqueos registrados en esta evaluación.",
    phases: "Plan de cinco fases",
    advisory: "Orientación educativa y estratégica; no es una aprobación, oferta ni garantía de financiamiento.",
  },
} as const;

const BAND_LABELS: Record<CapitalReadinessLocale, Record<CapitalReadinessBand, string>> = {
  en: {
    ready_soon: "Ready soon",
    three_to_six_months: "3–6 months",
    six_to_twelve_months: "6–12 months",
    one_plus_year: "1+ year",
    insufficient_evidence: "Insufficient evidence",
  },
  es: {
    ready_soon: "Listo pronto",
    three_to_six_months: "3–6 meses",
    six_to_twelve_months: "6–12 meses",
    one_plus_year: "1+ año",
    insufficient_evidence: "Evidencia insuficiente",
  },
};

const REVIEW_LABELS: Record<CapitalReadinessLocale, Record<CapitalReadinessReviewStatus, string>> = {
  en: {
    provisional: "Provisional",
    awaiting_review: "Awaiting QC review",
    confirmed: "QC reviewed",
    revised: "QC revised",
  },
  es: {
    provisional: "Provisional",
    awaiting_review: "Pendiente de revisión de QC",
    confirmed: "Revisado por QC",
    revised: "Revisado y ajustado por QC",
  },
};

const METRIC_LABELS_ES: Record<string, string> = {
  gross_margin_pct: "Margen bruto",
  net_margin_pct: "Margen neto",
  property_noi: "Ingreso operativo neto",
  current_dscr: "DSCR actual",
};
const METRIC_LABELS_EN: Record<string, string> = {
  gross_margin_pct: "Gross margin",
  net_margin_pct: "Net margin",
  property_noi: "Property NOI",
  current_dscr: "Current DSCR",
};

const PHASE_COPY: Record<CapitalReadinessLocale, Record<string, { label: string; detail: string }>> = {
  en: {
    baseline_health_check: { label: "Baseline health check", detail: "Verify the starting financial and banking metrics." },
    financial_restructuring: { label: "Financial restructuring", detail: "Clean up and document the financial presentation." },
    system_tracking: { label: "System tracking", detail: "Monitor targets and monthly progress." },
    pre_underwriting: { label: "Pre-underwriting", detail: "Verify milestones and build the lender-ready package." },
    prime_capital: { label: "Preparing for prime capital", detail: "Align the verified file with an appropriate capital path." },
  },
  es: {
    baseline_health_check: { label: "Diagnóstico inicial", detail: "Verificar las métricas financieras y bancarias iniciales." },
    financial_restructuring: { label: "Reestructuración financiera", detail: "Ordenar y documentar la presentación financiera." },
    system_tracking: { label: "Seguimiento del sistema", detail: "Monitorear objetivos y progreso mensual." },
    pre_underwriting: { label: "Pre-suscripción", detail: "Verificar hitos y preparar el expediente para el suscriptor." },
    prime_capital: { label: "Preparación para capital preferencial", detail: "Alinear el expediente verificado con una opción de capital adecuada." },
  },
};

const PHASE_STATUS: Record<CapitalReadinessLocale, Record<CapitalReadinessPhase["status"], string>> = {
  en: { not_started: "Not started", in_progress: "In progress", ready: "Ready", completed: "Completed" },
  es: { not_started: "No iniciado", in_progress: "En progreso", ready: "Listo", completed: "Completado" },
};

export function CapitalReadinessCard(props: Props) {
  const { t } = useTheme();
  const query = useCapitalReadiness(props);
  const snapshot = query.data;
  const locale = props.uiLocale ?? (snapshot?.communication_locale === "es" || snapshot?.communication_locale === "en"
    ? snapshot.communication_locale
    : props.fallbackLocale ?? "en");
  const c = COPY[locale];

  // An omitted source is intentional: mobile does not have a canonical
  // current-profile mapping. A 404/no baseline is also a quiet empty state.
  if (!props.profileId && !props.dealerId && props.initialSnapshot === undefined) return null;
  if (query.isLoading) {
    return (
      <Card pad={16} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ActivityIndicator color={t.petrol} />
        <Text style={{ color: t.ink3, fontSize: 13 }}>{c.loading}</Text>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card pad={16}>
        <Text style={{ color: t.danger, fontSize: 13 }}>{c.error}</Text>
      </Card>
    );
  }
  if (!snapshot) return null;

  const score = capitalReadinessScore(snapshot);
  const metrics = capitalReadinessMetrics(snapshot);
  const phaseByKey = new Map(snapshot.phases.map((phase) => [phase.key, phase]));
  const phases = CAPITAL_READINESS_PHASES.map((phase) => ({
    ...phase,
    snapshot: phaseByKey.get(phase.key),
  }));

  return (
    <Card pad={16}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "800" }}>{c.title}</Text>
          <Text style={{ color: t.ink3, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{c.lede}</Text>
        </View>
        <Pill color={reviewColor(snapshot.review_status, t)} bg={reviewBackground(snapshot.review_status, t)}>
          {REVIEW_LABELS[locale][snapshot.review_status]}
        </Pill>
      </View>

      <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
        <SummaryCell
          label={c.score}
          value={score == null ? c.hidden : `${Math.round(score)}/100`}
          detail={score == null ? c.hiddenDetail : BAND_LABELS[locale][snapshot.band]}
          accent={score == null ? t.warn : bandColor(snapshot.band, t)}
        />
        <SummaryCell label={c.coverage} value={`${Math.round(snapshot.evidence_coverage_pct)}%`} detail={`${c.confidence}: ${Math.round(snapshot.confidence_pct)}%`} accent={t.petrol} />
      </View>

      <Progress value={snapshot.evidence_coverage_pct} color={t.petrol} track={t.surface2} />

      {metrics.length > 0 ? (
        <Section title={c.metrics} color={t.ink3}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {metrics.map((metric) => (
              <View key={metric.key} style={{ width: "48%", minWidth: 130, flexGrow: 1, borderRadius: 12, padding: 11, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }}>
                <Text style={{ color: t.ink3, fontSize: 10.5, fontWeight: "700" }} numberOfLines={2}>
                  {(locale === "es" ? METRIC_LABELS_ES : METRIC_LABELS_EN)[metric.key] ?? metric.label}
                </Text>
                <Text style={{ color: metricColor(metric.status, t), fontSize: 19, fontWeight: "800", marginTop: 5 }}>
                  {formatCapitalReadinessMetric(metric, locale)}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={c.blockers} color={t.ink3}>
        {snapshot.blockers.length === 0 ? (
          <Text style={{ color: t.ink3, fontSize: 12 }}>{c.noBlockers}</Text>
        ) : snapshot.blockers.slice(0, 3).map((blocker) => (
          <View key={blocker.key} style={{ flexDirection: "row", gap: 9, alignItems: "flex-start" }}>
            <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: blocker.impact === "critical" || blocker.impact === "high" ? t.danger : t.warn, marginTop: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 12.5, fontWeight: "700", lineHeight: 18 }}>{blocker.label}</Text>
              {blocker.detail ? <Text style={{ color: t.ink3, fontSize: 11.5, lineHeight: 17, marginTop: 1 }}>{blocker.detail}</Text> : null}
            </View>
          </View>
        ))}
      </Section>

      <Section title={c.phases} color={t.ink3}>
        {phases.map(({ key, number, snapshot: phase }, index) => {
          const canonical = PHASE_COPY[locale][key];
          const status = phase?.status ?? "not_started";
          return (
            <View key={key} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ alignItems: "center" }}>
                <View style={{ width: 27, height: 27, borderRadius: 99, backgroundColor: phaseColor(status, t), alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: status === "not_started" ? t.ink3 : t.inverse, fontSize: 11, fontWeight: "800" }}>{number}</Text>
                </View>
                {index < phases.length - 1 ? <View style={{ width: 1, flex: 1, minHeight: 18, backgroundColor: t.line }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: index < phases.length - 1 ? 10 : 0 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ flex: 1, color: t.ink, fontSize: 12.5, fontWeight: "700", lineHeight: 18 }}>{canonical.label}</Text>
                  <Text style={{ color: t.ink3, fontSize: 10 }}>{PHASE_STATUS[locale][status]}</Text>
                </View>
                <Text style={{ color: t.ink3, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>{canonical.detail}</Text>
              </View>
            </View>
          );
        })}
      </Section>

      <Text style={{ color: t.ink4, fontSize: 10.5, lineHeight: 15, marginTop: 14 }}>{c.advisory}</Text>
    </Card>
  );
}

function SummaryCell({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderTopWidth: 3, borderTopColor: accent, borderRadius: 12, padding: 11, backgroundColor: t.surface2 }}>
      <Text style={{ color: t.ink3, fontSize: 10.5, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: t.ink, fontSize: 19, fontWeight: "800", marginTop: 4 }}>{value}</Text>
      <Text style={{ color: t.ink3, fontSize: 10.5, lineHeight: 14, marginTop: 3 }}>{detail}</Text>
    </View>
  );
}

function Progress({ value, color, track }: { value: number; color: string; track: string }) {
  return (
    <View style={{ height: 6, borderRadius: 99, backgroundColor: track, overflow: "hidden", marginTop: 9 }}>
      <View style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
    </View>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 9, marginTop: 16 }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" }}>{title}</Text>
      {children}
    </View>
  );
}

type ThemeTokens = ReturnType<typeof useTheme>["t"];

function bandColor(band: CapitalReadinessBand, t: ThemeTokens): string {
  if (band === "ready_soon") return t.profit;
  if (band === "three_to_six_months") return t.petrol;
  if (band === "six_to_twelve_months") return t.warn;
  return t.danger;
}

function reviewColor(status: CapitalReadinessReviewStatus, t: ThemeTokens): string {
  if (status === "confirmed") return t.profit;
  if (status === "revised") return t.petrol;
  if (status === "awaiting_review") return t.warn;
  return t.ink3;
}

function reviewBackground(status: CapitalReadinessReviewStatus, t: ThemeTokens): string {
  if (status === "confirmed") return t.profitBg;
  if (status === "revised") return t.petrolSoft;
  if (status === "awaiting_review") return t.warnBg;
  return t.surface2;
}

function metricColor(status: CapitalReadinessMetricStatus, t: ThemeTokens): string {
  if (status === "healthy" || status === "very_strong") return t.profit;
  if (status === "acceptable") return t.warn;
  if (status === "concerning") return t.danger;
  return t.ink3;
}

function phaseColor(status: CapitalReadinessPhase["status"], t: ThemeTokens): string {
  if (status === "completed") return t.profit;
  if (status === "ready" || status === "in_progress") return t.petrol;
  return t.surface2;
}
