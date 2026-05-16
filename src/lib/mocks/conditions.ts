export interface LoanCondition {
  id: string;
  category: string;
  label: string;
  description: string | null;
  status: "open" | "in_progress" | "resolved" | "waived";
  required_by: string | null;
  assigned_to: string | null;
}

export function mockConditions(_loanId: string): LoanCondition[] {
  return [];
}
