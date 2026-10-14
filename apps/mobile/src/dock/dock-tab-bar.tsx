// The glass dock as the tab bar (Senryo's Dock, kept as Kawase's current tab set for now: Home · Markets · orb · Chat ·
// Activity; the tab change to Home · Markets · centre · Activity · Settings is Stage 3). The four tabs are the (tabs)
// routes; the orb in the centre is not a route, it opens the voice overlay over the live page. Given to expo-router's
// `Tabs` as `tabBar`, so tab state, deep links and the hardware back button keep working; the dock floats over the pages,
// which pad themselves with `useDockClearance`. The dock hides under every sheet (the dock context) and while the keyboard
// is up. The orb slot is the voice overlay's trigger, and its orb steps aside while the overlay's orb is up so there is
// only ever one.
import type { Tabs } from "expo-router";
import type * as React from "react";
import { View } from "react-native";

import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { Activity, Home, LineChart, MessageCircle } from "@/components/kit/icons";
import { Dock, type DockItem } from "@/components/shell/Dock";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { ORB_DOCK_SIZE } from "@/overlay/voice-overlay";
import { useTheme } from "@/theme/theme-provider";

/** What `Tabs` hands its custom tab bar (expo-router does not export the type by name). */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ORB_KEY = "voice";
const ORB_IDLE_LEVEL = 0.15;

/** Route names in the (tabs) group, in dock order; the orb sits in the centre. Settings is a tab without a slot. */
const TAB_ORDER = ["index", "markets", ORB_KEY, "chat", "activity"] as const;
const ICONS = { index: Home, markets: LineChart, chat: MessageCircle, activity: Activity } as const;

export function DockTabBar({ state, navigation }: TabBarProps) {
  const { t } = useT();
  const { network } = useTheme();
  const overlay = useOverlay();
  const activeKey = state.routes[state.index]?.name ?? "index";
  const orbAway = overlay.shown === "voice";

  const labels: Record<string, string> = {
    index: t("home.dockHome"),
    markets: t("markets.dock"),
    chat: t("home.dockChat"),
    [ORB_KEY]: t("home.dockVoice"),
    activity: t("home.dockActivity"),
  };

  const items: DockItem[] = TAB_ORDER.map((key) =>
    key === ORB_KEY
      ? {
          key,
          label: labels[key]!,
          action: true,
          slotRef: overlay.voiceTrigger,
          render: () => (
            <View style={{ width: ORB_DOCK_SIZE, height: ORB_DOCK_SIZE, opacity: orbAway ? 0 : 1 }}>
              <Orb colors={tokens.orb[network]} level={ORB_IDLE_LEVEL} paused={orbAway} className="size-full" />
            </View>
          ),
        }
      : { key, label: labels[key]!, icon: ICONS[key] },
  );

  const onPress = (key: string) => {
    if (key === ORB_KEY) {
      overlay.open("voice");
      return;
    }
    const route = state.routes.find((candidate) => candidate.name === key);
    if (!route) return;
    // The same handshake as the default tab bar, so screens can veto or observe the press.
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (key !== activeKey && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  return <Dock items={items} activeKey={activeKey} onPress={onPress} />;
}
