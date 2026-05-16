export interface HudLine {
  id: string;
  line_number: string;
  description: string;
  amount: number;
  payee: string | null;
  paid_by: "buyer" | "seller" | "lender" | null;
}

export function mockHudLines(_loanId: string): HudLine[] {
  return [];
}
