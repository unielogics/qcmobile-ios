// Shared bottom-sheet primitive for every drill-down on mobile.
//
// Why a bespoke one instead of @gorhom/bottom-sheet:
//   - we already ship the touch-handling work-around (transparent
//     Modal + no nested SafeAreaView, see AIChatSheet header
//     comment) and want to keep that contract identical.
//   - we don't yet need snap-points / pan-down-to-dismiss; the
//     header pill + scroll content covers 95% of use.
//   - keyboard handling routes through <KeyboardAware> so every
//     sheet behaves the same way the composer fix demands.

import { type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { KeyboardAware } from "@/components/KeyboardAware";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  // Custom right-side header action (e.g. "Save"). Falls back to
  // an X close button if omitted.
  headerAction?: ReactNode;
  // If true the body scrolls. Set false when the body owns its own
  // scroll (e.g. a FlatList).
  scrollable?: boolean;
  children: ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  headerAction,
  scrollable = true,
  children,
}: Props) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
        }}
      >
        <KeyboardAware excludeTabBar>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: t.line,
              backgroundColor: t.bg,
            }}
          >
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={10}
              style={({ pressed }) => ({
                width: 36, height: 36, borderRadius: 999,
                backgroundColor: pressed ? t.chip : "transparent",
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Icon name="x" size={18} color={t.ink2} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: "800", color: t.ink, letterSpacing: -0.2 }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {headerAction ?? null}
          </View>
          {scrollable ? (
            <ScrollView
              style={{ flex: 1, backgroundColor: t.bg }}
              contentContainerStyle={{
                padding: 14,
                // Reserve the system-bar inset so the bottom of the
                // sheet content (Save buttons, send button) clears
                // the Android nav bar / iOS home indicator.
                paddingBottom: 24 + insets.bottom,
                gap: 12,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: insets.bottom }}>{children}</View>
          )}
        </KeyboardAware>
      </View>
    </Modal>
  );
}
