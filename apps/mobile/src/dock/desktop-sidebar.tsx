// The floating rail on a desktop window (Senryo/Mitoshi web shell, 21st.dev unlumen/sidebar-001 as the spec): the same
// destinations as the dock (Home · Markets · Chat · Activity) with the orb as "Talk to Kawase" (it opens the voice
// overlay, which rises from this row), the money actions the phone keeps in the fan, the mode capsule and the inbox in
// the header, and the person at the bottom (profile and settings). Guests get the language pill and Sign in there
// instead. 248 px wide, 88 px compact below 1280 px (icons only). It stays beside every page of the signed-in area,
// pushed pages included, so it navigates by route: inside the tabs it switches tab, from a pushed page it goes back down
// to the tabs. An action that is not available on this network is not drawn (no "Soon"); a destination never is hidden.
import { useRouter, useSegments } from "expo-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ChartCandlestick,
  HandCoins,
  Home,
  MessageCircle,
  QrCode,
  Send,
  Settings,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, useWindowDimensions, View } from "react-native";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_PRESSABLE } from "@kawase/ui-native/lib/wide";
import { tokens } from "@kawase/ui-tokens";

import { Rail, type RailRow, type RailSection } from "@/components/shell/Rail";
import { LAYOUT } from "@/components/kit/theme";
import { Orb } from "@/components/orb";
import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { NetworkPill } from "@/components/network-pill";
import { useFund } from "@/fund/fund-provider";
import { useCapability } from "@/home/use-capability";
import { useT } from "@/i18n";
import { InboxBell } from "@/inbox/inbox-bell";
import { useOverlay } from "@/overlay/overlay-provider";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme } from "@/theme/theme-provider";

const MARK = 28;
const ORB = 20;
const AVATAR = 36;
const ORB_IDLE_LEVEL = 0.15;
/** The tab pages and their paths. */
const TAB_HREFS = {
  index: "/",
  markets: "/markets",
  chat: "/chat",
  activity: "/activity",
  settings: "/settings",
} as const;
type TabKey = keyof typeof TAB_HREFS;

function isTab(key: string): key is TabKey {
  return key in TAB_HREFS;
}

export function DesktopSidebar() {
  const { t } = useT();
  const router = useRouter();
  const segments = useSegments();
  const overlay = useOverlay();
  const fund = useFund();
  const signIn = useSignIn();
  const { network } = useTheme();
  const { width } = useWindowDimensions();
  const { status, user } = useSession();
  const swapReady = useCapability("swap") === "available";
  const requestReady = useCapability("request") === "available";
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const compact = width < LAYOUT.railCompactBelow;
  const account = status === "account";
  // ["(app)", "(tabs)", "markets"] on a tab (Home has no third segment); a pushed page selects no row.
  const path = segments as readonly string[];
  const onTabs = path[1] === "(tabs)";
  const activeKey = onTabs ? (path[2] ?? "index") : "";
  const name = !account
    ? t("common.guest")
    : user?.handle
      ? `@${user.handle}`
      : (user?.email?.split("@")[0] ?? t("common.guest"));

  const go = (key: string) => {
    if (key === "voice") return overlay.open("voice");
    if (key === "fund") return fund.open();
    if (key === "send") return router.push("/send");
    if (key === "receive") return router.push("/wallet/receive");
    if (key === "swap") return swapReady ? router.push("/swap") : undefined;
    if (key === "request") return requestReady ? router.push("/request") : undefined;
    if (!isTab(key) || key === activeKey) return undefined;
    if (onTabs) router.navigate(TAB_HREFS[key]);
    else router.dismissTo(TAB_HREFS[key]);
    return undefined;
  };

  const moneyRows: RailRow[] = [
    { key: "fund", label: t("assets.addMoney"), icon: ArrowDownToLine, action: true },
    { key: "send", label: t("home.send"), icon: Send, action: true },
    { key: "receive", label: t("home.receive"), icon: QrCode, action: true },
    ...(swapReady ? [{ key: "swap", label: t("home.swap"), icon: ArrowLeftRight, action: true }] : []),
    ...(requestReady ? [{ key: "request", label: t("home.request"), icon: HandCoins, action: true }] : []),
  ];
  const sections: RailSection[] = [
    {
      key: "main",
      rows: [
        { key: "index", label: t("home.dockHome"), icon: Home },
        { key: "markets", label: t("markets.dock"), icon: ChartCandlestick },
        { key: "chat", label: t("home.dockChat"), icon: MessageCircle },
        { key: "activity", label: t("home.dockActivity"), icon: Activity },
        {
          key: "voice",
          label: t("home.dockVoice"),
          action: true,
          slotRef: overlay.voiceTrigger,
          render: () => (
            <View style={{ width: ORB, height: ORB, opacity: overlay.shown === "voice" ? 0 : 1 }}>
              <Orb
                colors={tokens.orb[network]}
                level={ORB_IDLE_LEVEL}
                paused={overlay.shown === "voice"}
                className="size-full"
              />
            </View>
          ),
        },
      ],
    },
    { key: "money", label: t("home.moveMoney"), rows: moneyRows },
  ];

  return (
    <>
      <Rail
        label={t("home.navigation")}
        sections={sections}
        activeKey={activeKey}
        onPress={go}
        compact={compact}
        header={
          <>
            <View className="flex-row items-center gap-2.5 px-1">
              <KawaseMark size={MARK} />
              {compact ? null : <Text className="font-display text-foreground text-lg font-bold">Kawase</Text>}
            </View>
            <View className={cn("gap-2", compact ? "items-center" : "flex-row items-center justify-between")}>
              <NetworkPill compact={compact} />
              {!compact && account ? <InboxBell /> : null}
              {!account && !compact ? <LanguagePill onPress={() => setLanguageOpen(true)} /> : null}
            </View>
            {compact && account ? <InboxBell /> : null}
          </>
        }
        footer={
          <>
            {!account && !compact ? (
              <Button size="sm" onPress={signIn.open}>
                <Text>{t("signIn.title")}</Text>
              </Button>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${t("home.dockProfile")}`}
              accessibilityState={{ selected: activeKey === "settings" }}
              onPress={() => go("settings")}
              className={cn(
                "flex-row items-center gap-3 rounded-xl px-2 py-2",
                activeKey === "settings" ? "bg-secondary" : "active:bg-muted",
                WEB_PRESSABLE,
              )}
            >
              <DefaultAvatar seed={user?.id ?? "guest"} size={AVATAR} />
              {compact ? null : (
                <>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
                      {t("home.dockProfile")}
                    </Text>
                  </View>
                  <Icon as={Settings} className="text-muted-foreground size-4" />
                </>
              )}
            </Pressable>
          </>
        }
      />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </>
  );
}
