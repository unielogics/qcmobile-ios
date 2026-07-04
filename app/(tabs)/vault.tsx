// Vault — split into two tabs:
//   experience    — proof of past deals (HUDs, closings, deeds, prior leases)
//   active_asset  — currently-owned real estate (bank notes, current leases,
//                   insurance, tax bills)
//
// Upload flow: tap FAB → pick KIND (experience | active_asset) → pick SOURCE
// (camera / library / file) → pick PROPERTY (loan) → PUT to S3 via
// /documents/upload-init. The kind becomes Document.category upstream so
// the tabs can filter.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel, VerifiedBadge } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { Fab } from "@/components/Fab";
import { UploadKindSheet, type UploadKind } from "@/components/sheets/UploadKindSheet";
import { UploadActionSheet, type PickedFile } from "@/components/sheets/UploadActionSheet";
import { UploadChecklistPickerSheet, type ChecklistPick } from "@/components/sheets/UploadChecklistPickerSheet";
import { PropertyPickerSheet } from "@/components/sheets/PropertyPickerSheet";
import { useDocuments, useDocumentsAnalysis, useLoans, useUploadDocument } from "@/hooks/useApi";
import type { Document, Loan } from "@/lib/types";

type DocStatus = Document["status"];
// Three tabs:
//   requested    — open AI-driven asks (checklist items the AI auto-
//                  requested at intake or via reminders). Tap a row →
//                  upload flow pre-bound to that doc.
//   experience   — proof of past deals
//   active_asset — currently-owned real estate
type VaultTab = "requested" | "experience" | "active_asset";

function statusKind(status: DocStatus): "verified" | "pending" | "flagged" {
  if (status === "verified" || status === "received") return "verified";
  if (status === "flagged") return "flagged";
  return "pending";
}

// Match a doc to a category tab. Uncategorized legacy uploads default
// to the "experience" tab since that's what the vault was historically
// used for. The new "requested" tab is filtered by status, not by
// category, so this helper isn't called for it.
function tabFor(category: string | null | undefined): VaultTab {
  if (category === "active_asset") return "active_asset";
  return "experience";
}

