export interface AIQuestion {
  id: string;
  body: string;
  context: string | null;
  status: "open" | "answered" | "dismissed";
  answered_body: string | null;
  created_at: string;
}

export function mockAIQuestions(_loanId: string): AIQuestion[] {
  return [];
}
