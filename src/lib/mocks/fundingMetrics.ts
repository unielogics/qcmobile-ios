export interface FundingMetrics {
  uw_ready: number;
  needs_structure: number;
  open_conditions: number;
  ai_blocked: number;
  next_closing_date: string | null;
}

export function mockFundingMetrics(): FundingMetrics {
  return {
    uw_ready: 0,
    needs_structure: 0,
    open_conditions: 0,
    ai_blocked: 0,
    next_closing_date: null,
  };
}
