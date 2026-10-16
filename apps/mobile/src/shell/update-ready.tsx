// A newer Kawase is ready (Abu, 10-16: "you have not updated the app… I still see the glassy" — an over-the-air update
// only applied on the second cold launch, and nothing said one was waiting). On the phone: whenever the app comes back
// to the front it asks for an update and downloads it; once one is downloaded a toast offers Restart, which applies it
// at once. Never a restart on its own — the person may be mid-signature. (update-ready.web.tsx does the browser's.)
import * as Updates from "expo-updates";
import * as React from "react";
import { AppState } from "react-native";
import { toast } from "sonner-native";

import { useT } from "@/i18n";

const TOAST_ID = "kawase-update";

export function UpdateReady() {
  const { t } = useT();
  const { isUpdatePending } = Updates.useUpdates();

  React.useEffect(() => {
    if (!Updates.isEnabled) return undefined;
    const check = () =>
      void Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    if (!isUpdatePending) return;
    toast(t("update.readyTitle"), {
      id: TOAST_ID,
      duration: Infinity,
      action: { label: t("update.readyRestart"), onClick: () => void Updates.reloadAsync() },
    });
  }, [isUpdatePending, t]);

  return null;
}
