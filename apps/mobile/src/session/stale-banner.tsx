// A quiet line that says the account shown is the last one Kawase confirmed, because the api cannot be reached
// right now, with Retry (Codex review R01). It renders nothing while the session is fresh, so any screen can mount
// it at the top of its content.
import { CloudOff } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { useSession } from "./session-provider";

export function StaleBanner({ className }: { className?: string }) {
  const { t } = useT();
  const { stale, connection, retry } = useSession();
  const [retrying, setRetrying] = React.useState(false);
  if (!stale) return null;
  const again = async () => {
    setRetrying(true);
    await retry().finally(() => setRetrying(false));
  };
  return (
    <View
      accessibilityRole="alert"
      className={cn("bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-2", className)}
    >
      <Icon as={CloudOff} className="text-muted-foreground size-4" />
      <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
        {connection === "storage-unavailable"
          ? t("errors.storageUnavailable")
          : connection === "offline"
            ? t("errors.offline")
            : t("errors.serverTrouble")}
      </Text>
      <Button size="sm" variant="ghost" disabled={retrying} onPress={() => void again()}>
        <Text className="text-foreground text-sm">{t("common.retry")}</Text>
      </Button>
    </View>
  );
}
