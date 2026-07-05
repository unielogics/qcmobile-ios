import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedFetch } from "./useAuthedFetch";
import { useSession } from "@/store/session";
import type {
  Loan,
  RecalcResponse,
  CreditPullStatus,
  CreditSummary,
  BillingAddress,
  PaymentAuthorizationStatusRead,
  PaymentAuthorizationStartResponse,
  PaymentAuthorizationCompleteResponse,
  SetupIntentResponse,
  CreditPullAccessRead,
  User,
  Client,
  Deal,
  RateSKU,
  Activity,
  Document,
  DocumentUploadInitResponse,
  AIChatRequest,
  AIChatResponse,
  AIChatThread,
  AIChatThreadDetail,
  AIChatSendResponse,
  ClientLivingProfile,
  RequiredDocument,
  CalendarActivityItem,
  CalendarEvent,
  DashboardReport,
  FredSeriesSummary,
  PrequalRequest,
  AdminPrequalCreate,
  PrequalRequestCreate,
  PrequalSellerOutcome,
  AITask,
  AddressResolveResponse,
  AddressSuggestion,
  AnalysisProduct,
  AnalysisSource,
  AnalysisRun,
  AnalysisRunCreate,
  AnalysisRunPrequalRequest,
  AnalysisRunPrequalResponse,
  AnalysisRunUpdate,
  BrokerSettings,
  AgentSettingsRead,
  EngagementSignal,
  FunnelMetrics,
  ListScope,
  NextAction,
  PropertyIntelligenceLookupRequest,
  PropertyIntelligenceSnapshot,
  ShareAnalysisResponse,
} from "@/lib/types";
import type { ClientStage, LoanPurpose } from "@/lib/enums.generated";

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function isNotFound(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof NotFoundError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b/.test(msg);
}

function useCacheKey() {
  // Returning a key that incorporates Clerk's `isLoaded` makes
  // EVERY query that uses this helper auto-recover from the
  // auth-readiness race: useAuthedFetch returns a never-resolving
  // promise on the first render before Clerk has hydrated, and RQ
  // doesn't auto-cancel the in-flight queryFn when its closure
  // changes. By baking isLoaded into the key, the auth flip
  // produces a NEW queryKey → RQ starts a fresh query with the
  // updated fetcher → events arrive immediately.
  //
  // First seen on the calendar tab; the chat sheet hit the same
  // bug because useAIChatThreads / useLoans / useAIChatThread all
  // use this key.
  const { isLoaded } = useAuth();
  const devUser = useSession((s) => s.devUser);
  return isLoaded ? devUser : `__auth_pending__${devUser ?? ""}`;
}

// /auth/me — canonical "who am I?". Mirrors qcdesktop's useCurrentUser:
// short staleTime + refetchOnWindowFocus so backend-side role changes
// (demote_to_client.py, Settings → Team) propagate within a tab-switch
// instead of taking 5 minutes.
//
// In React Native `refetchOnWindowFocus` only does anything when the app
// has wired focusManager to AppState — see app/_layout.tsx. Without that
// it's a no-op, but harmless.
export function useCurrentUser() {
  const fetcher = useAuthedFetch();
  const { isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["auth-me", isSignedIn],
    queryFn: () => fetcher<User>("/auth/me"),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isLoaded,
  });
}

// Backward-compat alias — older mobile screens import { useMe }. New code
// should use useCurrentUser to stay aligned with desktop naming.
export const useMe = useCurrentUser;

export function useRates() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["rates", key],
    queryFn: () => fetcher<RateSKU[]>("/rates"),
    staleTime: 60 * 1000,
  });
}

// `scope` is optional. Pass "mine" from agent screens to ask the backend for
// the broker's own book (matches qcdesktop's useLoans("mine")). Borrower
// callers omit it and continue to get the auto-scoped result.
export function useLoans(scope?: ListScope) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const qs = scope ? `?scope=${scope}` : "";
  return useQuery({
    queryKey: ["loans", scope ?? "auto", key],
    queryFn: () => fetcher<Loan[]>(`/loans${qs}`),
  });
}

export function useLoan(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["loan", loanId, key],
    queryFn: () => fetcher<Loan>(`/loans/${loanId}`),
    enabled: !!loanId,
    // Poll every 15s so CLIENTs see operator/AI edits propagate without
    // a page refresh. Slice 3 will replace this with WebSocket push.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

// Single canonical credit hook used by /profile, /home, /simulator, and
// /credit-pull. ALL of these need to see the same source of truth — when
// the borrower pulls credit on desktop and reopens mobile, every screen
// should reflect it without refetching individually.
//
// Previously we had two hooks (useCreditCurrent + useMyCredit) with
// DIFFERENT queryKeys hitting the SAME endpoint. The backend ignores the
// client_id query param and just uses user.client.id, so the responses
// are identical, but react-query treated them as separate caches —
// causing profile to show the score while home/simulator stayed gated.
//
// This consolidates: both names point at the same useQuery so any
// consumer's mount/refocus refetch warms the cache for everyone else.
export function useCreditCurrent() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const access = useCreditPullAccess();
  // Gate on Clerk readiness — useAuthedFetch returns a never-resolving
  // promise while Clerk is still loading, which would otherwise leave
  // this query stuck in `pending` forever for any screen that mounts
  // before sign-in finishes (notably the Home tab, which is the default).
  const { isLoaded } = useAuth();
  return useQuery({
    queryKey: ["credit-current", key],
    queryFn: () => fetcher<CreditPullStatus | null>("/credit/current"),
    enabled: isLoaded && (access.data ? access.data.can_run_credit : false),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
}

export function useCurrentCredit(clientId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const access = useCreditPullAccess();
  return useQuery({
    queryKey: ["credit", clientId ?? null, key],
    queryFn: () => fetcher<CreditPullStatus | null>(`/credit/current?client_id=${encodeURIComponent(clientId!)}`),
    enabled: !!clientId && (access.data ? access.data.can_run_credit : false),
    staleTime: 30 * 1000,
  });
}

// Backed by /clients/me. Returns the calling user's linked Client record
// (phone, address, city, tier, etc.). Used to pre-fill borrower-facing
// flows like Credit & Pre-Authorization. 404 is expected for operator users
// with no client linkage — don't retry.
export function useMyClient() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["my-client", key],
    queryFn: () => fetcher<Client>("/clients/me"),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

// Borrower-safe summary derived from the parsed credit report.
// Backend: GET /credit/pulls/{id}/summary.
export function useCreditSummary(pullId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const access = useCreditPullAccess();
  return useQuery({
    queryKey: ["credit-summary", pullId, key],
    queryFn: () => fetcher<CreditSummary>(`/credit/pulls/${pullId}/summary`),
    enabled: !!pullId && (access.data ? access.data.can_run_credit : false),
  });
}

export function useCreditPullAccess() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const { isLoaded } = useAuth();
  return useQuery({
    queryKey: ["credit-pull-access", key],
    queryFn: () => fetcher<CreditPullAccessRead>("/credit/pull-access"),
    enabled: isLoaded,
    staleTime: 30 * 1000,
  });
}

export function usePaymentAuthorizationStatus() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const { isLoaded } = useAuth();
  return useQuery({
    queryKey: ["payment-authorization-status", key],
    queryFn: () => fetcher<PaymentAuthorizationStatusRead>("/billing/payment-authorization/status"),
    enabled: isLoaded,
    staleTime: 30 * 1000,
  });
}

export function useStartPaymentAuthorization() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetcher<PaymentAuthorizationStartResponse>("/billing/payment-authorization/start", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-authorization-status"] }),
  });
}

