// The minimum-version check (cards/access.md): the api's /health names the oldest app version it still serves; an
// older build shows "Update required" with the way to the store instead of failing in odd places. Over-the-air updates
// (expo-updates) download in the background and apply on the next launch; they are never forced, and they cannot raise
// the native version, so this gate is what an incompatible api change relies on. Offline or unknown: never blocks.
import * as Application from "expo-application";
import { Download } from "lucide-react-native";
import * as React from "react";
import { Linking, Platform, View } from "react-native";

import { compareVersions } from "@kawase/config";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { api } from "@/session/api";

const ICON_SIZE = 40;
/** Where a newer build is: TestFlight on iOS until the App Store listing exists, the Play listing on Android. */
const STORE_URL = {
  ios: process.env.EXPO_PUBLIC_IOS_STORE_URL ?? "itms-beta://",
  android: "market://details?id=xyz.kawase.app",
} as const;

/** True once /health says this build is older than the oldest one served. */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = React.useState(false);
  React.useEffect(() => {
    const version = Application.nativeApplicationVersion;
    if (Platform.OS === "web" || !version) return;
    let live = true;
    void api
      .health()
      .then((health) => {
        if (live && health.minAppVersion && compareVersions(version, health.minAppVersion) < 0) setRequired(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return required;
}

export function UpdateRequiredScreen() {
  const { t } = useT();
  const url = Platform.OS === "android" ? STORE_URL.android : STORE_URL.ios;
  return (
    <View className="bg-background flex-1">
      <EmptyState
        art={<Icon as={Download} className="text-muted-foreground" size={ICON_SIZE} />}
        title={t("update.title")}
        body={t("update.body", { version: Application.nativeApplicationVersion ?? "" })}
        action={
          <Button onPress={() => void Linking.openURL(url)}>
            <Text>{t("update.action")}</Text>
          </Button>
        }
      />
    </View>
  );
}
