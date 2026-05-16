import type { Client, CreditPullStatus, Document, Loan } from "./types";
import { computeEligibility } from "./eligibility";

export type NextActionRoute = "/credit-pull" | "/(tabs)/vault" | "/(tabs)/profile" | "/(tabs)/calendar";

export interface NextAction {
  kind: "credit" | "documents" | "profile" | "review_terms" | "all_clear";
  title: string;
  body: string;
  ctaLabel: string;
  route: NextActionRoute | null;
}

export interface DeriveNextActionInput {
  client: Client | null | undefined;
  credit: CreditPullStatus | null | undefined;
  loans: Loan[];
  documents: Document[];
}

const DOC_PENDING: ReadonlySet<Document["status"]> = new Set(["requested", "pending", "flagged"]);

export function deriveNextAction(input: DeriveNextActionInput): NextAction {
  const { client, credit, loans, documents } = input;

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount: 0,
    hasYearOfOwnership: false,
    creditExpired: credit?.is_expired,
  });
  if (eligibility.tier === "blocked") {
    return {
      kind: "credit",
      title: eligibility.banner?.title ?? "Verify your credit",
      body: eligibility.banner?.body ?? "Run a soft credit pull to unlock loan offers.",
      ctaLabel: eligibility.banner?.ctaLabel ?? "Start Soft Pull",
      route: "/credit-pull",
    };
  }

  const pendingDocs = documents.filter((d) => DOC_PENDING.has(d.status));
  if (pendingDocs.length > 0) {
    return {
      kind: "documents",
      title: pendingDocs.length === 1 ? "Upload 1 requested document" : `Upload ${pendingDocs.length} requested documents`,
      body: "Your Funding Team is waiting on these to keep your file moving.",
      ctaLabel: "Open Documents",
      route: "/(tabs)/vault",
    };
  }

  if (client && (!client.phone || !client.address)) {
    return {
      kind: "profile",
      title: "Complete your profile",
      body: "We need a phone and address on file before underwriting can finalize.",
      ctaLabel: "Update Profile",
      route: "/(tabs)/profile",
    };
  }

  const activeLoan = loans.find((l) => l.stage !== "funded");
  if (activeLoan) {
    return {
      kind: "review_terms",
      title: "Review your latest terms",
      body: `Latest pricing on ${activeLoan.address || "your active loan"} is ready to review.`,
      ctaLabel: "Open My Deal",
      route: null,
    };
  }

  return {
    kind: "all_clear",
    title: "You're all caught up",
    body: "No pending actions. We'll surface the next step here as your file progresses.",
    ctaLabel: "View Calendar",
    route: "/(tabs)/calendar",
  };
}
