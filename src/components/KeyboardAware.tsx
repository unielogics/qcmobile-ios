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
// Android: the native activity uses adjustResize, so Android should
//   resize the app window when the keyboard opens. Do not also move
//   the React tree with KeyboardAvoidingView; on Samsung foldables and
//   Phone Link this double-counts the keyboard and pushes chat content
//   out of the viewport.

import { type ReactNode, useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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
  // Kept for source compatibility with older call sites. Android now
  // relies on native adjustResize instead of React-side movement.
  androidBehavior?: "height" | "padding" | "position";
}

const TAB_BAR_HEIGHT = 64;

export function KeyboardAware({
  children,
  style,
  offset,
  excludeTabBar = false,
  enabled = true,
}: Props) {
  const isAndroid = Platform.OS === "android";

  // iOS: offset for the bottom tab bar (or screen-supplied override).
  const tabBar = excludeTabBar ? 0 : TAB_BAR_HEIGHT;
  const iosOffset = offset !== undefined ? offset : tabBar;
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);

  useEffect(() => {
    if (!isAndroid || !enabled) return undefined;

    const onShow = (event: { endCoordinates?: { screenY?: number; height?: number } }) => {
      const windowHeight = Dimensions.get("window").height;
      const keyboardTop = event.endCoordinates?.screenY;
      const overlap = typeof keyboardTop === "number" ? Math.max(0, windowHeight - keyboardTop) : 0;

      // If Android adjustResize is active, overlap is 0 because the app
      // window already ends at the keyboard. If the keyboard overlays
      // the app, overlap is the exact amount covering the footer.
      setAndroidKeyboardInset(overlap);
    };

    const onHide = () => setAndroidKeyboardInset(0);
    const show = Keyboard.addListener("keyboardDidShow", onShow);
    const hide = Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled, isAndroid]);

  if (isAndroid || !enabled) {
    return (
      <View style={[{ flex: 1, paddingBottom: isAndroid ? androidKeyboardInset : 0 }, style]}>
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior="padding"
      keyboardVerticalOffset={iosOffset}
      enabled
    >
      {children}
    </KeyboardAvoidingView>
  );
}
