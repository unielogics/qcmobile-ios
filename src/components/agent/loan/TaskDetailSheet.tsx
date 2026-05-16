// Per-task detail sheet for the AI Secretary. Mounts on row tap.
// Shows the task's objective + completion criteria + current owner,
// and provides an explicit segmented Reassign control as a fallback
// for users who can't reliably swipe (accessibility / large fingers).

import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { BottomSheet } from "@/components/sheets/BottomSheet";
import { Icon } from "@/design-system/Icon";
import type { DSTaskRow } from "@/lib/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  task: DSTaskRow | null;
  onAssignAI: () => void;
  onAssignHuman: () => void;
}

export function TaskDetailSheet({ visible, onClose, task, onAssignAI, onAssignHuman }: Props) {
  const { t } = useTheme();
  if (!task) return null;
  const isAI = task.owner_type === "ai";
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={task.label}
      subtitle={humanizeCategory(task.category)}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            paddingVertical: 5,
            paddingHorizontal: 9,
            borderRadius: 6,
            backgroundColor: isAI ? t.petrol : t.brand,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 0.8 }}>
            {isAI ? "AI" : "ME"}
          </Text>
        </View>
        <Text style={{ fontSize: 12.5, color: t.ink2, fontWeight: "600" }}>
          {isAI ? "Currently with the AI" : "Currently with you"}
        </Text>
      </View>

      {task.objective_text ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Objective
          </Text>
          <Text style={{ fontSize: 13, color: t.ink, lineHeight: 18, marginTop: 4 }}>{task.objective_text}</Text>
        </View>
      ) : null}

      {task.completion_criteria ? (
        <View>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Done when
          </Text>
          <Text style={{ fontSize: 13, color: t.ink, lineHeight: 18, marginTop: 4 }}>{task.completion_criteria}</Text>
        </View>
      ) : null}

      <View
        style={{
          marginTop: 16,
          flexDirection: "row",
          gap: 8,
          padding: 4,
          borderRadius: 12,
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.line,
        }}
      >
        <Pressable
          onPress={() => {
            if (!isAI) return;
            onAssignHuman();
            onClose();
          }}
          accessibilityLabel="Reassign to me"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: 9,
            alignItems: "center",
            backgroundColor: !isAI ? t.brand : pressed ? t.chip : "transparent",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          })}
        >
          <Icon name="user" size={13} color={!isAI ? "#fff" : t.ink2} />
          <Text style={{ fontSize: 12.5, fontWeight: "800", color: !isAI ? "#fff" : t.ink2 }}>
            Keep with me
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (isAI) return;
            onAssignAI();
            onClose();
          }}
          accessibilityLabel="Send to AI"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: 9,
            alignItems: "center",
            backgroundColor: isAI ? t.petrol : pressed ? t.chip : "transparent",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          })}
        >
          <Icon name="spark" size={13} color={isAI ? "#fff" : t.ink2} />
          <Text style={{ fontSize: 12.5, fontWeight: "800", color: isAI ? "#fff" : t.ink2 }}>
            Send to AI
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function humanizeCategory(cat: string): string {
  return cat.replace(/_/g, " ");
}
