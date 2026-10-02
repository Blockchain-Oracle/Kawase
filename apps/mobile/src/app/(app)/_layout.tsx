// The signed-in area (guest or account): everything under it needs a session. The tabs with the dock are one
// screen of this stack; wallet setup, sign-in, receive and the inbox push over them without the dock. The
// parenthesised group keeps the URL paths, so "/", "/settings", "/wallet" and "/sign-in" are unchanged.
// A saved session that cannot be read yet (offline on the very first open after an update, before any account
// was cached) shows a calm "can't reach Kawase" page with Retry, never a blank screen and never a new guest.
import { Redirect, Stack } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { View } from "react-native";

import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { UpdateRequiredScreen, useUpdateRequired } from "@/account/update-gate";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const ICON = 40;

export default function AppLayout() {
  const { t } = useT();
  const { status, connection, retry } = useSession();
  const updateRequired = useUpdateRequired();
  if (updateRequired) return <UpdateRequiredScreen />;
  if (status === "loading" && connection !== "online") {
    return (
      <View className="bg-background flex-1">
        <EmptyState
          art={<Icon as={CloudOff} className="text-muted-foreground" size={ICON} />}
          title={
            connection === "storage-unavailable"
              ? t("errors.storageUnavailable")
              : connection === "offline"
                ? t("errors.offline")
                : t("errors.serverTrouble")
          }
          action={
            <Button onPress={() => void retry()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          }
        />
      </View>
    );
  }
  if (status === "loading") return null;
  if (status === "none") return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
