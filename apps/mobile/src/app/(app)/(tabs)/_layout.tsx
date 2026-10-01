// The tab pages under the glass dock: Home · Chat · Activity · Profile (settings). The dock is the tab bar; the
// overlay host (voice, fan) sits above the pages and the dock so the blur sees the live page. Pages pad their
// bottom with `useDockClearance` because the dock floats over them.
import { Tabs } from "expo-router";
import { View } from "react-native";

import { DockTabBar } from "@/dock/dock-tab-bar";
import { OverlayHost } from "@/overlay/overlay-host";
import { OverlayProvider } from "@/overlay/overlay-provider";

export default function TabsLayout() {
  return (
    <OverlayProvider>
      <View className="bg-background flex-1">
        <Tabs tabBar={(props) => <DockTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="chat" />
          <Tabs.Screen name="activity" />
          <Tabs.Screen name="settings" />
        </Tabs>
        <OverlayHost />
      </View>
    </OverlayProvider>
  );
}