export default function Vault() {
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocuments(null);
  const { data: analysis } = useDocumentsAnalysis(null);
  const { data: loans = [] } = useLoans();
  const upload = useUploadDocument();
  const router = useRouter();
  // Smart-route entry: calendar `document_due` events route here
  // with `?fulfill=<doc_id>`. We pre-bind the upload flow to that
  // doc and pop the action sheet automatically — same UX as
  // tapping a REQUESTED row in the vault itself.
  const params = useLocalSearchParams<{ fulfill?: string }>();

  // Active tab
  const [tab, setTab] = useState<VaultTab>("experience");

  // Upload flow state
  const [showKind, setShowKind] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [showProperty, setShowProperty] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [pendingKind, setPendingKind] = useState<UploadKind | null>(null);
  const [pendingFile, setPendingFile] = useState<PickedFile | null>(null);
  const [pendingLoanId, setPendingLoanId] = useState<string | null>(null);
  // Smart-routing state: when the user taps a REQUESTED doc card we
  // pre-bind the loan + fulfill_document_id so we can skip the
  // property + checklist sheets and go straight from file-pick to
  // upload. The user already told us which doc this is by tapping
  // the row — we shouldn't ask them again.
  const [pendingFulfillDocId, setPendingFulfillDocId] = useState<string | null>(null);
  const [pendingPrefilledName, setPendingPrefilledName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Filter docs by active tab. "Requested" is special — filters by
  // status (REQUESTED) regardless of category, since checklist items
  // from kickoff_loan don't carry a category at all.
  const tabDocs = useMemo(() => {
    if (tab === "requested") {
      return docs.filter((d) => d.status === "requested");
    }
    return docs.filter((d) => d.status !== "requested" && tabFor(d.category) === tab);
  }, [docs, tab]);

  // Stats — derived from the active tab's docs only, so the headline
  // numbers reflect the section the user is looking at.
  const stats = useMemo(() => {
    const total = tabDocs.length;
    const verified = tabDocs.filter((d) => d.status === "verified").length;
    const flagged = tabDocs.filter((d) => d.status === "flagged").length;
    return { total, verified, flagged };
  }, [tabDocs]);

  // Tab counts for the header pills.
  const tabCounts = useMemo(() => ({
    requested: docs.filter((d) => d.status === "requested").length,
    experience: docs.filter((d) => d.status !== "requested" && tabFor(d.category) === "experience").length,
    active_asset: docs.filter((d) => d.status !== "requested" && tabFor(d.category) === "active_asset").length,
  }), [docs]);

  // First-load default: land on "Requested" whenever there's at
  // least one open request — that's the AI's task list, it should
  // be in the borrower's face. Tracks a `defaulted` ref so we
  // don't override the tab the user manually picked.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current) return;
    if (tabCounts.requested > 0) {
      setTab("requested");
      defaultedRef.current = true;
    } else if (tabCounts.experience > 0 || tabCounts.active_asset > 0) {
      defaultedRef.current = true;
    }
  }, [tabCounts.requested, tabCounts.experience, tabCounts.active_asset]);

  // Upload flow: FAB / dashed CTA → kind sheet → action sheet → property picker.
  const onPickKind = (kind: UploadKind) => {
    setShowKind(false);
    setPendingKind(kind);
    setUploadError(null);
    setShowAction(true);
  };

  const onPicked = async (file: PickedFile) => {
    setShowAction(false);
    setPendingFile(file);
    setUploadError(null);
    if (loans.length === 0) {
      setUploadError("Start a loan first — uploads need to be linked to a property.");
      setPendingFile(null);
      setPendingKind(null);
      return;
    }
    // Smart-route: when the user came in by tapping a REQUESTED
    // doc card we already know the loan + which checklist item
    // this file fulfills. Skip the property + checklist sheets and
    // upload directly.
    if (pendingFulfillDocId && pendingLoanId) {
      try {
        await upload.mutateAsync({
          loan_id: pendingLoanId,
          file,
          category: pendingKind ?? undefined,
          fulfill_document_id: pendingFulfillDocId,
          name: pendingPrefilledName ?? undefined,
        });
        if (pendingKind) setTab(pendingKind);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setPendingFile(null);
        setPendingKind(null);
        setPendingLoanId(null);
        setPendingFulfillDocId(null);
        setPendingPrefilledName(null);
      }
      return;
    }
    setShowProperty(true);
  };

  // Smart-route entry point: tap a REQUESTED doc card. Pre-binds the
  // loan + fulfill_document_id and jumps straight to the
  // camera/library/file picker. Saves three taps.
  const onTapRequestedDoc = (doc: Document) => {
    setUploadError(null);
    setPendingKind("active_asset");
    setPendingLoanId(doc.loan_id);
    setPendingFulfillDocId(doc.id);
    setPendingPrefilledName(doc.name);
    setShowAction(true);
  };

  // Deep-link from calendar tap (?fulfill=<doc_id>). Wait until the
  // doc list has loaded so we can resolve the doc + auto-fire
  // onTapRequestedDoc. Strip the param after handling so a tab
  // re-render doesn't re-trigger.
  useEffect(() => {
    if (!params.fulfill) return;
    if (docs.length === 0) return;
    const target = docs.find((d) => d.id === params.fulfill);
    if (!target || target.status !== "requested") {
      router.replace("/(tabs)/vault");
      return;
    }
    onTapRequestedDoc(target);
    router.replace("/(tabs)/vault");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.fulfill, docs.length]);

  const onPickProperty = (loan: Loan) => {
    setShowProperty(false);
    if (!pendingFile) return;
    setPendingLoanId(loan.id);
    setShowChecklist(true);
  };

  const onPickChecklist = async (pick: ChecklistPick) => {
    setShowChecklist(false);
    if (!pendingFile || !pendingLoanId) return;
    try {
      await upload.mutateAsync({
        loan_id: pendingLoanId,
        file: pendingFile,
        category: pendingKind ?? undefined,
        fulfill_document_id: pick.fulfill_document_id,
        checklist_key: pick.checklist_key,
        is_other: pick.is_other,
        name: pick.label,
      });
      if (pendingKind) setTab(pendingKind);
      setPendingFile(null);
      setPendingKind(null);
      setPendingLoanId(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
      setPendingFile(null);
      setPendingKind(null);
      setPendingLoanId(null);
    }
  };

  const onCancelProperty = () => {
    setShowProperty(false);
    setPendingFile(null);
    setPendingKind(null);
    setPendingLoanId(null);
  };

  const onCancelChecklist = () => {
    setShowChecklist(false);
    setPendingFile(null);
    setPendingKind(null);
    setPendingLoanId(null);
  };

  const onCancelAction = () => {
    setShowAction(false);
    setPendingKind(null);
    // Also clear the smart-route bindings so the next FAB tap
    // doesn't accidentally inherit them.
    setPendingFulfillDocId(null);
    setPendingPrefilledName(null);
    setPendingLoanId(null);
  };

  // Group active-tab docs by loan
  const groupedByLoan = useMemo(() => {
    const map = new Map<string, { loan: Loan | undefined; docs: Document[] }>();
    for (const d of tabDocs) {
      if (!map.has(d.loan_id)) {
        map.set(d.loan_id, { loan: loans.find((l) => l.id === d.loan_id), docs: [] });
      }
      map.get(d.loan_id)!.docs.push(d);
    }
    return Array.from(map.entries());
  }, [tabDocs, loans]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Vault" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Tab switcher */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: t.surface2,
            borderRadius: 12,
            padding: 4,
            marginBottom: 14,
            gap: 4,
          }}
        >
          <TabButton
            t={t}
            label="Requested"
            count={tabCounts.requested}
            active={tab === "requested"}
            onPress={() => setTab("requested")}
          />
          <TabButton
            t={t}
            label="Experience"
            count={tabCounts.experience}
            active={tab === "experience"}
            onPress={() => setTab("experience")}
          />
          <TabButton
            t={t}
            label="Active assets"
            count={tabCounts.active_asset}
            active={tab === "active_asset"}
            onPress={() => setTab("active_asset")}
          />
        </View>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <Card pad={12} style={{ flex: 1 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>Documents</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 2, color: t.ink, letterSpacing: -0.5 }}>
              {stats.total}
            </Text>
          </Card>
          <Card pad={12} style={{ flex: 1 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>Verified</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 2, color: t.profit, letterSpacing: -0.5 }}>
              {stats.verified}
            </Text>
          </Card>
          <Card pad={12} style={{ flex: 1 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>Flagged</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 2, color: stats.flagged > 0 ? t.danger : t.ink, letterSpacing: -0.5 }}>
              {stats.flagged}
            </Text>
          </Card>
        </View>

        {/* AI underwriting summary */}
        {analysis && analysis.summary.total > 0 ? (
          <Card pad={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.8 }}>
                AI underwriting summary
              </Text>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor:
                    analysis.summary.verdict === "clean"
                      ? t.profitBg
                      : analysis.summary.verdict === "needs_review"
                        ? t.dangerBg
                        : t.surface2,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    color:
                      analysis.summary.verdict === "clean"
                        ? t.profit
                        : analysis.summary.verdict === "needs_review"
                          ? t.danger
                          : t.ink3,
                  }}
                >
                  {analysis.summary.verdict === "needs_review" ? "Needs review" : analysis.summary.verdict}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 19 }}>{analysis.summary.headline}</Text>
            <Text style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
              {analysis.summary.reviewed}/{analysis.summary.total} reviewed · {analysis.summary.flagged} flagged · {analysis.summary.conflicts} conflict(s)
            </Text>
            {analysis.documents
              .filter((d) => (d.issues?.length ?? 0) > 0 || d.status === "flagged" || d.ai_notes)
              .slice(0, 6)
              .map((d) => {
                const flagged = (d.issues?.length ?? 0) > 0 || d.status === "flagged";
                return (
                  <View
                    key={d.document_id}
                    style={{
                      marginTop: 8,
                      padding: 9,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: flagged ? `${t.danger}55` : t.line,
                      backgroundColor: flagged ? t.dangerBg : t.surface2,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: t.ink }}>{d.name}</Text>
                      {d.detected_type ? (
                        <Text style={{ fontSize: 11, color: t.ink3 }}>
                          {d.detected_type}{d.confidence != null ? ` · ${Math.round(d.confidence * 100)}%` : ""}
                        </Text>
                      ) : null}
                    </View>
                    {d.ai_notes ? (
                      <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 3, lineHeight: 16 }}>{d.ai_notes}</Text>
                    ) : null}
                    {(d.issues ?? []).map((iss, idx) => (
                      <Text key={idx} style={{ fontSize: 11.5, color: t.danger, marginTop: 3, fontWeight: "600" }}>
                        ⚠ {String((iss as Record<string, unknown>).field ?? (iss as Record<string, unknown>).type ?? "Conflict")}
                      </Text>
                    ))}
                  </View>
                );
              })}
          </Card>
        ) : null}

        {/* Upload CTA — opens the kind picker first */}
        <Pressable
          onPress={() => setShowKind(true)}
          disabled={upload.isPending}
          style={({ pressed }) => ({
            paddingVertical: 14, paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1.5, borderStyle: "dashed", borderColor: t.lineStrong,
            backgroundColor: "transparent",
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            marginBottom: 14,
            opacity: pressed || upload.isPending ? 0.7 : 1,
          })}
        >
          {upload.isPending ? (
            <>
              <ActivityIndicator color={t.ink2} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>Uploading…</Text>
            </>
          ) : (
            <>
              <Icon name="scan" size={18} color={t.ink} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>
                Upload {tab === "active_asset" ? "Asset Doc" : "Experience Doc"}
              </Text>
              <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "500" }}>· AI verifies on the server</Text>
            </>
          )}
        </Pressable>

        {/* Errors */}
        {uploadError ? (
          <Card pad={12} style={{ marginBottom: 14, backgroundColor: t.dangerBg, borderColor: `${t.danger}40` }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Icon name="alert" size={14} color={t.danger} />
              <Text style={{ flex: 1, fontSize: 12, color: t.danger, fontWeight: "700" }}>{uploadError}</Text>
              <Pressable onPress={() => setUploadError(null)}>
                <Icon name="x" size={14} color={t.danger} />
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* Empty / loading */}
        {isLoading ? (
          <Card pad={32} style={{ marginBottom: 14, alignItems: "center" }}>
            <ActivityIndicator color={t.ink3} />
            <Text style={{ fontSize: 12, color: t.ink3, marginTop: 8 }}>Loading vault…</Text>
          </Card>
        ) : null}

        {!isLoading && tabDocs.length === 0 ? (
          <Card pad={24} style={{ marginBottom: 14, alignItems: "center" }}>
            <Icon name="vault" size={32} color={t.ink4} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink2, marginTop: 12, textAlign: "center" }}>
              {tab === "requested"
                ? "Nothing requested right now"
                : tab === "active_asset"
                  ? "No active assets yet"
                  : "No experience proof yet"}
            </Text>
            <Text style={{ fontSize: 12, color: t.ink3, marginTop: 6, textAlign: "center", lineHeight: 17 }}>
              {tab === "requested"
                ? "When the AI requests a document, it'll show up here. Tap a row to upload."
                : tab === "active_asset"
                  ? "Upload bank notes, leases, insurance, or tax bills for properties you currently own."
                  : "Upload HUDs, closing statements, deeds, or prior leases from past deals to count toward your investor experience tier."}
            </Text>
          </Card>
        ) : null}

        {/* Grouped by loan */}
        {groupedByLoan.map(([loanId, { loan, docs: groupDocs }]) => (
          <View key={loanId} style={{ marginBottom: 16 }}>
            <SectionLabel
              action={
                loan ? (
                  <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "600" }}>
                    {loan.deal_id} · {groupDocs.length}
                  </Text>
                ) : undefined
              }
            >
              {loan ? loan.address : `Loan ${loanId.slice(0, 8)}`}
            </SectionLabel>
            <Card pad={0}>
              {groupDocs.map((d, i) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  isLast={i === groupDocs.length - 1}
                  onTapRequested={d.status === "requested" ? () => onTapRequestedDoc(d) : undefined}
                />
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>

      <Fab onPress={() => setShowKind(true)} icon="plus" />

      <UploadKindSheet
        visible={showKind}
        onClose={() => setShowKind(false)}
        onPick={onPickKind}
      />

      <UploadActionSheet
        visible={showAction}
        onClose={onCancelAction}
        onPicked={onPicked}
      />

      <PropertyPickerSheet
        visible={showProperty}
        loans={loans}
        fileName={pendingFile?.name}
        onClose={onCancelProperty}
        onPick={onPickProperty}
      />

      <UploadChecklistPickerSheet
        visible={showChecklist}
        loanId={pendingLoanId}
        onClose={onCancelChecklist}
        onPick={onPickChecklist}
      />
    </SafeAreaView>
  );
}

function TabButton({
  t,
  label,
  count,
  active,
  onPress,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 9,
        borderRadius: 9,
        backgroundColor: active ? t.bg : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? t.ink : t.ink2 }}>
        {label}
      </Text>
      <View
        style={{
          minWidth: 20,
          height: 18,
          paddingHorizontal: 6,
          borderRadius: 9,
          backgroundColor: active ? t.brandSoft : t.line,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: "700", color: active ? t.brand : t.ink3 }}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function DocRow({
  doc,
  isLast,
  onTapRequested,
}: {
  doc: Document;
  isLast: boolean;
  // When provided, the row becomes a Pressable that routes the user
  // straight into the upload flow with this doc pre-bound. Only
  // wired for REQUESTED rows by the parent — other statuses stay
  // as plain Views so they can't be accidentally re-uploaded.
  onTapRequested?: () => void;
}) {
  const { t } = useTheme();
  const kind = statusKind(doc.status);
  const isRequested = !!onTapRequested;

  const inner = (
    <>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
        <Icon name={doc.s3_key?.toLowerCase().match(/\.(jpe?g|png|heic|webp)$/) ? "scan" : "doc"} size={15} color={t.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{doc.name}</Text>
        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
          {doc.category ?? "uncategorized"}
          {doc.received_on ? ` · received ${new Date(doc.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          {doc.requested_on && !doc.received_on ? ` · requested ${new Date(doc.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </Text>
        {isRequested ? (
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.warn, marginTop: 3, letterSpacing: 0.4 }}>
            TAP TO UPLOAD →
          </Text>
        ) : null}
      </View>
      <VerifiedBadge kind={kind} />
    </>
  );

  if (isRequested) {
    return (
      <Pressable
        onPress={onTapRequested}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingVertical: 12, paddingHorizontal: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: t.line,
          backgroundColor: pressed ? t.surface2 : "transparent",
        })}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 12, paddingHorizontal: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: t.line,
      }}
    >
      {inner}
    </View>
  );
}
