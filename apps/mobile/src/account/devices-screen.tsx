// Settings → Sign-in & security → Devices (cards/access.md) on the Senryo kit: this device first, then every other one
// signed in (its name, system and app version, where and when it was last active). Signing one out asks once in a
// sheet and ends its Kawase sessions at once (with Turnkey, its session key goes too); "Sign out every other device"
// does it for all of them, for a lost phone. This device signs out the way Settings does.
// States: a list-shaped skeleton on the first read; the last list kept (and marked stale) when a refresh fails or the
// phone is offline; an error with Retry only when nothing was ever read; "only this device" when nobody else is in.
import * as Application from "expo-application";
import * as Device from "expo-device";
import { useFocusEffect } from "expo-router";
import { Laptop, Monitor, Smartphone } from "lucide-react-native";
import * as React from "react";
import { RefreshControl, StyleSheet, View } from "react-native";

import type { DeviceView } from "@kawase/api-client";

import { Button, EmptyState, ErrorState, Icon, ListRow, LoadingState, RADIUS, SIZE, SPACE, StaleTick, useHeldLoading, useTheme } from "@/components/kit";
import { diagnose, type Diagnosis } from "@/components/kit/diagnosis";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { notify } from "@/components/toast/notify";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";
import { readCache, writeCache } from "@/session/cache";
import { useSession } from "@/session/session-provider";

import { Group, GroupNote, Page } from "./kit-page";
import { useAccountMethods } from "./use-account-methods";
import { useLeave } from "./use-leave";

const PLATFORM_NAMES = { ios: "iOS", android: "Android", web: "Web", desktop: "Desktop" } as const;
const PLATFORM_ICON = { ios: Smartphone, android: Smartphone, web: Laptop, desktop: Monitor } as const;

type Read = { list?: DeviceView[]; at?: number; error?: Diagnosis; loading: boolean };
type Ask = { kind: "one"; device: DeviceView } | { kind: "others"; count: number };

export function DevicesScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const { user } = useSession();
  const cacheKey = `devices.${user?.id ?? "none"}`;
  const [read, setRead] = React.useState<Read>({ loading: true });
  const [refreshing, setRefreshing] = React.useState(false);
  const [ask, setAsk] = React.useState<Ask>();

  // The last list this person saw, shown at once while the network answers (and kept, stale, if it does not).
  React.useEffect(() => {
    void readCache<DeviceView[]>(cacheKey).then((cached) => {
      if (cached) setRead((current) => (current.list ? current : { ...current, list: cached.value, at: cached.at }));
    });
  }, [cacheKey]);

  const load = React.useCallback(async () => {
    setRead((current) => ({ ...current, loading: true }));
    try {
      // This device says its own name first, so it never shows as nameless.
      await api.account
        .touchDevice({
          ...(Device.deviceName ? { name: Device.deviceName } : {}),
          ...(Application.nativeApplicationVersion ? { appVersion: Application.nativeApplicationVersion } : {}),
        })
        .catch(() => undefined);
      const { devices } = await api.account.devices();
      setRead({ list: devices, at: Date.now(), loading: false });
      void writeCache(cacheKey, devices);
    } catch (error) {
      setRead((current) => ({ ...current, error: diagnose(error), loading: false }));
    }
  }, [cacheKey]);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );
  const skeleton = useHeldLoading(read.loading && !read.list);

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const nameOf = (device: DeviceView) => device.name ?? PLATFORM_NAMES[device.platform];

  const signedIn = (read.list ?? []).filter((device) => device.signedIn || device.current);
  const current = signedIn.find((device) => device.current);
  const others = signedIn.filter((device) => !device.current);

  const row = (device: DeviceView) => (
    <ListRow
      key={device.id}
      leading={<PlatformGlyph device={device} />}
      title={device.current ? `${nameOf(device)} · ${t("devices.thisDevice")}` : nameOf(device)}
      detail={[
        `${PLATFORM_NAMES[device.platform]}${device.appVersion ? ` ${device.appVersion}` : ""}`,
        device.location,
        device.current ? null : t("devices.lastActive", { time: when(device.lastSeenAt) }),
      ]
        .filter(Boolean)
        .join(" · ")}
      trailing={<Button label={t("devices.signOut")} size="sm" variant="ghost" block={false} onPress={() => setAsk({ kind: "one", device })} />}
    />
  );

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
      {!read.list ? (
        read.error && !read.loading ? (
          <ErrorState diagnosis={read.error} retry={() => void load()} stillWorks={t("devices.stillWorks")} />
        ) : skeleton ? (
          <LoadingState shape="list" label={t("devices.loading")} />
        ) : null
      ) : (
        <>
          <View style={styles.block}>
            <Group label={t("devices.signedIn")}>
              {current ? row(current) : null}
              {others.map(row)}
            </Group>
            {read.error && read.at ? <StaleTick asOf={read.at} reason={read.error.kind === "offline" ? "offline" : "refresh-failed"} /> : null}
          </View>
          {others.length === 0 ? (
            <EmptyState size="inline" why={t("devices.onlyThis")} detail={t("devices.onlyThisDetail")} />
          ) : (
            <View style={styles.block}>
              <Button label={t("devices.signOutEverywhere")} variant="destructive" onPress={() => setAsk({ kind: "others", count: others.length })} />
              <GroupNote>{t("devices.lostPhone")}</GroupNote>
            </View>
          )}
        </>
      )}
      {ask ? <SignOutSheet ask={ask} name={ask.kind === "one" ? nameOf(ask.device) : ""} onClose={() => setAsk(undefined)} onDone={() => void load()} /> : null}
    </Page>
  );
}

