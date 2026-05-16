// Broker Clients tab.
//
// Phase 7 redesign — the contact-creation flow is the headline action of
// this tab, not a FAB tucked at the bottom-right. The screen now reads
// top-to-bottom as: header → "Add a new client" hero CTA → stats chips
// → search/filter → client list.

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Avatar, Card, Pill, TappableCard } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { StageFilterChips } from "@/components/agent/StageFilterChips";
import { useClients } from "@/hooks/useApi";
import { ClientStage, ClientStageOptions } from "@/lib/enums.generated";

const STAGE_LABEL: Record<ClientStage, string> = Object.fromEntries(
  ClientStageOptions.map((o) => [o.value, o.label])
) as Record<ClientStage, string>;

export function ClientsScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: clients = [], isLoading } = useClients("mine");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ClientStage | null>(null);
  const activeClients = clients.filter((c) => c.stage !== "lead").length;
  const leadClients = clients.filter((c) => c.stage === "lead").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (stage && c.stage !== stage) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.email ?? ""} ${c.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clients, query, stage]);

  const goNew = () => router.push("/agent/client/new" as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="Clients" />

      {/* Local sub-header pill — discoverable when the user has scrolled past
          the hero CTA. Lives inside ClientsScreen only; does NOT touch the
          shared <TopBar> API (which is consumed by other tabs). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 8,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>
          Your book
        </Text>
        <Pressable
          onPress={goNew}
          accessibilityLabel="Add a new client"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: pressed ? t.brand : t.brandSoft,
          })}
        >
          <Icon name="plus" size={12} color={t.brand} />
          <Text style={{ fontSize: 11.5, fontWeight: "800", color: t.brand, letterSpacing: 0.3 }}>NEW CLIENT</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {/* Hero CTA — replaces the previous "Client book" summary card. */}
        <TappableCard onPress={goNew} accessibilityLabel="Add a new client">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 13,
                backgroundColor: t.brand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={22} color="#fff" stroke={2.6} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}>
                Add a new client
              </Text>
              <Text style={{ fontSize: 12, color: t.ink3, marginTop: 3, lineHeight: 17 }} numberOfLines={2}>
                Capture a lead, run the intake, hand off to lending when ready.
              </Text>
            </View>
          </View>
        </TappableCard>

        {/* Stats demoted to a thin chip row. */}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Pill bg={t.chip} color={t.ink2}>{clients.length} total</Pill>
          <Pill bg={t.brandSoft} color={t.brand}>{activeClients} active</Pill>
          <Pill bg={t.petrolSoft} color={t.petrol}>{leadClients} new leads</Pill>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.surface2, borderRadius: 10, paddingHorizontal: 12 }}>
          <Icon name="search" size={16} color={t.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, email, city"
            placeholderTextColor={t.ink4}
            style={{ flex: 1, color: t.ink, fontSize: 14, paddingVertical: 10 }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search">
              <Icon name="x" size={14} color={t.ink3} />
            </Pressable>
          ) : null}
        </View>

        <StageFilterChips
          options={ClientStageOptions as ReadonlyArray<{ value: ClientStage; label: string }>}
          selected={stage}
          onChange={setStage}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading && clients.length === 0 ? (
          <Card pad={18}><Text style={{ fontSize: 13, color: t.ink3 }}>Loading…</Text></Card>
        ) : filtered.length === 0 ? (
          <Card pad={18}>
            <Text style={{ fontSize: 13, color: t.ink2 }}>
              {query || stage ? "No clients match this filter." : "No clients in your book yet — tap “Add a new client” above to get started."}
            </Text>
          </Card>
        ) : (
          filtered.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/agent/client/${c.id}` as Href)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 12,
                paddingVertical: 12, paddingHorizontal: 14,
                backgroundColor: t.surface,
                borderColor: t.line, borderWidth: 1,
                borderRadius: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Avatar
                label={c.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                color={c.avatar_color ?? undefined}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }} numberOfLines={1}>
                  {c.city ?? c.email ?? "—"}
                  {c.fico != null ? ` · FICO ${c.fico}` : ""}
                </Text>
              </View>
              {c.stage ? <Pill bg={t.chip} color={t.ink2}>{STAGE_LABEL[c.stage]}</Pill> : null}
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
