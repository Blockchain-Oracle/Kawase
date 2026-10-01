// Two things overlays and ambient art need (Codex review R13/R16). Reduced motion read live: Reanimated's
// `useReducedMotion` reports the setting at app start only, so someone who turns it on with the app open would still
// get the motion; this follows the system setting as it changes (iOS, Android, and the browser's
// prefers-reduced-motion through react-native-web). And moving focus to one element — into an overlay as it opens,
// back to its trigger as it closes: the screen reader's focus on a phone, the keyboard's on the web.
import * as React from "react";
import { AccessibilityInfo, Platform, type View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

function useReducedMotionLive(): boolean {
  const atStart = useReducedMotion();
  const [reduced, setReduced] = React.useState(atStart);
  React.useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

function focusElement(node: View | null | undefined) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as { focus?: () => void }).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

export { focusElement, useReducedMotionLive };
