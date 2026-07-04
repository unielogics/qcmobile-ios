import { useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, StageBadge, TappableCard } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import { TopBar } from "@/components/TopBar";
import { DealHealthPill } from "@/components/agent/DealHealthPill";
import { DealSecretaryBadge } from "@/components/agent/DealSecretaryBadge";
import { ReassignAgentSheet } from "@/components/agent/ReassignAgentSheet";
import { ContextMenu, type ContextMenuItem } from "@/components/agent/ContextMenu";
import {
  useClients,
  useLoans,
  useDealSecretarySummary,
  useCurrentUser,
} from "@/hooks/useApi";
import { LoanStage, LoanStageOptions } from "@/lib/enums.generated";
import type { Client, Loan } from "@/lib/types";

type Sort = "stage" | "amount_desc" | "closing_soonest" | "stuck_first";

const DEAL_STAGES: { value: LoanStage; label: string }[] = [
  { value: "prequalified", label: "Prequalified" },
  { value: "collecting_docs", label: "Collecting Docs" },
  { value: "lender_connected", label: "Lender Connected" },
  { value: "processing", label: "Processing" },
  { value: "closing", label: "Closing" },
  { value: "funded", label: "Funded" },
];

const STAGE_INDEX = new Map<LoanStage, number>(
  LoanStageOptions.map((o, index) => [o.value, index])
);

const SORTS: { value: Sort; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "amount_desc", label: "Amount" },
  { value: "closing_soonest", label: "Closing soonest" },
  { value: "stuck_first", label: "Stuck first" },
];

export function PipelineScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(280, width);
  const pagerRef = useRef<ScrollView | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("stage");
  const [activeStage, setActiveStage] = useState<LoanStage>("prequalified");
  const [reassignTarget, setReassignTarget] = useState<{ clientId: string; clientName: string; currentAgentId: string | null } | null>(null);
  const [menuTarget, setMenuTarget] = useState<{ id: string; clientId: string; clientName: string; currentAgentId: string | null; address?: string } | null>(null);
  const { data: clients = [] } = useClients("mine");
  const { data: loans = [] } = useLoans("mine");
  const { data: me } = useCurrentUser();
  const isSuperAdmin = me?.role === "super_admin" || me?.role === "loan_exec";

  const loanIds = useMemo(() => loans.map((l) => l.id), [loans]);
  const { data: dsSummary } = useDealSecretarySummary(loanIds);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const q = query.trim().toLowerCase();

  const matchesQuery = (c: Client | undefined, l?: Loan) => {
    if (!q) return true;
    if (c && c.name.toLowerCase().includes(q)) return true;
    if (c && c.city?.toLowerCase().includes(q)) return true;
    if (l && l.address?.toLowerCase().includes(q)) return true;
    if (l && l.deal_id?.toLowerCase().includes(q)) return true;
    return false;
  };

  const dealGroups = useMemo(() => {
    const m = new Map<LoanStage, Loan[]>();
    for (const s of DEAL_STAGES) m.set(s.value, []);
    for (const l of loans) {
      const c = clientById.get(l.client_id);
      if (!matchesQuery(c, l)) continue;
      if (m.has(l.stage)) m.get(l.stage)!.push(l);
    }
    for (const [k, arr] of m.entries()) m.set(k, sortLoans(arr, sort));
    return m;
  }, [clientById, loans, q, sort]);

  const activeIndex = Math.max(0, DEAL_STAGES.findIndex((stage) => stage.value === activeStage));
  const setStage = (stage: LoanStage) => {
    const nextIndex = DEAL_STAGES.findIndex((item) => item.value === stage);
    setActiveStage(stage);
    if (nextIndex >= 0) pagerRef.current?.scrollTo({ x: nextIndex * pageWidth, animated: true });
  };
  const onPageSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const stage = DEAL_STAGES[nextIndex];
    if (stage) setActiveStage(stage.value);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Pipeline" />

      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <View
          style={{
            flexDirection: "row", alignItems: "center", gap: 8,
            paddingHorizontal: 12, paddingVertical: 9,
            borderRadius: 10, borderWidth: 1, borderColor: t.line,
            backgroundColor: t.surface2,
          }}
        >
          <Icon name="search" size={14} color={t.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search address, deal id, client..."
            placeholderTextColor={t.ink4}
            style={{ flex: 1, color: t.ink, fontSize: 13, padding: 0 }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
              <Icon name="x" size={14} color={t.ink3} />
            </Pressable>
          ) : null}
        </View>

        <TappableCard onPress={() => router.push("/agent/loan/new" as Href)} accessibilityLabel="New funding file">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: t.brand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={18} color="#fff" stroke={2.6} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink }}>
                New funding file
              </Text>
              <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, lineHeight: 15 }} numberOfLines={1}>
                Originate a deal, run the intake, hand off to lending.
              </Text>
            </View>
          </View>
        </TappableCard>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {SORTS.map((s) => {
            const active = sort === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                style={{
                  paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999,
                  borderWidth: 1, borderColor: active ? t.brand : t.line,
                  backgroundColor: active ? t.brandSoft : t.surface,
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: active ? t.brand : t.ink2 }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <StageNavigator
          stages={DEAL_STAGES}
          activeStage={activeStage}
          counts={dealGroups}
          onSelect={setStage}
        />
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageSettled}
        contentOffset={{ x: activeIndex * pageWidth, y: 0 }}
        keyboardShouldPersistTaps="handled"
      >
        {DEAL_STAGES.map((s) => {
          const items = dealGroups.get(s.value) ?? [];
          return (
            <ScrollView
              key={s.value}
              style={{ width: pageWidth }}
              contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: 104 + insets.bottom }}
              showsVerticalScrollIndicator={false}
            >
              <StageHeader label={s.label} count={items.length} />
              {items.length === 0 ? (
                <EmptyStage text={query ? "No funding files match this search in this status." : "No funding files here yet."} />
              ) : items.map((l) => {
                const c = clientById.get(l.client_id);
                return (
                  <LoanFileRow
                    key={l.id}
                    clientName={c?.name}
                    address={l.address || "Subject property"}
                    amount={Number(l.amount || 0)}
                    health={l.deal_health ?? null}
                    stageIndex={STAGE_INDEX.get(l.stage) ?? 0}
                    secretary={dsSummary?.[l.id]}
                    onPress={() => router.push(`/agent/loan/${l.id}` as Href)}
                    onLongPress={
                      isSuperAdmin && c
                        ? () => setMenuTarget({
                            id: l.id,
                            clientId: l.client_id,
                            clientName: c.name,
                            currentAgentId: c.current_agent_id ?? c.broker_id ?? null,
                            address: l.address ?? undefined,
                          })
                        : undefined
                    }
                  />
                );
              })}
            </ScrollView>
          );
        })}
      </ScrollView>

      <ContextMenu
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        title="Card actions"
        subtitle={menuTarget?.address ?? menuTarget?.clientName ?? null}
        items={menuTargetItems(menuTarget, setReassignTarget)}
      />

      {reassignTarget ? (
        <ReassignAgentSheet
          visible
          onClose={() => setReassignTarget(null)}
          clientId={reassignTarget.clientId}
          clientName={reassignTarget.clientName}
          currentAgentId={reassignTarget.currentAgentId}
        />
      ) : null}
    </SafeAreaView>
  );
}

