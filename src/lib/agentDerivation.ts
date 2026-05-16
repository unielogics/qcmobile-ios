// Client-side fallbacks for the agent endpoints that may not yet be
// deployed for mobile. Both helpers are pure — same shape as what the
// real /agents/me/funnel and /agents/me/next-actions endpoints return.

import type { AITask, Client, FunnelMetrics, Loan, NextAction } from "./types";

const LEAD_STALE_DAYS = 3;
const CLOSING_SOON_DAYS = 30;
const ACTIVE_LOAN_STAGES = new Set([
  "prequalified", "collecting_docs", "lender_connected", "processing", "closing",
]);

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (Date.now() - then) / 86_400_000;
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (then - Date.now()) / 86_400_000;
}

export function deriveFunnelFromLoans(loans: Loan[], clients: Client[]): FunnelMetrics {
  const oneWeekAgo = Date.now() - 7 * 86_400_000;
  const leadsThisWeek = clients.filter((c) => {
    if (c.stage !== "lead") return false;
    return c.since != null && Date.parse(c.since) >= oneWeekAgo;
  }).length;
  const contactedCount = clients.filter((c) => c.stage === "contacted").length;
  const stale = clients.filter((c) => c.stage === "lead" && daysSince(c.since) > LEAD_STALE_DAYS).length;

  const byStage: Record<string, number> = {};
  for (const c of clients) {
    if (c.stage) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
  }

  return {
    leads_this_week: leadsThisWeek,
    contacted: contactedCount,
    stale_lead_count: stale,
    intake_completion: { value: null, sample_size: 0 },
    prequal_conversion: { value: null, sample_size: 0 },
    lead_to_prequal: { value: null, sample_size: 0 },
    prequal_to_funded: { value: null, sample_size: 0 },
    clients_by_stage: byStage,
  };
}

export function deriveNextActionsFromLoans(
  loans: Loan[],
  clients: Client[],
  aiTasks: AITask[]
): NextAction[] {
  const out: NextAction[] = [];
  const clientById = new Map(clients.map((c) => [c.id, c]));

  for (const c of clients) {
    if (c.stage === "lead" && daysSince(c.since) > LEAD_STALE_DAYS) {
      out.push({
        id: `derived-lead-${c.id}`,
        kind: "call_lead",
        priority: "high",
        title: `Call ${c.name}`,
        subtitle: c.city ?? "Stale lead — no contact yet",
        target_type: "client",
        target_id: c.id,
        deeplink: `/agent/client/${c.id}`,
        created_at: c.since ?? new Date().toISOString(),
        client_id: c.id,
        loan_id: null,
      });
    }
  }

  for (const l of loans) {
    if (!ACTIVE_LOAN_STAGES.has(l.stage)) continue;
    const client = clientById.get(l.client_id);
    const clientLabel = client?.name ?? "Borrower";
    if (l.deal_health === "stuck" || l.deal_health === "at_risk") {
      out.push({
        id: `derived-stuck-${l.id}`,
        kind: "chase_doc",
        priority: l.deal_health === "stuck" ? "high" : "medium",
        title: `${clientLabel} — ${l.address || "deal"} is ${l.deal_health.replace("_", " ")}`,
        subtitle: "Open the deal to see what's blocking it.",
        target_type: "loan",
        target_id: l.id,
        deeplink: `/agent/loan/${l.id}`,
        created_at: new Date().toISOString(),
        client_id: l.client_id,
        loan_id: l.id,
      });
    }
    const dToClose = daysUntil(l.close_date);
    if (dToClose <= CLOSING_SOON_DAYS && dToClose >= 0) {
      out.push({
        id: `derived-closing-${l.id}`,
        kind: "closing_prep",
        priority: dToClose <= 7 ? "high" : "medium",
        title: `${clientLabel} — closing in ${Math.max(0, Math.round(dToClose))}d`,
        subtitle: l.address || "Closing soon",
        target_type: "loan",
        target_id: l.id,
        deeplink: `/agent/loan/${l.id}`,
        created_at: new Date().toISOString(),
        client_id: l.client_id,
        loan_id: l.id,
      });
    }
  }

  for (const task of aiTasks) {
    if (task.status !== "pending") continue;
    out.push({
      id: `derived-task-${task.id}`,
      kind: "pending_task",
      priority: task.priority === "high" ? "high" : task.priority === "medium" ? "medium" : "low",
      title: task.title,
      subtitle: task.summary,
      target_type: "ai_task",
      target_id: task.id,
      deeplink: task.loan_id ? `/agent/loan/${task.loan_id}` : `/agent/(tabs)/today`,
      created_at: task.created_at,
      client_id: null,
      loan_id: task.loan_id,
    });
  }

  // Sort: high priority first, then most recent.
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || b.created_at.localeCompare(a.created_at));
}
