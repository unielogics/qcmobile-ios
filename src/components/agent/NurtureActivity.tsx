// NurtureActivity — "what the AI did for this client lately" digest.
// Surfaces recent EngagementSignal rows scoped to a single client. Lives
// at the top of the client detail page next to NurtureControls so the
// broker doesn't have to take it on faith that the AI is doing anything.

import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useEngagement } from "@/hooks/useApi";

const MAX_ROWS = 5;

// Signal kinds we surface as "AI did this". Other signal kinds are
// human-driven (login, doc_uploaded, etc.) and live on the wider
// activity feed below NurtureActivity. The AI-attribution set lets us
// keep this card focused on the broker's lead-automation question:
// "what did MY AI just do for me?"
const AI_SIGNAL_KINDS = new Set<string>([
  "intake_started",
  "intake_completed",
  "intake_abandoned_step",
  "doc_uploaded",
  "document_viewed",
  "message_viewed",
  "calendar_event_viewed",
]);

interface Props {
  clientId: string;
}

export function NurtureActivity({ clientId }: Props) {
  const { t } = useTheme();
  const { data: signals = [], isLoading } = useEngagement(clientId);

  const rows = useMemo(() => {
    return signals
      .filter((s) => AI_SIGNAL_KINDS.has(s.signal_type))
      .slice(0, MAX_ROWS);
  }, [signals]);

  if (isLoading && signals.length === 0) {
    return (
      <Card pad={14}>
        <SectionLabel>AI activity</SectionLabel>
        <Text style={{ fontSize: 12, color: t.ink3 }}>Loading…</Text>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card pad={14}>
        <SectionLabel>AI activity</SectionLabel>
        <Text style={{ fontSize: 12.5, color: t.ink3, lineHeight: 17 }}>
          No AI-driven activity yet. Turn on nurturing above and the AI
          will start checking in on your cadence.
        </Text>
      </Card>
    );
  }

  return (
    <Card pad={14}>
      <SectionLabel>AI activity</SectionLabel>
      <View style={{ gap: 8, marginTop: 4 }}>
        {rows.map((s) => {
          const tone = toneFor(s.signal_type, t);
          return (
            <View
              key={s.id}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                paddingVertical: 6,
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  backgroundColor: tone.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={tone.icon} size={12} color={tone.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 12.5, color: t.ink, fontWeight: "600" }} numberOfLines={1}>
                  {humanize(s.signal_type)}
                </Text>
                <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
                  {new Date(s.occurred_at).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function humanize(kind: string): string {
  return kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function toneFor(kind: string, t: ReturnType<typeof useTheme>["t"]):
  { bg: string; fg: string; icon: import("@/design-system/Icon").IconName } {
  if (kind.startsWith("intake")) return { bg: t.brandSoft, fg: t.brand, icon: "docCheck" };
  if (kind.startsWith("doc"))    return { bg: t.petrolSoft, fg: t.petrol, icon: "doc" };
  if (kind.startsWith("message")) return { bg: t.warnBg, fg: t.warn, icon: "chat" };
  if (kind.startsWith("calendar")) return { bg: t.chip, fg: t.ink2, icon: "cal" };
  return { bg: t.chip, fg: t.ink2, icon: "audit" };
}
