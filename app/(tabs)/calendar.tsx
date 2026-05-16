// Borrower / operator agenda. Wired to the real /calendar API (alembic
// 0013+). Backend handles audience scoping — clients only see their
// own loan's manual + auto events; raw `source='ai'` rows never leak
// here, they live operator-side until approved through the AITask
// flow. The tab title intentionally stays "Activity" to match the
// existing mobile vocabulary.

import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { useCalendar, useUpdateCalendarEvent } from "@/hooks/useApi";
import { KIND_META } from "@/lib/sample-data";
import type { CalendarEvent } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "doc", label: "Docs" },
  { id: "call", label: "Calls" },
  { id: "milestone", label: "Milestones" },
  { id: "ai", label: "AI" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const DAY_MS = 24 * 60 * 60 * 1000;

const dayLabel = (offset: number) => {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  if (offset < 0) return `${Math.abs(offset)} days ago`;
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};

const shortDate = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const HHMM = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

export default function CalendarScreen() {
  const { t } = useTheme();
  const [filter, setFilter] = useState<FilterId>("all");
  const { data: events = [], isLoading, isRefetching, error, refetch } = useCalendar();
  const update = useUpdateCalendarEvent();
  const router = useRouter();

  const filtered = useMemo(
    () => events.filter((e) => filter === "all" || e.kind === filter),
    [events, filter],
  );

  // Group by day-offset from today (so the existing "Today / Tomorrow / N days"
  // ordering still works). Past events are hidden by default — the backend
  // already returns recent + future, but we trim anything older than yesterday.
  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const byDay = useMemo(() => {
    const acc: Record<number, CalendarEvent[]> = {};
    for (const e of filtered) {
      const ts = new Date(e.starts_at).getTime();
      const offset = Math.floor((ts - todayMidnight) / DAY_MS);
      if (offset < -1) continue;
      (acc[offset] = acc[offset] || []).push(e);
    }
    return acc;
  }, [filtered, todayMidnight]);

  const dayKeys = useMemo(
    () => Object.keys(byDay).map(Number).sort((a, b) => a - b),
    [byDay],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Activity" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={t.ink3}
          />
        }
      >
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 4, paddingLeft: 4 }}
          style={{ marginHorizontal: -4, marginBottom: 12 }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: active ? t.ink : t.chip,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? t.inverse : t.ink2 }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Loading / error / empty / day groups */}
        {isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={t.ink3} />
          </View>
        ) : error ? (
          <Text style={{ textAlign: "center", color: t.danger, fontSize: 12, paddingVertical: 24 }}>
            Couldn&apos;t load your calendar. Pull to refresh.
          </Text>
        ) : dayKeys.length === 0 ? (
          <Text style={{ textAlign: "center", color: t.ink4, fontSize: 12, paddingVertical: 24 }}>
            Nothing scheduled
          </Text>
        ) : (
          <View style={{ gap: 18 }}>
            {dayKeys.map((dayKey) => {
              const evs = byDay[dayKey]
                .slice()
                .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
              return (
                <View key={dayKey}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.3, color: t.ink }}>
                        {dayLabel(dayKey)}
                      </Text>
                      {dayKey !== 0 && dayKey !== 1 ? (
                        <Text style={{ fontSize: 11, color: t.ink3 }}>{shortDate(dayKey)}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "600" }}>
                      {evs.length} item{evs.length === 1 ? "" : "s"}
                    </Text>
                  </View>

                  {/* Each event is its own colored pill — green when
                      done, red when overdue, yellow when pending and
                      not yet due. No checkbox; tapping toggles done.
                      The pill carries the status signal end-to-end so
                      the user reads completion state at a glance. */}
                  <View style={{ gap: 8 }}>
                    {evs.map((e) => {
                      const meta = KIND_META[e.kind as keyof typeof KIND_META];
                      const isPriority = e.priority === "high";
                      const isDone = e.status === "done";
                      const isCancelled = e.status === "cancelled";
                      const startsAt = new Date(e.starts_at).getTime();
                      const isOverdue = !isDone && !isCancelled && startsAt < Date.now();
                      // Status color: green=done, red=overdue, yellow=pending.
                      // Cancelled events fall back to neutral gray.
                      const statusFg = isCancelled
                        ? t.ink3
                        : isDone
                          ? t.profit
                          : isOverdue
                            ? t.danger
                            : t.warn;
                      const statusBg = isCancelled
                        ? t.surface2
                        : isDone
                          ? t.profitBg
                          : isOverdue
                            ? t.dangerBg
                            : t.warnBg;
                      const onToggleDone = () => {
                        update.mutate({
                          id: e.id,
                          patch: { status: isDone ? "pending" : "done" },
                        });
                      };
                      // Smart-route: a document_due event carries the
                      // Document UUID in external_ref_id. Tapping it
                      // jumps the user to the vault upload flow for
                      // that doc (?fulfill=<doc_id>) instead of just
                      // toggling done — completion is implicit when
                      // they actually upload.
                      const isDocDue = e.external_ref_kind === "document_due" && !!e.external_ref_id;
                      const onPress = () => {
                        if (isDocDue && !isDone) {
                          router.push({ pathname: "/(tabs)/vault", params: { fulfill: e.external_ref_id! } });
                          return;
                        }
                        onToggleDone();
                      };
                      return (
                        <Pressable
                          key={e.id}
                          onPress={onPress}
                          style={({ pressed }) => ({
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: statusFg,
                            backgroundColor: pressed ? t.surface2 : statusBg,
                            opacity: isCancelled ? 0.6 : 1,
                          })}
                        >
                          {/* Time */}
                          <Text
                            style={{
                              minWidth: 42,
                              fontSize: 11,
                              fontWeight: "700",
                              color: statusFg,
                              letterSpacing: 0.3,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {HHMM(e.starts_at)}
                          </Text>
                          {/* Kind icon — colored by status, not by hue */}
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              backgroundColor: t.bg,
                              borderWidth: 1,
                              borderColor: statusFg,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon name={meta?.icon ?? "calendar"} size={13} color={statusFg} />
                          </View>
                          {/* Title + meta */}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text
                                numberOfLines={1}
                                style={{
                                  flex: 1,
                                  fontSize: 13,
                                  fontWeight: "700",
                                  color: t.ink,
                                  letterSpacing: -0.2,
                                  textDecorationLine: isDone || isCancelled ? "line-through" : "none",
                                }}
                              >
                                {e.title}
                              </Text>
                              {isPriority && !isDone && !isCancelled ? (
                                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.danger }} />
                              ) : null}
                            </View>
                            {(e.who || e.source === "auto" || isOverdue) ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                                {isOverdue ? (
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: t.danger, letterSpacing: 0.5 }}>
                                    OVERDUE
                                  </Text>
                                ) : null}
                                {isOverdue && e.who ? <Text style={{ fontSize: 11, color: t.ink3 }}>·</Text> : null}
                                {e.who ? (
                                  <Text numberOfLines={1} style={{ fontSize: 11, color: t.ink3, flex: 1 }}>
                                    {e.who}
                                  </Text>
                                ) : null}
                                {e.source === "auto" ? (
                                  <>
                                    {(e.who || isOverdue) ? <Text style={{ fontSize: 11, color: t.ink3 }}>·</Text> : null}
                                    <Text style={{ fontSize: 10, fontWeight: "700", color: t.petrol, letterSpacing: 0.5 }}>
                                      AUTO
                                    </Text>
                                  </>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}
