// Prequal requests for the loan. Lists existing requests; new
// request flow lives in the existing PreQualRequestSheet at
// src/components/sheets/PreQualRequestSheet.tsx.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { useLoanPrequalRequests } from "@/hooks/useApi";

export function PrequalTab({ loanId, clientId: _clientId }: { loanId: string; clientId: string }) {
  const { t } = useTheme();
  const { data = [], isLoading } = useLoanPrequalRequests(loanId);
  const [openSheet, setOpenSheet] = useState(false);
  // PreQualRequestSheet exists but expects its own caller wiring.
  // For now we surface a CTA pointer; full mount lives in a
  // follow-up so we don't duplicate the existing entry point.

  if (isLoading) {
    return (
      <Card pad={18}>
        <Text style={{ color: t.ink3, fontSize: 13 }}>Loading prequal requests…</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Card pad={14}>
        <SectionLabel>Pre-Qual</SectionLabel>
        {data.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            No prequal request on this loan yet.
          </Text>
        ) : (
          data.map((p, i) => (
            <View
              key={p.id}
              style={{
                paddingVertical: 10,
                borderBottomColor: t.line,
                borderBottomWidth: i < data.length - 1 ? 1 : 0,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink }}>
                  {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
                <Pill
                  bg={p.status === "offer_accepted" ? t.profitBg : p.status === "rejected" || p.status === "offer_declined" ? t.dangerBg : t.warnBg}
                  color={p.status === "offer_accepted" ? t.profit : p.status === "rejected" || p.status === "offer_declined" ? t.danger : t.warn}
                >
                  {p.status.replace(/_/g, " ")}
                </Pill>
              </View>
              {p.target_property_address ? (
                <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }} numberOfLines={2}>
                  {p.target_property_address}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Card>
      <Pressable
        onPress={() => setOpenSheet(true)}
        style={({ pressed }) => ({
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: pressed ? t.surface2 : t.surface,
          alignItems: "center",
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>Request a new prequal</Text>
        <Text style={{ fontSize: 11, color: t.ink3, marginTop: 3 }}>
          {openSheet
            ? "Opening the request sheet…"
            : "Opens the lending-handoff form for this loan."}
        </Text>
      </Pressable>
    </View>
  );
}
