import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@/design-system/Icon";
import { Pill } from "@/design-system/primitives";
import { useTheme } from "@/design-system/ThemeProvider";
import { useAddressAutocomplete, useResolveAddress } from "@/hooks/useApi";
import { US_STATES } from "@/lib/usStates";
import type { AddressParts } from "@/lib/types";

function makeSessionToken() {
  return `qc-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function formatAddressParts(parts: AddressParts | null | undefined, fallback = ""): string {
  if (!parts) return fallback.trim();
  const full = clean(parts.full);
  if (full) return full;
  const cityLine = [parts.city, parts.state, parts.zip].map(clean).filter(Boolean).join(" ");
  return [parts.street, cityLine].map(clean).filter(Boolean).join(", ").trim() || fallback.trim();
}

export function isAddressLookupReady(parts: AddressParts | null | undefined): parts is AddressParts {
  if (!parts) return false;
  if (clean(parts.full)) return true;
  return Boolean(clean(parts.street) && clean(parts.city) && clean(parts.state));
}

function hasSplitAddress(parts: AddressParts | null | undefined) {
  return Boolean(clean(parts?.street) || clean(parts?.city) || clean(parts?.state) || clean(parts?.zip));
}

function normalize(parts: AddressParts | null | undefined): AddressParts {
  return {
    street: clean(parts?.street) || null,
    city: clean(parts?.city) || null,
    state: clean(parts?.state) || null,
    zip: clean(parts?.zip) || null,
    full: clean(parts?.full) || null,
    latitude: parts?.latitude ?? null,
    longitude: parts?.longitude ?? null,
  };
}

function useDebouncedValue(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function GoogleAddressInput({
  value,
  onChange,
  onResolved,
  label = "Property address",
  helperText = "Search Google and select the property, or use manual entry if the address is not listed.",
  showZip = true,
  disabled = false,
}: {
  value: AddressParts | null;
  onChange: (next: AddressParts) => void;
  onResolved?: (next: AddressParts, googlePlace: Record<string, unknown> | null) => void;
  label?: string;
  helperText?: string;
  showZip?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTheme();
  const [query, setQuery] = useState(() => formatAddressParts(value));
  const [manualOpen, setManualOpen] = useState(() => hasSplitAddress(value));
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState(makeSessionToken);
  const debouncedQuery = useDebouncedValue(query);
  const suggestions = useAddressAutocomplete(debouncedQuery, sessionToken);
  const resolveAddress = useResolveAddress();

  const formattedValue = useMemo(
    () => formatAddressParts(value),
    [value?.street, value?.city, value?.state, value?.zip, value?.full],
  );

  useEffect(() => {
    if (!formattedValue || formattedValue === query) return;
    setQuery(formattedValue);
  }, [formattedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldStyle = {
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: 10,
    backgroundColor: t.surface2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: t.ink,
    fontSize: 14,
  } as const;

  const updatePart = (key: keyof Pick<AddressParts, "street" | "city" | "state" | "zip">, raw: string) => {
    const next = normalize({
      ...value,
      [key]: raw,
      full: null,
      latitude: null,
      longitude: null,
    });
    onChange(next);
    setQuery(formatAddressParts(next));
  };

  const openManual = () => {
    const next = normalize(value);
    if (!next.street && query.trim()) next.street = query.trim();
    onChange(next);
    setManualOpen(true);
    setSuggestionsOpen(false);
  };

  const selectSuggestion = async (placeId: string, fallbackText: string) => {
    const resolved = await resolveAddress.mutateAsync({ place_id: placeId, session_token: sessionToken });
    const next = normalize(resolved.address);
    const formatted = formatAddressParts(next, fallbackText);
    const withFull = { ...next, full: next.full || formatted };
    onChange(withFull);
    onResolved?.(withFull, resolved.google_place);
    setQuery(formatted);
    setManualOpen(true);
    setSuggestionsOpen(false);
    setSessionToken(makeSessionToken());
  };

  const showSuggestions =
    suggestionsOpen &&
    !disabled &&
    debouncedQuery.trim().length >= 2 &&
    Boolean(suggestions.data?.length);
  const showManualFallback =
    suggestionsOpen &&
    !disabled &&
    debouncedQuery.trim().length >= 3 &&
    !suggestions.isFetching &&
    !suggestions.data?.length;
  const selectedState = US_STATES.find((s) => s.code === value?.state);

  return (
    <View style={{ gap: 8 }}>
      <View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {label}
        </Text>
        <View style={{ marginTop: 4, borderWidth: 1, borderColor: t.line, borderRadius: 11, backgroundColor: t.surface2, flexDirection: "row", alignItems: "center", paddingHorizontal: 11 }}>
          <Icon name="search" size={14} color={t.ink3} />
          <TextInput
            value={query}
            editable={!disabled}
            onFocus={() => setSuggestionsOpen(true)}
            onChangeText={(text) => {
              setQuery(text);
              setSuggestionsOpen(true);
            }}
            placeholder="Start typing property address"
            placeholderTextColor={t.ink4}
            style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: 14, paddingVertical: 10, paddingHorizontal: 8 }}
          />
          {resolveAddress.isPending ? <Icon name="refresh" size={13} color={t.brand} /> : null}
        </View>
      </View>

      {showSuggestions ? (
        <View style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface, overflow: "hidden" }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 230 }}>
            {suggestions.data?.map((s) => (
              <Pressable
                key={s.place_id}
                onPress={() => selectSuggestion(s.place_id, s.text)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  borderBottomWidth: 1,
                  borderBottomColor: t.line,
                  backgroundColor: pressed ? t.chip : t.surface,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: t.ink }}>{s.text}</Text>
                {s.secondary_text ? <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{s.secondary_text}</Text> : null}
              </Pressable>
            ))}
            <Pressable onPress={openManual} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.brand }}>Enter address manually</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      {showManualFallback ? (
        <View style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface, padding: 12 }}>
          <Text style={{ fontSize: 12.5, color: t.ink3, lineHeight: 18 }}>No Google match. Use manual entry for this property.</Text>
          <Pressable onPress={openManual} style={{ marginTop: 8, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.brand }}>Enter address manually</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Pill bg={value?.latitude && value?.longitude ? t.profitBg : t.chip} color={value?.latitude && value?.longitude ? t.profit : t.ink3}>
          {value?.latitude && value?.longitude
            ? "Google address resolved"
            : hasSplitAddress(value)
              ? "Manual address"
              : "Search Google or enter manually"}
        </Pill>
        {!manualOpen ? (
          <Pressable onPress={openManual}>
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: t.brand }}>Manual entry</Text>
          </Pressable>
        ) : null}
      </View>
      {helperText ? <Text style={{ fontSize: 12, color: t.ink3, lineHeight: 17 }}>{helperText}</Text> : null}

      {manualOpen ? (
        <View style={{ gap: 8 }}>
          <View>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Street
            </Text>
            <TextInput value={value?.street ?? ""} onChangeText={(text) => updatePart("street", text)} placeholderTextColor={t.ink4} style={fieldStyle} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1.5 }}>
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                City
              </Text>
              <TextInput value={value?.city ?? ""} onChangeText={(text) => updatePart("city", text)} placeholderTextColor={t.ink4} style={fieldStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                State
              </Text>
              <Pressable
                onPress={() => setStateOpen((open) => !open)}
                style={{ ...fieldStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 41 }}
              >
                <Text style={{ fontSize: 13.5, color: selectedState ? t.ink : t.ink4 }}>
                  {selectedState ? selectedState.code : "ST"}
                </Text>
                <Icon name={stateOpen ? "chevU" : "chevD"} size={13} color={t.ink3} />
              </Pressable>
            </View>
            {showZip ? (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                  ZIP
                </Text>
                <TextInput value={value?.zip ?? ""} onChangeText={(text) => updatePart("zip", text)} keyboardType="number-pad" placeholderTextColor={t.ink4} style={fieldStyle} />
              </View>
            ) : null}
          </View>
          {stateOpen ? (
            <View style={{ borderWidth: 1, borderColor: t.line, borderRadius: 11, overflow: "hidden", maxHeight: 220 }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {US_STATES.map((s) => (
                  <Pressable
                    key={s.code}
                    onPress={() => {
                      updatePart("state", s.code);
                      setStateOpen(false);
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: s.code === value?.state ? t.brandSoft : t.surface }}
                  >
                    <Text style={{ fontSize: 13.5, color: t.ink }}>{s.code} - {s.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
