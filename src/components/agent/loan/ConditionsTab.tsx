// Underwriting condition checklist. Grouped by category, row-tap
// drills into a per-condition BottomSheet for status + assignment.
// Phase 3 — gated by BACKEND_HAS_CONDITIONS.

import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { ActionRow } from "@/components/agent/ActionRow";
import { BottomSheet } from "@/components/sheets/BottomSheet";
import { useLoanConditions, useUpdateCondition } from "@/hooks/useApi";
import type { LoanCondition } from "@/lib/mocks";

export function ConditionsTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: conditions = [], isLoading } = useLoanConditions(loanId);
  const [active, setActive] = useState<LoanCondition | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, LoanCondition[]>();
    for (const c of conditions) {
      const arr = m.get(c.category) ?? [];
      arr.push(c);
      m.set(c.category, arr);
    }
    return Array.from(m.entries());
  }, [conditions]);

  if (isLoading) {
    return (
      <Card pad={18}>
        <Text style={{ color: t.ink3, fontSize: 13 }}>Loading conditions…</Text>
      </Card>
    );
  }
  if (conditions.length === 0) {
    return (
      <Card pad={18}>
        <SectionLabel>Conditions</SectionLabel>
        <Text style={{ color: t.ink3, fontSize: 13 }}>No underwriting conditions yet.</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {grouped.map(([cat, items]) => (
        <Card key={cat} pad={14}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: t.ink3, textTransform: "uppercase" }}>{cat}</Text>
            <Pill bg={t.chip} color={t.ink2}>{items.length}</Pill>
          </View>
          <View style={{ marginTop: 6 }}>
            {items.map((c, i) => (
              <ActionRow
                key={c.id}
                icon={c.status === "resolved" ? "check" : c.status === "in_progress" ? "refresh" : "alert"}
                iconColor={c.status === "resolved" ? t.profit : c.status === "in_progress" ? t.petrol : t.warn}
                iconBg={c.status === "resolved" ? t.profitBg : c.status === "in_progress" ? t.petrolSoft : t.warnBg}
                label={c.label}
                sublabel={c.description ?? null}
                noBorder={i === items.length - 1}
                onPress={() => setActive(c)}
              />
            ))}
          </View>
        </Card>
      ))}
      <ConditionDetailSheet
        visible={!!active}
        onClose={() => setActive(null)}
        loanId={loanId}
        condition={active}
      />
    </View>
  );
}

function ConditionDetailSheet({
  visible, onClose, loanId, condition,
}: {
  visible: boolean;
  onClose: () => void;
  loanId: string;
  condition: LoanCondition | null;
}) {
  const { t } = useTheme();
  const update = useUpdateCondition();
  if (!condition) return null;
  const setStatus = (status: LoanCondition["status"]) =>
    update.mutate({ loanId, conditionId: condition.id, status });
  return (
    <BottomSheet visible={visible} onClose={onClose} title={condition.label} subtitle={condition.category}>
      {condition.description ? (
        <Text style={{ fontSize: 13, color: t.ink2, lineHeight: 18 }}>{condition.description}</Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {(["open", "in_progress", "resolved", "waived"] as const).map((s) => {
          const active = condition.status === s;
          return (
            <Pill
              key={s}
              bg={active ? t.brand : t.chip}
              color={active ? "#fff" : t.ink2}
            >
              <Text onPress={() => setStatus(s)} style={{ color: active ? "#fff" : t.ink2, fontSize: 11.5, fontWeight: "600" }}>
                {s.replace("_", " ")}
              </Text>
            </Pill>
          );
        })}
      </View>
    </BottomSheet>
  );
}
