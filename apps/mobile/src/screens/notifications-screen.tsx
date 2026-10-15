// Settings → Notifications (Stage 9, D31): whether this phone gets push (and the one way to fix it when it can't),
// where emails go, what Kawase tells about on each channel, amounts hidden on the lock screen (A5-3), and quiet hours. Every change saves at once and is undone
// on screen if the save fails. The inbox gets everything regardless; these choices only decide who else is told.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { AppState, Linking, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { NotificationSettings, QuietHours } from "@kawase/api-client";
import { NOTIFICATION_KINDS, notificationOn, type NotificationChannel, type NotificationKind } from "@kawase/config";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Badge } from "@kawase/ui-native/components/ui/badge";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { pushState, registerPushToken, turnOnPush, type PushState } from "@/notifications/push";
import { api } from "@/session/api";

const EDGE_INSET = 12;
const KIND_LABEL: Record<NotificationKind, string> = {
  payment_received: "notifications.kindPaymentReceived",
  request_received: "notifications.kindRequestReceived",
  request_paid: "notifications.kindRequestPaid",
  send_completed: "notifications.kindSendCompleted",
  swap_completed: "notifications.kindSwapCompleted",
  bridge_completed: "notifications.kindBridgeCompleted",
  automation_skipped: "notifications.kindAutomationSkipped",
  rule_alert: "notifications.kindRuleAlert",
  device_signed_in: "alerts.kindDeviceSignedIn",
  device_signed_out: "alerts.kindDeviceSignedOut",
  position_health: "notifications.kindPositionHealth",
  position_closed: "notifications.kindPositionClosed",
  token_graduated: "notifications.kindTokenGraduated",
};
/** Quiet hours as a few common nights rather than a time picker: most people want one of these. */
const QUIET_CHOICES: (QuietHours | null)[] = [null, { start: "22:00", end: "07:00" }, { start: "23:00", end: "08:00" }, { start: "21:00", end: "06:00" }];
const quietKey = (quiet: QuietHours | null) => (quiet ? `${quiet.start}-${quiet.end}` : "off");

