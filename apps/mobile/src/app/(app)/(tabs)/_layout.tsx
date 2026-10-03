// The tab pages under the glass dock: Home · Markets · Chat · Activity; Settings is a tab reached from the header avatar. The dock is the tab bar; the
// overlay host (voice, fan) sits above the pages and the dock so the blur sees the live page, and while an overlay
// is open the pages and the dock are hidden from assistive tech (review R13). Pages pad their bottom with
// `useDockClearance` because the dock floats over them. The overlay state itself is the signed-in area's (its
// layout). On a desktop window (Stage 13) the sidebar beside every page replaces the dock and that layout hosts the
// overlays, so the tabs are only the pages.
import { Tabs } from "expo-router";
import { View } from "react-native";

import { useWide } from "@kawase/ui-native/lib/wide";

import { DockTabBar } from "@/dock/dock-tab-bar";
import { OverlayHost } from "@/overlay/overlay-host";
import { OverlayUnderlay } from "@/overlay/overlay-provider";

export default function TabsLayout() {
  const wide = useWide();
  return (
    <View className="bg-background flex-1">
      <OverlayUnderlay className="flex-1">
        <Tabs tabBar={(props) => (wide ? null : <DockTabBar {...props} />)} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="markets" />
          <Tabs.Screen name="chat" />
          <Tabs.Screen name="activity" />
          <Tabs.Screen name="settings" />
        </Tabs>
      </OverlayUnderlay>
      {wide ? null : <OverlayHost />}
    </View>
  );
}
