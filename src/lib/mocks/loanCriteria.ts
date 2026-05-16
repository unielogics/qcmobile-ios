export interface LoanCriteria {
  loan_amount: number | null;
  ltv: number | null;
  dscr: number | null;
  rate_target: number | null;
  amortization_years: number | null;
  product: string | null;
  notes: string | null;
}

export function mockLoanCriteria(_loanId: string): LoanCriteria {
  return {
    loan_amount: null,
    ltv: null,
    dscr: null,
    rate_target: null,
    amortization_years: null,
    product: null,
    notes: null,
  };
}