export function useCreateSetupIntent() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: (payload: { authorization_id?: string; billing?: BillingAddress }) =>
      fetcher<SetupIntentResponse>("/billing/setup-intents", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useCompletePaymentAuthorization() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      authorization_id: string;
      setup_intent_id: string;
      typed_name: string;
      esign_consent: boolean;
      payment_terms_consent: boolean;
      signature_data_url: string;
      billing: BillingAddress;
      device_metadata?: Record<string, unknown>;
    }) =>
      fetcher<PaymentAuthorizationCompleteResponse>("/billing/payment-authorization/complete", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-authorization-status"] });
      qc.invalidateQueries({ queryKey: ["credit-pull-access"] });
      qc.invalidateQueries({ queryKey: ["credit-current"] });
    },
  });
}

export function useStartCreditPull() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetcher<CreditPullStatus>("/credit/pull", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      // useMyCredit / useCreditCurrent are now a single hook backed by
      // queryKey ["credit-current", key]. Seed it so the simulator
      // unlocks immediately when the user navigates back from credit-pull.
      // We also leave the legacy invalidations in place in case any other
      // module was caching under those older prefixes.
      qc.setQueryData(["credit-current", key], data);
      qc.invalidateQueries({ queryKey: ["credit-current"] });
      qc.invalidateQueries({ queryKey: ["credit"] });
      qc.invalidateQueries({ queryKey: ["my-credit"] });
    },
  });
}

export function useRecalc() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: ({
      loanId, discount_points, base_rate, loan_amount, annual_taxes, annual_insurance, monthly_hoa, ltv, purpose, arv, brv, rehab_budget, payoff, ltv_tier_cap,
    }: {
      loanId: string;
      discount_points: number;
      base_rate?: number;
      loan_amount?: number;
      annual_taxes?: number;
      annual_insurance?: number;
      monthly_hoa?: number;
      ltv?: number;
      purpose?: LoanPurpose | null;
      arv?: number | null;
      brv?: number | null;
      rehab_budget?: number | null;
      payoff?: number | null;
      ltv_tier_cap?: number | null;
    }) =>
      fetcher<RecalcResponse>(`/loans/${loanId}/recalc`, {
        method: "POST",
        body: JSON.stringify({
          discount_points,
          base_rate,
          loan_amount,
          annual_taxes,
          annual_insurance,
          monthly_hoa,
          ltv,
          purpose,
          arv,
          brv,
          rehab_budget,
          payoff,
          ltv_tier_cap,
        }),
      }),
  });
}

export function useLoanActivity(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["loanActivity", loanId, key],
    queryFn: () => fetcher<Activity[]>(`/loans/${loanId}/activity`),
    enabled: !!loanId,
  });
}

export function useDocuments(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["documents", loanId, key],
    queryFn: () => fetcher<Document[]>(loanId ? `/documents?loan_id=${loanId}` : "/documents"),
  });
}

export interface DocAnalysisResponse {
  summary: {
    total: number;
    reviewed: number;
    flagged: number;
    conflicts: number;
    verdict: "clean" | "needs_review" | "pending";
    headline: string;
  };
  documents: {
    document_id: string;
    name: string;
    status: string;
    detected_type: string | null;
    confidence: number | null;
    ai_notes: string | null;
    ai_scan_status: string | null;
    issues: Record<string, unknown>[];
  }[];
}
// Aggregate AI underwriting read. No arg → backend auto-scopes to the
// signed-in client's docs (CLIENT role); pass a loanId to narrow.
export function useDocumentsAnalysis(loanId?: string | null) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["documents-analysis", loanId ?? null, key],
    queryFn: () =>
      fetcher<DocAnalysisResponse>(
        loanId ? `/documents/analysis?loan_id=${loanId}` : "/documents/analysis",
      ),
    staleTime: 30 * 1000,
  });
}

// Upload a document to a specific loan. Two-step:
//   1. POST /documents/upload-init  → { document_id, upload_url (presigned S3) }
//   2. PUT the file blob to upload_url with x-amz-server-side-encryption: AES256
//
// In dev mode (no AWS keys on backend) upload_url is null — we still record
// metadata so the doc shows up in /documents. Mirrors qcdesktop's
// useUploadDocument but takes RN-style file refs (uri / name / mimeType).
export function useUploadDocument() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      loan_id: string;
      file: { uri: string; name: string; mimeType: string };
      category?: string;
      // alembic 0017 — pick exactly one of these to link the upload
      // to the loan's checklist for AI vision scanning.
      fulfill_document_id?: string | null;
      checklist_key?: string | null;
      is_other?: boolean;
      // Optional name override (so checklist labels stick).
      name?: string;
    }) => {
      const init = await fetcher<DocumentUploadInitResponse>("/documents/upload-init", {
        method: "POST",
        body: JSON.stringify({
          loan_id: vars.loan_id,
          name: vars.name ?? vars.file.name,
          content_type: vars.file.mimeType,
          category: vars.category,
          fulfill_document_id: vars.fulfill_document_id ?? null,
          checklist_key: vars.checklist_key ?? null,
          is_other: !!vars.is_other,
        }),
      });
      if (init.upload_url) {
        // Read the file as a Blob from its local uri, then PUT it to S3.
        // RN's fetch handles file:// uris natively.
        const fileResp = await fetch(vars.file.uri);
        const blob = await fileResp.blob();
        const put = await fetch(init.upload_url, {
          method: "PUT",
          body: blob,
          headers: {
            "Content-Type": vars.file.mimeType,
            "x-amz-server-side-encryption": "AES256",
          },
        });
        if (!put.ok) throw new Error(`S3 upload failed: ${put.status} ${put.statusText}`);
        // Flip the doc to RECEIVED + queue the vision scan.
        await fetcher(`/documents/upload-complete`, {
          method: "POST",
          body: JSON.stringify({ document_id: init.document_id }),
        });
      }
      return init;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.loan_id] });
      qc.invalidateQueries({ queryKey: ["documents", undefined] });
      qc.invalidateQueries({ queryKey: ["documents", null] });
      qc.invalidateQueries({ queryKey: ["required-documents", vars.loan_id] });
    },
  });
}

// /loans/{id}/required-documents — drives the upload sheet's
// checklist picker.
export function useRequiredDocuments(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["required-documents", loanId, key],
    queryFn: () => fetcher<RequiredDocument[]>(`/loans/${loanId}/required-documents`),
    enabled: !!loanId,
  });
}

// Find-or-create the AI chat thread. Lazy-spawn on first tap.
// alembic 0030 added client_id alongside loan_id for the Realtor AI's
// per-client threads. Routing precedence: loan_id > client_id > both
// null (account-wide).
export function useFindOrCreateChatThread() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: ({ loan_id, client_id }: { loan_id?: string | null; client_id?: string | null }) =>
      fetcher<AIChatThread>("/ai/chat/threads/find-or-create", {
        method: "POST",
        body: JSON.stringify({ loan_id: loan_id ?? null, client_id: client_id ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiChatThreads", key] }),
  });
}

export function useAIChat() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: (payload: AIChatRequest) =>
      fetcher<AIChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

// ── Persisted Underwriter chat threads (Phase 8) ──────────────────────────

export function useAIChatThreads() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["aiChatThreads", key],
    queryFn: () => fetcher<AIChatThread[]>("/ai/chat/threads"),
    // Poll every 15s so the chat icon's unread dot reflects new
    // system messages (kickoff opener, anchor narration, doc-reminder
    // tier-1) without waiting for a manual refresh.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useAIChatThread(threadId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["aiChatThread", threadId, key],
    queryFn: () => fetcher<AIChatThreadDetail>(`/ai/chat/threads/${threadId}`),
    enabled: !!threadId,
    // While the thread is open, poll for new messages so the AI's
    // anchor narration ("Got your bank statements!") shows up
    // without a manual close/reopen.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

// Bumps `last_seen_at = now()` on the thread. Called when the
// borrower opens a thread so the unread dot clears.
export function useMarkThreadSeen() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: (threadId: string) =>
      fetcher<AIChatThread>(`/ai/chat/threads/${threadId}/seen`, {
        method: "POST",
      }),
    onSuccess: (_, threadId) => {
      qc.invalidateQueries({ queryKey: ["aiChatThread", threadId, key] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", key] });
    },
  });
}

