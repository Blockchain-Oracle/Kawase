// Whether ambient art (the orb's slow breathing) should be moving right now (Codex review R16): only while its
// screen is the one in front, the app is in the foreground, and reduced motion is off (read live, not only at
// start). Hidden work is stopped, not just covered.
import { useIsFocused } from "expo-router";
import * as React from "react";
import { AppState } from "react-native";

import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

const subscribe = (onChange: () => void) => {
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
};
const snapshot = () => AppState.currentState;

/** The app is in front (not in the background, not behind the app switcher). */
export function useAppActive(): boolean {
  const state = React.useSyncExternalStore(subscribe, snapshot);
  return state !== "background" && state !== "inactive";
}

export function useAmbientMotion(): boolean {
  const focused = useIsFocused();
  const active = useAppActive();
  const reduced = useReducedMotionLive();
  return focused && active && !reduced;
}
