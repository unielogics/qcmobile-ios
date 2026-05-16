// Sample/seed data ported from .design-source/project/data.js.
// Used as a fallback when the backend has nothing to return — design fidelity
// stays high during demos and onboarding even if the API is empty.

const seedSpark = (() => {
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return (start: number, vol = 0.08): number[] => {
    const out = [start];
    for (let i = 1; i < 30; i++) {
      const drift = (Math.sin(i * 0.4) + Math.cos(i * 0.13)) * vol;
      out.push(+(out[i - 1] + drift + (rand() - 0.5) * 0.05).toFixed(3));
    }
    return out;
  };
})();

export interface SampleLoan {
  id: string;
  address: string;
  city: string;
  type: "Fix & Flip" | "DSCR" | "Ground Up" | "Bridge" | "Portfolio" | "Cash-Out Refi";
  amount: number;
  stage: number;
  stages: string[];
  close: string;
  dscr: number | null;
}

export interface SampleRate {
  id: string;
  label: string;
  rate: number;
  delta: number;
  ltv: string;
  term: string;
  spark: number[];
}

export interface SampleActivity {
  d: number; // day offset from today
  t: string; // time
  kind: "call" | "doc" | "ai" | "inspect" | "milestone" | "lock" | "pay" | "closing";
  title: string;
  loan?: string;
  who?: string;
  dur?: string;
  priority?: "high";
}

export interface SampleVaultDoc {
  id: string;
  name: string;
  type: string;
  subject: "subject" | "reo";
  verified: boolean | "pending" | "flagged";
  sale?: number;
  closed?: string;
  props?: number;
  thumb: string;
}

export const SAMPLE_DATA = {
  asOf: "May 4, 2026 · 9:41 AM ET",
  rates: [
    { id: "ff",   label: "Fix & Flip",             rate: 9.625,  delta: -12, ltv: "90% LTC / 75% ARV", term: "12 mo", spark: seedSpark(9.8) },
    { id: "gu",   label: "Ground Up Construction", rate: 10.250, delta: +5,  ltv: "85% LTC / 70% LTFC", term: "18 mo", spark: seedSpark(10.1) },
    { id: "dscr", label: "DSCR Rental",            rate: 7.375,  delta: -8,  ltv: "80% LTV",            term: "30 yr", spark: seedSpark(7.5) },
    { id: "br",   label: "Bridge",                 rate: 8.875,  delta: +2,  ltv: "75% LTV",            term: "24 mo", spark: seedSpark(8.7) },
  ] as SampleRate[],
  portfolio: {
    equityUnlocked: 4_280_000,
    equityDelta: 12.4,
    globalDSCR: 1.42,
    activeLoans: 7,
    avgYield: 11.8,
    properties: 14,
  },
  activeLoans: [
    { id: "L-2604", address: "418 Sycamore St", city: "Charlotte, NC", type: "Fix & Flip", amount: 387_500,   stage: 2, stages: ["Prequalified","Processing","Underwriting","Closing","Funded"], close: "May 18", dscr: null },
    { id: "L-2598", address: "12 Highline Mews", city: "Brooklyn, NY", type: "DSCR",        amount: 1_240_000, stage: 3, stages: ["Prequalified","Processing","Underwriting","Closing","Funded"], close: "May 12", dscr: 1.34 },
    { id: "L-2587", address: "Lot 47, Riverbend", city: "Austin, TX",  type: "Ground Up",   amount: 2_100_000, stage: 1, stages: ["Prequalified","Processing","Underwriting","Closing","Funded"], close: "Jun 3",  dscr: null },
  ] as SampleLoan[],
  activity: [
    { d: 0, t: "10:30", kind: "call",      title: "UW call — 418 Sycamore",                       loan: "L-2604", who: "Marisol Vega · UW", dur: "30m" },
    { d: 0, t: "14:00", kind: "doc",       title: "Insurance binder due",                          loan: "L-2604", who: "Borrower upload", priority: "high" },
    { d: 0, t: "16:15", kind: "ai",        title: "AI: Refinance window opens for 12 Highline",    loan: "L-2598", who: "Suggested action" },
    { d: 1, t: "09:00", kind: "inspect",   title: "Site inspection — Riverbend Lot 47",            loan: "L-2587", who: "Greg Hollins · Inspector" },
    { d: 1, t: "11:00", kind: "doc",       title: "HUD-1 draft review",                            loan: "L-2598", who: "Title co. · Sterling" },
    { d: 2, t: "13:30", kind: "milestone", title: "Appraisal received",                            loan: "L-2604", who: "Cleared underwriting" },
    { d: 3, t: "08:30", kind: "lock",      title: "Rate lock expires",                             loan: "L-2598", who: "60-day lock", priority: "high" },
    { d: 3, t: "15:00", kind: "pay",       title: "Interest payment due — L-2541",                 loan: "L-2541", who: "$3,287.50" },
    { d: 4, t: "10:00", kind: "closing",   title: "Closing — 12 Highline Mews",                    loan: "L-2598", who: "Sterling Title · 10am ET", priority: "high" },
    { d: 5, t: "14:30", kind: "call",      title: "Strategy call — Q3 deal flow",                  who: "Account Exec · Daniel R." },
    { d: 6, t: "11:00", kind: "doc",       title: "REO schedule refresh",                          who: "Annual update" },
    { d: 8, t: "09:30", kind: "inspect",   title: "Final walk — 418 Sycamore",                     loan: "L-2604" },
    { d: 9, t: "10:00", kind: "closing",   title: "Closing — 418 Sycamore",                        loan: "L-2604", priority: "high" },
    { d: 11, t: "13:00", kind: "milestone", title: "Funding wired — L-2587",                        loan: "L-2587" },
    { d: 14, t: "10:00", kind: "call",      title: "Quarterly portfolio review",                    who: "Sr. Underwriter + AE" },
  ] as SampleActivity[],
  vault: [
    { id: "v1", name: "HUD — 89 Maple Ridge",   type: "HUD-1",     subject: "subject", verified: true,       sale: 587_000, closed: "Mar 2025", thumb: "#0F5F66" },
    { id: "v2", name: "HUD — 314 Beacon St",    type: "HUD-1",     subject: "subject", verified: true,       sale: 412_000, closed: "Nov 2024", thumb: "#1A3A5C" },
    { id: "v3", name: "HUD — 7 Tradd Ln",       type: "HUD-1",     subject: "subject", verified: "flagged",  sale: 875_000, closed: "Jan 2025", thumb: "#7A4A1F" },
    { id: "v4", name: "REO Schedule 2026 Q1",   type: "REO",       subject: "reo",     verified: true,       props: 12,     thumb: "#0B1F3A" },
    { id: "v5", name: "HUD — 1208 Oakdale",     type: "HUD-1",     subject: "subject", verified: "pending",  sale: 298_000, closed: "Apr 2025", thumb: "#5C2D4A" },
    { id: "v6", name: "Rent Roll — Highline",   type: "Rent Roll", subject: "reo",     verified: true,       props: 4,      thumb: "#0F5F66" },
  ] as SampleVaultDoc[],
};

