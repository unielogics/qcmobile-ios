// Borrower / agent calendar. Backend scopes /calendar by role; this
// screen keeps Today on a real vertical clock while future days remain compact.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import {
  useAgentSettings,
  useCalendar,
  useCalendarActivity,
  useClients,
  useCreateCalendarEvent,
  useCurrentUser,
  useLoans,
  useUpdateCalendarEvent,
  useUsers,
} from "@/hooks/useApi";
import { CalendarEventKind } from "@/lib/enums.generated";
import { KIND_META } from "@/lib/sample-data";
import { publishWidgetSnapshot } from "@/lib/widgetData";
import type { AgentBookingSettings, CalendarActivityItem, CalendarEvent, Client, Loan, User } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PX_PER_MINUTE = 1.9;
const MIN_EVENT_HEIGHT = 58;
const NOW_LINE_RATIO = 0.4;
const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 20 * 60;
const BOOKING_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.qualifiedcommercial.com";

export default function CalendarScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const [nowTs, setNowTs] = useState(() => Date.now());
  const todayStart = useMemo(() => startOfLocalDay(new Date(nowTs)), [nowTs]);
  const queryWindow = useMemo(() => ({
    from: new Date(todayStart.getTime() - DAY_MS).toISOString(),
    to: new Date(todayStart.getTime() + 31 * DAY_MS).toISOString(),
  }), [todayStart]);
  const activityWindow = useMemo(() => ({
    from: new Date(todayStart.getTime() - 30 * DAY_MS).toISOString(),
    to: new Date(todayStart.getTime() + DAY_MS).toISOString(),
    limit: 60,
  }), [todayStart]);
  const { data: me } = useCurrentUser();
  const role = me?.role ?? null;
  const isClient = role === "client";
  const canManageCalendar = !!me && !isClient;
  const { data: events = [], isLoading, isRefetching, error, refetch } = useCalendar(queryWindow);
  const { data: activity = [] } = useCalendarActivity(activityWindow);
  const isRealtor = role === "broker";
  const { data: loans = [] } = useLoans(canManageCalendar ? "mine" : undefined);
  const { data: clients = [] } = useClients(isRealtor ? "mine" : undefined, { enabled: canManageCalendar });
  const { data: users = [] } = useUsers({ enabled: canManageCalendar && !isRealtor });
  const { data: agentSettings } = useAgentSettings({ enabled: role === "broker" });
  const update = useUpdateCalendarEvent();
  const createEvent = useCreateCalendarEvent();
  const [createOpen, setCreateOpen] = useState(false);
  const bookingUrl = useMemo(
    () => getBookingUrl(role, agentSettings?.data.booking ?? null),
    [agentSettings?.data.booking, role],
  );
  const shareBookingLink = useCallback(() => {
    if (!bookingUrl) return;
    Share.share({
      title: agentSettings?.data.booking?.title ?? "Book a meeting",
      message: bookingUrl,
      url: bookingUrl,
    }).catch(() => {
      Alert.alert("Could not share", "Copy the booking link from the booking card and try again.");
    });
  }, [agentSettings?.data.booking?.title, bookingUrl]);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const ts = new Date(e.starts_at).getTime();
          return ts >= todayStart.getTime() - DAY_MS && ts <= todayStart.getTime() + 30 * DAY_MS;
        })
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events, todayStart],
  );
  const todayEvents = useMemo(
    () => visibleEvents.filter((e) => isSameLocalDay(new Date(e.starts_at), new Date(nowTs))),
    [visibleEvents, nowTs],
  );
  const byUpcomingDay = useMemo(() => {
    const acc: Record<string, CalendarEvent[]> = {};
    for (const event of visibleEvents) {
      const starts = new Date(event.starts_at);
      if (isSameLocalDay(starts, new Date(nowTs))) continue;
      if (starts.getTime() < todayStart.getTime()) continue;
      const key = localDateKey(starts);
      (acc[key] ||= []).push(event);
    }
    return acc;
  }, [visibleEvents, nowTs, todayStart]);
  const upcomingDays = Object.keys(byUpcomingDay).sort().slice(0, 10);

  useEffect(() => {
    if (!isRealtor) return;
    publishWidgetSnapshot({
      updated_at: new Date(nowTs).toISOString(),
      meetings: visibleEvents.slice(0, 3).map((event) => ({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        source: event.who ?? event.source,
        deeplink: "qcmobile://agent/(tabs)/calendar",
      })),
      pipeline_count: loans.filter((loan) => loan.stage !== "funded").length,
    }).catch(() => undefined);
  }, [isRealtor, loans, nowTs, visibleEvents]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar
        title="Calendar"
        titleAction={bookingUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share booking link"
            onPress={shareBookingLink}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: t.brand,
              backgroundColor: pressed ? t.brandSoft : t.surface,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Icon name="send" size={16} color={t.brand} />
          </Pressable>
        ) : null}
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={t.ink3}
          />
        }
      >
        {isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={t.ink3} />
          </View>
        ) : error ? (
          <Text style={{ textAlign: "center", color: t.danger, fontSize: 12, paddingVertical: 24 }}>
            Couldn't load your calendar. Pull to refresh.
          </Text>
        ) : (
          <>
            <TodayTimeline
              events={todayEvents}
              nowTs={nowTs}
              onOpenDocument={(documentId) => router.push({ pathname: "/(tabs)/vault", params: { fulfill: documentId } })}
              onToggle={(event) => {
                update.mutate({
                  id: event.id,
                  patch: { status: event.status === "done" ? "pending" : "done" },
                });
              }}
            />

            {isClient ? (
              <ClientActivity rows={activity} />
            ) : canManageCalendar ? (
              <BookingLinkCard booking={agentSettings?.data.booking ?? null} role={role} bookingUrl={bookingUrl} onShare={shareBookingLink} />
            ) : null}

            {upcomingDays.length > 0 ? (
              <View style={{ gap: 14 }}>
                {upcomingDays.map((dayKey) => {
                  const dayEvents = byUpcomingDay[dayKey]
                    .slice()
                    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
                  return (
                    <View key={dayKey} style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }}>{formatDayHeader(dayKey)}</Text>
                        <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "700" }}>
                          {dayEvents.length} item{dayEvents.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {dayEvents.map((event) => (
                          <CompactEventRow
                            key={event.id}
                            event={event}
                            onPress={() => {
                              if (isDocumentDue(event) && event.status !== "done" && event.external_ref_id) {
                                router.push({ pathname: "/(tabs)/vault", params: { fulfill: event.external_ref_id } });
                                return;
                              }
                              update.mutate({
                                id: event.id,
                                patch: { status: event.status === "done" ? "pending" : "done" },
                              });
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 14, padding: 16 }}>
                <Text style={{ textAlign: "center", color: t.ink3, fontSize: 12.5 }}>No upcoming events after today.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      {canManageCalendar ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New event"
            onPress={() => setCreateOpen(true)}
            style={({ pressed }) => ({
              position: "absolute",
              right: 18,
              bottom: 28,
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: t.brand,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.28,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
              opacity: pressed ? 0.84 : 1,
            })}
          >
            <Icon name="plus" size={25} color={t.bg} stroke={2.4} />
          </Pressable>
          <MobileEventModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            me={me ?? null}
            loans={loans}
            clients={clients}
            users={users}
            isRealtor={isRealtor}
            onCreate={(payload) => createEvent.mutateAsync(payload)}
            isCreating={createEvent.isPending}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

type CreateCalendarEventPayload = {
  loan_id?: string | null;
  kind: string;
  title: string;
  description?: string | null;
  who?: string | null;
  starts_at: string;
  duration_min?: number | null;
  priority?: "low" | "medium" | "high" | null;
  owner_user_id?: string | null;
};

function BookingLinkCard({
  booking,
  role,
  bookingUrl,
  onShare,
}: {
  booking: AgentBookingSettings | null;
  role: string | null;
  bookingUrl: string | null;
  onShare: () => void;
}) {
  const { t } = useTheme();
  const isBroker = role === "broker";

  return (
    <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>
            Booking
          </Text>
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: "900", marginTop: 3 }}>
            {bookingUrl ? (booking?.title || "Public meeting link") : "Calendar controls"}
          </Text>
          <Text numberOfLines={2} style={{ color: t.ink3, fontSize: 12, marginTop: 3 }}>
            {bookingUrl
              ? bookingUrl
              : isBroker
                ? "Configure your personalized booking page from desktop Agent Settings."
                : "Use the plus button to schedule clients, agents, lenders, vendors, and internal team meetings."}
          </Text>
        </View>
        {bookingUrl ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => Linking.openURL(bookingUrl)}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: pressed ? t.surface2 : t.bg,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="external" size={16} color={t.ink2} />
            </Pressable>
            <Pressable
              onPress={onShare}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: pressed ? t.brandSoft : t.brand,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="send" size={16} color={t.bg} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const EVENT_TEMPLATES = [
  { id: "client", label: "Client meeting", attendeeMode: "client", kind: CalendarEventKind.CALL, title: "Client meeting" },
  { id: "agent", label: "Agent meeting", attendeeMode: "agent", kind: CalendarEventKind.CALL, title: "Agent meeting" },
  { id: "underwriting", label: "Funding review", attendeeMode: "team", kind: CalendarEventKind.MILESTONE, title: "Funding review" },
  { id: "partner", label: "Partner call", attendeeMode: "partner", kind: CalendarEventKind.CALL, title: "Partner call" },
  { id: "external", label: "External meeting", attendeeMode: "external", kind: CalendarEventKind.CALL, title: "External meeting" },
] as const;

type EventTemplate = (typeof EVENT_TEMPLATES)[number];
type AttendeeMode = EventTemplate["attendeeMode"];
const REALTOR_EVENT_TEMPLATES: readonly EventTemplate[] = [EVENT_TEMPLATES[0]];
const ALL_ATTENDEE_MODES: AttendeeMode[] = ["client", "agent", "team", "partner", "external"];
const REALTOR_ATTENDEE_MODES: AttendeeMode[] = ["client"];

function MobileEventModal({
  open,
  onClose,
  me,
  loans,
  clients,
  users,
  isRealtor,
  onCreate,
  isCreating,
}: {
  open: boolean;
  onClose: () => void;
  me: User | null;
  loans: Loan[];
  clients: Client[];
  users: User[];
  isRealtor: boolean;
  onCreate: (payload: CreateCalendarEventPayload) => Promise<unknown>;
  isCreating: boolean;
}) {
  const { t } = useTheme();
  const initialStart = useMemo(() => nextHalfHour(new Date()), [open]);
  const templates = isRealtor ? REALTOR_EVENT_TEMPLATES : EVENT_TEMPLATES;
  const attendeeModes = isRealtor ? REALTOR_ATTENDEE_MODES : ALL_ATTENDEE_MODES;
  const [templateId, setTemplateId] = useState<EventTemplate["id"]>("client");
  const selectedTemplate = templates.find((item) => item.id === templateId) ?? templates[0];
  const [attendeeMode, setAttendeeMode] = useState<AttendeeMode>(selectedTemplate.attendeeMode);
  const [title, setTitle] = useState<string>(selectedTemplate.title);
  const [who, setWho] = useState("");
  const [loanId, setLoanId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState(initialStart);
  const [durationMin, setDurationMin] = useState("30");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [query, setQuery] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    if (!open) return;
    const template = templates.find((item) => item.id === templateId) ?? templates[0];
    if (template.id !== templateId) setTemplateId(template.id);
    setAttendeeMode(template.attendeeMode);
    setTitle(template.title);
  }, [open, templateId, templates]);

  useEffect(() => {
    if (!open) return;
    setStartsAt(nextHalfHour(new Date()));
  }, [open]);

  const attendeeMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (attendeeMode === "client") {
      return clients
        .filter((client) => filterPerson(client.name, client.email, needle))
        .slice(0, 8)
        .map((client) => ({
          id: client.id,
          label: client.name,
          sub: client.email ?? client.phone ?? "Client",
          value: client.email ? `${client.name} <${client.email}>` : client.name,
          icon: "user",
        }));
    }
    if (attendeeMode === "agent") {
      return users
        .filter((user) => user.role === "broker")
        .filter((user) => filterPerson(user.name, user.email, needle))
        .slice(0, 8)
        .map((user) => ({
          id: user.id,
          label: user.name,
          sub: user.email,
          value: `${user.name} <${user.email}>`,
          icon: "user",
        }));
    }
    if (attendeeMode === "team") {
      return users
        .filter((user) => user.role !== "client" && user.role !== "broker")
        .filter((user) => filterPerson(user.name, user.email, needle))
        .slice(0, 8)
        .map((user) => ({
          id: user.id,
          label: user.name,
          sub: `${user.role} - ${user.email}`,
          value: `${user.name} <${user.email}>`,
          icon: "shield",
        }));
    }
    return [];
  }, [attendeeMode, clients, query, users]);

  const selectedLoan = loans.find((loan) => loan.id === loanId) ?? null;
  const submit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Add a meeting title before saving.");
      return;
    }
    const duration = Math.max(15, Math.min(480, Number.parseInt(durationMin, 10) || 30));
    const description = [
      selectedTemplate.label,
      location.trim() ? `Location: ${location.trim()}` : null,
      notes.trim() ? notes.trim() : null,
    ].filter(Boolean).join("\n\n");
    try {
      await onCreate({
        loan_id: loanId,
        kind: selectedTemplate.kind,
        title: title.trim(),
        description: description || null,
        who: who.trim() || null,
        starts_at: startsAt.toISOString(),
        duration_min: duration,
        priority,
        owner_user_id: loanId ? null : me?.id ?? null,
      });
      setWho("");
      setLoanId(null);
      setLocation("");
      setNotes("");
      setQuery("");
      onClose();
    } catch (err) {
      Alert.alert("Could not create event", err instanceof Error ? err.message : "Please try again.");
    }
  }, [durationMin, loanId, location, me?.id, notes, onClose, onCreate, priority, selectedTemplate, startsAt, title, who]);

  return (
    <Modal animationType="slide" visible={open} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View>
            <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" }}>New event</Text>
            <Text style={{ color: t.ink, fontSize: 19, fontWeight: "900", marginTop: 2 }}>Schedule meeting</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: pressed ? t.surface2 : t.surface,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Icon name="x" size={18} color={t.ink2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => {
                  setTemplateId(template.id);
                  setAttendeeMode(template.attendeeMode);
                  setTitle(template.title);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: templateId === template.id ? t.brand : t.line,
                  backgroundColor: templateId === template.id ? t.brandSoft : pressed ? t.surface2 : t.surface,
                })}
              >
                <Text style={{ color: templateId === template.id ? t.brand : t.ink2, fontSize: 12, fontWeight: "900" }}>
                  {template.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 12 }}>
            <FieldLabel label="Title" />
            <CalendarInput value={title} onChangeText={setTitle} placeholder="Meeting title" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setShowDate(true)}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1,
                  borderColor: t.line,
                  borderRadius: 13,
                  backgroundColor: pressed ? t.surface2 : t.bg,
                  padding: 12,
                })}
              >
                <FieldLabel label="Date" />
                <Text style={{ color: t.ink, fontSize: 14, fontWeight: "800", marginTop: 4 }}>
                  {startsAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowTime(true)}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1,
                  borderColor: t.line,
                  borderRadius: 13,
                  backgroundColor: pressed ? t.surface2 : t.bg,
                  padding: 12,
                })}
              >
                <FieldLabel label="Time" />
                <Text style={{ color: t.ink, fontSize: 14, fontWeight: "800", marginTop: 4 }}>
                  {formatClock(startsAt)}
                </Text>
              </Pressable>
            </View>

            {showDate ? (
              <DateTimePicker
                value={startsAt}
                mode="date"
                onChange={(_, selected) => {
                  setShowDate(false);
                  if (!selected) return;
                  const next = new Date(startsAt);
                  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                  setStartsAt(next);
                }}
              />
            ) : null}
            {showTime ? (
              <DateTimePicker
                value={startsAt}
                mode="time"
                onChange={(_, selected) => {
                  setShowTime(false);
                  if (!selected) return;
                  const next = new Date(startsAt);
                  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                  setStartsAt(next);
                }}
              />
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Duration" />
                <CalendarInput value={durationMin} onChangeText={setDurationMin} placeholder="30" keyboardType="number-pad" suffix="min" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Priority" />
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  {(["low", "medium", "high"] as const).map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setPriority(item)}
                      style={{
                        flex: 1,
                        borderRadius: 11,
                        borderWidth: 1,
                        borderColor: priority === item ? t.brand : t.line,
                        backgroundColor: priority === item ? t.brandSoft : t.bg,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: priority === item ? t.brand : t.ink3, fontSize: 11, fontWeight: "900", textTransform: "capitalize" }}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 12 }}>
            <FieldLabel label="Attendee" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {attendeeModes.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => {
                    setAttendeeMode(mode);
                    setQuery("");
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: attendeeMode === mode ? t.brand : t.line,
                    backgroundColor: attendeeMode === mode ? t.brandSoft : t.bg,
                  }}
                >
                  <Text style={{ color: attendeeMode === mode ? t.brand : t.ink3, fontSize: 11, fontWeight: "900", textTransform: "capitalize" }}>
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
            <CalendarInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (attendeeMode === "partner" || attendeeMode === "external") setWho(text);
              }}
              placeholder={attendeeMode === "partner" || attendeeMode === "external" ? "Name, company, or email" : "Search by name or email"}
              icon="search"
            />
            {attendeeMatches.length > 0 ? (
              <View style={{ gap: 8 }}>
                {attendeeMatches.map((match) => (
                  <Pressable
                    key={match.id}
                    onPress={() => {
                      setWho(match.value);
                      setQuery(match.label);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      borderWidth: 1,
                      borderColor: t.line,
                      borderRadius: 13,
                      backgroundColor: pressed ? t.surface2 : t.bg,
                      padding: 10,
                    })}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={match.icon} size={14} color={t.brand} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: t.ink, fontSize: 13, fontWeight: "900" }}>{match.label}</Text>
                      <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 11, marginTop: 2 }}>{match.sub}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : attendeeMode === "client" || attendeeMode === "agent" || attendeeMode === "team" ? (
              <Text style={{ color: t.ink3, fontSize: 12 }}>Search existing records. If no result is available, type the attendee in notes or use External.</Text>
            ) : null}

            <FieldLabel label="Selected attendee" />
            <CalendarInput value={who} onChangeText={setWho} placeholder="Who is attending?" />
          </View>

          <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 12 }}>
            <FieldLabel label="Funding file" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              <Pressable
                onPress={() => setLoanId(null)}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: !loanId ? t.brand : t.line,
                  backgroundColor: !loanId ? t.brandSoft : t.bg,
                }}
              >
                <Text style={{ color: !loanId ? t.brand : t.ink3, fontSize: 11, fontWeight: "900" }}>No file</Text>
              </Pressable>
              {loans.slice(0, 20).map((loan) => (
                <Pressable
                  key={loan.id}
                  onPress={() => setLoanId(loan.id)}
                  style={{
                    maxWidth: 240,
                    paddingHorizontal: 11,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: loanId === loan.id ? t.brand : t.line,
                    backgroundColor: loanId === loan.id ? t.brandSoft : t.bg,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: loanId === loan.id ? t.brand : t.ink3, fontSize: 11, fontWeight: "900" }}>
                    {loan.address || loan.id}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedLoan ? (
              <Text style={{ color: t.ink3, fontSize: 12 }}>
                Linked to {selectedLoan.address}{selectedLoan.city ? `, ${selectedLoan.city}` : ""}.
              </Text>
            ) : null}

            <FieldLabel label="Location" />
            <CalendarInput value={location} onChangeText={setLocation} placeholder="Phone, Zoom, office, property address" />
            <FieldLabel label="Notes" />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Context, agenda, prep notes"
              placeholderTextColor={t.ink4}
              multiline
              style={{
                minHeight: 92,
                borderWidth: 1,
                borderColor: t.line,
                borderRadius: 13,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: t.ink,
                backgroundColor: t.bg,
                fontSize: 13,
                textAlignVertical: "top",
              }}
            />
          </View>

          <Pressable
            disabled={isCreating}
            onPress={submit}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: 16,
              backgroundColor: isCreating ? t.ink4 : pressed ? t.brandSoft : t.brand,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 9,
            })}
          >
            {isCreating ? <ActivityIndicator color={t.bg} /> : <Icon name="cal" size={18} color={t.bg} />}
            <Text style={{ color: t.bg, fontSize: 14, fontWeight: "900" }}>{isCreating ? "Creating..." : "Create event"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function FieldLabel({ label }: { label: string }) {
  const { t } = useTheme();
  return (
    <Text style={{ color: t.ink3, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
      {label}
    </Text>
  );
}

function CalendarInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  suffix,
  icon,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad";
  suffix?: string;
  icon?: string;
}) {
  const { t } = useTheme();
  return (
    <View style={{ marginTop: 6, position: "relative" }}>
      {icon ? (
        <View style={{ position: "absolute", left: 12, top: 13, zIndex: 2 }}>
          <Icon name={icon} size={16} color={t.ink4} />
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.ink4}
        keyboardType={keyboardType}
        style={{
          height: 46,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 13,
          paddingLeft: icon ? 38 : 12,
          paddingRight: suffix ? 44 : 12,
          color: t.ink,
          backgroundColor: t.bg,
          fontSize: 13,
          fontWeight: "700",
        }}
      />
      {suffix ? (
        <Text style={{ position: "absolute", right: 12, top: 14, color: t.ink3, fontSize: 12, fontWeight: "800" }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

function TodayTimeline({
  events,
  nowTs,
  onToggle,
  onOpenDocument,
}: {
  events: CalendarEvent[];
  nowTs: number;
  onToggle: (event: CalendarEvent) => void;
  onOpenDocument: (documentId: string) => void;
}) {
  const { t } = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const [containerHeight, setContainerHeight] = useState(560);
  const layout = useMemo(() => buildTimelineLayout(events, new Date(nowTs)), [events, nowTs]);

  const alignNow = useCallback(() => {
    const target = Math.max(0, layout.currentOffset - containerHeight * NOW_LINE_RATIO);
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [containerHeight, layout.currentOffset]);

  useEffect(() => {
    alignNow();
    const id = setTimeout(alignNow, 80);
    return () => clearTimeout(id);
  }, [alignNow, events.length]);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.surface,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 13, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>Today</Text>
            <Text style={{ fontSize: 13, color: t.ink, fontWeight: "800", marginTop: 2 }}>
              Fixed timeline · {formatClock(new Date(nowTs))}
            </Text>
          </View>
          <View style={{ backgroundColor: t.chip, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
            <Text style={{ fontSize: 11, color: t.ink2, fontWeight: "800" }}>
              {events.length} item{events.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      </View>

      <View
        onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        style={{ height: 560, position: "relative", overflow: "hidden", backgroundColor: t.surface }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${NOW_LINE_RATIO * 100}%`,
            zIndex: 5,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              marginLeft: 8,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: "rgba(239,68,68,0.16)",
              color: "#ef4444",
              fontSize: 10,
              fontWeight: "900",
              overflow: "hidden",
            }}
          >
            {formatClock(new Date(nowTs))}
          </Text>
          <View style={{ height: 2, flex: 1, backgroundColor: "#ef4444" }} />
        </View>

        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ height: layout.height, minHeight: 560, position: "relative" }}>
            {layout.hours.map((hour) => (
              <View
                key={hour.minute}
                style={{
                  position: "absolute",
                  top: hour.top,
                  left: 0,
                  right: 0,
                  height: 1,
                  backgroundColor: t.line,
                }}
              >
                <Text style={{ position: "absolute", top: -8, left: 10, width: 46, fontSize: 10, color: t.ink4, fontWeight: "800" }}>
                  {formatHour(hour.minute)}
                </Text>
              </View>
            ))}

            <View style={{ position: "absolute", left: 58, right: 10, top: 0, bottom: 0 }}>
              {layout.items.length === 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: Math.max(30, layout.currentOffset + 32),
                    left: 0,
                    right: 0,
                    borderWidth: 1,
                    borderColor: t.lineStrong,
                    borderStyle: "dashed",
                    borderRadius: 12,
                    padding: 13,
                  }}
                >
                  <Text style={{ color: t.ink3, textAlign: "center", fontSize: 12.5 }}>Nothing scheduled today.</Text>
                </View>
              ) : null}

              {layout.items.map((item) => (
                <TimelineEvent
                  key={item.event.id}
                  item={item}
                  onPress={() => {
                    if (isDocumentDue(item.event) && item.event.status !== "done" && item.event.external_ref_id) {
                      onOpenDocument(item.event.external_ref_id);
                      return;
                    }
                    onToggle(item.event);
                  }}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function TimelineEvent({ item, onPress }: { item: TimelineItem; onPress: () => void }) {
  const { t } = useTheme();
  const event = item.event;
  const tone = eventTone(event, t);
  const meta = KIND_META[event.kind as keyof typeof KIND_META];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        top: item.top,
        left: `${(item.column / item.columnCount) * 100}%`,
        width: `${100 / item.columnCount}%`,
        height: item.height,
        paddingRight: item.columnCount > 1 ? 6 : 0,
        opacity: event.status === "cancelled" ? 0.58 : pressed ? 0.84 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: tone.fg,
          backgroundColor: tone.bg,
          padding: 9,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Icon name={meta?.icon ?? "cal"} size={13} color={tone.fg} />
          <Text style={{ fontSize: 11, color: tone.fg, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {formatClock(new Date(event.starts_at))}
          </Text>
          {event.duration_min ? <Text style={{ fontSize: 10, color: t.ink3 }}>{event.duration_min}m</Text> : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: t.ink,
            fontSize: 13,
            fontWeight: "900",
            marginTop: 5,
            textDecorationLine: event.status === "done" || event.status === "cancelled" ? "line-through" : "none",
          }}
        >
          {event.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: "auto" }}>
          <Text style={{ fontSize: 10, color: tone.fg, fontWeight: "900", textTransform: "uppercase" }}>
            {tone.label || event.kind}
          </Text>
          {event.who ? (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: t.ink3 }}>
              {event.who}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function CompactEventRow({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const { t } = useTheme();
  const tone = eventTone(event, t);
  const meta = KIND_META[event.kind as keyof typeof KIND_META];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tone.fg,
        backgroundColor: pressed ? t.surface2 : tone.bg,
        opacity: event.status === "cancelled" ? 0.6 : 1,
      })}
    >
      <Text style={{ minWidth: 42, fontSize: 11, fontWeight: "800", color: tone.fg, fontVariant: ["tabular-nums"] }}>
        {formatClock(new Date(event.starts_at))}
      </Text>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: t.bg, borderWidth: 1, borderColor: tone.fg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={meta?.icon ?? "cal"} size={13} color={tone.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: t.ink, textDecorationLine: event.status === "done" || event.status === "cancelled" ? "line-through" : "none" }}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
          {[tone.label, event.who, event.duration_min ? `${event.duration_min}m` : null].filter(Boolean).join(" · ") || event.kind}
        </Text>
      </View>
    </Pressable>
  );
}

function ClientActivity({ rows }: { rows: CalendarActivityItem[] }) {
  const { t } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 10 }}>
      <Text style={{ fontSize: 11, color: t.ink3, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>
        Account activity
      </Text>
      {rows.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: t.ink3 }}>No recent borrower-visible activity.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.slice(0, 12).map((row) => (
            <View key={row.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 4 }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name={activityIcon(row.kind)} size={13} color={t.brand} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontSize: 12.5, color: t.ink, fontWeight: "700" }}>
                  {row.summary || humanize(row.kind)}
                </Text>
                <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  {humanize(row.kind)} · {new Date(row.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface TimelineItem {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

function buildTimelineLayout(events: CalendarEvent[], now: Date) {
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const raw = events
    .map((event) => {
      const starts = new Date(event.starts_at);
      const startMinute = starts.getHours() * 60 + starts.getMinutes();
      const duration = Math.max(15, event.duration_min ?? 30);
      return { event, startMinute, endMinute: Math.min(24 * 60, startMinute + duration) };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const minMinute = Math.min(DEFAULT_DAY_START_MINUTE, nowMinute, ...raw.map((x) => x.startMinute));
  const maxMinute = Math.max(DEFAULT_DAY_END_MINUTE, nowMinute + 30, ...raw.map((x) => x.endMinute));
  const rangeStart = Math.max(0, Math.floor(minMinute / 60) * 60);
  const rangeEnd = Math.min(24 * 60, Math.ceil(maxMinute / 60) * 60);
  const height = Math.max(560, (rangeEnd - rangeStart) * PX_PER_MINUTE);
  const items: TimelineItem[] = [];

  for (const cluster of clusterOverlaps(raw)) {
    const colEnds: number[] = [];
    const clusterItems = cluster.map((item) => {
      let column = colEnds.findIndex((end) => end <= item.startMinute);
      if (column === -1) {
        column = colEnds.length;
        colEnds.push(item.endMinute);
      } else {
        colEnds[column] = item.endMinute;
      }
      return { ...item, column };
    });
    const columnCount = Math.max(1, colEnds.length);
    for (const item of clusterItems) {
      items.push({
        ...item,
        top: (item.startMinute - rangeStart) * PX_PER_MINUTE,
        height: Math.max((item.endMinute - item.startMinute) * PX_PER_MINUTE, MIN_EVENT_HEIGHT),
        columnCount,
      });
    }
  }
  const hours = [];
  for (let minute = rangeStart; minute <= rangeEnd; minute += 60) {
    hours.push({ minute, top: (minute - rangeStart) * PX_PER_MINUTE });
  }
  return {
    rangeStart,
    rangeEnd,
    height,
    currentOffset: clampNumber((nowMinute - rangeStart) * PX_PER_MINUTE, 0, height),
    items,
    hours,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clusterOverlaps<T extends { startMinute: number; endMinute: number }>(items: T[]): T[][] {
  const clusters: T[][] = [];
  let active: T[] = [];
  let activeEnd = -1;
  for (const item of items) {
    if (active.length === 0 || item.startMinute < activeEnd) {
      active.push(item);
      activeEnd = Math.max(activeEnd, item.endMinute);
    } else {
      clusters.push(active);
      active = [item];
      activeEnd = item.endMinute;
    }
  }
  if (active.length) clusters.push(active);
  return clusters;
}

function filterPerson(name: string | null | undefined, email: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return `${name ?? ""} ${email ?? ""}`.toLowerCase().includes(needle);
}

function getBookingUrl(role: string | null, booking: AgentBookingSettings | null): string | null {
  if (role !== "broker" || !booking?.enabled || !booking.slug) return null;
  return `${BOOKING_BASE_URL.replace(/\/$/, "")}/book/${booking.slug}`;
}

function nextHalfHour(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const add = minutes === 0 || minutes === 30 ? 30 : minutes < 30 ? 30 - minutes : 60 - minutes;
  next.setMinutes(minutes + add);
  return next;
}

function eventTone(event: CalendarEvent, t: ReturnType<typeof useTheme>["t"]) {
  const done = event.status === "done";
  const cancelled = event.status === "cancelled";
  const overdue = !done && !cancelled && new Date(event.starts_at).getTime() < Date.now();
  if (cancelled) return { fg: t.ink3, bg: t.surface2, label: "Cancelled" };
  if (done) return { fg: t.profit, bg: t.profitBg, label: "Done" };
  if (overdue) return { fg: t.danger, bg: t.dangerBg, label: "Overdue" };
  return { fg: t.warn, bg: t.warnBg, label: "" };
}

function isDocumentDue(event: CalendarEvent): boolean {
  return event.external_ref_kind === "document_due" && !!event.external_ref_id;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatHour(minute: number): string {
  const d = new Date();
  d.setHours(Math.floor(minute / 60), 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

function activityIcon(kind: string) {
  if (kind.startsWith("document")) return "doc";
  if (kind.startsWith("calendar")) return "cal";
  if (kind.startsWith("prequal")) return "docCheck";
  if (kind.startsWith("analysis")) return "calc";
  return "audit";
}

function humanize(kind: string): string {
  return kind.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
