// HUD line viewer + "Add my fee" inline form for brokers.
//
// Brokers add their own fees (origination, broker commission, etc.)
// directly from this tab. The amount input supports both $ and %
// modes — % is the most common shape brokers think in. When %
// is selected, we calculate the dollar amount from the loan amount
// at submit time, since the backend HUD model only stores dollars.

import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useCreateHudLine, useHudLines } from "@/hooks/useApi";
import { QC_FMT } from "@/design-system/tokens";

interface Props {
  loanId: string;
  // Loan amount used to compute the dollar value when the broker
  // enters their fee as a percentage. Defaults to 0 — the percentage
  // path is disabled (with a hint) until the loan has an amount.
  loanAmount?: number;
}

type AmountMode = "$" | "%";

export function HudTab({ loanId, loanAmount = 0 }: Props) {
  const { t } = useTheme();
  const { data = [], isLoading } = useHudLines(loanId);
  const createLine = useCreateHudLine();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [mode, setMode] = useState<AmountMode>("%");

  const reset = () => {
    setDescription("");
    setAmountStr("");
    setMode("%");
    setOpen(false);
  };

  const submit = async () => {
    const desc = description.trim();
    const raw = Number(amountStr);
    if (!desc) {
      Alert.alert("Add a description", "Tell us what this fee is for (e.g. 'Broker origination').");
      return;
    }
    if (!Number.isFinite(raw) || raw <= 0) {
      Alert.alert("Enter a valid amount", "Use a positive number.");
      return;
    }
    if (mode === "%" && loanAmount <= 0) {
      Alert.alert("Loan amount unknown", "Switch to $ mode — the loan amount isn't set yet, so the percentage can't be computed.");
      return;
    }
    // % mode multiplies by loan amount / 100. We round to whole
    // dollars since the existing HUD column stores integer cents
    // effectively and brokers don't usually quote fractions.
    const amount = mode === "%" ? Math.round((raw / 100) * loanAmount) : Math.round(raw);
    // Description carries the original "% of loan" so the source is
    // visible after the fact — we lose the percentage in the dollar
    // amount otherwise.
    const finalDescription = mode === "%"
      ? `${desc} (${raw}% of loan)`
      : desc;
    try {
      await createLine.mutateAsync({
        loanId,
        // Loose line numbering — broker fees historically use the 800
        // series on HUD-1. Sequential within that block.
        line_number: nextBrokerLineNumber(data.map((l) => l.line_number)),
        description: finalDescription,
        amount,
        payee: "Broker",
        paid_by: "buyer",
      });
      reset();
    } catch (e) {
      Alert.alert("Couldn't add fee", e instanceof Error ? e.message : undefined);
    }
  };

  const total = data.reduce((s, l) => s + Number(l.amount || 0), 0);

  if (isLoading) {
    return (
      <Card pad={18}>
        <Text style={{ color: t.ink3, fontSize: 13 }}>Loading HUD lines…</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {data.length === 0 ? (
        <Card pad={18}>
          <SectionLabel>HUD lines</SectionLabel>
          <Text style={{ color: t.ink3, fontSize: 13 }}>No HUD lines on this loan yet.</Text>
        </Card>
      ) : (
        <Card pad={14}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
            <SectionLabel>HUD lines</SectionLabel>
            <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink }}>{QC_FMT.short(total)}</Text>
          </View>
          {data.map((line, i) => (
            <View
              key={line.id}
              style={{
                paddingVertical: 10,
                borderBottomColor: t.line,
                borderBottomWidth: i < data.length - 1 ? 1 : 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: t.ink3, width: 38 }}>{line.line_number}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }} numberOfLines={1}>
                  {line.description}
                </Text>
                {line.payee ? (
                  <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }} numberOfLines={1}>{line.payee}</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink }}>{QC_FMT.short(Number(line.amount || 0))}</Text>
            </View>
          ))}
        </Card>
      )}

      {open ? (
        <Card pad={14}>
          <SectionLabel>Add my fee</SectionLabel>
          <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 10, lineHeight: 15 }}>
            Posted as a line in the 800 series. % is computed against the loan amount
            ({loanAmount > 0 ? QC_FMT.short(loanAmount) : "—"}).
          </Text>

          <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 4 }}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Broker origination"
            placeholderTextColor={t.ink4}
            style={{
              backgroundColor: t.surface2, color: t.ink, fontSize: 14,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
              borderColor: t.line, borderWidth: 1, marginBottom: 12,
            }}
          />

          <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 4 }}>Amount</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TextInput
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="decimal-pad"
              placeholder={mode === "%" ? "1.5" : "5000"}
              placeholderTextColor={t.ink4}
              style={{
                flex: 1,
                backgroundColor: t.surface2, color: t.ink, fontSize: 14,
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                borderColor: t.line, borderWidth: 1,
              }}
            />
            <View style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: 10, padding: 3, borderColor: t.line, borderWidth: 1 }}>
              {(["%", "$"] as const).map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    accessibilityLabel={m === "%" ? "Percent of loan" : "Dollar amount"}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 7,
                      backgroundColor: active ? t.surface : "transparent",
                      borderWidth: active ? 1 : 0,
                      borderColor: active ? t.line : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: active ? t.ink : t.ink3 }}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {mode === "%" && amountStr && loanAmount > 0 ? (
            <Text style={{ fontSize: 11, color: t.ink3, marginBottom: 12 }}>
              ≈ {QC_FMT.short(Math.round((Number(amountStr) / 100) * loanAmount))} on {QC_FMT.short(loanAmount)}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={reset}
              disabled={createLine.isPending}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: t.surface2,
                borderWidth: 1,
                borderColor: t.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: t.ink2, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={createLine.isPending}
              style={({ pressed }) => ({
                flex: 1.4,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.brand,
                opacity: createLine.isPending ? 0.6 : pressed ? 0.85 : 1,
                flexDirection: "row",
                gap: 8,
              })}
            >
              {createLine.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="plus" size={14} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                {createLine.isPending ? "Adding…" : "Add fee"}
              </Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityLabel="Add my fee"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 13,
            borderRadius: 12,
            backgroundColor: t.brand,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="plus" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Add my fee</Text>
        </Pressable>
      )}
    </View>
  );
}

// Pick the next broker-fee line number (HUD-1 800-series). Looks at
// what's already there in the 800-block and increments, otherwise
// starts at "801".
function nextBrokerLineNumber(existing: string[]): string {
  const eight = existing
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n) && n >= 800 && n < 900);
  if (eight.length === 0) return "801";
  return String(Math.max(...eight) + 1);
}
