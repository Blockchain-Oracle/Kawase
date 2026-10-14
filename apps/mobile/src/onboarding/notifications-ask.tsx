// Notifications are asked last (Senryo's setup order): never during sign-in, never before the person has seen Kawase
// work. Setup's last step starts the first real agent run and marks the ask as owed; when the person is back on a tab
// after that run, one sheet asks once — "Know when it's done" — with the system prompt behind its one button. Not now
// is remembered too, so it never nags; Settings → Notifications stays the way back. Phones only (the web has no push).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSegments } from "expo-router";
import * as React from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/kit/Button";
import { SPACE } from "@/components/kit/theme";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { pushState, turnOnPush } from "@/notifications/push";
import { useSession } from "@/session/session-provider";

const KEY = "kawase.notificationsAsk.v1";
/** Lets the page the person came back to settle before a sheet rises over it. */
const SETTLE_MS = 1_200;

type AskState = "owed" | "done";
let cached: AskState | undefined;

/** Setup's last step started the first agent run: the ask comes when the person is back on a tab. */
export function markNotificationsOwed() {
  if (cached === "done") return;
  cached = "owed";
  void AsyncStorage.getItem(KEY)
    .then((stored) => (stored === "done" ? undefined : AsyncStorage.setItem(KEY, "owed")))
    .catch(() => undefined);
}

function markDone() {
  cached = "done";
  void AsyncStorage.setItem(KEY, "done").catch(() => undefined);
}

export function NotificationsAsk() {
  const { status } = useSession();
  const segments = useSegments() as readonly string[];
  const onTab = segments[1] === "(tabs)";
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (status !== "account" || !onTab || open) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const stored = cached ?? ((await AsyncStorage.getItem(KEY).catch(() => null)) as AskState | null) ?? undefined;
        cached = stored;
        if (cancelled || stored !== "owed") return;
        // Already on, never possible here, or refused in the phone's Settings: nothing to ask.
        const phone = await pushState().catch(() => "unavailable" as const);
        if (cancelled) return;
        if (phone !== "off") return markDone();
        setOpen(true);
      })();
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, onTab, open]);

  if (!open) return null;
  return (
    <AskSheet
      onClose={() => {
        markDone();
        setOpen(false);
      }}
    />
  );
}

function AskSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: t("setup.notifyTitle") })}>
      <AskBody />
    </Sheet>
  );
}

function AskBody() {
  const { t } = useT();
  const close = useSheetClose();
  const [busy, setBusy] = React.useState(false);
  const allow = async () => {
    setBusy(true);
    const result = await turnOnPush(t("notifications.title")).catch(() => "unavailable" as const);
    if (result === "on") fire("confirm");
    close();
  };
  return (
    <View style={styles.body}>
      <SheetHeading title={t("setup.notifyTitle")} body={t("setup.notifyBody")} />
      <View style={styles.actions}>
        <Button label={t("setup.notifyAllow")} loading={busy} onPress={() => void allow()} />
        <Button label={t("setup.notNow")} variant="ghost" disabled={busy} onPress={() => close()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.xl, paddingBottom: SPACE.sm },
  actions: { gap: SPACE.sm },
});
