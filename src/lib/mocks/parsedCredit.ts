export interface ParsedCreditTradeline {
  id: string;
  creditor: string;
  account_type: string;
  balance: number | null;
  payment: number | null;
  status: string;
}

export interface ParsedCreditReport {
  pull_id: string;
  pulled_at: string;
  score_equifax: number | null;
  score_experian: number | null;
  score_transunion: number | null;
  tradelines: ParsedCreditTradeline[];
  notes: string | null;
}

export function mockParsedCredit(pullId: string): ParsedCreditReport | null {
  return {
    pull_id: pullId,
    pulled_at: new Date().toISOString(),
    score_equifax: null,
    score_experian: null,
    score_transunion: null,
    tradelines: [],
    notes: null,
  };
}