export function useCreateAIChatThread() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: (payload: { title?: string | null }) =>
      fetcher<AIChatThread>("/ai/chat/threads", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiChatThreads", key] }),
  });
}

export function useSendAIChatMessage() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: ({
      threadId,
      body,
      loan_id,
      attachment_tokens,
    }: {
      threadId: string;
      body: string;
      loan_id?: string | null;
      attachment_tokens?: string[] | null;
    }) =>
      fetcher<AIChatSendResponse>(`/ai/chat/threads/${threadId}/message`, {
        method: "POST",
        body: JSON.stringify({
          body,
          loan_id: loan_id ?? null,
          attachment_tokens: attachment_tokens ?? null,
        }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiChatThread", vars.threadId, key] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", key] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// Chat-composer paperclip: mints a presigned URL for a file the
// borrower drops into a loan-scoped chat thread. The next send-msg
// call (with the returned document_id in `attachment_tokens`)
// flips the doc RECEIVED, runs vision scan, and lets the AI
// propose routing in its reply.
export function useChatAttachmentInit() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: async (vars: {
      threadId: string;
      file: { uri: string; name: string; mimeType: string };
    }): Promise<{ document_id: string }> => {
      const init = await fetcher<{
        document_id: string;
        upload_url: string | null;
        s3_key: string;
      }>(`/ai/chat/threads/${vars.threadId}/attachments/upload-init`, {
        method: "POST",
        body: JSON.stringify({
          name: vars.file.name,
          content_type: vars.file.mimeType,
        }),
      });
      if (init.upload_url) {
        const fileResp = await fetch(vars.file.uri);
        const blob = await fileResp.blob();
        const put = await fetch(init.upload_url, {
          method: "PUT",
          body: blob,
          headers: {
            "Content-Type": vars.file.mimeType,
            "x-amz-server-side-encryption": "AES256",
          },
        });
        if (!put.ok) throw new Error(`S3 upload failed: ${put.status} ${put.statusText}`);
      }
      return { document_id: init.document_id };
    },
  });
}

// Hit by the chat's confirm_document_routing CTA. Relinks an
// orphan upload to a checklist slot (or merges it into the slot's
// existing REQUESTED row).
export function useRouteDocument() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: ({
      documentId,
      checklist_key,
    }: {
      documentId: string;
      checklist_key: string | null;
    }) =>
      fetcher(`/documents/${documentId}/route`, {
        method: "POST",
        body: JSON.stringify({
          checklist_key,
          is_other: checklist_key == null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["aiChatThread"] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", key] });
    },
  });
}

export function useDeleteAIChatThread() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: (threadId: string) =>
      fetcher<void>(`/ai/chat/threads/${threadId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiChatThreads", key] }),
  });
}

// ── Account-wide living profile (Phase 8) ─────────────────────────────────

export function useMyLivingProfile() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["myLivingProfile", key],
    queryFn: () => fetcher<ClientLivingProfile>("/clients/me/living-profile"),
    staleTime: 60_000,
  });
}

export function useRefreshMyLivingProfile() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  const key = useCacheKey();
  return useMutation({
    mutationFn: () =>
      fetcher<ClientLivingProfile>("/clients/me/summary/refresh", { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(["myLivingProfile", key], data),
  });
}

// /reports/dashboard — KPI tiles (funded YTD, pipeline value, avg close, pull-through)
export function useDashboardReport() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["dashboard-report", key],
    queryFn: () => fetcher<DashboardReport>("/reports/dashboard"),
    staleTime: 30 * 1000,
  });
}

// /calendar — agenda events (today + upcoming)
export interface CalendarQueryParams {
  from?: string | null;
  to?: string | null;
  days?: number;
  include_cancelled?: boolean;
}

function calendarQuery(params?: CalendarQueryParams & { limit?: number }): string {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.days != null) qs.set("days", String(params.days));
  if (params?.include_cancelled != null) qs.set("include_cancelled", String(params.include_cancelled));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export function useCalendar(params?: CalendarQueryParams) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  // Gate on Clerk's `isLoaded`. When the user hits the Calendar tab
  // before auth has hydrated, the fetcher returns a never-resolving
  // promise (the auth-readiness gate inside useAuthedFetch). React
  // Query doesn't auto-cancel an in-flight queryFn when its
  // closure changes, so without this we'd stay in `pending` even
  // after auth comes up. Putting `isLoaded` in the queryKey makes
  // the auth-flip create a fresh query that uses the working
  // fetcher → resolves immediately.
  const { isLoaded } = useAuth();
  return useQuery({
    queryKey: ["calendar", key, isLoaded, params ?? {}],
    queryFn: () => fetcher<CalendarEvent[]>(`/calendar${calendarQuery(params)}`),
    enabled: isLoaded,
    // Borrower hits the tab expecting fresh status — emitter-driven
    // events (doc due, closing day, etc.) appear without a manual
    // refresh.
    staleTime: 30 * 1000,
  });
}

export function useCalendarActivity(params?: CalendarQueryParams & { limit?: number }) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const { isLoaded } = useAuth();
  return useQuery({
    queryKey: ["calendarActivity", key, isLoaded, params ?? {}],
    queryFn: () => fetcher<CalendarActivityItem[]>(`/calendar/activity${calendarQuery(params)}`),
    enabled: isLoaded,
    staleTime: 30 * 1000,
  });
}

// PATCH /calendar/{id} — mark done / re-open. Borrowers may only flip
// status; backend enforces. Operators can also patch title/who/etc.
export function useUpdateCalendarEvent() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        status: "pending" | "done" | "cancelled";
        title: string;
        description: string | null;
        starts_at: string;
        priority: "low" | "medium" | "high" | null;
      }>;
    }) =>
      fetcher<CalendarEvent>(`/calendar/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["calendarActivity"] });
    },
  });
}

// /fred/series — FRED-driven market rates with spreads.
// Mirrors qcdesktop's useFredSeries. The optional `days` argument (1..90)
// requests a wider history window for the rate-explorer chart; default
// (omit) returns the standard 30-day bundle. Days is part of the queryKey
// so different ranges cache independently.
export function useFredSeries(days?: number) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  // Same Clerk-readiness gate as useCreditCurrent — the home tab mounts
  // before sign-in finishes, and a never-resolving promise from the
  // pre-Clerk fetcher would leave the rate strip stuck on "—".
  const { isLoaded } = useAuth();
  const requested = days != null ? Math.max(1, Math.min(days, 90)) : undefined;
  const path = requested ? `/fred/series?days=${requested}` : "/fred/series";
  return useQuery({
    queryKey: ["fredSeries", key, requested ?? "default"],
    queryFn: () => fetcher<FredSeriesSummary[]>(path),
    enabled: isLoaded,
    // Previously: 5-min staleTime + 1-retry cap meant a single transient
    // 401 (e.g. during a sign-in race) left the hook stuck on the cached
    // error for 5 min — and the user saw "market rates not loading".
    // Now: 60s staleTime, retry up to 3 times on transport errors,
    // refetch on every mount so navigating back to home/calculator
    // always re-attempts.
    staleTime: 60 * 1000,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

// Single-series with full history — used by detail screens that want to
// drill into one rate. Mirrors qcdesktop's useFredSeriesDetail.
export function useFredSeriesDetail(seriesId: string | null, days = 30) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["fredSeries", seriesId, days, key],
    queryFn: () => fetcher<FredSeriesSummary>(`/fred/series/${seriesId}?days=${days}`),
    enabled: !!seriesId,
  });
}

