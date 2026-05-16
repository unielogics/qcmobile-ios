// Bottom-sheet picker for the Vault upload flow.
// Three sources: take a photo, pick from library, or pick a document file.
// Resolves to a normalized { uri, name, mimeType } that the upload hook
// understands.

import { Modal, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/Icon";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export function UploadActionSheet({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked: (file: PickedFile) => void;
}) {
  const { t } = useTheme();

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      onClose();
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      exif: false,
    });
    if (res.canceled || res.assets.length === 0) {
      onClose();
      return;
    }
    const a = res.assets[0];
    const ext = (a.uri.split(".").pop() || "jpg").toLowerCase();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    onPicked({
      uri: a.uri,
      name: a.fileName ?? `photo-${ts}.${ext}`,
      mimeType: a.mimeType ?? "image/jpeg",
      size: a.fileSize,
    });
  };

  const fromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      onClose();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || res.assets.length === 0) {
      onClose();
      return;
    }
    const a = res.assets[0];
    const ext = (a.uri.split(".").pop() || "jpg").toLowerCase();
    onPicked({
      uri: a.uri,
      name: a.fileName ?? `photo.${ext}`,
      mimeType: a.mimeType ?? "image/jpeg",
      size: a.fileSize,
    });
  };

  const fromFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets.length === 0) {
      onClose();
      return;
    }
    const a = res.assets[0];
    onPicked({
      uri: a.uri,
      name: a.name,
      mimeType: a.mimeType ?? "application/octet-stream",
      size: a.size,
    });
  };

  const items: { label: string; sub: string; icon: string; onPress: () => void }[] = [
    { label: "Take photo",     sub: "Use the camera to capture a HUD-1 or property photo", icon: "scan",     onPress: fromCamera },
    { label: "Choose from photos", sub: "Pick an existing image from your library",          icon: "vault",    onPress: fromLibrary },
    { label: "Choose file",    sub: "PDF, spreadsheet, or any document",                 icon: "doc",      onPress: fromFile },
  ];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(6,7,11,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 28,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, alignSelf: "center", marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>Add to Vault</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: t.ink, letterSpacing: -0.4, marginTop: 2 }}>How do you want to upload?</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="x" size={16} color={t.ink2} />
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 12,
                  padding: 14, borderRadius: 14,
                  backgroundColor: t.surface,
                  borderWidth: 1, borderColor: t.line,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={item.icon} size={20} color={t.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: t.ink }}>{item.label}</Text>
                  <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{item.sub}</Text>
                </View>
                <Icon name="chevR" size={14} color={t.ink4} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
