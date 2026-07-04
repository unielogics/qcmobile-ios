// Broker-scoped Elara Inbox.
//
// Replaces the previous "Messages" bottom-tab. Surfaces every PENDING
// AI task whose loan is in the broker's book (the broker_id filter is
// effectively `task.loan_id ∈ useLoans("mine").map(l => l.id)`).
//
// Each row is a tappable card: priority dot + title + summary + source
// pill + "Xh ago". Tap → drills into the loan's Elara tab.
//
// Thread list (the old Messages content) is still reachable via the
// AI FAB on the Today screen → AIChatSheet's conversations view.

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { useAITasks, useLoans } from "@/hooks/useApi";
import type { AITask } from "@/lib/types";
import type { AITaskPriority } from "@/lib/enums.generated";

type PriorityFilter = "all" | AITaskPriority;

const PRIORITY_ORDER: Record<AITaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function InboxScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const tasksQ = useAITasks();
  const loansQ = useLoans("mine");
  const tasks = tasksQ.data ?? [];
  const loans = loansQ.data ?? [];

  const myLoanIds = useMemo(() => new Set(loans.map((l) => l.id)), [loans]);

  // Broker scope: task must be pending AND tied to a loan in my book.
  // Tasks without a loan_id (account-wide AI tasks) are also shown if
  // the broker is the only assignee — we keep them in for now since the
  // backend doesn't currently emit account-wide tasks for non-admins.
  const visible: AITask[] = useMemo(() => {
    return tasks
      .filter((t) => t.status === "pending")
      .filter((t) => t.loan_id == null || myLoanIds.has(t.loan_id))
      .filter((t) => filter === "all" || t.priority === filter)
      .sort((a, b) => {
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tasks, myLoanIds, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, high: 0, medium: 0, low: 0 } as Record<PriorityFilter, number>;
    for (const t of tasks) {
      if (t.status !== "pending") continue;
      if (t.loan_id != null && !myLoanIds.has(t.loan_id)) continue;
      c.all += 1;
      c[t.priority] += 1;
    }
    return c;
  }, [tasks, myLoanIds]);

  const openTask = (task: AITask) => {
    if (task.loan_id) {
      router.push(`/agent/loan/${task.loan_id}` as Href);
    }
  };

  const filters: Array<{ key: PriorityFilter; label: string; tint: string }> = [
    { key: "all", label: "All", tint: t.ink2 },
    { key: "high", label: "High", tint: t.danger },
    { key: "medium", label: "Medium", tint: t.warn },
    { key: "low", label: "Low", tint: t.ink3 },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Inbox" />
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Card pad={14}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}>
                Actions waiting
              </Text>
              <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
                {counts.all === 0
                  ? "No pending AI items on your loans."
                  : `${counts.all} pending · ${counts.high} high-priority`}
              </Text>
            </View>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: t.petrolSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="bell" size={16} color={t.petrol} />
            </View>
          </View>
        </Card>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", gap: 6 }}>
        {filters.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key];
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityLabel={`Filter ${f.label}`}
              style={({ pressed }) => ({
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? t.ink : t.line,
                backgroundColor: active ? t.ink : pressed ? t.surface2 : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              })}
            >
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: active ? t.inverse : t.ink2 }}>
                {f.label}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: active ? t.inverse : f.tint,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 6,
                  backgroundColor: active ? "transparent" : t.chip,
                }}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={tasksQ.isFetching && !tasksQ.isLoading}
            onRefresh={() => tasksQ.refetch()}
            tintColor={t.ink3}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {tasksQ.isLoading ? (
          <Card pad={18}>
            <Text style={{ fontSize: 13, color: t.ink3 }}>Loading inbox…</Text>
          </Card>
        ) : visible.length === 0 ? (
          <Card pad={20} style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: t.profitBg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Icon name="check" size={20} stroke={3} color={t.profit} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, textAlign: "center" }}>
              No actions in your inbox. Nice.
            </Text>
            <Text style={{ fontSize: 12, color: t.ink3, textAlign: "center", marginTop: 4, lineHeight: 17 }}>
              Pull down to refresh, or check back after the AI runs its next sweep.
            </Text>
          </Card>
        ) : (
          <>
            <SectionLabel>{filter === "all" ? "All pending" : `${filter[0].toUpperCase()}${filter.slice(1)} priority`}</SectionLabel>
            {visible.map((task) => (
              <InboxRow key={task.id} task={task} onPress={() => openTask(task)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InboxRow({ task, onPress }: { task: AITask; onPress: () => void }) {
  const { t } = useTheme();
  const tone =
    task.priority === "high"
      ? { dot: t.danger, label: "High", bg: t.dangerBg, fg: t.danger }
      : task.priority === "medium"
        ? { dot: t.warn, label: "Medium", bg: t.warnBg, fg: t.warn }
        : { dot: t.ink3, label: "Low", bg: t.chip, fg: t.ink3 };

  const ageMin = Math.max(1, Math.round((Date.now() - new Date(task.created_at).getTime()) / 60_000));
  const age = ageMin < 60
    ? `${ageMin}m ago`
    : ageMin < 24 * 60
      ? `${Math.round(ageMin / 60)}h ago`
      : `${Math.round(ageMin / 60 / 24)}d ago`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${tone.label} priority. ${age}.`}
      style={({ pressed }) => ({
        backgroundColor: t.surface,
        borderColor: t.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        opacity: pressed ? 0.85 : 1,
        flexDirection: "row",
        gap: 12,
      })}
    >
      <View style={{ paddingTop: 4 }}>
        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: tone.dot }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.1 }} numberOfLines={2}>
          {task.title}
        </Text>
        {task.summary ? (
          <Text
            style={{ fontSize: 12, color: t.ink2, marginTop: 4, lineHeight: 17 }}
            numberOfLines={3}
          >
            {task.summary}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Pill bg={tone.bg} color={tone.fg}>{tone.label}</Pill>
          <Pill bg={t.chip} color={t.ink2}>{task.source.replace(/_/g, " ")}</Pill>
          <Text style={{ fontSize: 10.5, color: t.ink3, fontWeight: "600" }}>{age}</Text>
        </View>
      </View>
      <Icon name="chevR" size={14} color={t.ink4} />
    </Pressable>
  );
}
