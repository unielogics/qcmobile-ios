// Mobile-styled renderer for /privacy, /terms, /disclosures. Mirrors the
// QCDashboard <LegalDocumentView> + QCWeb <LegalPage> but uses RN
// primitives, design tokens from useTheme(), and an Expo-Router back
// button (no native nav header — _layout sets headerShown:false).

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { Card } from "@/design-system/primitives";
import { COMPANY_NAME, type LegalDocument } from "@/lib/legal";

type PeerLink = { href: string; label: string };

interface Props {
  doc: LegalDocument;
  // Cross-links shown in a thin footer band so users can hop between
  // Privacy / Terms / Disclosures without going back to Settings.
  peers?: PeerLink[];
}

export function LegalDocumentView({ doc, peers = [] }: Props) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button — matches the credit-pull pattern */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Back"
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Icon name="arrowL" size={14} color={t.brand} />
          <Text style={{ color: t.brand, fontWeight: "700", fontSize: 13 }}>Back</Text>
        </Pressable>

        {/* Eyebrow + title + effective-date subtitle */}
        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "800",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: t.petrol,
            }}
          >
            {COMPANY_NAME}
          </Text>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "800",
              letterSpacing: -0.4,
              color: t.ink,
              lineHeight: 30,
            }}
          >
            {doc.title}
          </Text>
          <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
            Effective {doc.effectiveDate} · v1.0
          </Text>
        </View>

        {/* Preamble (entity / contact / approver block) */}
        {doc.preamble ? (
          <Card pad={14}>
            <Text style={{ fontSize: 12.5, color: t.ink2, lineHeight: 19 }}>
              {doc.preamble}
            </Text>
          </Card>
        ) : null}

        {/* Sections */}
        <Card pad={16}>
          <View style={{ gap: 18 }}>
            {doc.sections.map((section, i) => (
              <View key={i} style={{ gap: 8 }}>
                {section.heading ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: t.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {section.heading}
                  </Text>
                ) : null}
                <View style={{ gap: 8 }}>
                  {section.paragraphs.map((p, j) => (
                    <Text
                      key={j}
                      style={{ fontSize: 13, color: t.ink2, lineHeight: 19.5 }}
                    >
                      {p}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Card>

        {/* Peer cross-links — keeps users inside the legal triad */}
        {peers.length > 0 ? (
          <View style={{ marginTop: 4, gap: 8 }}>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: "800",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: t.ink3,
              }}
            >
              Also read
            </Text>
            {peers.map((p) => (
              <Pressable
                key={p.href}
                onPress={() => router.push(p.href as never)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: pressed ? t.surface2 : t.surface,
                  gap: 10,
                })}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: t.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="doc" size={14} color={t.ink2} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: t.ink }}>
                  {p.label}
                </Text>
                <Icon name="chevR" size={14} color={t.ink4} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
