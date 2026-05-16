// Long-press popover for card-level actions (Reassign, Archive,
// Mark stuck, etc.). Built on the shared BottomSheet primitive so
// keyboard behavior is consistent.

import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { BottomSheet } from "@/components/sheets/BottomSheet";
import { ActionRow } from "@/components/agent/ActionRow";
import type { IconName } from "@/design-system/Icon";

export interface ContextMenuItem {
  key: string;
  label: string;
  sublabel?: string | null;
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  items: ContextMenuItem[];
}

export function ContextMenu({ visible, onClose, title, subtitle, items }: Props) {
  const { t } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.line,
          paddingHorizontal: 14,
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
            Nothing available for this item.
          </Text>
        ) : (
          items.map((item, idx) => (
            <ActionRow
              key={item.key}
              icon={item.icon}
              iconColor={item.iconColor}
              iconBg={item.iconBg}
              label={item.label}
              sublabel={item.sublabel ?? null}
              destructive={item.destructive}
              noBorder={idx === items.length - 1}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            />
          ))
        )}
      </View>
    </BottomSheet>
  );
}