function PlatformGlyph({ device }: { device: DeviceView }) {
  const { color } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: device.current ? color.selectedRow : color.raised2 }]}>
      <Icon icon={PLATFORM_ICON[device.platform]} size={SIZE.iconSm} tint={color.ink} />
    </View>
  );
}

/** One question before a device leaves: who, what happens (the wallet and the money stay), then the action. */
function SignOutSheet({ ask, name, onClose, onDone }: { ask: Ask; name: string; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const title =
    ask.kind === "others"
      ? t("devices.signOutEverywhereTitle")
      : ask.device.current
        ? t("devices.signOutThisTitle")
        : t("devices.signOutTitle", { name });
  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: title })}>
      <SheetHeading title={title} body={t("devices.signOutBody")} />
      <SignOutActions ask={ask} name={name} onDone={onDone} />
    </Sheet>
  );
}

function SignOutActions({ ask, name, onDone }: { ask: Ask; name: string; onDone: () => void }) {
  const { t } = useT();
  const close = useSheetClose();
  const account = useAccountMethods();
  const leave = useLeave();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (ask.kind === "one" && ask.device.current) {
        await leave();
        return;
      }
      if (ask.kind === "one") {
        const { turnkeyPublicKey } = await api.account.signOutDevice(ask.device.id);
        // With Turnkey its session key goes too, so that phone can't sign anything even with the app still open.
        await account.deleteSessionKeys(turnkeyPublicKey ? [turnkeyPublicKey] : []).catch(() => 0);
        notify.success(t("devices.signedOut", { name }));
      } else {
        const { turnkeyPublicKeys } = await api.account.signOutEverywhere();
        await account.deleteSessionKeys(turnkeyPublicKeys).catch(() => 0);
        notify.success(t("devices.signedOutEverywhere"));
      }
      close(onDone);
    } catch (error) {
      notify.error(diagnose(error).kind === "offline" ? t("errors.offlineAction") : t("devices.signOutFailed"));
      setBusy(false);
    }
  };
  return (
    <View style={styles.sheetActions}>
      <Button label={ask.kind === "others" ? t("devices.signOutEverywhere") : t("devices.signOut")} variant="destructive" loading={busy} onPress={() => void run()} />
      <Button label={t("common.cancel")} variant="ghost" disabled={busy} onPress={() => close()} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm },
  glyph: { width: SIZE.markRow, height: SIZE.markRow, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  sheetActions: { gap: SPACE.md, paddingTop: SPACE.md },
});
