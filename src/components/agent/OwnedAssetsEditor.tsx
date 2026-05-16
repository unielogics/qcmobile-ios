// OwnedAssetsEditor — buyer-side multi-row editor for properties the
// buyer already owns. Used in the new-client wizard Step 2 when the
// buyer toggles "I own other properties".
//
// Each row collapses to a single-line summary by default; tapping expands
// the row to edit address / city / state / use / value / balance owed.
// Mirrors the desktop AgentLeadModal owned-assets block.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";

export interface OwnedAsset {
  address: string;
  city: string;
  state: string;
  use: "primary" | "rental" | "second_home" | "investment" | "other";
  value: string;          // raw input, parsed at submit
  balanceOwed: string;    // raw input, parsed at submit
}

export const NEW_ASSET: OwnedAsset = {
  address: "",
  city: "",
  state: "",
  use: "rental",
  value: "",
  balanceOwed: "",
};

const USE_OPTIONS: { value: OwnedAsset["use"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "rental", label: "Rental" },
  { value: "second_home", label: "2nd home" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

interface Props {
  assets: OwnedAsset[];
  onChange: (next: OwnedAsset[]) => void;
}

export function OwnedAssetsEditor({ assets, onChange }: Props) {
  const { t } = useTheme();
  const [expanded, setExpanded] = useState<number | null>(assets.length === 0 ? null : 0);

  const updateRow = (idx: number, patch: Partial<OwnedAsset>) => {
    onChange(assets.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const removeRow = (idx: number) => {
    onChange(assets.filter((_, i) => i !== idx));
    if (expanded === idx) setExpanded(null);
  };
  const addRow = () => {
    onChange([...assets, { ...NEW_ASSET }]);
    setExpanded(assets.length);
  };

  return (
    <View style={{ gap: 8 }}>
      {assets.map((a, idx) => {
        const open = expanded === idx;
        const summary = a.address.trim()
          ? `${a.address}${a.city ? ", " + a.city : ""}${a.state ? " " + a.state : ""}`
          : "New property — tap to fill in";
        return (
          <View
            key={idx}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: open ? t.brand : t.line,
              backgroundColor: t.surface,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => setExpanded(open ? null : idx)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name="building" size={14} color={t.ink2} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: t.ink }} numberOfLines={1}>
                {summary}
              </Text>
              <Icon name={open ? "chevU" : "chevD"} size={12} color={t.ink3} />
            </Pressable>
            {open ? (
              <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: t.line }}>
                <RowInput t={t} value={a.address} placeholder="Street address" onChange={(v) => updateRow(idx, { address: v })} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 2 }}>
                    <RowInput t={t} value={a.city} placeholder="City" onChange={(v) => updateRow(idx, { city: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <RowInput
                      t={t}
                      value={a.state}
                      placeholder="ST"
                      autoCapitalize="characters"
                      onChange={(v) => updateRow(idx, { state: v.toUpperCase().slice(0, 2) })}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {USE_OPTIONS.map((u) => {
                    const active = a.use === u.value;
                    return (
                      <Pressable
                        key={u.value}
                        onPress={() => updateRow(idx, { use: u.value })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          backgroundColor: active ? t.brand : t.surface2,
                          borderColor: active ? t.brand : t.line,
                          borderWidth: 1,
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: active ? "#fff" : t.ink2 }}>
                          {u.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <RowInput
                      t={t}
                      value={a.value}
                      placeholder="Est. value"
                      keyboardType="numeric"
                      onChange={(v) => updateRow(idx, { value: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <RowInput
                      t={t}
                      value={a.balanceOwed}
                      placeholder="Balance owed"
                      keyboardType="numeric"
                      onChange={(v) => updateRow(idx, { balanceOwed: v })}
                    />
                  </View>
                </View>
                <Pressable
                  onPress={() => removeRow(idx)}
                  accessibilityLabel="Remove this property"
                  style={({ pressed }) => ({
                    alignSelf: "flex-start",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: pressed ? t.dangerBg : "transparent",
                  })}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.danger }}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      <Pressable
        onPress={addRow}
        accessibilityLabel="Add another property"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderColor: t.line,
          borderWidth: 1,
          borderStyle: "dashed",
          backgroundColor: pressed ? t.surface2 : "transparent",
          alignSelf: "flex-start",
        })}
      >
        <Icon name="plus" size={12} color={t.ink2} />
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: t.ink2 }}>Add another property</Text>
      </Pressable>
    </View>
  );
}

function RowInput({
  t,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  autoCapitalize?: "none" | "sentences" | "characters";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.ink4}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? "sentences"}
      style={{
        backgroundColor: t.surface2,
        color: t.ink,
        fontSize: 13,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderColor: t.line,
        borderWidth: 1,
      }}
    />
  );
}
