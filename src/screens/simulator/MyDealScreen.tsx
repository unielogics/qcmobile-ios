import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { TopBar } from "@/components/TopBar";
import { LoanSimulator } from "@/components/LoanSimulator";
import { useLoans } from "@/hooks/useApi";

export function MyDealScreen() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const activeLoan = useMemo(() => loans.find((l) => l.stage !== "funded") ?? loans[0] ?? null, [loans]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <TopBar title="My Deal" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.6, color: t.ink3, textTransform: "uppercase" }}>
            My Deal
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, marginTop: 4 }}>
            {activeLoan?.address ?? "Your active loan"}
          </Text>
        </View>

        {activeLoan ? (
          <LoanSimulator loan={activeLoan} />
        ) : (
          <Card pad={20}>
            <SectionLabel>No active loan</SectionLabel>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="bolt" size={18} color={t.ink3} />
              <Text style={{ flex: 1, fontSize: 13, color: t.ink2, lineHeight: 18 }}>
                Once your Funding Team starts a file for you, your live terms and
                what-if scenarios will appear here.
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