export const LOAN_TYPES = [
  { id: "ff",   label: "Fix & Flip",             desc: "Short-term rehab + resale",         icon: "hammer",    rate: "9.625%",  term: "12 mo" },
  { id: "gu",   label: "Ground Up Construction", desc: "New build, draw schedule",          icon: "building2", rate: "10.250%", term: "18 mo" },
  { id: "dscr", label: "DSCR Rental",            desc: "Long-term hold, rental cash flow",  icon: "key",       rate: "7.375%",  term: "30 yr" },
  { id: "br",   label: "Bridge",                 desc: "Short-term capital, exit strategy", icon: "bolt",      rate: "8.875%",  term: "24 mo" },
  { id: "port", label: "Portfolio",              desc: "5+ properties, blanket lien",       icon: "layers",    rate: "8.125%",  term: "30 yr" },
  { id: "cash", label: "Cash-Out Refi",          desc: "Pull equity from existing rentals", icon: "refresh",   rate: "7.625%",  term: "30 yr" },
];

export const KIND_META = {
  call:      { label: "Call",        icon: "chat",      hue: "brand" as const },
  doc:       { label: "Doc",         icon: "doc",       hue: "gold" as const },
  ai:        { label: "AI Suggest",  icon: "spark",     hue: "petrol" as const },
  inspect:   { label: "Inspection",  icon: "pin",       hue: "gold" as const },
  milestone: { label: "Milestone",   icon: "flag",      hue: "brand" as const },
  lock:      { label: "Rate Lock",   icon: "lock",      hue: "gold" as const },
  pay:       { label: "Payment",     icon: "dollar",    hue: "brand" as const },
  closing:   { label: "Closing",     icon: "shieldChk", hue: "petrol" as const },
};
