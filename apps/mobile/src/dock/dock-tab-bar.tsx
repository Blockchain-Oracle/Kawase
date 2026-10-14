// The glass dock as the tab bar (decision 1): Home · Markets · centre · Activity · Settings, icons only. The four tabs
// are the (tabs) routes; the centre is not a route: a tap opens the + fan (Send · Receive · Add money · Swap · Bridge),
// a hold opens the voice orb, which rises from it. Chat is not in the dock: Home's composer and feed open it as a page.
// Given to expo-router's `Tabs` as `tabBar`, so tab state, deep links and the hardware back button keep working; the
// dock floats over the pages, which pad themselves with `useDockClearance`. It hides under every sheet (the dock
// context) and while the keyboard is up, and stays up under its own fan (the × closes it).
import type { Tabs } from "expo-router";
import type * as React from "react";

import { Activity, Home, LineChart, Settings } from "@/components/kit/icons";
import { Dock, type DockItem } from "@/components/shell/Dock";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";

import { CentreGlyph } from "./centre-button";

/** What `Tabs` hands its custom tab bar (expo-router does not export the type by name). */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

export const CENTRE_KEY = "centre";

/** Route names in the (tabs) group, in dock order, with the centre between Markets and Activity. */
const TAB_ORDER = ["index", "markets", CENTRE_KEY, "activity", "settings"] as const;
const ICONS = { index: Home, markets: LineChart, activity: Activity, settings: Settings } as const;

export function DockTabBar({ state, navigation }: TabBarProps) {
  const { t } = useT();
  const overlay = useOverlay();
  const activeKey = state.routes[state.index]?.name ?? "index";
  const fanOpen = overlay.current === "fan";

  const labels: Record<(typeof TAB_ORDER)[number], string> = {
    index: t("shell.dock.home"),
    markets: t("shell.dock.markets"),
    [CENTRE_KEY]: t("shell.dock.actions"),
    activity: t("shell.dock.activity"),
    settings: t("shell.dock.settings"),
  };

  const items: DockItem[] = TAB_ORDER.map((key) =>
    key === CENTRE_KEY
      ? {
          key,
          label: fanOpen ? t("shell.fan.close") : labels[key],
          action: true,
          expanded: fanOpen,
          slotRef: overlay.voiceTrigger,
          hold: { label: t("shell.dock.voice"), run: () => overlay.open("voice") },
          render: () => <CentreGlyph open={fanOpen} away={overlay.shown === "voice"} />,
        }
      : { key, label: labels[key], icon: ICONS[key] },
  );

  const onPress = (key: string) => {
    if (key === CENTRE_KEY) {
      overlay.toggle("fan");
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