// POST /loans/calc — loan-less what-if pricing. Mirrors qcdesktop's
// useFreeCalc so the mobile simulator can stop doing client-side math
// and use the same backend pricing engine the operator surface uses.
export function useFreeCalc() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: (body: {
      type: string;
      property_type?: string;
      loan_amount: number;
      base_rate: number;
      discount_points: number;
      term_months?: number | null;
      monthly_rent?: number | null;
      annual_taxes?: number;
      annual_insurance?: number;
      monthly_hoa?: number;
    }) =>
      fetcher<RecalcResponse>("/loans/calc", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useAddressAutocomplete(input: string, sessionToken?: string | null) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const q = input.trim();
  return useQuery({
    queryKey: ["property-intelligence", "address-autocomplete", q, sessionToken ?? null, key],
    queryFn: () =>
      fetcher<AddressSuggestion[]>("/property-intelligence/address/autocomplete", {
        method: "POST",
        body: JSON.stringify({ input: q, session_token: sessionToken ?? null }),
      }),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useResolveAddress() {
  const fetcher = useAuthedFetch();
  return useMutation({
    mutationFn: (payload: { place_id?: string | null; address?: string | null; session_token?: string | null }) =>
      fetcher<AddressResolveResponse>("/property-intelligence/address/resolve", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function usePropertyIntelligenceLookup() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PropertyIntelligenceLookupRequest) =>
      fetcher<PropertyIntelligenceSnapshot>("/property-intelligence/lookup", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property-intelligence"] }),
  });
}

export function useCreateAnalysisRun() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AnalysisRunCreate) =>
      fetcher<AnalysisRun>("/analysis-runs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateAnalysisRun() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AnalysisRunUpdate }) =>
      fetcher<AnalysisRun>(`/analysis-runs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useShareAnalysisRun() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      fetcher<ShareAnalysisResponse>(`/analysis-runs/${runId}/share-to-client`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useConvertAnalysisRunToPrequal() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, payload }: { runId: string; payload: AnalysisRunPrequalRequest }) =>
      fetcher<AnalysisRunPrequalResponse>(`/analysis-runs/${runId}/prequal-request`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useAnalysisRuns(filters?: {
  client_id?: string | null;
  loan_id?: string | null;
  product?: AnalysisProduct | null;
  tool_source?: AnalysisSource | null;
  updated_since?: string | null;
  limit?: number | null;
  shared?: boolean;
}) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const qs = new URLSearchParams();
  if (filters?.client_id) qs.set("client_id", filters.client_id);
  if (filters?.loan_id) qs.set("loan_id", filters.loan_id);
  if (filters?.product) qs.set("product", filters.product);
  if (filters?.tool_source) qs.set("tool_source", filters.tool_source);
  if (filters?.updated_since) qs.set("updated_since", filters.updated_since);
  if (filters?.limit) qs.set("limit", String(filters.limit));
  if (filters?.shared != null) qs.set("shared", String(filters.shared));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return useQuery({
    queryKey: ["analysis-runs", filters ?? {}, key],
    queryFn: () => fetcher<AnalysisRun[]>(`/analysis-runs${suffix}`).catch(() => [] as AnalysisRun[]),
    retry: false,
  });
}

export function useAdminPrequalRequests(status?: string | null) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: ["prequal-requests", "admin", status ?? "all", key],
    queryFn: () => fetcher<PrequalRequest[]>(`/admin/prequal-requests${qs}`).catch(() => [] as PrequalRequest[]),
    staleTime: 30 * 1000,
    retry: false,
  });
}

// /credit/current?client_id=self — explicit "my own credit" lookup. Mirrors
// desktop's useMyCredit. The plain useCreditCurrent (no scope) works for
// any role; this version is the one to call from CLIENT-only flows so the
// intent is explicit in the code.
// Alias for useCreditCurrent — same cache, same data. Kept as a separate
// name only so existing callers don't have to be touched. New code should
// prefer useCreditCurrent directly. See the comment on useCreditCurrent
// for the consolidation rationale.
export function useMyCredit() {
  return useCreditCurrent();
}

// ── Pre-qualification letters (borrower-only on mobile) ───────────────
// Mirrors QCDashboard hooks. Mobile only ships the borrower flow:
// submit, list, and report-back the seller's outcome. No admin queue,
// no review modal — operators stay on desktop.

export function useMyPrequalRequests() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["prequal-requests", "me", key],
    queryFn: () => fetcher<PrequalRequest[]>("/me/prequal-requests"),
    // Borrower opens the app expecting fresh status — pending may have
    // flipped to approved while they were away.
    staleTime: 30 * 1000,
  });
}

export function useSubmitPrequalRequest() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PrequalRequestCreate) =>
      fetcher<PrequalRequest>("/prequal-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
    // Even on error we refresh the list — F&F auto-approval can write
    // the row to the DB, then time out during PDF render and surface as
    // 502/504 to the proxy. The borrower's request is real either way;
    // we want them to see it on the next render rather than re-submit.
    onError: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
  });
}

export function useAdminCreateManualPrequal() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminPrequalCreate) =>
      fetcher<PrequalRequest>("/admin/prequal-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["fixFlipScenarios"] });
    },
  });
}

export function useAcceptPrequalOffer() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: PrequalSellerOutcome }) =>
      fetcher<PrequalRequest>(`/me/prequal-requests/${requestId}/accept-offer`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
      // Acceptance spawns a Loan — refresh the borrower's loan list so
      // it appears in the My Loans section under the prequal section.
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useDeclinePrequalOffer() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: PrequalSellerOutcome }) =>
      fetcher<PrequalRequest>(`/me/prequal-requests/${requestId}/decline-offer`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
  });
}

// ─── Agent (broker) hooks ─────────────────────────────────────────
// All ported from QCDashboard/src/hooks/useApi.ts. Same endpoints,
// same query-key shape. Used exclusively by the app/agent/* routes.

export function useClients(scope?: ListScope, options?: { enabled?: boolean }) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const qs = scope ? `?scope=${scope}` : "";
  return useQuery({
    queryKey: ["clients", scope ?? "auto", key],
    queryFn: () => fetcher<Client[]>(`/clients${qs}`),
    enabled: options?.enabled ?? true,
  });
}

export function useUsers(options?: { enabled?: boolean }) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["users", key],
    queryFn: () => fetcher<User[]>("/users").catch(() => [] as User[]),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useClient(clientId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["client", clientId, key],
    queryFn: () => fetcher<Client>(`/clients/${clientId}`),
    enabled: !!clientId,
  });
}

export function useAITasks() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["aiTasks", key],
    queryFn: () => fetcher<AITask[]>("/ai-tasks").catch(() => [] as AITask[]),
    retry: false,
  });
}

// /agents/me/funnel — backend-scoped to the broker's book. May 404 on
// older deploys; agent screens fall back to deriveFunnelFromLoans().
export function useLeadFunnel() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["leadFunnel", key],
    queryFn: () => fetcher<FunnelMetrics>("/agents/me/funnel"),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

// /agents/me/next-actions — backend-built action queue. May 404; agent
// screens fall back to deriveNextActionsFromLoans().
export function useNextActions() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["nextActions", key],
    queryFn: () => fetcher<NextAction[]>("/agents/me/next-actions"),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

export function useBrokerSettings() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["brokerSettings", key],
    queryFn: () => fetcher<BrokerSettings>("/me/broker-settings"),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

export function useAgentSettings(options?: { enabled?: boolean }) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["agentSettings", key],
    queryFn: () => fetcher<AgentSettingsRead>("/me/broker-settings"),
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

export function useUpdateBrokerSettings() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<BrokerSettings>) =>
      fetcher<BrokerSettings>("/me/broker-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokerSettings"] });
    },
  });
}

export function useEngagement(clientId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["engagement", clientId, key],
    queryFn: () =>
      fetcher<EngagementSignal[]>(`/clients/${clientId}/engagement`).catch(() => [] as EngagementSignal[]),
    enabled: !!clientId,
    retry: false,
  });
}

// Stage transitions — both wired to dashboard's PATCH /clients/{id}/stage
// and POST /clients/{id}/start-funding. May 404 on older backends.
export function useUpdateClientStage() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, stage }: { clientId: string; stage: ClientStage }) =>
      fetcher<Client>(`/clients/${clientId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

export function useStartFunding() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      fetcher<Client>(`/clients/${clientId}/start-funding`, { method: "POST" }),
    onSuccess: (_, clientId) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

// POST /clients — broker-side "Add Lead". Backend hard-stamps broker_id
// from the session for Role.BROKER, so we don't send it. Lead routing /
// ownership / attribution fields (alembic 0029) sit alongside the
// basic name/email/phone — captured by the mobile AgentAddLeadRoute.
export function useCreateClient() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      email?: string;
      phone?: string;
      city?: string;
      referral_source?: string;
      stage?: ClientStage;
      client_type?: "buyer" | "seller";
      // Per-lead overrides (alembic 0025).
      lead_intake?: Record<string, unknown> | null;
      checklist_overrides?: Record<string, unknown> | null;
      ai_cadence_override?: Record<string, unknown> | null;
      // Lead routing / ownership / attribution (alembic 0029). Mirrors
      // QCDashboard so the mobile agent flow fills in the same data
      // and the funding team has parity context regardless of channel.
      lead_source?: string;
      lead_temperature?: string;
      financing_support_needed?: string;
      contact_permission?: string;
      relationship_context?: string;
      source_channel?: string;
    }) =>
      fetcher<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Create a loan-file (Pipeline tab) for an existing client. POSTs to
// /intake — backend finds-or-creates the client by email and originates
// a Loan with property + ask + AI cadence. Brokers are allowed at this
// endpoint (only CLIENT is blocked).
export function useCreateLoanFile() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      borrower: {
        name: string;
        email: string;
        phone: string;
        entity_type?: string;
        entity_name?: string | null;
        experience?: string;
      };
      asset: {
        address: string;
        city: string | null;
        state: string | null;
        property_type: string;
        annual_taxes?: number;
        annual_insurance?: number;
      };
      numbers: {
        type: string;
        amount: number;
        ltv: number;
        base_rate: number;
        purpose?: string;
      };
      ai_rules: {
        floor_rate: number;
        max_buy_down_points?: number;
        require_soft_pull?: boolean;
        auto_send_terms?: boolean;
        doc_auto_verify?: boolean;
        escalation_delta_bps?: number;
        notify_channel?: string;
        intro_message?: string | null;
      };
      deal_side?: "buyer" | "seller";
      source_attribution?: string;
      document_overrides?: {
        skip_names?: string[];
        due_offset_overrides?: Record<string, number>;
        add_items?: { name: string; due_date?: string | null }[];
        collection_start_delay_days?: number;
      };
    }) =>
      fetcher<{ loan_id: string }>("/intake", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Hand a lead off to the funding team for prequalification review.
// Backend creates a PrequalRequest from Client.lead_intake JSONB +
// spawns an AITask in the funding-team queue. Used by:
//   - "Ready for Prequalification" action on /agent/client/[id]
//   - AIChatSheet action card (kind: "request_prequalification")
export function useRequestPrequalification() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["client", clientId], ["clients"], ["ai-tasks"]
    mutationFn: (clientId: string) =>
      fetcher<{
        prequal_request_id: string;
        client_id: string;
        lead_promotion_status: string;
        // Lending Handoff Packet (alembic 0031). Returned so the
        // confirm Alert can show what the AI inherited.
        handoff_packet_id?: string | null;
        lending_thread_id?: string | null;
        handoff_summary?: string | null;
        first_lending_question?: string | null;
        missing_lending_items?: string[];
      }>(`/clients/${clientId}/request-prequalification`, {
        method: "POST",
      }),
    onSuccess: (_data, clientId) => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["ai-tasks"] });
    },
  });
}

