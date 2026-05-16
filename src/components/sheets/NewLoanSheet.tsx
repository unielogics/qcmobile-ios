import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { LOAN_TYPES } from "@/lib/sample-data";
import { isProductKeyEnabled } from "@/lib/products";

const ENABLED_LOAN_TYPES = LOAN_TYPES.filter((lt) => isProductKeyEnabled(lt.id));

export function NewLoanSheet({ visible, onClose, onPick }: {
  visible: boolean;
  onClose: () => void;
  onPick: (loanTypeId: string) => void;
}) {
  const { t, isDark } = useTheme();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 28,
          maxHeight: "85%",
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, alignSelf: "center", marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>New Loan</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: t.ink, letterSpacing: -0.4, marginTop: 2 }}>What are you financing?</Text>
              <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>AI will guide you through intake from here.</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel="Close"
            >
              <Icon name="x" size={16} color={t.ink2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingTop: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
              {ENABLED_LOAN_TYPES.map((lt) => (
                <View key={lt.id} style={{ width: "50%", padding: 4 }}>
                  <Pressable
                    onPress={() => onPick(lt.id)}
                    style={({ pressed }) => ({
                      padding: 14,
                      borderRadius: 14,
                      backgroundColor: t.surface,
                      borderWidth: 1,
                      borderColor: t.line,
                      shadowColor: isDark ? "transparent" : "#0B1629",
                      shadowOpacity: isDark ? 0 : 0.06,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                      gap: 8,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={lt.icon} size={18} color={t.brand} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink, letterSpacing: -0.2 }}>{lt.label}</Text>
                      <Text style={{ fontSize: 10.5, color: t.ink3, marginTop: 2, lineHeight: 14 }}>{lt.desc}</Text>
                    </View>
                    <View style={{ marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.line, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Text style={{ fontSize: 10, color: t.ink4, fontWeight: "600" }}>{lt.term}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }}>{lt.rate}</Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => onPick("unknown")}
              style={({ pressed }) => ({
                marginTop: 14,
                paddingVertical: 13,
                borderRadius: 12,
                backgroundColor: t.petrolSoft,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name="spark" size={14} color={t.petrol} />
              <Text style={{ color: t.petrol, fontSize: 13, fontWeight: "700" }}>Not sure — let AI recommend</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
