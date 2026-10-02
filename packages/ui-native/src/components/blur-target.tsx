// Android blur (expo-blur, SDK 57; docs.expo.dev/versions/latest/sdk/blur-view, read 2026-10-01): a BlurView blurs
// only a `BlurTargetView` it is given, and must sit outside it. The overlay host is a sibling of the tab pages, so
// the pages are wrapped in a target and the overlays (voice, the fan) blur them. Anything inside the target (the dock
// rides inside the tab navigator) gets no target and keeps the tinted glass. iOS and the web blur what is behind
// them and ignore all of this.
import { BlurTargetView, type BlurMethod } from "expo-blur";
import * as React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

type Target = React.RefObject<View | null>;

const BlurTargetContext = React.createContext<Target | null>(null);

/** Provides the target to the layers that may blur it (put it above both the pages and the overlays). */
function BlurTargetProvider({ target, children }: { target: Target; children: React.ReactNode }) {
  return <BlurTargetContext.Provider value={target}>{children}</BlurTargetContext.Provider>;
}

/**
 * Wraps what overlays blur. Inside it, nothing may blur it, so its children see no target. On Android the target is a
 * native view that takes no `className`, so a plain View carries the classes and accessibility props and the target
 * fills it with a style (with the classes on the target itself the pages collapsed to nothing on Android).
 */
function BlurTarget({ target, children, ...props }: ViewProps & { target: Target }) {
  return (
    <View {...props}>
      <BlurTargetView ref={target} style={styles.fill}>
        <BlurTargetContext.Provider value={null}>{children}</BlurTargetContext.Provider>
      </BlurTargetView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

/**
 * The Android props for a BlurView here: a real blur on Android 12+ when a target is in reach (RenderNode; the
 * recommended `dimezisBlurViewSdk31Plus`), otherwise the tinted fallback.
 */
function useAndroidBlur(): { blurMethod?: BlurMethod; blurTarget?: Target } {
  const target = React.useContext(BlurTargetContext);
  if (Platform.OS !== "android") return {};
  return target ? { blurMethod: "dimezisBlurViewSdk31Plus", blurTarget: target } : { blurMethod: "none" };
}

export { BlurTarget, BlurTargetProvider, useAndroidBlur };
