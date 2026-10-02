// Settings → Account → Devices (cards/access.md): this device and the others (name, system, app version, last
// active). "Sign out" on another device revokes its Kawase sessions and deletes its Turnkey session key; "Sign out
// everywhere else" does it for all of them (lost phone: then Pause all from Wallet & limits). This device signs out
// the way Settings does.
import * as Application from "expo-application";
import * as Device from "expo-device";
import { useFocusEffect } from "expo-router";
import { Laptop, Smartphone } from "lucide-react-native";
import * as React from "react";
import { RefreshControl, View } from "react-native";
import { toast } from "sonner-native";

import type { DeviceView } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useAccountMethods } from "@/account/use-account-methods";
import { useLeave } from "@/account/use-leave";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const SKELETON_HEIGHT = 120;
const PLATFORM_NAMES = { ios: "iOS", android: "Android", web: "Web", desktop: "Desktop" } as const;

export function DevicesScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const account = useAccountMethods();
  const leave = useLeave();
  const [list, setList] = React.useState<DeviceView[]>();
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState<string>();
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      // This device says its own name first, so it never shows as nameless.
      await api.account.touchDevice({ ...(Device.deviceName ? { name: Device.deviceName } : {}), ...(Application.nativeApplicationVersion ? { appVersion: Application.nativeApplicationVersion } : {}) }).catch(() => undefined);
      setList((await api.account.devices()).devices);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const when = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  const signOut = async (device: DeviceView) => {
    if (device.current) {
      await leave();
      return;
    }
    setBusy(device.id);
    try {
      const { turnkeyPublicKey } = await api.account.signOutDevice(device.id);
      // Its Turnkey session key goes too, so that phone can't sign anything even with the app still open.
      await account.deleteSessionKeys(turnkeyPublicKey ? [turnkeyPublicKey] : []).catch(() => 0);
      toast(t("devices.signedOut", { name: device.name ?? PLATFORM_NAMES[device.platform] }));
      await load();
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(undefined);
    }
  };

  const everywhere = async () => {
    setBusy("all");
    try {
      const { turnkeyPublicKeys } = await api.account.signOutEverywhere();
      await account.deleteSessionKeys(turnkeyPublicKeys).catch(() => 0);
      toast(t("devices.signedOutEverywhere"));
      await load();
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(undefined);
    }
  };

  const others = list?.filter((device) => !device.current && device.signedIn) ?? [];
  return (
    <Page
      title={t("devices.title")}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {failed && !list ? (
        <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
          <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("devices.failed")}</Text>
          <Button size="sm" variant="secondary" onPress={() => void load()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : !list ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : (
        <>
          <Section title={t("devices.signedIn")}>
            <ListGroup>
              {list
                .filter((device) => device.signedIn || device.current)
                .map((device) => (
                  <ListRow
                    key={device.id}
                    leading={<Icon as={device.platform === "web" || device.platform === "desktop" ? Laptop : Smartphone} className="text-muted-foreground size-5" />}
                    title={`${device.name ?? PLATFORM_NAMES[device.platform]}${device.current ? ` · ${t("devices.thisDevice")}` : ""}`}
                    subtitle={`${PLATFORM_NAMES[device.platform]}${device.appVersion ? ` ${device.appVersion}` : ""} · ${t("devices.lastActive", { time: when(device.lastSeenAt) })}`}
                    trailing={<Text className="text-destructive text-sm font-semibold">{busy === device.id ? t("common.loading") : t("devices.signOut")}</Text>}
                    {...(busy ? {} : { onPress: () => void signOut(device) })}
                  />
                ))}
            </ListGroup>
          </Section>
          {others.length > 0 ? (
            <View className="gap-2">
              <Button variant="secondary" disabled={Boolean(busy)} onPress={() => void everywhere()}>
                <Text className="text-destructive">{busy === "all" ? t("common.loading") : t("devices.signOutEverywhere")}</Text>
              </Button>
              <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("devices.lostPhone")}</Text>
            </View>
          ) : null}
        </>
      )}
    </Page>
  );
}
