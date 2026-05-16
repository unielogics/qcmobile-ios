export interface LenderMessage {
  id: string;
  body: string;
  from_role: "broker" | "lender" | "system";
  created_at: string;
}

export interface LenderConnection {
  lender_id: string | null;
  lender_name: string | null;
  status: "disconnected" | "pending" | "connected";
}

export function mockLenderConnection(_loanId: string): LenderConnection {
  return { lender_id: null, lender_name: null, status: "disconnected" };
}

export function mockLenderMessages(_loanId: string): LenderMessage[] {
  return [];
}
