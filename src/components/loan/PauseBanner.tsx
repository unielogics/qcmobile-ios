// Yellow banner shown when an operator (super_admin or broker via
// Live Chat) is handling the conversation directly. Same shape on
// agent-loan view and client-loan view so both sides see the
// "human is replying directly" state.
//
// We keep a small countdown so the user sees the AI will resume
// itself. There is intentionally NO "Resume now" button on this
// mobile component — per design decision the resume is automatic
// at the 60-minute mark.

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";
import { usePauseBanner } from "@/hooks/usePauseBanner";

interface Props {
  loanId: string | null | undefined;
  // Override the standard copy. Optional.
  message?: string;
}

export function PauseBanner({ loanId, message }: Props) {
  const { t } = useTheme();
  const state = usePauseBanner(loanId);
  // Tick once a minute so the countdown updates without forcing
  // the parent to re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.isPaused) return;
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, [state.isPaused]);

  if (!state.isPaused) return null;
  const minutes = Math.max(1, state.minutesRemaining);
  const who =
    state.pausedBy === "super_admin"
      ? "Your operator"
      : state.pausedBy === "broker"
        ? "Your agent"
        : "An operator";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: t.warnBg,
        borderColor: t.warn,
        borderWidth: 1,
      }}
      accessibilityLiveRegion="polite"
    >
      <Icon name="pause" size={12} color={t.warn} />
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.ink2 }}
      >
        <Text style={{ fontWeight: "800", color: t.warn }}>AI paused · </Text>
        {message ?? `${who} is replying. Resumes in ~${minutes} min.`}
      </Text>
    </View>
  );
}
