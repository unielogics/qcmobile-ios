import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";

export const SIGNATURE_VIEWBOX_WIDTH = 1000;
export const SIGNATURE_VIEWBOX_HEIGHT = 400;
export const SIGNATURE_VIEWBOX = `0 0 ${SIGNATURE_VIEWBOX_WIDTH} ${SIGNATURE_VIEWBOX_HEIGHT}`;

export function SignaturePreview({
  paths,
  height = 92,
}: {
  paths: string[];
  height?: number;
}) {
  const { t, isDark } = useTheme();
  return (
    <View
      style={{
        height,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: isDark ? "#080A10" : "#F8FAFC",
        overflow: "hidden",
      }}
    >
      <Svg width="100%" height="100%" viewBox={SIGNATURE_VIEWBOX} pointerEvents="none">
        {paths.map((path, index) => (
          <Path
            key={`${index}-${path.length}`}
            d={path}
            stroke={t.ink}
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
}

export function SignatureCaptureModal({
  visible,
  initialPaths,
  signerName,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initialPaths: string[];
  signerName: string;
  onCancel: () => void;
  onSave: (paths: string[]) => void;
}) {
  const { t, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const [paths, setPaths] = useState<string[]>(initialPaths);
  const canvasSize = useRef({ width: 1, height: 1 });
  const currentPath = useRef("");

  useEffect(() => {
    if (visible) {
      setPaths(initialPaths);
      currentPath.current = "";
    }
  }, [initialPaths, visible]);

  const pointFromEvent = (locationX: number, locationY: number) => {
    const size = canvasSize.current;
    const x = Math.max(0, Math.min(SIGNATURE_VIEWBOX_WIDTH, (locationX / Math.max(1, size.width)) * SIGNATURE_VIEWBOX_WIDTH));
    const y = Math.max(0, Math.min(SIGNATURE_VIEWBOX_HEIGHT, (locationY / Math.max(1, size.height)) * SIGNATURE_VIEWBOX_HEIGHT));
    return { x: Math.round(x), y: Math.round(y) };
  };

  const signatureResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const point = pointFromEvent(locationX, locationY);
          currentPath.current = `M ${point.x} ${point.y}`;
          setPaths((prev) => [...prev, currentPath.current]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const point = pointFromEvent(locationX, locationY);
          currentPath.current += ` L ${point.x} ${point.y}`;
          setPaths((prev) => [...prev.slice(0, -1), currentPath.current]);
        },
        onPanResponderRelease: () => {
          currentPath.current = "";
        },
        onPanResponderTerminate: () => {
          currentPath.current = "";
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  );

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onCancel} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={onCancel}
              accessibilityLabel="Cancel signature"
              hitSlop={10}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: pressed ? t.surface2 : t.surface,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="x" size={18} color={t.ink2} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 }}>
                Sign authorization
              </Text>
              <Text style={{ color: t.ink3, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>
                Use your finger to draw inside the box. This full-screen pad will not scroll while signing.
              </Text>
            </View>
          </View>

          <View
            {...signatureResponder.panHandlers}
            collapsable={false}
            onLayout={(event) => {
              canvasSize.current = {
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              };
            }}
            style={{
              flex: 1,
              minHeight: Math.max(320, Math.min(520, height - 260)),
              borderRadius: 20,
              borderWidth: 1,
              borderColor: t.lineStrong,
              backgroundColor: isDark ? "#080A10" : "#F8FAFC",
              overflow: "hidden",
            }}
          >
            <Svg width="100%" height="100%" viewBox={SIGNATURE_VIEWBOX} pointerEvents="none">
              {paths.map((path, index) => (
                <Path
                  key={`${index}-${path.length}`}
                  d={path}
                  stroke={t.ink}
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
            {paths.length === 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 18,
                  right: 18,
                  top: 18,
                  bottom: 18,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: t.lineStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: t.ink4, fontSize: 15, fontWeight: "800" }}>Draw here</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: t.ink3, fontSize: 12, lineHeight: 17 }}>
              Signer: <Text style={{ color: t.ink, fontWeight: "800" }}>{signerName.trim() || "Legal name required"}</Text>
            </Text>
            <Text style={{ color: t.ink4, fontSize: 11.5, lineHeight: 16 }}>
              Screen {Math.round(width)} x {Math.round(height)}. Signature is saved as an encrypted authorization record after card setup is complete.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setPaths([])}
              accessibilityLabel="Clear signature"
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: pressed ? t.surface2 : t.surface,
                paddingVertical: 15,
                alignItems: "center",
              })}
            >
              <Text style={{ color: t.ink, fontSize: 14, fontWeight: "900" }}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(paths)}
              disabled={paths.length === 0}
              accessibilityLabel="Use signature"
              style={({ pressed }) => ({
                flex: 1.5,
                borderRadius: 14,
                backgroundColor: paths.length === 0 ? t.chip : t.petrol,
                paddingVertical: 15,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: paths.length === 0 ? t.ink4 : isDark ? "#06110E" : "#FFFFFF", fontSize: 14, fontWeight: "900" }}>
                Use signature
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
