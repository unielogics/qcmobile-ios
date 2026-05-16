// Hand-typed mirror of backend response shapes.

import type {
  AITaskPriority, AITaskSource, AITaskStatus, BrokerTier, CalendarEventKind,
  ClientStage, DocStatus, LoanPurpose, LoanStage, LoanType, MessageFrom, PropertyType, Role,
} from "./enums.generated";

export type ClientType = "buyer" | "seller";
export type ListScope = "mine" | "all";

export interface User {
  id: string;
  clerk_id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Client {
  id: string;
  user_id: string | null;
  broker_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  since: string | null;
  tier: string;
  fico: number | null;
  avatar_color: string | null;
  funded_total: number;
  funded_count: number;
  properties: string | null;
  experience: string | null;
  // Agent CRM fields (shared with QCDashboard). Optional so existing rows
  // without these populated still type-check.
  stage?: ClientStage | null;
  client_type?: ClientType | null;
  // Mobile-app experience mode. Optional so the front-end can ship before the
  // backend column lands — deriveExperienceMode() falls back to broker_id.
  client_experience_mode?: ClientExperienceMode | null;
  client_experience_mode_reason?: ClientExperienceModeReason | null;
  client_experience_mode_locked_by?: ClientExperienceModeLockedBy | null;
  // Lead routing / ownership / attribution (alembic 0029). Mirrors
  // QCDashboard so mobile agents can read / write the same lead
  // surface as the desktop.
  lead_source?: LeadSource | null;
  lead_temperature?: LeadTemperature | null;
  financing_support_needed?: FinancingSupportNeeded | null;
  contact_permission?: ContactPermission | null;
  relationship_context?: RelationshipContext | null;
  lead_promotion_status?: LeadPromotionStatus;
  originating_agent_id?: string | null;
  current_agent_id?: string | null;
  source_channel?: string | null;
  // Realtor Client Intelligence Profile (alembic 0030). Free-shape
  // JSONB written by the Realtor AI on every conversational turn.
  realtor_profile?: RealtorClientProfile | null;
}

// Lead-routing enum values mirror app/schemas/client.py.
export type LeadSource =
  | "manual_entry"
  | "open_house"
  | "referral"
  | "listing_inquiry"
  | "buyer_consultation"
  | "existing_database"
  | "other";
export type LeadTemperature = "hot" | "warm" | "nurture";
export type FinancingSupportNeeded = "yes" | "maybe" | "no" | "unknown";
export type ContactPermission =
  | "send_invite_now"
  | "save_lead_only"
  | "agent_will_introduce_first";
export type RelationshipContext =
  | "new_lead"
  | "existing_client"
  | "past_client"
  | "referral_from_other"
  | "other";
export type LeadPromotionStatus =
  | "not_ready"
  | "agent_requested_review"
  | "funding_reviewing"
  | "promoted_to_intake"
  | "declined";

export type ClientExperienceMode = "guided" | "self_directed" | "hybrid";
export type ClientExperienceModeReason =
  | "agent_referred"
  | "self_signup"
  | "funding_team_required"
  | "underwriting_conditions"
  | "user_preference"
  | "super_admin_override";
export type ClientExperienceModeLockedBy =
  | "system"
  | "agent"
  | "funding_team"
  | "super_admin";

export interface RateSKU {
  id: string;
  label: string;
  loan_type: LoanType;
  rate: number;
  points: number;
  term: string;
  min_fico: number;
  max_ltv: number;
  delta_bps: number;
}

// Deal — agent-side transaction unit (Phase 3). A client can carry
// multiple deals (buyer search, seller listing, investor purchase),
// each promoted to its own Loan via mark-ready-for-lending.
export interface Deal {
  id: string;
  client_id: string;
  deal_type: string;
  side: string;
  status: string;
  title: string;
  summary: string | null;
  property_id: string | null;
  promoted_loan_id: string | null;
  assigned_agent_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  list_price: number | null;
  target_price: number | null;
  listing_status: string | null;
  mls_number: string | null;
  ai_status: string;
  handoff_status: string;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  deal_id: string;
  // Set when this loan was promoted from a deal (Phase 3). Used by
  // the chat surfaces to look up the (A) Agent deal-chat that
  // preceded this funding file.
  source_deal_id?: string | null;
  client_id: string;
  broker_id: string | null;
  address: string;
  city: string | null;
  property_type: PropertyType;
  type: LoanType;
  purpose: LoanPurpose | null;
  stage: LoanStage;
  amount: number;
  ltv: number | null;
  ltc: number | null;
  arv: number | null;
  base_rate: number | null;
  discount_points: number;
  final_rate: number | null;
  origination_pct: number;
  term_months: number | null;
  monthly_rent: number | null;
  annual_taxes: number;
  annual_insurance: number;
  monthly_hoa: number;
  dscr: number | null;
  risk_score: number | null;
  close_date: string | null;
  // Property details (writable via the AI property-intake tool +
  // desktop PropertyTab; alembic 0019 added unit_count).
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  unit_count?: number | null;
  // alembic 0023 — buyer-side or seller-side transaction. Drives
  // doc-checklist filtering at kickoff. Optional so existing
  // borrower-fetched payloads still type-check.
  side?: "buyer" | "seller";
  // Health pill driven by the deal-health summarizer (LLM-backed on desktop).
  // Optional — agent UI surfaces "stuck" / "at_risk" loans on Today.
  deal_health?: "on_track" | "at_risk" | "stuck" | null;
}

export interface RecalcResponse {
  final_rate: number;
  monthly_pi: number;
  dscr: number | null;
  cash_to_close_pricing: number;
  hud_total: number;
  warnings: { code: string; message: string; severity: string }[];
  loan_amount?: number | null;
  sizing?: {
    loan_amount: number;
    max_allowed: number;
    binding_constraint: string;
    clamped: boolean;
    ltv: number | null;
    ltc: number | null;
    arv_ltv: number | null;
    effective_ltv_cap: number | null;
    total_cost: number | null;
    cash_to_borrower: number | null;
    cash_to_close: number | null;
  } | null;
}

export interface CreditPullStatus {
  id: string;
  status: string;
  fico: number | null;
  pulled_at: string | null;
  expires_at: string | null;
  // Derived (computed in router) — UI uses these to render the
  // "expires in 12 days" pill without doing date math.
  is_expired?: boolean;
  days_until_expiry?: number | null;
  expiring_soon?: boolean;
}

// ── Credit summary (borrower-facing) ───────────────────────────────────────
// Shape mirrors qcdesktop/src/lib/types.ts CreditSummary — keep in sync.
export interface CreditSummaryBullet {
  kind: "positive" | "neutral" | "warn";
  label: string;
  detail: string | null;
}
export interface CreditSummaryProduct {
  id: string;
  label: string;
  loan_type: string;
  rate?: number;
  max_ltv?: number;
  term?: string;
  min_fico?: number;
  reason?: string;
}
export interface CreditSummary {
  fico: number | null;
  fico_model: string | null;
  tier: string | null;
  tier_max_ltv: number | null;
  bullets: CreditSummaryBullet[];
  recent_inquiries_6mo?: number;
  available_products: CreditSummaryProduct[];
  blocked_products: CreditSummaryProduct[];
  fraud_flag: string | null;
  note?: string;
}

export interface Activity {
  id: string;
  loan_id: string | null;
  actor_id: string | null;
  actor_label: string | null;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
}

export interface Document {
  id: string;
  loan_id: string;
  name: string;
  category: string | null;
  s3_key: string | null;
  status: DocStatus;
  requested_on: string | null;
  received_on: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

// /documents/upload-init returns either a presigned S3 URL (production) or
// null upload_url (dev mode without AWS keys — backend just records metadata).
export interface DocumentUploadInitResponse {
  document_id: string;
  upload_url: string | null;
  s3_key: string;
}

export interface AIChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatRequest {
  messages: AIChatTurn[];
  loan_id?: string | null;
}

export interface AIChatResponse {
  reply: string;
  model: string;
  used_stub: boolean;
}

// Persisted Underwriter chat threads (Phase 8)
export interface AIChatThread {
  id: string;
  title: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  // alembic 0021 — bumped on /threads/{id}/seen. Renders the
  // unread dot when last_message_at > last_seen_at.
  last_seen_at?: string | null;
  unread?: boolean;
  created_at: string;
  updated_at: string;
  // alembic 0017 — loan-scoped thread when set; account-wide when null.
  loan_id?: string | null;
  loan_deal_id?: string | null;
  loan_address?: string | null;
}

// /loans/{id}/required-documents (alembic 0017). Drives the
// vault upload sheet's checklist picker. Final row is always the
// "Other / not in checklist" sentinel (is_other=true,
// checklist_key=null).
export interface RequiredDocument {
  checklist_key: string | null;
  label: string;
  required: boolean;
  auto_request: boolean;
  is_other: boolean;
  current_document_id: string | null;
  current_status: "pending" | "requested" | "received" | "verified" | "flagged" | null;
  received_on: string | null;
  verified_at: string | null;
  days_since_requested: number | null;
}
// CTAs the AI emits via tool-use. The frontend renders a button per
// action under the assistant bubble; tapping deep-links into the
// vault upload flow (or an inline confirm endpoint).
export interface ChatAction {
  kind:
    | "upload_document"
    | "confirm_document_routing"
    | "complete_property_intake"
    | "open_calendar_event"
    // Realtor AI action cards (alembic 0030). Each maps to a backend
    // confirm-endpoint; the agent's tap fires the side effect.
    | "request_prequalification"
    | "send_buyer_agreement"
    | "send_listing_agreement"
    | "create_buyer_intake"
    | "create_seller_intake"
    | "schedule_showing"
    | "schedule_picture_day"
    | "prepare_cma_task"
    | "create_listing_prep_checklist"
    | "send_property_matches"
    | "draft_follow_up_text"
    | "draft_follow_up_email"
    | "mark_client_finance_ready"
    | "update_realtor_pipeline_stage";
  label: string;
  document_id?: string | null;
  checklist_key?: string | null;
  calendar_event_id?: string | null;
  // Set on Realtor AI action cards.
  client_id?: string | null;
  // For draft_* kinds, the AI pre-drafts a body the agent reviews.
  draft_body?: string | null;
  draft_subject?: string | null;
  confirm?: boolean;
}

// ── Realtor Client Intelligence Profile (alembic 0030) ────────────────
// Mirror of QCDashboard's RealtorClientProfile. Lives on
// Client.realtor_profile JSONB; written by the Realtor AI.
export interface RealtorClientProfile {
  client_id: string;
  agent_id: string;
  client_type: "buyer" | "seller" | "buyer_and_seller" | "unknown";
  relationship_stage:
    | "new_lead"
    | "contacted"
    | "needs_discovery"
    | "agreement_pending"
    | "active_client"
    | "finance_ready"
    | "handoff_to_lending"
    | "under_contract"
    | "closed"
    | "lost";
  intent_summary: string;
  buyer_profile?: {
    target_property_type?: string | null;
    target_location?: string | null;
    target_budget?: number | null;
    target_budget_range?: { low: number; high: number } | null;
    purchase_timeline?: "asap" | "0_30" | "30_60" | "60_plus" | null;
    financing_needed?: boolean | null;
    prequalified?: boolean;
    buyer_agreement_status?: "not_sent" | "sent" | "signed" | "n/a";
    proof_of_funds_status?: "not_collected" | "verbal" | "received";
    urgency_level?: "high" | "medium" | "low";
    showing_activity?: { date: string; address: string; outcome: string }[];
  } | null;
  seller_profile?: {
    property_address?: string | null;
    property_type?: string | null;
    desired_list_price?: number | null;
    selling_timeline?: string | null;
    listing_agreement_status?: "not_sent" | "sent" | "signed";
    photos_status?: "not_scheduled" | "scheduled" | "complete";
    cma_status?: "not_started" | "in_progress" | "complete";
    showing_instructions?: string | null;
    occupancy_status?: "owner" | "tenant" | "vacant" | null;
    payoff_amount?: number | null;
  } | null;
  known_facts?: { field: string; value: string; source: string; captured_at: string }[];
  missing_facts?: string[];
  documents?: { name: string; status: string; document_id?: string }[];
  open_tasks?: { title: string; due_date?: string; reason: string }[];
  next_best_question?: string | null;
  next_best_action?: string | null;
  readiness_score?: number;
}

// Files riding on a chat message. Borrower attaches via the
// composer paperclip → backend creates an is_other Document, runs
// vision scan, includes a chip on the persisted user message.
export interface ChatAttachment {
  document_id: string;
  name: string;
  content_type?: string | null;
  status?: string | null;
  suggested_checklist_key?: string | null;
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  created_at: string;
  actions?: ChatAction[] | null;
  attachments?: ChatAttachment[] | null;
}
export interface AIChatThreadDetail extends AIChatThread {
  messages: AIChatMessage[];
}
export interface AIChatSendResponse {
  user_message: AIChatMessage;
  assistant_message: AIChatMessage;
  thread: AIChatThread;
  used_stub: boolean;
}

// Account-wide living profile (Phase 8)
export interface ClientNextAction {
  title: string;
  owner: "client" | "broker" | "ai";
  priority: "low" | "medium" | "high";
  cta:
    | "upload_doc"
    | "run_credit"
    | "complete_profile"
    | "accept_prequal_offer"
    | "decline_prequal_offer"
    | "submit_prequal"
    | "respond_to_message"
    | "none";
  due_at: string | null;
}
export interface ClientLivingProfileBody {
  summary?: string;
  outstanding_documents?: { loan_id?: string; deal_id?: string; name: string; days_overdue?: number }[];
  blocking_credit_issues?: string[];
  next_actions?: ClientNextAction[];
  rate_pressure_notes?: string[];
  suggested_next_loan?: string | null;
}
export interface ClientLivingProfile {
  client_id: string;
  living_profile: ClientLivingProfileBody | null;
  living_summary: string | null;
  living_refreshed_at: string | null;
}

// Calendar (mirrors qcdesktop/src/lib/types.ts CalendarEvent + alembic 0013).
export type CalendarEventStatus = "pending" | "done" | "cancelled";
export type CalendarEventSource = "manual" | "auto" | "ai";

export interface CalendarEvent {
  id: string;
  loan_id: string | null;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  who: string | null;
  starts_at: string;
  duration_min: number | null;
  priority: "low" | "medium" | "high" | null;
  status: CalendarEventStatus;
  source: CalendarEventSource;
  owner_user_id: string | null;
  external_ref_kind: string | null;
  external_ref_id: string | null;
}

// Reports/dashboard
export interface StageBreakdown {
  stage: LoanStage;
  count: number;
  value: number;
}
export interface TypeBreakdown {
  type: string;
  count: number;
  value: number;
}
export interface DashboardReport {
  funded_ytd: number;
  funded_ytd_delta: number | null;
  pipeline_value: number;
  pipeline_count: number;
  avg_close_days: number | null;
  avg_close_delta: number | null;
  pull_through: number | null;
  pull_through_delta: number | null;
  by_stage: StageBreakdown[];
  by_type: TypeBreakdown[];
}

// ── Pre-qualification letter requests ─────────────────────────────────
// Mirrors QCDashboard/src/lib/types.ts — keep in sync.
//
// Lifecycle (backend alembic 0011+):
//   pending → approved → offer_accepted (Loan spawned at THIS step)
//                        offer_declined (no loan ever created)
//             rejected
//
// loan_id is NULL until offer_accepted — submit creates a standalone
// request, not a Loan.
export type PrequalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "offer_accepted"
  | "offer_declined";
// Four products. DSCR splits into purchase vs refi (5pt LTV haircut on
// refi); Fix & Flip is a first-class option alongside Bridge. Mirror of
// QCDashboard/src/lib/types.ts — keep in sync with backend
// app/routers/prequal.py LTV_CAPS.
export type PrequalLoanType = "dscr_purchase" | "dscr_refi" | "fix_flip" | "bridge";

// F&F scope-of-work line. Backend validates total_usd >= 0,
// category 1-80 chars, description 0-500 chars (alembic 0014).
export interface PrequalSowLineItem {
  category: string;
  description: string;
  total_usd: number;
}

export const PREQUAL_LTV_CAPS: Record<PrequalLoanType, number> = {
  dscr_purchase: 0.80,
  dscr_refi: 0.75,
  fix_flip: 0.85,
  bridge: 0.85,
};

export const PREQUAL_LOAN_TYPE_LABELS: Record<PrequalLoanType, { title: string; sub: string }> = {
  dscr_purchase: { title: "DSCR Purchase", sub: "30-yr fixed" },
  dscr_refi:     { title: "DSCR Refinance", sub: "Rate-and-term refi" },
  fix_flip:      { title: "Fix & Flip", sub: "Short-term rehab" },
  bridge:        { title: "Bridge", sub: "Short-term" },
};

export interface PrequalRequest {
  id: string;
  loan_id: string | null;
  requester_id: string;
  target_property_address: string;
  // For F&F: purchase_price is the BRV. For DSCR / Bridge it's the
  // property purchase / value.
  purchase_price: number;
  requested_loan_amount: number;
  // F&F-only (alembic 0014). Null on non-F&F products.
  arv_estimate: number | null;
  sow_items: PrequalSowLineItem[] | null;
  total_construction: number | null;
  approved_arv: number | null;
  approved_total_construction: number | null;
  approved_purchase_price: number | null;
  approved_loan_amount: number | null;
  approved_scenario: Record<string, unknown> | null;
  loan_type: PrequalLoanType;
  expected_closing_date: string | null;
  borrower_notes: string | null;
  admin_notes: string | null;
  // LLC / entity name on the letter. Null = TBD (letter falls back to
  // the borrower's individual legal name).
  borrower_entity: string | null;
  status: PrequalStatus;
  // Q-XXXX, generated on first approval and frozen across re-approvals.
  quote_number: string | null;
  // Presigned 24h GET URL — minted fresh on every API read.
  pdf_url: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrequalRequestCreate {
  target_property_address: string;
  purchase_price: number;
  requested_loan_amount: number;
  loan_type: PrequalLoanType;
  expected_closing_date?: string | null;
  borrower_notes?: string | null;
  borrower_entity?: string | null;
  // F&F-only. Backend ignores when loan_type !== fix_flip.
  arv_estimate?: number | null;
  sow_items?: PrequalSowLineItem[] | null;
}

export interface PrequalSellerOutcome {
  note?: string | null;
}

// FRED-driven market rates (mirrors qcdesktop)
export interface FredObservation {
  date: string;
  value: number | null;
}
export interface FredSeriesSummary {
  series_id: string;
  label: string;
  description: string;
  current_value: number | null;
  current_date: string | null;
  previous_value: number | null;
  delta_bps: number | null;
  spread_bps: number;
  estimated_rate: number | null;
  history_7d: FredObservation[];
  history_30d: FredObservation[];
  // Variable-window history (request via /fred/series?days=N). Optional so
  // older backend deploys still validate. The chart component prefers
  // `history` when present and falls back to `history_30d` / `history_7d`.
  history?: FredObservation[];
  history_days?: number;
}

// ── Agent dashboard metrics ────────────────────────────────────────
// Mirrors qcdesktop's FunnelMetrics / NextAction shape (defined in
// qcdesktop/src/hooks/useApi.ts). Backed by:
//   GET /agents/me/funnel
//   GET /agents/me/next-actions

export interface FunnelStat {
  value: number | null;
  sample_size: number;
}

export interface FunnelMetrics {
  leads_this_week: number;
  contacted: number;
  stale_lead_count: number;
  intake_completion: FunnelStat;
  prequal_conversion: FunnelStat;
  lead_to_prequal: FunnelStat;
  prequal_to_funded: FunnelStat;
  clients_by_stage: Record<string, number>;
}

export type NextActionKind = "call_lead" | "chase_doc" | "closing_prep" | "pending_task";

export interface NextAction {
  id: string;
  kind: NextActionKind;
  priority: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  target_type: "client" | "loan" | "document" | "ai_task";
  target_id: string;
  deeplink: string;
  created_at: string;
  client_id: string | null;
  loan_id: string | null;
}

// Mirrors qcdesktop's AITask shape (alembic 0021).
export interface AITask {
  id: string;
  loan_id: string | null;
  source: AITaskSource;
  priority: AITaskPriority;
  status: AITaskStatus;
  action: string;
  title: string;
  summary: string;
  confidence: number;
  agent: string;
  draft_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Mirrors qcdesktop's BrokerSettings shape. Backed by:
//   GET /me/broker-settings
//   PUT /me/broker-settings
export interface BrokerSettings {
  stale_lead_threshold_days: number;
  default_buyer_doc_set: string | null;
  default_seller_doc_set: string | null;
  notify_on_new_lead: boolean;
  notify_on_stuck_deal: boolean;
}

// Mirrors qcdesktop's EngagementSignal — backed by GET /clients/{id}/engagement.
export type EngagementSignalType =
  | "invite_opened"
  | "intake_started"
  | "intake_abandoned_step"
  | "doc_uploaded"
  | "document_viewed"
  | "message_viewed"
  | "login"
  | "last_action"
  | "simulator_used"
  | "profile_updated"
  | "credit_pull_started"
  | "credit_pull_completed"
  | "calendar_event_viewed";

export interface EngagementSignal {
  id: string;
  client_id: string;
  deal_id: string | null;
  signal_type: EngagementSignalType;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

// ── Deal Secretary (AI delegation) — mirror of QCDashboard types ──

export type DSRequirementCategory =
  | "borrower_info"
  | "property_data"
  | "financials"
  | "credit"
  | "agreements"
  | "insurance"
  | "title_and_escrow"
  | "appraisal_and_inspection"
  | "scheduling"
  | "compliance"
  | "communication"
  | "ai_internal";

export type DSTaskOwnerType = "human" | "ai";

// Subset of the full desktop DSTaskRow — enough fields for the
// mobile swipe row + detail sheet. Backend returns extra fields
// that we ignore safely.
export interface DSTaskRow {
  client_requirement_status_id: string;
  requirement_key: string;
  label: string;
  category: DSRequirementCategory;
  required_level: "required" | "recommended" | "optional";
  status: string;
  owner_type: DSTaskOwnerType;
  source: string;
  objective_text: string;
  completion_criteria: string;
  due_at: string | null;
  blocks_stage: string | null;
}

export interface DSDealSecretaryView {
  loan_id: string | null;
  client_id: string;
  // The two-column desktop split: left = human-owned, right = AI-owned.
  // Mobile flattens these into one swipe list.
  left: DSTaskRow[];
  right: DSTaskRow[];
}
