import { useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
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
  const [dismissed, setDismissed] = useState(false);

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
    <>
      {children}
      <Modal visible={!dismissed} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "rgba(3,6,15,0.58)", justifyContent: "flex-end", padding: 18 }}>
          <Card pad={22} style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name="bolt" size={24} color={t.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "900", color: t.ink }}>
                  {banner?.title ?? "Credit & Pre-Authorization"}
                </Text>
                <Text style={{ fontSize: 13, color: t.ink3, lineHeight: 18, marginTop: 3 }}>
                  The app is available now. Credit-based terms unlock after authorization and a soft pull.
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: t.ink2, lineHeight: 20 }}>
              {banner?.body ?? "Complete Credit & Pre-Authorization to unlock loan offers. The soft pull has no score impact."}
            </Text>
            <View style={{ gap: 9 }}>
              <Pressable
                onPress={() => router.push("/credit-pull")}
                style={({ pressed }) => ({
                  backgroundColor: t.brand,
                  paddingVertical: 14,
                  paddingHorizontal: 22,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                  {banner?.ctaLabel ?? "Start Credit & Pre-Authorization"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDismissed(true)}
                style={({ pressed }) => ({
                  paddingVertical: 13,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: t.ink, fontWeight: "800", fontSize: 14 }}>Do later</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}
