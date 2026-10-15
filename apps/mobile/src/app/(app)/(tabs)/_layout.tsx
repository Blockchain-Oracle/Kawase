// The tab pages under the glass dock (decision 1): Home · Markets · Activity · Settings, with the dock's centre (the +
// fan on a tap, the voice orb on a hold) between Markets and Activity. Chat is a page of its own (`(app)/chat.tsx`),
// opened from Home's composer and feed. The dock is the tab bar; the overlay host (the + fan) sits above the pages
// and the dock so the blur sees the live page (voice sits higher still, in the signed-in layout), and while an overlay is open the pages and the dock are hidden from
// assistive tech. Pages pad their bottom with `useDockClearance` because the dock floats over them. On a desktop window
// the rail beside every page replaces the dock and the signed-in layout hosts the overlays, so the tabs are only pages.
//
// Two hosts of the first minute live here, because the tab shell is what a person lands on after signing in: the
// money action a guest started before signing in opens by itself (DeferredActionHost), and the notifications ask comes
// last, after the first agent run (NotificationsAsk).
import { Tabs } from "expo-router";
import { View } from "react-native";

import { useWide } from "@kawase/ui-native/lib/wide";

import { DockTabBar } from "@/dock/dock-tab-bar";
import { DeferredActionHost } from "@/onboarding/account-gate";
import { NotificationsAsk } from "@/onboarding/notifications-ask";
import { OverlayHost } from "@/overlay/overlay-host";
import { OverlayUnderlay } from "@/overlay/overlay-provider";

export default function TabsLayout() {
  const wide = useWide();
  return (
    <View className="bg-background flex-1">
      <OverlayUnderlay className="flex-1">
        <Tabs
          tabBar={(props) => (wide ? null : <DockTabBar {...props} />)}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="markets" />
          <Tabs.Screen name="activity" />
          <Tabs.Screen name="settings" />
        </Tabs>
      </OverlayUnderlay>
      {wide ? null : <OverlayHost />}
      <DeferredActionHost />
      <NotificationsAsk />
    </View>
  );
}