// Realtor AI ChatAction confirm-endpoints (alembic 0030). Mirror of
// QCDashboard's hooks. v1 stubs spawn AITasks; full integrations land
// in follow-up.

interface RealtorActionResult {
  client_id: string;
  action_kind: string;
  ai_task_id: string | null;
}

function useRealtorAction(path: (id: string) => string) {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      fetcher<RealtorActionResult>(path(clientId), { method: "POST" }),
    onSuccess: (_data, clientId) => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["ai-tasks"] });
    },
  });
}

export function useSendBuyerAgreement() {
  return useRealtorAction((id) => `/clients/${id}/send-buyer-agreement`);
}

export function useSendListingAgreement() {
  return useRealtorAction((id) => `/clients/${id}/send-listing-agreement`);
}

export function useMarkClientFinanceReady() {
  return useRealtorAction((id) => `/clients/${id}/mark-finance-ready`);
}


// ── AI Plan hooks (Phase 2 mobile parity) ──────────────────────────

export interface ClientAIPlanItem {
  requirement_key: string;
  label: string;
  category: string;
  required_level: string;
  blocks_stage: string | null;
  visibility: string[];
  can_agent_override: boolean;
  status: string;
  source: string;
  display_order: number;
  playbook_name: string;
}

export interface ClientAIPlanRead {
  client_id: string;
  loan_id: string | null;
  current_phase: string;
  custom_instructions: string | null;
  required_items: ClientAIPlanItem[];
  waived_items: ClientAIPlanItem[];
  next_best_question: string | null;
  next_best_action: { kind: string; requirement_key?: string } | null;
  readiness_score: number | null;
  computed_at: string;
}

export function useClientAIPlan(clientId: string | null | undefined, loanId?: string | null) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["clientAIPlan", clientId, loanId ?? null],
    queryFn: () =>
      fetcher<ClientAIPlanRead>(
        `/clients/${clientId}/ai-plan${loanId ? `?loan_id=${loanId}` : ""}`,
      ),
    enabled: !!clientId,
  });
}

