// ClientSearchBlock — dedup check shown inline in the new-client wizard's
// Lead step. As the broker types name / email / phone, this surfaces up to
// 5 likely-existing-client matches from their book. Tap a match → broker
// exits the wizard via onPickExisting and routes to that client's detail
// page, avoiding a duplicate Client row.
//
// Source-of-truth: mirrors the equivalent block on QCDashboard's
// AgentLeadModal Step 1.

import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Avatar } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { useClients } from "@/hooks/useApi";
import type { Client } from "@/lib/types";

interface Props {
  name: string;
  email: string;
  phone: string;
  onPickExisting: (client: Client) => void;
}

const MAX_HITS = 5;
const MIN_QUERY_LEN = 2;

export function ClientSearchBlock({ name, email, phone, onPickExisting }: Props) {
  const { t } = useTheme();
  const { data: clients = [] } = useClients("mine");

  const matches = useMemo(() => {
    const tokens = [name, email, phone]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= MIN_QUERY_LEN);
    if (tokens.length === 0) return [];
    return clients
      .filter((c) => {
        const hay = [
          c.name,
          c.email ?? "",
          c.phone ?? "",
          c.city ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return tokens.some((tok) => hay.includes(tok));
      })
      .slice(0, MAX_HITS);
  }, [clients, name, email, phone]);

  if (matches.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 12,
        backgroundColor: t.warnBg,
        borderColor: t.warn,
        borderWidth: 1,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="alert" size={13} color={t.warn} />
        <Text style={{ fontSize: 12, fontWeight: "800", color: t.warn, letterSpacing: 0.2 }}>
          Existing client{matches.length === 1 ? "" : "s"} in your book
        </Text>
      </View>
      <Text style={{ fontSize: 11.5, color: t.ink2, lineHeight: 16 }}>
        Tap to open instead of creating a duplicate.
      </Text>
      <View style={{ gap: 6 }}>
        {matches.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPickExisting(c)}
            accessibilityLabel={`Open existing client ${c.name}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 10,
              backgroundColor: pressed ? t.surface2 : t.surface,
              borderColor: t.line,
              borderWidth: 1,
            })}
          >
            <Avatar
              label={c.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
              color={c.avatar_color ?? undefined}
              size={28}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: t.ink }} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={{ fontSize: 11, color: t.ink3, marginTop: 1 }} numberOfLines={1}>
                {[c.email, c.phone, c.city].filter(Boolean).join(" · ") || "—"}
              </Text>
            </View>
            <Icon name="chevR" size={13} color={t.ink4} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
