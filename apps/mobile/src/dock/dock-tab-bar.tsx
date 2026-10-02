// The glass dock as the tab bar (Fomo F12 / M09, in Kawase's material): Home · Chat · orb · Activity · Profile.
// The four tabs are the (tabs) routes; the orb in the centre is not a route — it opens the voice overlay over the
// live page. Given to expo-router's `Tabs` as `tabBar`, so tab state, deep links and the hardware back button
// keep working; the dock floats over the pages, which pad themselves with `useDockClearance`. The four tabs are
// announced as tabs and the orb as a button (Codex review R13); the orb slot is the voice overlay's trigger, and its
// orb steps aside while the overlay's orb is up so there is only ever one (R16). The bar follows the reading
// direction, bubble included.
import type { Tabs } from "expo-router";
import { Activity, Home, MessageCircle, UserRound } from "lucide-react-native";
import type * as React from "react";
import { View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";

import { GlassDock, type DockItem } from "@kawase/ui-native/components/glass-dock";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useOverlay } from "@/overlay/overlay-provider";
import { ORB_DOCK_SIZE } from "@/overlay/voice-overlay";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

/** What `Tabs` hands its custom tab bar (expo-router does not export the type by name). */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ORB_KEY = "voice";
const ORB_IDLE_LEVEL = 0.15;

/** Route names in the (tabs) group, in dock order; the orb sits between chat and activity. */
const TAB_ORDER = ["index", "chat", ORB_KEY, "activity", "settings"] as const;

export function DockTabBar({ state, navigation, insets }: TabBarProps) {
  const { t } = useT();
  const { mode, network } = useTheme();
  const colors = useThemeColors();
  const overlay = useOverlay();
  const { rtl } = useLocale();
  const keyboardVisible = useKeyboardState((keyboard) => keyboard.isVisible);
  const activeKey = state.routes[state.index]?.name ?? "index";
  const orbAway = overlay.shown === "voice";

  const labels: Record<string, string> = {
    index: t("home.dockHome"),
    chat: t("home.dockChat"),
    [ORB_KEY]: t("home.dockVoice"),
    activity: t("home.dockActivity"),
    settings: t("home.dockProfile"),
  };
  const icons = { index: Home, chat: MessageCircle, activity: Activity, settings: UserRound } as const;

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
      : { key, label: labels[key]!, icon: icons[key] },
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

  if (keyboardVisible) return null;
  return <GlassDock items={items} activeKey={activeKey} onPress={onPress} scheme={mode} tint={colors.glass} bottomInset={insets.bottom} rtl={rtl} />;
}
