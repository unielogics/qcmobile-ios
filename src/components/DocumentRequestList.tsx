import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import type { Document } from "@/lib/types";

const PENDING_STATUSES: ReadonlySet<Document["status"]> = new Set(["requested", "pending", "flagged"]);

export function DocumentRequestList({ documents, onSelect }: { documents: Document[]; onSelect?: (doc: Document) => void }) {
  const { t } = useTheme();
  const pending = documents.filter((d) => PENDING_STATUSES.has(d.status));

  if (pending.length === 0) {
    return (
      <Card pad={18}>
        <SectionLabel>Documents</SectionLabel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="check" size={18} color={t.profit} />
          <Text style={{ fontSize: 13, color: t.ink2 }}>Nothing pending — your file is up to date.</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card pad={18}>
      <SectionLabel>Requested documents</SectionLabel>
      <View style={{ gap: 10 }}>
        {pending.map((doc) => {
          const row = (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.line }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: t.warnBg, alignItems: "center", justifyContent: "center" }}>
                <Icon name="vault" size={16} color={t.warn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{doc.name}</Text>
                {doc.category ? <Text style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{doc.category}</Text> : null}
              </View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.warn, textTransform: "uppercase", letterSpacing: 0.8 }}>
                {doc.status === "flagged" ? "Revise" : "Upload"}
              </Text>
            </View>
          );
          return onSelect ? (
            <Pressable key={doc.id} onPress={() => onSelect(doc)}>{row}</Pressable>
          ) : (
            <View key={doc.id}>{row}</View>
          );
        })}
      </View>
    </Card>
  );
}
