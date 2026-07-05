import type { DSDealSecretaryView, DSTaskRow } from "@/lib/types";

export type DealSecretaryState =
  | "idle"
  | "running"
  | "needs_input"
  | "blocked"
  | "complete";

export interface DealSecretarySummary {
  state: DealSecretaryState;
  ai_blocked: boolean;
  next_question: string | null;
}

export function mockDealSecretarySummary(loanIds: string[]): Record<string, DealSecretarySummary> {
  const out: Record<string, DealSecretarySummary> = {};
  for (const id of loanIds) {
    out[id] = { state: "idle", ai_blocked: false, next_question: null };
  }
  return out;
}

// Mock task list returned when BACKEND_HAS_DEAL_SECRETARY is off so the
// swipe-to-assign UI is exercisable in dev without the real route.
// Mirrors the shape `/loans/{id}/deal-secretary` returns.
function mockTask(partial: Partial<DSTaskRow> & Pick<DSTaskRow, "requirement_key" | "label" | "owner_type">): DSTaskRow {
  return {
    client_requirement_status_id: `crs-${partial.requirement_key}`,
    category: "borrower_info",
    required_level: "required",
    status: "open",
    source: "playbook",
    objective_text: "",
    completion_criteria: "",
    due_at: null,
    blocks_stage: null,
    ...partial,
  } as DSTaskRow;
}

export function mockDealSecretaryView(loanId: string): DSDealSecretaryView {
  return {
    loan_id: loanId || null,
    client_id: "mock-client",
    left: [
      mockTask({ requirement_key: "borrower_id", label: "Collect borrower ID", category: "borrower_info", owner_type: "human" }),
      mockTask({ requirement_key: "rent_roll", label: "Collect rent roll", category: "property_data", owner_type: "human" }),
      mockTask({ requirement_key: "insurance_quote", label: "Confirm insurance quote", category: "insurance", owner_type: "human" }),
    ],
    right: [
      mockTask({ requirement_key: "credit_pull", label: "Complete Credit & Pre-Authorization", category: "credit", owner_type: "ai" }),
      mockTask({ requirement_key: "doc_chase", label: "Chase outstanding bank statements", category: "financials", owner_type: "ai" }),
    ],
  };
}
