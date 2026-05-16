// Bottom sheet to link an upload to an existing property (loan record).
// CLIENTs can attach to any active or funded loan they own.

import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { QC_FMT } from "@/design-system/tokens";
import type { Loan } from "@/lib/types";

const TYPE_ICON: Record<string, string> = {
  fix_and_flip: "hammer",
  ground_up: "building2",
  dscr: "key",
  bridge: "bolt",
  portfolio: "layers",
  cash_out_refi: "refresh",
};
const TYPE_LABEL: Record<string, string> = {
  fix_and_flip: "Fix & Flip",
  ground_up: "Ground Up",
  dscr: "DSCR",
  bridge: "Bridge",
  portfolio: "Portfolio",
  cash_out_refi: "Cash-Out",
};

export function PropertyPickerSheet({
  visible,
  loans,
  onClose,
  onPick,
  fileName,
}: {
  visible: boolean;
  loans: Loan[];
  onClose: () => void;
  onPick: (loan: Loan) => void;
  fileName?: string;
}) {
  const { t } = useTheme();

  // Sort: active first, then funded
  const sorted = [...loans].sort((a, b) => {
    const af = a.stage === "funded" ? 1 : 0;
    const bf = b.stage === "funded" ? 1 : 0;
    return af - bf;
  });

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
          maxHeight: "80%",
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, alignSelf: "center", marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
                Link to property
              </Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: t.ink, letterSpacing: -0.4, marginTop: 2 }}>
                Which property is this for?
              </Text>
              {fileName ? (
                <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }} numberOfLines={1}>
                  Uploading: {fileName}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="x" size={16} color={t.ink2} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {loans.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <Icon name="layers" size={28} color={t.ink4} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink2, marginTop: 12, textAlign: "center" }}>
                  No properties yet
                </Text>
                <Text style={{ fontSize: 12, color: t.ink3, marginTop: 6, textAlign: "center", lineHeight: 17 }}>
                  Start a loan first — uploads need to be linked to a property in your portfolio.
                </Text>
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              {sorted.map((l) => {
                const iconName = TYPE_ICON[l.type] ?? "doc";
                const typeLabel = TYPE_LABEL[l.type] ?? l.type.replace("_", " ");
                const isFunded = l.stage === "funded";
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => onPick(l)}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 12,
                      padding: 14, borderRadius: 14,
                      backgroundColor: t.surface,
                      borderWidth: 1, borderColor: t.line,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={iconName} size={20} color={t.brand} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: t.ink3 }}>
                          {l.deal_id}
                        </Text>
                        <View style={{
                          paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999,
                          backgroundColor: isFunded ? t.profitBg : t.brandSoft,
                        }}>
                          <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase",
                            color: isFunded ? t.profit : t.brand }}>
                            {isFunded ? "Funded" : "Active"}
                          </Text>
                        </View>
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: t.ink, marginTop: 4 }}>
                        {l.address}
                      </Text>
                      <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                        {QC_FMT.short(Number(l.amount))} · {typeLabel}{l.city ? ` · ${l.city}` : ""}
                      </Text>
                    </View>
                    <Icon name="chevR" size={14} color={t.ink4} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