export function usePatchClientAIPlan() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, loanId, ...body }: {
      clientId: string;
      loanId?: string | null;
      custom_instructions?: string | null;
      waive_keys?: string[];
      unwaive_keys?: string[];
    }) =>
      fetcher<ClientAIPlanRead>(
        `/clients/${clientId}/ai-plan${loanId ? `?loan_id=${loanId}` : ""}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["clientAIPlan", vars.clientId] });
    },
  });
}

export interface AgentPlaybook {
  playbook_type: string;
  rules: Record<string, unknown>;
  platform_requirements: Record<string, unknown>[];
  agent_requirements: Record<string, unknown>[];
}

export function useAgentPlaybook(playbookType: "buyer" | "seller" | "cadence") {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["agentPlaybook", playbookType],
    queryFn: () => fetcher<AgentPlaybook>(`/me/ai-playbook/${playbookType}`),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Cockpit parity hooks (mirror QCDashboard/src/hooks/useApi.ts shapes)
//
// Endpoints are gated by EXPO_PUBLIC_BACKEND_HAS_* flags so the UI can
// ship before the backend route is reachable. When the flag is off, the
// fetcher swaps in a mock from src/lib/mocks/ and the screen keeps
// rendering without 404 noise.
// ─────────────────────────────────────────────────────────────────────────

import { hasBackend } from "@/lib/featureFlags";
import type { ClosingCostTier } from "@/lib/fixFlip/types";
import {
  mockFundingMetrics, type FundingMetrics,
  mockDealSecretarySummary, type DealSecretarySummary,
  mockConditions, type LoanCondition,
  mockHudLines, type HudLine as HudLineMock,
  mockLenderConnection, mockLenderMessages, type LenderConnection, type LenderMessage,
  mockExperienceMode, type ExperienceModeState, type ExperienceMode,
  mockParsedCredit, type ParsedCreditReport,
  mockAIQuestions, type AIQuestion,
  mockLoanWorkspace, type LoanWorkspace, type LoanChatMessage, type DealChatMode, type DealChatRole,
  mockLoanCriteria, type LoanCriteria,
} from "@/lib/mocks";

// ── Loan workspace (chat + pause state) ────────────────────────────────

export function useLoanWorkspace(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["loanWorkspace", loanId ?? "", key],
    // Backend endpoint has been live for months — feature flag removed.
    // Keeping the read gated silently returned a mock workspace when
    // EXPO_PUBLIC_BACKEND_HAS_LOAN_WORKSPACE wasn't set in EAS, which
    // made the PauseBanner and chat thread render stale/empty even
    // though the API responded fine.
    queryFn: () => fetcher<LoanWorkspace>(`/loans/${loanId}/workspace/state`),
    enabled: !!loanId,
    refetchInterval: 60_000,
  });
}

export function useLoanChat(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["loanChat", loanId ?? "", key],
    // Backend endpoint has been live for months — feature flag removed.
    // The send path (useSendLoanChat) was never gated, so messages
    // persisted to the DB but reads silently returned [] when the
    // EAS env var was missing. End result: 'I typed but nothing shows'.
    queryFn: () => fetcher<LoanChatMessage[]>(`/loans/${loanId}/chat`),
    enabled: !!loanId,
    refetchInterval: 15_000,
  });
}

export interface LoanChatSendResponse {
  message: LoanChatMessage | null;
  ai_reply?: LoanChatMessage | null;
  kind?: string;
  paused_until: string | null;
}

// ── Fix & Flip Deal Analyzer scenarios ────────────────────────────────
export interface FixFlipScenarioRow {
  id: string;
  created_by: string | null;
  client_id: string | null;
  deal_id: string | null;
  loan_id: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  deal_score: number | null;
  deal_grade: string | null;
  created_at: string;
  updated_at: string;
}
interface FixFlipScenarioBody {
  client_id?: string | null;
  deal_id?: string | null;
  loan_id?: string | null;
  status?: string;
  payload: Record<string, unknown>;
  deal_score?: number | null;
  deal_grade?: string | null;
}
export function useSaveFixFlipScenario() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FixFlipScenarioBody) =>
      fetcher<FixFlipScenarioRow>(`/fix-flip/scenarios`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixFlipScenarios"] }),
  });
}
export function useUpdateFixFlipScenario() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<FixFlipScenarioBody>) =>
      fetcher<FixFlipScenarioRow>(`/fix-flip/scenarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixFlipScenarios"] }),
  });
}
export function useFixFlipScenarios() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["fixFlipScenarios", key],
    queryFn: () => fetcher<FixFlipScenarioRow[]>(`/fix-flip/scenarios`),
  });
}

interface ClosingCostTierRow {
  id: string;
  from_amount: number | null;
  to_amount: number | null;
  percentage: number;
  percentage_no_construction: number;
  sort_order: number;
}

// SUPER_ADMIN-configured closing-cost tiers. Read-only here — the
// Deal Analyzer feeds these into analyzeFixFlip(inputs, { closingTiers }).
export function useClosingCostTiers() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["closingCostTiers", key],
    queryFn: async (): Promise<ClosingCostTier[]> => {
      const rows = await fetcher<ClosingCostTierRow[]>(`/closing-costs`);
      return rows.map((r) => ({
        id: r.id,
        fromAmount: r.from_amount,
        toAmount: r.to_amount,
        percentage: Number(r.percentage),
        percentageNoConstruction: Number(r.percentage_no_construction),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSendLoanChat() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      body,
      mode,
      attachment_document_id,
      optimistic_from_role,
      optimistic_client_visible,
    }: {
      loanId: string;
      body: string;
      mode: DealChatMode;
      attachment_document_id?: string | null;
      optimistic_from_role?: DealChatRole;
      optimistic_client_visible?: boolean;
    }) =>
      fetcher<LoanChatSendResponse>(`/loans/${loanId}/chat`, {
        method: "POST",
        body: JSON.stringify({ body, mode, attachment_document_id }),
      }),
    onMutate: async (vars) => {
      if (vars.mode === "instruct" || vars.mode === "broker_suggestion") return null;
      const optimisticId = `local-${Date.now()}`;
      const role = vars.optimistic_from_role ?? (vars.mode === "broker_question" ? "broker_internal" : "client");
      const optimistic: LoanChatMessage = {
        id: optimisticId,
        body: vars.body,
        from_role: role,
        from_user_id: null,
        from_name: "You",
        client_visible: vars.optimistic_client_visible ?? vars.mode !== "broker_question",
        created_at: new Date().toISOString(),
        attachment: vars.attachment_document_id
          ? { document_id: vars.attachment_document_id, name: "Attachment" }
          : null,
      };
      qc.setQueriesData<LoanChatMessage[]>(
        { queryKey: ["loanChat", vars.loanId] },
        (old) => (old ? [...old, optimistic] : [optimistic])
      );
      return { optimisticId };
    },
    onSuccess: (res, vars, ctx) => {
      if (ctx?.optimisticId) {
        qc.setQueriesData<LoanChatMessage[]>(
          { queryKey: ["loanChat", vars.loanId] },
          (old) => {
            if (!old) return old;
            const withoutOptimistic = old.filter((m) => m.id !== ctx.optimisticId);
            const next = res.message ? [...withoutOptimistic, res.message] : withoutOptimistic;
            if (res.ai_reply && !next.some((m) => m.id === res.ai_reply?.id)) {
              next.push(res.ai_reply);
            }
            return next;
          }
        );
      }
      qc.invalidateQueries({ queryKey: ["loanChat", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loanWorkspace", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["activities", vars.loanId] });
    },
    onError: (_err, vars, ctx) => {
      if (!ctx?.optimisticId) return;
      qc.setQueriesData<LoanChatMessage[]>(
        { queryKey: ["loanChat", vars.loanId] },
        (old) => old?.filter((m) => m.id !== ctx.optimisticId)
      );
    },
  });
}

// Client-facing To-Do for a loan — outstanding docs + upcoming calls
// + open agent/AI asks. Backend composes it from existing data.
export interface LoanTodoItem {
  id: string;
  kind: "document" | "call" | "task";
  title: string;
  subtitle?: string | null;
  status?: string | null;
  due_at?: string | null;
  deeplink?: string | null;
}
export type TodoStatusFilter = "pending" | "completed" | "all";
export function useLoanTodo(
  loanId: string | null | undefined,
  status: TodoStatusFilter = "pending",
) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["loanTodo", loanId ?? "", status, key],
    queryFn: () => fetcher<LoanTodoItem[]>(`/loans/${loanId}/todo?status=${status}`),
    enabled: !!loanId,
    refetchInterval: 60_000,
  });
}

