// Mobile mirror of /agent-settings/ai — 5 tabs in a segmented control.
//
// Tabs match desktop 1:1: Buyer / Seller / Follow-Up / Ready / Style.
// Heavy editing (adding custom requirements, full cadence rule
// authoring) lives on desktop; mobile shows the resolved view with
// quick toggles where it makes sense.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useAgentPlaybook } from "@/hooks/useApi";

const TABS = ["buyer", "seller", "followup", "handoff", "style"] as const;
type Tab = typeof TABS[number];
const LABELS: Record<Tab, string> = {
  buyer: "Buyer",
  seller: "Seller",
  followup: "Follow-Up",
  handoff: "Ready",
  style: "Style",
};


export default function AIAssistantSettingsRoute() {
  const { t } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("buyer");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 12, paddingVertical: 10, gap: 10,
        borderBottomColor: t.line, borderBottomWidth: 1,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="x" size={18} color={t.ink} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "800", color: t.ink, flex: 1 }}>Elara</Text>
      </View>

      <View style={{ flexDirection: "row", padding: 10, gap: 4 }}>
        {TABS.map(x => (
          <Pressable
            key={x}
            onPress={() => setTab(x)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: tab === x ? t.accent : t.surface,
              borderWidth: 1, borderColor: tab === x ? t.accent : t.line,
              opacity: pressed ? 0.85 : 1,
              alignItems: "center",
            })}
          >
            <Text style={{
              fontSize: 11, fontWeight: "700",
              color: tab === x ? "#fff" : t.ink,
            }}>
              {LABELS[x]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        <MiniWorkflow />
        {tab === "buyer" ? <SidedView side="buyer" leadLabel="buyer lead" /> : null}
        {tab === "seller" ? <SidedView side="seller" leadLabel="seller lead" /> : null}
        {tab === "followup" ? <FollowUpView /> : null}
        {tab === "handoff" ? <HandoffView /> : null}
        {tab === "style" ? <StyleView /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}


function SidedView({ side, leadLabel }: { side: "buyer" | "seller"; leadLabel: string }) {
  const { t } = useTheme();
  const { data, isLoading } = useAgentPlaybook(side);
  const platform = (data?.platform_requirements || []) as Array<Record<string, unknown>>;
  const overlay = (data?.agent_requirements || []) as Array<Record<string, unknown>>;

  function bucket(level: "required" | "recommended" | "optional") {
    const allRows = [...platform, ...overlay];
    return allRows.filter(r => r.required_level === level);
  }
  const required = bucket("required");
  const recommended = bucket("recommended");
  const optional = bucket("optional");

  return (
    <Card pad={16}>
      <InfoStrip
        icon={side === "buyer" ? "user" : "building2"}
        title={side === "buyer" ? "Agent-side collection" : "Seller-side collection"}
        body={
          side === "buyer"
            ? "These rules guide the Realtor AI until the buyer is ready for lending."
            : "Seller rules stay with the agent workflow and are not sent into lending by themselves."
        }
      />
      <Text style={{ fontSize: 13, color: t.muted, marginBottom: 12 }}>
        When you get a {leadLabel}, your AI should collect:
      </Text>
      {isLoading ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>Loading…</Text>
      ) : (
        <>
          <Group title="Required" rows={required} t={t} />
          <Group title="Recommended" rows={recommended} t={t} />
          <Group title="Optional" rows={optional} t={t} />
          <Text style={{
            fontSize: 11, color: t.muted, marginTop: 14,
            fontStyle: "italic",
          }}>
            Editing rules + adding custom items is desktop-only for now.
          </Text>
        </>
      )}
    </Card>
  );
}


function Group({
  title, rows, t,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (!rows.length) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{
        fontSize: 11, fontWeight: "700", color: t.muted,
        marginBottom: 6, textTransform: "uppercase",
      }}>
        {title}
      </Text>
      {rows.map((r, i) => {
        const locked = !r.can_agent_override;
        return (
          <View key={i} style={{
            flexDirection: "row", alignItems: "center", gap: 8,
            paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.border,
          }}>
            <Text style={{ flex: 1, fontSize: 13, color: t.ink }}>{String(r.label)}</Text>
            {locked ? (
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#a06000" }}>🔒</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}


function FollowUpView() {
  const { t } = useTheme();
  const { data } = useAgentPlaybook("cadence");
  const fu = (data?.rules?.followup as Record<string, unknown>) || {};
  const sections: { id: string; label: string }[] = [
    { id: "new_lead", label: "New Lead — if no response after:" },
    { id: "buyer_agreement", label: "Buyer Agreement — if not signed after:" },
    { id: "seller_listing", label: "Seller Listing — if listing agreement not signed after:" },
  ];
  return (
    <Card pad={16}>
      {sections.map(s => {
        const rows = (fu[s.id] as Array<{ wait_hours: number; action: string }> | undefined) || [];
        if (rows.length === 0) return null;
        return (
          <View key={s.id} style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink, marginBottom: 6 }}>
              {s.label}
            </Text>
            {rows.map((row, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <Text style={{
                  fontSize: 12, color: t.ink,
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
                  backgroundColor: t.surface2,
                }}>
                  {formatHours(row.wait_hours)}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>→</Text>
                <Text style={{ flex: 1, fontSize: 13, color: t.ink }}>
                  {actionLabel(row.action)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
      <Text style={{
        fontSize: 12, color: t.muted, marginTop: 8,
        paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border,
      }}>
        ✓ Always ask before sending messages
        {"\n"}✓ Drafts go to Elara Inbox
      </Text>
    </Card>
  );
}


function HandoffView() {
  const { t } = useTheme();
  const { data } = useAgentPlaybook("buyer");
  const platform = (data?.platform_requirements || []) as Array<Record<string, unknown>>;
  const locked = platform.filter(r => !r.can_agent_override);
  const gates = ((data?.rules?.before_handoff as string[]) || []);

  return (
    <Card pad={16}>
      <InfoStrip
        icon="arrowR"
        title="Buyer-to-lending gate"
        body="After the agent confirms this gate, the funding-side AI takes over with loan requirements, document checks, tasks, and calendar due dates."
      />
      <Text style={{ fontSize: 13, color: t.muted, marginBottom: 12 }}>
        Before your AI suggests sending a buyer to lending:
      </Text>

      {gates.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{
            fontSize: 11, fontWeight: "700", color: t.muted,
            marginBottom: 6, textTransform: "uppercase",
          }}>
            Your gates
          </Text>
          {gates.map(g => (
            <Text key={g} style={{ fontSize: 13, color: t.ink, paddingVertical: 3 }}>
              ✓ {g.replace(/_/g, " ")}
            </Text>
          ))}
        </View>
      ) : null}

      {locked.length > 0 ? (
        <View style={{
          padding: 12, borderRadius: 8, backgroundColor: "#fff8e0",
          borderWidth: 1, borderColor: "#d4a02488",
        }}>
          <Text style={{
            fontSize: 11, fontWeight: "700", color: "#a06000",
            marginBottom: 6, textTransform: "uppercase",
          }}>
            🔒 Funding-required (always)
          </Text>
          {locked.map((r, i) => (
            <Text key={i} style={{ fontSize: 13, color: "#7a5e22", paddingVertical: 2 }}>
              · {String(r.label)}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}


function StyleView() {
  const { t } = useTheme();
  const { data } = useAgentPlaybook("cadence");
  const s = (data?.rules?.style as Record<string, unknown>) || {};
  return (
    <Card pad={16}>
      <Field label="Tone" value={String(s.tone || "professional")} t={t} />
      <Field label="Follow-up style" value={String(s.follow_up_style || "balanced")} t={t} />
      <Field label="Signature" value={String(s.signature || "—")} t={t} />
      <Text style={{
        fontSize: 11, color: t.muted, marginTop: 8,
        fontStyle: "italic",
      }}>
        Edit on desktop.
      </Text>
    </Card>
  );
}


function MiniWorkflow() {
  const { t } = useTheme();
  const steps = [
    { icon: "user", label: "Agent AI", body: "Buyer / seller relationship" },
    { icon: "check", label: "Ready", body: "Buyer handoff gate" },
    { icon: "shieldChk", label: "Lending AI", body: "Funding workflow" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {steps.map((step, i) => (
        <View key={step.label} style={{
          flex: 1,
          padding: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: i === 1 ? t.accent : t.border,
          backgroundColor: i === 1 ? t.surface2 : t.surface,
          minHeight: 98,
        }}>
          <Icon name={step.icon} size={16} color={i === 1 ? t.accent : t.muted} />
          <Text style={{ marginTop: 7, fontSize: 11, fontWeight: "800", color: t.ink }}>
            {step.label}
          </Text>
          <Text style={{ marginTop: 3, fontSize: 10, lineHeight: 14, color: t.muted }}>
            {step.body}
          </Text>
        </View>
      ))}
    </View>
  );
}


function InfoStrip({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  const { t } = useTheme();
  return (
    <View style={{
      flexDirection: "row",
      gap: 9,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface2,
      marginBottom: 12,
    }}>
      <Icon name={icon} size={15} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: t.ink, marginBottom: 2 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, lineHeight: 15, color: t.muted }}>
          {body}
        </Text>
      </View>
    </View>
  );
}


function Field({
  label, value, t,
}: {
  label: string;
  value: string;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{
        fontSize: 11, fontWeight: "700", color: t.muted,
        marginBottom: 2, textTransform: "uppercase",
      }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, color: t.ink, textTransform: "capitalize" }}>
        {value}
      </Text>
    </View>
  );
}


function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  if (h % 168 === 0) return `${h / 168}w`;
  return `${h / 24}d`;
}


function actionLabel(action: string): string {
  switch (action) {
    case "draft_message": return "Draft follow-up message";
    case "create_task": return "Create call task";
    case "mark_stalled": return "Mark stalled";
    case "mark_lead_cold": return "Mark lead cold";
    case "escalate": return "Escalate";
    default: return action;
  }
}
