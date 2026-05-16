// Step 4 of the mobile vault upload sequence: pick which checklist
// item this file fulfills. Sits between PropertyPickerSheet and the
// actual upload call so the AI vision scanner can score the doc
// against an "expected_type".
//
// Shape:
//   1. Required documents — one row per checklist item for the
//      loan's product. Already-verified rows are visible but
//      disabled (operator can replace via vault row tap later).
//   2. Other — escape hatch. Borrower types a quick label; the
//      vision scan may auto-link if it recognizes a known type.

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Pill } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useRequiredDocuments } from "@/hooks/useApi";
import type { RequiredDocument } from "@/lib/types";

export interface ChecklistPick {
  // Mutually exclusive — exactly one of these is non-null:
  fulfill_document_id: string | null;
  checklist_key: string | null;
  is_other: boolean;
  // Human-readable label that becomes the doc's `name`.
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (pick: ChecklistPick) => void;
  loanId: string | null;
}

export function UploadChecklistPickerSheet({ visible, onClose, onPick, loanId }: Props) {
  const { t } = useTheme();
  const { data: required = [], isLoading } = useRequiredDocuments(loanId);
  const [picked, setPicked] = useState<string>("");
  const [otherLabel, setOtherLabel] = useState<string>("");

  useEffect(() => {
    if (!visible) {
      setPicked("");
      setOtherLabel("");
    }
  }, [visible]);

  const submit = () => {
    if (!picked) return;
    if (picked === "other") {
      onPick({
        fulfill_document_id: null,
        checklist_key: null,
        is_other: true,
        label: otherLabel.trim() || "Other",
      });
      return;
    }
    if (picked.startsWith("doc:")) {
      const id = picked.slice(4);
      const row = required.find((r) => r.current_document_id === id);
      onPick({
        fulfill_document_id: id,
        checklist_key: null,
        is_other: false,
        label: row?.label ?? "Document",
      });
      return;
    }
    if (picked.startsWith("checklist:")) {
      const key = picked.slice(10);
      onPick({
        fulfill_document_id: null,
        checklist_key: key,
        is_other: false,
        label: key,
      });
    }
  };

  const items = required.filter((r) => !r.is_other);
  const otherRow = required.find((r) => r.is_other);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 18,
            maxHeight: "85%",
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, alignSelf: "center", marginBottom: 14 }} />

          <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Which document is this?
          </Text>
          <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17, marginTop: 4, marginBottom: 12 }}>
            Picking helps the AI verify the upload against what was requested.
          </Text>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
            {isLoading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
                <ActivityIndicator size="small" color={t.ink3} />
                <Text style={{ fontSize: 12, color: t.ink3 }}>Loading checklist…</Text>
              </View>
            ) : items.length === 0 ? (
              <Text style={{ fontSize: 12, color: t.ink3, padding: 12 }}>
                Couldn&apos;t resolve a checklist for this loan. Pick &quot;Other&quot; below.
              </Text>
            ) : (
              items.map((r: RequiredDocument) => {
                const id = r.current_document_id ? `doc:${r.current_document_id}` : `checklist:${r.checklist_key}`;
                const fulfilled = r.current_status === "verified" || r.current_status === "received";
                const inFlight = r.current_status === "pending";
                const requested = r.current_status === "requested";
                let pillBg = t.surface2;
                let pillFg = t.ink3;
                let pillLabel = "";
                if (fulfilled) {
                  pillBg = t.profitBg; pillFg = t.profit;
                  pillLabel = r.current_status === "verified" ? "Verified" : "Received";
                } else if (inFlight) {
                  pillBg = t.warnBg; pillFg = t.warn; pillLabel = "In review";
                } else if (requested) {
                  const days = r.days_since_requested ?? 0;
                  pillLabel = `Requested · ${days}d`;
                }
                const active = picked === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => !fulfilled && setPicked(id)}
                    disabled={fulfilled}
                    style={({ pressed }) => ({
                      padding: 11,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: active ? t.petrol : t.line,
                      backgroundColor: pressed && !fulfilled ? t.surface2 : (active ? t.brandSoft : "transparent"),
                      opacity: fulfilled ? 0.55 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    })}
                  >
                    <View
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        borderWidth: 1.5, borderColor: active ? t.petrol : t.line,
                        backgroundColor: active ? t.petrol : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {active ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }} numberOfLines={1}>
                        {r.label}
                      </Text>
                      {r.required ? (
                        <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 2 }}>Required</Text>
                      ) : null}
                    </View>
                    {pillLabel ? <Pill bg={pillBg} color={pillFg}>{pillLabel}</Pill> : null}
                  </Pressable>
                );
              })
            )}
            {otherRow ? (
              <Pressable
                onPress={() => setPicked("other")}
                style={({ pressed }) => ({
                  padding: 11,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: picked === "other" ? t.petrol : t.line,
                  backgroundColor: pressed ? t.surface2 : (picked === "other" ? t.brandSoft : "transparent"),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                })}
              >
                <View
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    borderWidth: 1.5, borderColor: picked === "other" ? t.petrol : t.line,
                    backgroundColor: picked === "other" ? t.petrol : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {picked === "other" ? <Icon name="check" size={11} color="#fff" stroke={3} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: t.ink }}>
                    Other — not in checklist
                  </Text>
                  <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 2, lineHeight: 14 }}>
                    The AI will try to classify it; otherwise an underwriter follows up.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {picked === "other" ? (
              <TextInput
                value={otherLabel}
                onChangeText={setOtherLabel}
                placeholder="Briefly describe what this is (optional)"
                placeholderTextColor={t.ink4}
                style={{
                  marginTop: 4,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: t.surface2,
                  borderWidth: 1,
                  borderColor: t.line,
                  color: t.ink,
                  fontSize: 13,
                }}
              />
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: t.line,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13, color: t.ink2, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!picked}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 11,
                backgroundColor: picked ? t.petrol : t.chip,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 13, color: picked ? "#fff" : t.ink4, fontWeight: "700" }}>
                Continue
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
