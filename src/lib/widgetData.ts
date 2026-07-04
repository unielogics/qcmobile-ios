import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const STORAGE_KEY = "qc.widget.snapshot";

export interface MobileWidgetMeeting {
  id: string;
  title: string;
  starts_at: string;
  source?: string | null;
  deeplink?: string | null;
}

export interface MobileWidgetSnapshot {
  updated_at: string;
  meetings: MobileWidgetMeeting[];
  inbox_count?: number;
  pipeline_count?: number;
}

type QCWidgetDataNativeModule = {
  setWidgetData?: (json: string) => void;
};

export async function publishWidgetSnapshot(snapshot: MobileWidgetSnapshot) {
  const payload = JSON.stringify(snapshot);
  await AsyncStorage.setItem(STORAGE_KEY, payload);
  if (Platform.OS === "ios" || Platform.OS === "android") {
    (NativeModules.QCWidgetData as QCWidgetDataNativeModule | undefined)?.setWidgetData?.(payload);
  }
}
