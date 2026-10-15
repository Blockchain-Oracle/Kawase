// The floating rail on a desktop window (Senryo/Mitoshi web shell, 21st.dev unlumen/sidebar-001 #21517 as the spec). It
// mirrors the phone's dock: Home · Markets · Activity · Settings, "Chat with Kawase" (the typed conversation; Abu,
// 10-15: voice alone was the only door to it) and "Talk to Kawase" (the voice overlay rises from that row), and under "Move money" the + fan's five actions — Send · Receive · Add money · Swap · Bridge — through the same
// account gate (a guest gets the sign-in sheet in place and the action follows it). The mode capsule and the inbox sit
// in the header, the person at the bottom (or Sign in and the language pill for a guest). 248 px wide, 88 px compact
// below 1280 px (icons only). It stays beside every page of the signed-in area, so it navigates by route: inside the
// tabs it switches tab, from a pushed page it goes back down to the tabs.
import { useRouter, useSegments } from "expo-router";
import { Activity, Home, LineChart, MessageSquareText, Settings, Store } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { tokens } from "@kawase/ui-tokens";

import { Button } from "@/components/kit/Button";
import { Icon } from "@/components/kit/icons";
import { FONT, LAYOUT, RADIUS, SIZE, SPACE, TYPE, useTheme as useKitTheme } from "@/components/kit/theme";
import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { NetworkPill } from "@/components/network-pill";
import { Orb } from "@/components/orb";
import { Rail, type RailRow, type RailSection } from "@/components/shell/Rail";
import { useT } from "@/i18n";
import { InboxBell } from "@/inbox/inbox-bell";
import { useAccountGate } from "@/onboarding/account-gate";
import { DEFERRED_VERBS } from "@/onboarding/deferred-action";
import { useFanActions } from "@/overlay/fan-actions";
import { useOverlay } from "@/overlay/overlay-provider";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme } from "@/theme/theme-provider";

const MARK = 28;
const ORB = 20;
const ORB_IDLE_LEVEL = 0.15;
/** The tab pages and their paths. */
const TAB_HREFS = {
  index: "/",
  markets: "/markets",
  activity: "/activity",
  settings: "/settings",
} as const;
type TabKey = keyof typeof TAB_HREFS;

const isTab = (key: string): key is TabKey => key in TAB_HREFS;
const isMoney = (key: string): key is (typeof DEFERRED_VERBS)[number] =>
  (DEFERRED_VERBS as readonly string[]).includes(key);

export function DesktopSidebar() {
  const { t } = useT();
  const router = useRouter();
  const segments = useSegments();
  const overlay = useOverlay();
  const gate = useAccountGate();
  const signIn = useSignIn();
  const fan = useFanActions();
  const { network } = useTheme();
  const { color } = useKitTheme();
  const { width } = useWindowDimensions();
  const { status, user } = useSession();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const compact = width < LAYOUT.railCompactBelow;
  const account = status === "account";
  // ["(app)", "(tabs)", "markets"] on a tab (Home has no third segment); a pushed page selects no row.
  const path = segments as readonly string[];
  const onTabs = path[1] === "(tabs)";
  const activeKey = onTabs ? (path[2] ?? "index") : path[1] === "chat" || path[1] === "marketplace" ? path[1] : "";
  const name = !account
    ? t("common.guest")
    : user?.handle
      ? `@${user.handle}`
      : (user?.email?.split("@")[0] ?? t("common.guest"));

  const go = (key: string) => {
    if (key === "voice") return overlay.open("voice");
    if (key === "chat") return activeKey === "chat" ? undefined : router.push("/chat");
    if (key === "marketplace") return activeKey === "marketplace" ? undefined : router.push("/marketplace");
    if (isMoney(key)) return gate(key);
    if (!isTab(key) || key === activeKey) return undefined;
    if (onTabs) router.navigate(TAB_HREFS[key]);
    else router.dismissTo(TAB_HREFS[key]);
    return undefined;
  };

  const sections: RailSection[] = [
    {
      key: "main",
      rows: [
        { key: "index", label: t("shell.dock.home"), icon: Home },
        { key: "markets", label: t("shell.dock.markets"), icon: LineChart },
        { key: "marketplace", label: t("shell.dock.marketplace"), icon: Store },
        { key: "activity", label: t("shell.dock.activity"), icon: Activity },
        { key: "settings", label: t("shell.dock.settings"), icon: Settings },
        { key: "chat", label: t("shell.dock.chat"), icon: MessageSquareText },
        {
          key: "voice",
          label: t("shell.dock.voice"),
          action: true,
          slotRef: overlay.voiceTrigger,
          render: () => (
            <View style={[styles.orb, { opacity: overlay.shown === "voice" ? 0 : 1 }]}>
              <Orb colors={tokens.orb[network]} level={ORB_IDLE_LEVEL} paused={overlay.shown === "voice"} className="size-full" />
            </View>
          ),
        },
      ],
    },
    {
      key: "money",
      label: t("shell.rail.moveMoney"),
      rows: fan.map((action): RailRow => ({ key: action.verb, label: action.label, icon: action.icon, action: true })),
    },
  ];

  return (
    <>
      <Rail
        label={t("shell.dock.navigation")}
        sections={sections}
        activeKey={activeKey}
        onPress={go}
        compact={compact}
        header={
          <>
            <View style={styles.brand}>
              <KawaseMark size={MARK} />
              {compact ? null : (
                <Text style={[TYPE.sectionTitle, { color: color.ink, fontFamily: FONT.display }]}>
                  {t("common.appName")}
                </Text>
              )}
            </View>
            <View style={compact ? styles.headerCompact : styles.headerRow}>
              <NetworkPill bare={compact} />
              {!compact && account ? <InboxBell /> : null}
              {!account && !compact ? <LanguagePill onPress={() => setLanguageOpen(true)} /> : null}
            </View>
            {compact && account ? <InboxBell /> : null}
          </>
        }
        footer={
          <>
            {!account && !compact ? <Button label={t("signIn.title")} size="sm" onPress={() => signIn.open()} /> : null}
            {account ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${t("shell.rail.profile")}`}
                accessibilityState={{ selected: activeKey === "settings" }}
                onPress={() => go("settings")}
                style={({ pressed }) => [
                  styles.person,
                  { backgroundColor: activeKey === "settings" || pressed ? color.rowPressed : color.transparent },
                ]}
              >
                <DefaultAvatar seed={user?.id ?? "guest"} size={SIZE.avatarSm + SPACE.xs} />
                {compact ? null : (
                  <View style={styles.grow}>
                    <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
                      {t("shell.rail.profile")}
                    </Text>
                  </View>
                )}
                {compact ? null : <Icon icon={Settings} size={SIZE.iconSm} tint={color.text3} />}
              </Pressable>
            ) : null}
          </>
        }
      />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  orb: { width: ORB, height: ORB },
  brand: { flexDirection: "row", alignItems: "center", gap: SPACE.sm + SPACE.xxs, paddingHorizontal: SPACE.xs },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.sm },
  headerCompact: { alignItems: "center", gap: SPACE.sm },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
  },
  grow: { flex: 1, minWidth: 0 },
});
