// First step of the Vault upload flow — asks the borrower what KIND of
// document they're uploading before we know how to route the rest of
// the flow. Two kinds today:
//
//   experience    — proof of past deals (HUDs, closing statements,
//                   deeds, prior leases). Categorized so the underwriter
//                   can count it toward investor experience tiers.
//   active_asset  — currently-owned real estate (bank notes, current
//                   leases, insurance binders, tax bills). Categorized
//                   so the file shows up in the "active" tab of the
//                   vault rather than mingling with experience proof.
//
// Both kinds share the existing source picker (camera / library / file)
// and property linkage. The KIND becomes the Document.category field
// upstream so the vault list can filter into tabs.

import { Modal, Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";

export type UploadKind = "experience" | "active_asset";

export function UploadKindSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: UploadKind) => void;
}) {
  const { t } = useTheme();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 18,
            paddingTop: 14,
            paddingBottom: 28,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.lineStrong,
              alignSelf: "center",
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink }}>
            What are you uploading?
          </Text>
          <Text style={{ fontSize: 13, color: t.ink2, marginTop: 6, lineHeight: 18 }}>
            We file these in two places so the underwriter can use them quickly.
          </Text>

          <View style={{ marginTop: 18, gap: 10 }}>
            <KindCard
              t={t}
              title="Experience proof"
              icon="doc"
              accent={t.brand}
              accentBg={t.brandSoft}
              description="HUDs, closing statements, deeds, or prior leases from past deals. Counts toward investor experience tiers."
              onPress={() => onPick("experience")}
            />
            <KindCard
              t={t}
              title="Active asset"
              icon="home"
              accent={t.profit}
              accentBg={t.profitBg}
              description="Real estate you currently own — bank notes, current leases, insurance, tax bills."
              onPress={() => onPick("active_asset")}
            />
          </View>

          <Pressable
            onPress={onClose}
            style={{ marginTop: 18, alignItems: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: t.ink2, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function KindCard({
  t,
  title,
  icon,
  accent,
  accentBg,
  description,
  onPress,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  icon: "doc" | "home";
  accent: string;
  accentBg: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: t.surface2,
        borderColor: t.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        opacity: pressed ? 0.85 : 1,
        flexDirection: "row",
        gap: 14,
        alignItems: "flex-start",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: accentBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: t.ink }}>{title}</Text>
        <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 4, lineHeight: 17 }}>
          {description}
        </Text>
      </View>
      <Icon name="chevR" size={16} color={t.ink3} />
    </Pressable>
  );
}