export function NotificationsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = React.useState<NotificationSettings>();
  const [phone, setPhone] = React.useState<PushState>();
  const native = Platform.OS !== "web";

  const load = React.useCallback(() => {
    void (async () => {
      const [next, state] = await Promise.all([api.notifications.get().catch(() => undefined), pushState()]);
      if (next) setSettings(next);
      // "On" means Kawase can reach this phone, not only that the phone allows it: allowed but not registered is
      // tried once, and a phone that cannot get a push token (no push service) says so.
      if (state === "on" && next && !next.pushRegistered) {
        const registered = await registerPushToken();
        setPhone(registered ? "on" : "unavailable");
        if (registered) setSettings({ ...next, pushRegistered: true });
        return;
      }
      setPhone(state);
    })();
  }, []);
  useFocusEffect(load);
  // Coming back from the phone's Settings: read everything again.
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => state === "active" && load());
    return () => subscription.remove();
  }, [load]);

  const save = async (change: Parameters<typeof api.notifications.update>[0], optimistic: NotificationSettings) => {
    const before = settings;
    setSettings(optimistic);
    try {
      setSettings(await api.notifications.update(change));
    } catch {
      setSettings(before);
      toast.error(t("notifications.saveFailed"));
    }
  };

  const toggle = (kind: NotificationKind, channel: NotificationChannel, on: boolean) => {
    if (!settings) return;
    const prefs = { ...settings.prefs, [kind]: { ...settings.prefs[kind], [channel]: on } };
    void save({ prefs: { [kind]: { [channel]: on } } }, { ...settings, prefs });
  };

  const turnOn = async () => setPhone(await turnOnPush(t("notifications.title")));

  const emailUsable = Boolean(settings?.email && settings.emailEnabled);
  const channels: NotificationChannel[] = native ? ["push", "email"] : ["email"];

  return (
    <View className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("notifications.title")}
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET }}>
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("notifications.subtitle")}</Text>

        {native ? (
          <View className="gap-3">
            <ListGroup>
              <ListRow
                title={t("notifications.phone")}
                subtitle={phone === "denied" ? t("notifications.phoneOff") : phone === "unavailable" ? t("notifications.phoneUnavailable") : undefined}
                trailing={phone === "on" ? <Badge variant="secondary"><Text>{t("notifications.phoneOn")}</Text></Badge> : undefined}
              />
            </ListGroup>
            {phone === "off" ? (
              <Button onPress={() => void turnOn()}>
                <Text>{t("notifications.turnOn")}</Text>
              </Button>
            ) : phone === "denied" ? (
              <Button variant="secondary" onPress={() => void Linking.openSettings()}>
                <Text>{t("notifications.openSettings")}</Text>
              </Button>
            ) : null}
          </View>
        ) : (
          <Text className={cn("text-foreground text-base", TEXT_START)}>{t("notifications.webNote")}</Text>
        )}

        <View className="gap-2">
          <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
            {t("notifications.emailTitle")}
          </Text>
          <Text className={cn("text-muted-foreground text-base", TEXT_START)}>
            {!settings ? "" : !settings.email ? t("notifications.emailNone") : !settings.emailEnabled ? t("notifications.emailSoon") : t("notifications.emailTo", { email: settings.email })}
          </Text>
        </View>

        <View className="gap-2">
          <View className="flex-row items-end gap-3">
            <Text accessibilityRole="header" className={cn("text-foreground flex-1 text-lg font-semibold", TEXT_START)}>
              {t("notifications.events")}
            </Text>
            {channels.map((channel) => (
              <Text key={channel} className="text-muted-foreground w-14 text-center text-xs">
                {t(channel === "push" ? "notifications.push" : "notifications.email")}
              </Text>
            ))}
          </View>
          {!settings ? (
            <StateLabel>{t("common.loading")}</StateLabel>
          ) : (
            <ListGroup>
              {NOTIFICATION_KINDS.map((kind) => (
                <ListRow
                  key={kind}
                  title={t(KIND_LABEL[kind])}
                  trailing={
                    <View className="flex-row items-center gap-3">
                      {channels.map((channel) => {
                        const on = notificationOn(settings.prefs, kind, channel);
                        const disabled = channel === "email" ? !emailUsable : phone !== "on";
                        return (
                          <View key={channel} className="w-14 items-center">
                            <Switch
                              checked={on}
                              disabled={disabled}
                              accessibilityLabel={`${t(KIND_LABEL[kind])}, ${t(channel === "push" ? "notifications.push" : "notifications.email")}`}
                              onCheckedChange={(next) => toggle(kind, channel, next)}
                            />
                          </View>
                        );
                      })}
                    </View>
                  }
                />
              ))}
            </ListGroup>
          )}
        </View>

        {native && settings ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
              {t("notifications.lockTitle")}
            </Text>
            <ListGroup>
              <ListRow
                title={t("notifications.hideAmounts")}
                trailing={
                  <Switch
                    checked={settings.hideAmounts}
                    accessibilityLabel={t("notifications.hideAmounts")}
                    onCheckedChange={(next) => void save({ hideAmounts: next }, { ...settings, hideAmounts: next })}
                  />
                }
                onPress={() => void save({ hideAmounts: !settings.hideAmounts }, { ...settings, hideAmounts: !settings.hideAmounts })}
              />
            </ListGroup>
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("notifications.hideAmountsBody")}</Text>
          </View>
        ) : null}

        {native && settings ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
              {t("notifications.quietTitle")}
            </Text>
            <ListGroup>
              {QUIET_CHOICES.map((choice) => {
                const selected = quietKey(choice) === quietKey(settings.quietHours);
                return (
                  <ListRow
                    key={quietKey(choice)}
                    title={choice ? t("notifications.quietRange", { start: choice.start, end: choice.end }) : t("notifications.quietOff")}
                    selected={selected}
                    accessibilityRole="radio"
                    onPress={() => void save({ quietHours: choice }, { ...settings, quietHours: choice })}
                  />
                );
              })}
            </ListGroup>
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("notifications.quietBody")}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
