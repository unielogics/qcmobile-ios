// Right-side panel equivalent: bottom sheet with a broker picker.
// Used from the pipeline context menu and the client detail
// AssignedAgentCard. Only meaningful when the current user is
// super_admin — at broker level the backend rejects with 403.

import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { BottomSheet } from "@/components/sheets/BottomSheet";
import { useBrokers, useReassignAgent } from "@/hooks/useApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  currentAgentId?: string | null;
}

export function ReassignAgentSheet({ visible, onClose, clientId, clientName, currentAgentId }: Props) {
  const { t } = useTheme();
  const brokers = useBrokers();
  const reassign = useReassignAgent();
  const [selected, setSelected] = useState<string | null>(currentAgentId ?? null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!selected || selected === currentAgentId) {
      onClose();
      return;
    }
    setError(null);
    try {
      await reassign.mutateAsync({
        clientId,
        toAgentId: selected,
        reason: reason.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reassign.");
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Reassign agent"
      subtitle={clientName}
      headerAction={
        <Pressable
          onPress={submit}
          disabled={reassign.isPending || !selected || selected === currentAgentId}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: selected && selected !== currentAgentId ? t.brand : t.chip,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {reassign.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: selected && selected !== currentAgentId ? "#fff" : t.ink3, fontWeight: "700", fontSize: 12.5 }}>
              Reassign
            </Text>
          )}
        </Pressable>
      }
    >
      {error ? (
        <View style={{ padding: 10, borderRadius: 9, backgroundColor: t.dangerBg }}>
          <Text style={{ fontSize: 12, color: t.danger }}>{error}</Text>
        </View>
      ) : null}
      {brokers.isLoading ? (
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={t.ink3} />
          <Text style={{ fontSize: 12, color: t.ink3 }}>Loading agents…</Text>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        {(brokers.data ?? []).map((b) => {
          const active = selected === b.id;
          const isCurrent = currentAgentId === b.id;
          return (
            <Pressable
              key={b.id}
              onPress={() => setSelected(b.id)}
              style={({ pressed }) => ({
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? t.brand : t.line,
                backgroundColor: pressed ? t.surface2 : active ? t.brandSoft : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              })}
            >
              <View
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: active ? t.brand : t.chip,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon name="user" size={15} color={active ? "#fff" : t.ink2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: t.ink }} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }} numberOfLines={1}>
                  {b.email}
                  {isCurrent ? " · currently assigned" : ""}
                </Text>
              </View>
              {active ? <Icon name="check" size={14} color={t.brand} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Reason (optional)
        </Text>
        <Pressable
          onPress={() => {}}
          style={{
            marginTop: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.line,
            backgroundColor: t.surface2,
          }}
        >
          <Text style={{ fontSize: 12, color: reason ? t.ink : t.ink3 }} numberOfLines={3}>
            {reason || "Tap to add a note. Logged on the assignment activity."}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
