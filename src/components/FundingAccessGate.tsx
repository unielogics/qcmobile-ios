import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useCreditCurrent } from "@/hooks/useApi";
import { computeEligibility } from "@/lib/eligibility";

export function FundingAccessGate({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  const router = useRouter();
  const { data: credit, isLoading } = useCreditCurrent();

  // Don't flash the gate during initial credit load — show children
  // optimistically; the existing per-screen gates already handle the
  // missing-credit state inline if the load resolves to "blocked".
  if (isLoading) return <>{children}</>;

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount: 0,
    hasYearOfOwnership: false,
    creditExpired: credit?.is_expired,
    creditExpiringSoon: credit?.expiring_soon,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  if (eligibility.tier !== "blocked") return <>{children}</>;

  const banner = eligibility.banner;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
        <Card pad={24}>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name="bolt" size={26} color={t.brand} />
            </View>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: t.ink, textAlign: "center", marginBottom: 10 }}>
            {banner?.title ?? "Unlock Your Funding Workspace"}
          </Text>
          <Text style={{ fontSize: 14, color: t.ink2, textAlign: "center", lineHeight: 20, marginBottom: 22 }}>
            {banner?.body ?? "Run a soft credit pull to unlock loan offers. No score impact."}
          </Text>
          <Pressable
            onPress={() => router.push("/credit-pull")}
            style={({ pressed }) => ({
              backgroundColor: t.brand,
              paddingVertical: 14, paddingHorizontal: 22,
              borderRadius: 11, alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {banner?.ctaLabel ?? "Unlock My Funding Workspace"}
            </Text>
          </Pressable>
        </Card>
      </View>
    </SafeAreaView>
  );
}