function StageNavigator({
  stages,
  activeStage,
  counts,
  onSelect,
}: {
  stages: { value: LoanStage; label: string }[];
  activeStage: LoanStage;
  counts: Map<LoanStage, Loan[]>;
  onSelect: (stage: LoanStage) => void;
}) {
  const { t } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
      {stages.map((stage) => {
        const active = activeStage === stage.value;
        const count = counts.get(stage.value)?.length ?? 0;
        return (
          <Pressable
            key={stage.value}
            onPress={() => onSelect(stage.value)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingVertical: 8,
              paddingHorizontal: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? t.brand : t.line,
              backgroundColor: active ? t.brandSoft : t.surface,
            }}
          >
            <Text style={{ fontSize: 11.5, color: active ? t.brand : t.ink2, fontWeight: "900" }}>{stage.label}</Text>
            <Text style={{ fontSize: 10.5, color: active ? t.brand : t.ink3, fontWeight: "900" }}>{count}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function menuTargetItems(
  target: { clientId: string; clientName: string; currentAgentId: string | null } | null,
  setReassignTarget: (v: { clientId: string; clientName: string; currentAgentId: string | null } | null) => void,
): ContextMenuItem[] {
  if (!target) return [];
  return [
    {
      key: "reassign",
      label: "Reassign agent",
      sublabel: "Transfer this client to a different agent",
      icon: "user",
      onPress: () =>
        setReassignTarget({
          clientId: target.clientId,
          clientName: target.clientName,
          currentAgentId: target.currentAgentId,
        }),
    },
  ];
}

function sortLoans(arr: Loan[], sort: Sort): Loan[] {
  if (sort === "amount_desc") return [...arr].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
  if (sort === "closing_soonest")
    return [...arr].sort((a, b) => {
      const ax = a.close_date ? new Date(a.close_date).getTime() : Infinity;
      const bx = b.close_date ? new Date(b.close_date).getTime() : Infinity;
      return ax - bx;
    });
  if (sort === "stuck_first")
    return [...arr].sort((a, b) => healthRank(b.deal_health) - healthRank(a.deal_health));
  return arr;
}

function healthRank(h: Loan["deal_health"]): number {
  if (h === "stuck") return 3;
  if (h === "at_risk") return 2;
  if (h === "on_track") return 1;
  return 0;
}

function StageHeader({ label, count }: { label: string; count: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>{label}</Text>
      <Pill bg={t.chip} color={t.ink2}>{count}</Pill>
    </View>
  );
}

function EmptyStage({ text }: { text: string }) {
  const { t } = useTheme();
  return (
    <Card pad={14} style={{ borderRadius: 14 }}>
      <Text style={{ fontSize: 12, color: t.ink3 }}>{text}</Text>
    </Card>
  );
}

function LoanFileRow({
  clientName,
  address,
  amount,
  health,
  stageIndex,
  secretary,
  onPress,
  onLongPress,
}: {
  clientName?: string;
  address: string;
  amount: number;
  health: Loan["deal_health"];
  stageIndex: number;
  secretary?: import("@/lib/mocks").DealSecretarySummary;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        backgroundColor: t.surface,
        borderColor: t.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        opacity: pressed ? 0.85 : 1,
        shadowColor: "#0B1629",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="file" size={17} color={t.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {clientName ? (
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 0.4 }} numberOfLines={1}>
              {clientName}
            </Text>
          ) : null}
          <Text style={{ fontSize: 15, fontWeight: "800", color: t.ink, marginTop: clientName ? 2 : 0 }} numberOfLines={1}>
            {address}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink }}>{QC_FMT.short(amount)}</Text>
            <DealHealthPill health={health} />
            <StageBadge stage={stageIndex} />
            <DealSecretaryBadge summary={secretary} />
          </View>
        </View>
        <Icon name="chevR" size={14} color={t.ink4} />
      </View>
    </Pressable>
  );
}