// Create a calendar event (used for client "request a call"). Backend
// POST /calendar accepts CurrentUser with no role gate, so a client
// may book a call against their own loan.
export function useCreateCalendarEvent() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      loan_id?: string | null;
      kind: string;
      title: string;
      description?: string | null;
      who?: string | null;
      starts_at: string;
      duration_min?: number | null;
      priority?: "low" | "medium" | "high" | null;
      owner_user_id?: string | null;
    }) =>
      fetcher(`/calendar`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (_, vars) => {
      if (vars.loan_id) qc.invalidateQueries({ queryKey: ["loanTodo", vars.loan_id] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["calendarActivity"] });
    },
  });
}

// ── (A) Agent deal-chat — multi-party thread per Deal ─────────────────
//
// Backed by the qcbackend patch under /tmp/qcbackend-patch:
//   GET  /api/v1/deals/{deal_id}/chat
//   POST /api/v1/deals/{deal_id}/chat
// Gated by BACKEND_HAS_DEAL_CHAT until the patch is deployed; falls back
// to an empty array so the chat UI renders harmlessly otherwise.

export function useDeal(dealId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["deal", dealId ?? "", key],
    queryFn: () => fetcher<Deal>(`/deals/${dealId}`),
    enabled: !!dealId,
  });
}

export function useDealAgentChat(dealId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["dealAgentChat", dealId ?? "", key],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_DEAL_CHAT")) return [] as LoanChatMessage[];
      return fetcher<LoanChatMessage[]>(`/deals/${dealId}/chat`);
    },
    enabled: !!dealId,
    refetchInterval: 15_000,
  });
}

export function useSendDealAgentChat() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, body, mode }: { dealId: string; body: string; mode: DealChatMode }) =>
      fetcher<LoanChatSendResponse>(`/deals/${dealId}/chat`, {
        method: "POST",
        body: JSON.stringify({ body, mode }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dealAgentChat", vars.dealId] });
    },
  });
}

// ── Pipeline parity hooks ─────────────────────────────────────────────

export function useFundingMetrics() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["fundingMetrics", key],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_FUNDING_METRICS")) return mockFundingMetrics();
      return fetcher<FundingMetrics>("/agent/funding-metrics");
    },
  });
}

export function useDealSecretarySummary(loanIds: string[]) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  const csv = loanIds.join(",");
  return useQuery({
    queryKey: ["dealSecretarySummary", csv, key],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_DEAL_SECRETARY")) return mockDealSecretarySummary(loanIds);
      const arr = await fetcher<Array<DealSecretarySummary & { loan_id: string }>>(
        `/pipeline/deal-secretary-summary?loan_ids=${csv}`,
      );
      const out: Record<string, DealSecretarySummary> = {};
      for (const item of arr) out[item.loan_id] = item;
      return out;
    },
    enabled: loanIds.length > 0,
  });
}

export interface BrokerOption {
  id: string;
  name: string;
  email: string;
  tier: string | null;
}

export function useBrokers() {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["brokers", key],
    queryFn: () => fetcher<BrokerOption[]>("/brokers"),
  });
}

export function useReassignAgent() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      toAgentId,
      reason,
    }: {
      clientId: string;
      toAgentId: string;
      reason?: string;
    }) =>
      fetcher<Client>(`/clients/${clientId}/agent`, {
        method: "PATCH",
        body: JSON.stringify({ to_agent_id: toAgentId, reason }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

// ── Client detail parity ──────────────────────────────────────────────

export function useUpdateClient() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, ...body }: {
      clientId: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
      client_type?: "buyer" | "seller" | null;
    }) =>
      fetcher<Client>(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useParsedReport(pullId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["parsedCredit", pullId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_CREDIT_PARSED")) return mockParsedCredit(pullId ?? "");
      return fetcher<ParsedCreditReport>(`/credit/pulls/${pullId}/parsed`);
    },
    enabled: !!pullId,
  });
}

export function useExperienceMode(clientId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["experienceMode", clientId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_EXPERIENCE_MODE")) return mockExperienceMode(clientId ?? "");
      return fetcher<ExperienceModeState>(`/clients/${clientId}/experience-mode`);
    },
    enabled: !!clientId,
  });
}

export function useSetExperienceMode() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, mode }: { clientId: string; mode: ExperienceMode }) =>
      fetcher<ExperienceModeState>(`/clients/${clientId}/experience-mode`, {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["experienceMode", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

// ── Loan detail expansion ─────────────────────────────────────────────

export function useLoanCriteriaQ(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["loanCriteria", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_LOAN_CRITERIA")) return mockLoanCriteria(loanId ?? "");
      return fetcher<LoanCriteria>(`/loans/${loanId}/criteria`);
    },
    enabled: !!loanId,
  });
}

export function useUpdateLoanCriteria() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, ...body }: { loanId: string } & Partial<LoanCriteria>) =>
      fetcher<LoanCriteria>(`/loans/${loanId}/criteria`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanCriteria", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
    },
  });
}

export function useLoanConditions(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["loanConditions", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_CONDITIONS")) return mockConditions(loanId ?? "");
      return fetcher<LoanCondition[]>(`/loans/${loanId}/conditions`);
    },
    enabled: !!loanId,
  });
}

export function useUpdateCondition() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, conditionId, ...body }: {
      loanId: string;
      conditionId: string;
      status?: LoanCondition["status"];
      description?: string | null;
      assigned_to?: string | null;
    }) =>
      fetcher<LoanCondition>(`/loans/${loanId}/conditions/${conditionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanConditions", vars.loanId] });
    },
  });
}

export function useHudLines(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["hudLines", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_HUD")) return mockHudLines(loanId ?? "");
      return fetcher<HudLineMock[]>(`/loans/${loanId}/hud`);
    },
    enabled: !!loanId,
  });
}

export function useCreateHudLine() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, ...body }: {
      loanId: string;
      line_number: string;
      description: string;
      amount: number;
      payee?: string | null;
      paid_by?: "buyer" | "seller" | "lender" | null;
    }) =>
      fetcher<HudLineMock>(`/loans/${loanId}/hud`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["hudLines", vars.loanId] });
    },
  });
}

export function useDeleteHudLine() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, lineId }: { loanId: string; lineId: string }) =>
      fetcher<void>(`/loans/${loanId}/hud/${lineId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["hudLines", vars.loanId] });
    },
  });
}

export function useLoanPrequalRequests(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["loanPrequalRequests", loanId ?? ""],
    queryFn: () => fetcher<PrequalRequest[]>(`/loans/${loanId}/prequal-requests`),
    enabled: !!loanId,
  });
}

