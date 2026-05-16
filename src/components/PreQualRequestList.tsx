// Borrower-side pre-qualification request list (mobile mirror).
//
// Status badges:
//   pending          — amber "Under review"
//   approved         — green "Ready" + Download Letter + report-back buttons
//   offer_accepted   — brand "Loan opened — Q-XXXX"
//   offer_declined   — gray "Closed"
//   rejected         — red "Returned" + reviewer notes shown italicized
//
// On approved cards the borrower can tap "Seller accepted offer" to
// promote the prequal into a real Loan, or "Seller declined" to close.

import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, QButton } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { useAcceptPrequalOffer, useDeclinePrequalOffer } from "@/hooks/useApi";
import { PREQUAL_LOAN_TYPE_LABELS, type PrequalRequest } from "@/lib/types";

export function PreQualRequestList({
  requests,
  isLoading,
  emptyState,
}: {
  requests: PrequalRequest[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}) {
  const { t } = useTheme();

  if (isLoading) {
    return (
      <Card pad={16}>
        <Text style={{ fontSize: 12.5, color: t.ink3 }}>Loading requests…</Text>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card pad={16}>
        <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19 }}>
          {emptyState ?? "No pre-qualification requests yet."}
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} />
      ))}
    </View>
  );
}

function RequestRow({ req }: { req: PrequalRequest }) {
  const { t } = useTheme();
  const accept = useAcceptPrequalOffer();
  const decline = useDeclinePrequalOffer();

  const [outcomeMode, setOutcomeMode] = useState<null | "accept" | "decline">(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const status = req.status;
  const statusInfo = (() => {
    if (status === "approved")        return { label: "Ready",                                   bg: t.profitBg, fg: t.profit };
    if (status === "offer_accepted")  return { label: req.quote_number ? `Loan opened · ${req.quote_number}` : "Loan opened", bg: t.brandSoft, fg: t.brand };
    if (status === "offer_declined")  return { label: "Closed — seller declined",               bg: t.surface2, fg: t.ink3 };
    if (status === "rejected")        return { label: "Returned",                                bg: t.dangerBg, fg: t.danger };
    return                                  { label: "Under review",                            bg: t.warnBg,   fg: t.warn };
  })();

  const requestedAmount = Number(req.requested_loan_amount);
  const approvedAmount = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const showApproved = approvedAmount != null && approvedAmount !== requestedAmount;
  const programLabel = PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type;

  // F&F is sized against ARV, not BRV — showing "$300K of $85K" looks
  // broken to a borrower even on a perfectly normal F&F deal.
  const isFixFlip = req.loan_type === "fix_flip";
  const arvNum = req.approved_arv != null
    ? Number(req.approved_arv)
    : req.arv_estimate != null
      ? Number(req.arv_estimate)
      : 0;
  const purchaseNum = Number(req.purchase_price);
  const denomLabel = isFixFlip
    ? (arvNum > 0 ? `${QC_FMT.usd(arvNum, 0)} ARV` : `${QC_FMT.usd(purchaseNum, 0)} BRV`)
    : QC_FMT.usd(purchaseNum, 0);
  const denomConnector = isFixFlip ? "against" : "of";

  // Hide stale "[Auto-approval declined]" notes once the prequal has
  // been approved — the operator's manual approval supersedes the
  // earlier auto-evaluator decision and the notes are misleading.
  const visibleAdminNotes = (() => {
    const raw = req.admin_notes ?? "";
    if (!raw) return null;
    if ((status === "approved" || status === "offer_accepted") && raw.startsWith("[Auto-approval declined]")) {
      return null;
    }
    return raw;
  })();

  const submitOutcome = async () => {
    if (outcomeMode == null) return;
    setOutcomeError(null);
    try {
      const payload = { note: outcomeNote.trim() || null };
      if (outcomeMode === "accept") {
        await accept.mutateAsync({ requestId: req.id, payload });
      } else {
        await decline.mutateAsync({ requestId: req.id, payload });
      }
      setOutcomeMode(null);
      setOutcomeNote("");
    } catch (e) {
      setOutcomeError(e instanceof Error ? e.message : "Update failed.");
    }
  };

  return (
    <Card pad={14}>
      {/* Header row: status pill + program */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Pill bg={statusInfo.bg} color={statusInfo.fg}>{statusInfo.label}</Pill>
        <Pill>{programLabel}</Pill>
      </View>

      {/* Address + numbers */}
      <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, marginTop: 8, letterSpacing: -0.2 }} numberOfLines={2}>
        {req.target_property_address}
      </Text>
      <Text style={{ fontSize: 12, color: t.ink2, marginTop: 4, fontVariant: ["tabular-nums"] }}>
        {`Requested ${QC_FMT.usd(requestedAmount, 0)} ${denomConnector} ${denomLabel}`}
        {showApproved ? (
          <Text style={{ color: t.profit, fontWeight: "800" }}>
            {`  ·  approved at ${QC_FMT.usd(approvedAmount as number, 0)}`}
          </Text>
        ) : null}
      </Text>

      {/* Meta line */}
      {req.borrower_entity || req.expected_closing_date ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {req.borrower_entity ? (
            <Text style={{ fontSize: 11, color: t.ink3 }}>
              Issued to {req.borrower_entity}
            </Text>
          ) : null}
          {req.expected_closing_date ? (
            <Text style={{ fontSize: 11, color: t.ink3 }}>
              Close {new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Underwriter notes (visible to borrower in-app) */}
      {visibleAdminNotes ? (
        <View style={{
          marginTop: 10,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderLeftWidth: 3,
          borderLeftColor: status === "rejected" ? t.danger : t.petrol,
          backgroundColor: t.surface2,
          borderRadius: 6,
        }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink, marginBottom: 2 }}>
            Underwriter notes
          </Text>
          <Text style={{ fontSize: 12, color: t.ink2, fontStyle: "italic", lineHeight: 17 }}>
            {visibleAdminNotes}
          </Text>
        </View>
      ) : null}

      {/* Download Letter — present whenever there's a PDF (approved or
          loan-opened; rejected/declined never have one). */}
      {(status === "approved" || status === "offer_accepted") && req.pdf_url ? (
        <View style={{ marginTop: 12 }}>
          <QButton
            label="Download Letter"
            icon="docCheck"
            variant="primary"
            onPress={() => req.pdf_url && Linking.openURL(req.pdf_url)}
          />
        </View>
      ) : null}

      {/* Approved → present-and-report flow */}
      {status === "approved" ? (
        <View style={{
          marginTop: 12,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: t.line,
          borderStyle: "dashed",
        }}>
          <Text style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8, lineHeight: 16 }}>
            Once you&apos;ve presented this letter to the seller, let us know how it landed:
          </Text>
          {outcomeMode == null ? (
            <View style={{ gap: 8 }}>
              <QButton
                label="Seller accepted offer"
                icon="check"
                variant="petrol"
                onPress={() => setOutcomeMode("accept")}
              />
              <QButton
                label="Seller declined / I walked away"
                variant="ghost"
                onPress={() => setOutcomeMode("decline")}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: t.ink, fontWeight: "800" }}>
                {outcomeMode === "accept"
                  ? "Confirm: seller accepted my offer"
                  : "Confirm: seller declined / I walked away"}
              </Text>
              <TextInput
                value={outcomeNote}
                onChangeText={(v) => setOutcomeNote(v.slice(0, 500))}
                placeholder={
                  outcomeMode === "accept"
                    ? "Optional — accepted at $X, closing in N weeks…"
                    : "Optional — what happened?"
                }
                placeholderTextColor={t.ink4}
                multiline
                style={{
                  backgroundColor: t.surface2,
                  borderWidth: 1,
                  borderColor: t.line,
                  borderRadius: 9,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 12,
                  color: t.ink,
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />
              {outcomeMode === "accept" ? (
                <Text style={{ fontSize: 11, color: t.petrol, lineHeight: 15 }}>
                  Confirming will create a real loan file in the pipeline under{" "}
                  {req.quote_number ?? "your quote#"}. Your team starts processing immediately.
                </Text>
              ) : null}
              {outcomeError ? <Pill bg={t.dangerBg} color={t.danger}>{outcomeError}</Pill> : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <QButton
                    label="Back"
                    variant="ghost"
                    onPress={() => { setOutcomeMode(null); setOutcomeNote(""); setOutcomeError(null); }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <QButton
                    label={accept.isPending || decline.isPending ? "Saving…" : "Confirm"}
                    variant="primary"
                    disabled={accept.isPending || decline.isPending}
                    onPress={submitOutcome}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}
