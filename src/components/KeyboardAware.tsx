// Single source of truth for keyboard-avoiding behavior on mobile.
//
// Goal: when the soft keyboard opens, the composer (TextInput + Send)
// stays visible on both platforms regardless of:
//  - installed-build manifest quirks (windowSoftInputMode)
//  - the presence of an Android 3-button navigation bar (which RN's
//    Keyboard.height event excludes on some OEMs and includes on
//    others)
//
// iOS: behavior="padding" → RN pads the KAV bottom by the keyboard
//   height. keyboardVerticalOffset accounts for chrome below the
//   KAV's outer bottom edge (bottom tab bar, when mounted).
//
// Android: behavior="height" → RN shrinks the KAV's height by the
//   keyboard height. We pass NEGATIVE insets.bottom as the vertical
//   offset so RN's calculated height accounts for the nav bar that's
//   already deducted by adjustResize. Without this, devices with a
//   3-button nav bar end up with the composer hidden behind the
//   keyboard (the keyboard event reports the keyboard size starting
//   from the bottom of the SCREEN, but adjustResize has already
//   shrunk the window by the nav-bar height — so KAV double-counts).

import { type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Override the iOS vertical offset. Use when the wrapping screen
  // is outside the tab navigator (modal sheets, sign-in route).
  offset?: number;
  // Skip the tab-bar offset (the screen sits ABOVE the tab
  // navigator — e.g. /agent/loan/[id]).
  excludeTabBar?: boolean;
  // Escape hatch: pass enabled={false} to fully bypass the wrapper.
  enabled?: boolean;
}

const TAB_BAR_HEIGHT = 64;

export function KeyboardAware({
  children,
  style,
  offset,
  excludeTabBar = false,
  enabled = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === "android";

  // iOS: offset for the bottom tab bar (or screen-supplied override).
  // Android: subtract the gesture / 3-button nav-bar inset so RN
  // doesn't double-count it when shrinking. On gesture-nav devices
  // insets.bottom is ~0; on 3-button devices it's ~48dp.
  const tabBar = excludeTabBar ? 0 : TAB_BAR_HEIGHT;
  const iosOffset = offset !== undefined ? offset : tabBar;
  const androidOffset = -insets.bottom;
  const computed = isAndroid ? androidOffset : iosOffset;

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={isAndroid ? "height" : "padding"}
      keyboardVerticalOffset={computed}
      enabled={enabled}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
