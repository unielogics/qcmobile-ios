// Swipe-to-assign row primitive for the broker Elara.
//
// Gestures:
//   - Swipe LEFT  → assigns the task to AI         (calls onAssignAI)
//   - Swipe RIGHT → keeps the task with broker (me) (calls onAssignHuman)
// Tap → onOpenDetail (opens the per-task BottomSheet).
//
// Visual:
//   `[ AI ] <label>` when owner_type === "ai"  (petrol-soft tint)
//   `[ ME ] <label>` when owner_type === "human" (brand-soft tint)
//
// The behind-the-row reveal during drag shows the action color/icon so
// the broker sees what's about to happen before they commit.

import { Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Pressable } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import type { DSTaskRow } from "@/lib/types";

interface Props {
  task: DSTaskRow;
  onAssignAI: () => void;
  onAssignHuman: () => void;
  onOpenDetail: () => void;
}

const COMMIT_THRESHOLD = 80;

export function AssignmentRow({ task, onAssignAI, onAssignHuman, onOpenDetail }: Props) {
  const { t } = useTheme();
  const isAI = task.owner_type === "ai";

  // Background tints communicate owner without needing to read the chip.
  const rowBg = isAI ? t.petrolSoft : t.brandSoft;
  const rowBorder = isAI ? t.petrol : t.brand;
  const chipBg = isAI ? t.petrol : t.brand;
  const chipText = "#fff";

  // The reveal panels rendered behind the row while the user drags.
  // Left-reveal (visible when swiping right) = "Keep with me" (human).
  // Right-reveal (visible when swiping left) = "Send to AI".
  const renderLeftActions = () => (
    <View
      style={{
        backgroundColor: t.brand,
        justifyContent: "center",
        alignItems: "flex-start",
        paddingHorizontal: 20,
        flex: 1,
        borderRadius: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="user" size={16} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Keep with me</Text>
      </View>
    </View>
  );
  const renderRightActions = () => (
    <View
      style={{
        backgroundColor: t.petrol,
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: 20,
        flex: 1,
        borderRadius: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Send to AI</Text>
        <Icon name="spark" size={16} color="#fff" />
      </View>
    </View>
  );

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={COMMIT_THRESHOLD}
      rightThreshold={COMMIT_THRESHOLD}
      // Swipe right → reveal is on the left → "keep with me".
      onSwipeableOpen={(direction, swipeable) => {
        if (direction === "left") {
          // Reveal on the left means the user dragged the row to the right.
          if (task.owner_type === "human") {
            // Already mine — nothing to flip; just snap back.
          } else {
            onAssignHuman();
          }
        } else if (direction === "right") {
          if (task.owner_type === "ai") {
            // Already AI — nothing to flip.
          } else {
            onAssignAI();
          }
        }
        // Always close the row after the action so the user sees the new state.
        setTimeout(() => swipeable?.close(), 100);
      }}
    >
      <Pressable
        onPress={onOpenDetail}
        accessibilityRole="button"
        accessibilityLabel={`${isAI ? "AI" : "Me"} — ${task.label}. Swipe to reassign.`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: rowBg,
          borderColor: rowBorder,
          borderWidth: 1,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 8,
            borderRadius: 6,
            backgroundColor: chipBg,
            minWidth: 38,
            alignItems: "center",
          }}
        >
          <Text style={{ color: chipText, fontWeight: "800", fontSize: 11, letterSpacing: 0.8 }}>
            {isAI ? "AI" : "ME"}
          </Text>
        </View>
        <Text
          style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: t.ink, letterSpacing: -0.1 }}
          numberOfLines={2}
        >
          {task.label}
        </Text>
        <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>
          {humanizeCategory(task.category)}
        </Text>
      </Pressable>
    </Swipeable>
  );
}

function humanizeCategory(cat: string): string {
  return cat.replace(/_/g, " ");
}