export function useMarkDocumentVerified() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId }: { documentId: string }) =>
      fetcher<Document>(`/documents/${documentId}/verify`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useFlagDocument() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, reason }: { documentId: string; reason?: string }) =>
      fetcher<Document>(`/documents/${documentId}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason: reason ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── Elara ──────────────────────────────────────────────────────

export function useAIQuestions(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["aiQuestions", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_AI_SECRETARY")) return mockAIQuestions(loanId ?? "");
      return fetcher<AIQuestion[]>(`/loans/${loanId}/deal-secretary/ai-questions`);
    },
    enabled: !!loanId,
  });
}

export function useAnswerAIQuestion() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, questionId, answer }: {
      loanId: string;
      questionId: string;
      answer: string;
    }) =>
      fetcher<{ ok: boolean }>(
        `/loans/${loanId}/deal-secretary/ai-questions/${questionId}/answer`,
        { method: "POST", body: JSON.stringify({ answer }) },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiQuestions", vars.loanId] });
    },
  });
}

export function useStartAISecretary() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      fetcher<{ ok: boolean }>(`/loans/${loanId}/deal-secretary/start`, { method: "POST" }),
    onSuccess: (_, loanId) => {
      qc.invalidateQueries({ queryKey: ["aiQuestions", loanId] });
      qc.invalidateQueries({ queryKey: ["loanWorkspace", loanId] });
    },
  });
}

export function usePauseAISecretary() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      fetcher<{ ok: boolean }>(`/loans/${loanId}/deal-secretary/pause`, { method: "POST" }),
    onSuccess: (_, loanId) => {
      qc.invalidateQueries({ queryKey: ["loanWorkspace", loanId] });
    },
  });
}

// ── Lender thread ─────────────────────────────────────────────────────

export function useLenderConnection(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["lenderConnection", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_LENDER_THREAD")) return mockLenderConnection(loanId ?? "");
      return fetcher<LenderConnection>(`/loans/${loanId}/lender/connection`);
    },
    enabled: !!loanId,
  });
}

export function useLenderMessages(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  return useQuery({
    queryKey: ["lenderMessages", loanId ?? ""],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_LENDER_THREAD")) return mockLenderMessages(loanId ?? "");
      return fetcher<LenderMessage[]>(`/loans/${loanId}/lender/messages`);
    },
    enabled: !!loanId,
  });
}

export function useDraftLenderSend() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, body }: { loanId: string; body: string }) =>
      fetcher<LenderMessage>(`/loans/${loanId}/lender/send`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lenderMessages", vars.loanId] });
    },
  });
}

export function useConnectLender() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, lenderId }: { loanId: string; lenderId: string }) =>
      fetcher<LenderConnection>(`/loans/${loanId}/connect-lender`, {
        method: "POST",
        body: JSON.stringify({ lender_id: lenderId }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lenderConnection", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
    },
  });
}

export function useDisconnectLender() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      fetcher<{ ok: boolean }>(`/loans/${loanId}/disconnect-lender`, { method: "POST" }),
    onSuccess: (_, loanId) => {
      qc.invalidateQueries({ queryKey: ["lenderConnection", loanId] });
      qc.invalidateQueries({ queryKey: ["loan", loanId] });
    },
  });
}

// ── Deal Secretary (Phase 6 — swipe-to-assign workbench) ──────────────

import type { DSDealSecretaryView, DSTaskRow } from "@/lib/types";
import { mockDealSecretaryView } from "@/lib/mocks";

export function useDealSecretary(loanId: string | null | undefined) {
  const fetcher = useAuthedFetch();
  const key = useCacheKey();
  return useQuery({
    queryKey: ["dealSecretary", loanId ?? "", key],
    queryFn: async () => {
      if (!hasBackend("BACKEND_HAS_DEAL_SECRETARY")) {
        return mockDealSecretaryView(loanId ?? "");
      }
      return fetcher<DSDealSecretaryView>(`/loans/${loanId}/deal-secretary`);
    },
    enabled: !!loanId,
  });
}

// Flip a single task to AI-owned. Mirrors desktop useAssignToAI but with a
// minimal request body — mobile only sends the requirement_key. Channels /
// cadence / instructions are desktop-only refinements; brokers fall back to
// the desktop for those (per scope decision).
export function useAssignTaskToAI() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, requirement_key }: { loanId: string; requirement_key: string }) =>
      fetcher<DSTaskRow>(`/loans/${loanId}/deal-secretary/assign`, {
        method: "POST",
        body: JSON.stringify({ requirement_key }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dealSecretary", vars.loanId] });
    },
  });
}

// Flip a task back to human-owned (the swiped-right "keep with me" path).
export function useUnassignTaskFromAI() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, requirement_key }: { loanId: string; requirement_key: string }) =>
      fetcher<DSTaskRow>(`/loans/${loanId}/deal-secretary/unassign`, {
        method: "POST",
        body: JSON.stringify({ requirement_key }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dealSecretary", vars.loanId] });
    },
  });
}

// ── Wizard intent buffer (Phase 7 — lead-creation cadence handoff) ────
//
// Captures AI cadence preset (gentle/standard/aggressive) selected during
// the new-client wizard so the backend can later materialize it into
// real AITaskAssignment rows when the cadence engine fires pre-loan.
// Mirrors desktop's useBufferWizardIntent (QCDashboard useApi.ts:3650).
//
// Endpoint: POST /clients/{clientId}/deal-secretary/wizard-intent
// Body shape mirrors desktop's DSWizardIntentRequest — minimum required is
// `cadence_preset`; we leave `ai_assignments` empty on mobile (desktop's
// Step 4 picks individual tasks; mobile defers that to the per-client
// nurture controls in Phase 7.3).

export interface WizardIntentRequest {
  cadence_preset?: "gentle" | "standard" | "aggressive";
  ai_assignments?: Array<{ requirement_key: string }>;
}

export function useBufferWizardIntent() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, body }: { clientId: string; body: WizardIntentRequest }) =>
      fetcher<{ ok: boolean }>(
        `/clients/${clientId}/deal-secretary/wizard-intent`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clientAIPlan", vars.clientId] });
    },
  });
}

// ── Phase 7.3 — Client-level nurturing controls ─────────────────────
//
// Surface for the broker to drive the Client-AI tier on a lead /
// contacted / verified client. PATCHes the realtor-phase ClientAIPlan
// (loan_id IS NULL) — same endpoint the desktop AgentLeadModal uses
// for `lead_intake` + intake configuration. Backend accepts a
// partial `ai_secretary_settings` body.

export interface ClientNurtureSettings {
  outreach_mode: "off" | "draft_first" | "portal_auto" | "portal_email" | "portal_email_sms";
  default_cadence?: {
    hours_between_attempts?: number;
    max_attempts?: number;
    quiet_hours_start?: string | null;
    quiet_hours_end?: string | null;
  } | null;
}

export function useSetClientNurture() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, settings }: { clientId: string; settings: Partial<ClientNurtureSettings> }) =>
      fetcher<{ ok: boolean }>(
        `/clients/${clientId}/ai-plan`,
        {
          method: "PATCH",
          body: JSON.stringify({ ai_secretary_settings: settings }),
        },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clientAIPlan", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

export interface SendIntakeLinkResponse {
  url: string;
  sent_via: "portal" | "email" | "sms";
  sent_at: string;
}

export function useSendIntakeLink() {
  const fetcher = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, channel }: { clientId: string; channel?: "portal" | "email" | "sms" }) =>
      fetcher<SendIntakeLinkResponse>(
        `/clients/${clientId}/send-intake-link`,
        {
          method: "POST",
          body: JSON.stringify({ channel: channel ?? null }),
        },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["engagement", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}
