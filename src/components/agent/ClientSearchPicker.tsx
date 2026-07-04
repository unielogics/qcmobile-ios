import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import type { Client } from "@/lib/types";

function clientHaystack(client: Client): string {
  return [
    client.name,
    client.email,
    client.phone,
    client.city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ClientSearchPicker({
  clients,
  value,
  onChange,
  allowUnlinked = false,
  placeholder = "Search clients by name, email, or phone",
}: {
  clients: Client[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowUnlinked?: boolean;
  placeholder?: string;
}) {
  const { t } = useTheme();
  const selected = clients.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
    }
  }, [selected?.id]);

  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    return clients
      .filter((client) => clientHaystack(client).includes(normalized))
      .slice(0, 8);
  }, [clients, normalized]);

  const exactSelected =
    selected != null && normalized === selected.name.trim().toLowerCase();
  const showMatches = normalized.length > 0 && !exactSelected;

  const changeQuery = (next: string) => {
    setQuery(next);
    if (selected && next.trim().toLowerCase() !== selected.name.trim().toLowerCase()) {
      onChange(null);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 10,
          backgroundColor: t.surface2,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          gap: 8,
        }}
      >
        <Icon name="search" size={14} color={t.ink3} />
        <TextInput
          value={query}
          onChangeText={changeQuery}
          placeholder={placeholder}
          placeholderTextColor={t.ink4}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            color: t.ink,
            fontSize: 14,
            paddingVertical: 10,
          }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery("");
              onChange(null);
            }}
            hitSlop={8}
            accessibilityLabel={allowUnlinked ? "Clear client link" : "Clear client search"}
          >
            <Icon name="x" size={14} color={t.ink3} />
          </Pressable>
        ) : null}
      </View>

      {selected ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: t.brand,
            backgroundColor: t.brandSoft,
            borderRadius: 10,
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.brand }} numberOfLines={1}>
              {selected.name}
            </Text>
            <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }} numberOfLines={1}>
              {[selected.email, selected.phone, selected.city].filter(Boolean).join(" | ") || "Linked client"}
            </Text>
          </View>
          {allowUnlinked ? (
            <Pressable
              onPress={() => {
                setQuery("");
                onChange(null);
              }}
              hitSlop={8}
              accessibilityLabel="Unlink client"
            >
              <Text style={{ fontSize: 12, color: t.brand, fontWeight: "800" }}>Unlink</Text>
            </Pressable>
          ) : null}
        </View>
      ) : allowUnlinked ? (
        <Text style={{ fontSize: 11.5, color: t.ink3, lineHeight: 16 }}>
          No client linked. You can analyze unlinked, but prequalification requires a linked client.
        </Text>
      ) : clients.length === 0 && normalized.length === 0 ? (
        <Text style={{ fontSize: 11.5, color: t.ink3, lineHeight: 16 }}>
          Start typing to search your clients.
        </Text>
      ) : null}

      {showMatches ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: t.line,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {matches.length > 0 ? (
            matches.map((client) => (
              <Pressable
                key={client.id}
                onPress={() => {
                  onChange(client.id);
                  setQuery(client.name);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: t.line,
                  backgroundColor: pressed ? t.surface2 : t.surface,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink }} numberOfLines={1}>
                  {client.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }} numberOfLines={1}>
                  {[client.email, client.phone, client.city].filter(Boolean).join(" | ") || "Client"}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ fontSize: 12.5, color: t.ink3, padding: 12 }}>
              No matching clients.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
