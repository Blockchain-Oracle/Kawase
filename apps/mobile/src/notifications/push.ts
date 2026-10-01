// Push on this phone (Stage 9; docs.expo.dev/push-notifications/push-notifications-setup, read 2026-10-01). The
// Android channel exists before the permission prompt (Android 13+ asks only once one does); the Expo push token is
// sent to Kawase, which ties it to this device; a tap opens the screen the notification is about. Nothing here
// approves anything: a notification only tells and opens the app.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/session/api";

/** on: Kawase can notify this phone. off: not yet asked (or turned off here). denied: only phone Settings can change it. */
export type PushState = "on" | "off" | "denied" | "unavailable";

const CHANNEL = "default";

// While the app is open, a notification still shows as a banner (the inbox also updates).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** iOS simulators have no push token; Android emulators with Google Play do. */
const canHavePush = () => Platform.OS === "android" || Device.isDevice;

async function ensureChannel(name: string) {
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CHANNEL, { name, importance: Notifications.AndroidImportance.HIGH });
}

export async function pushState(): Promise<PushState> {
  if (!canHavePush()) return "unavailable";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "on";
  return canAskAgain ? "off" : "denied";
}

/** Sends this phone's current token to Kawase (tokens can change); quiet on failure. */
export async function registerPushToken(): Promise<boolean> {
  try {
    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    await api.notifications.pushToken(data);
    return true;
  } catch (error) {
    // No Firebase config on Android, no push entitlement on iOS, or offline: Kawase tells through the inbox instead.
    console.warn("[push]", error);
    return false;
  }
}

/** Asks for permission when the phone still may, then registers the token. */
export async function turnOnPush(channelName: string): Promise<PushState> {
  if (!canHavePush()) return "unavailable";
  await ensureChannel(channelName);
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return canAskAgain ? "off" : "denied";
  return (await registerPushToken()) ? "on" : "unavailable";
}

/** Signing out: this phone stops getting the person's notifications. */
export async function forgetPushToken() {
  await api.notifications.pushToken(null).catch(() => undefined);
}

/** The app screen a tapped notification opens (only Kawase's own paths). */
export function pathOf(response: Notifications.NotificationResponse | null | undefined): string | undefined {
  const path = response?.notification.request.content.data?.path;
  return typeof path === "string" && (path === "/inbox" || path === "/automations") ? path : undefined;
}

export { useLastNotificationResponse } from "expo-notifications";
