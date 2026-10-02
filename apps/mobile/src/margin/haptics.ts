// The trading controls' touch feedback (the ruler's tick per step and snap at the ends; the slide arming,
// committing and cancelling), honouring the person's haptics setting. Outcome feedback (the confirmed sound and
// haptic) stays with confirmedFeedback, once per confirmed result.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import type { SlideHaptic } from "@kawase/ui-native/components/slide-to-confirm";

import { feedbackPreferences } from "@/feedback/preferences";

const allowed = () => Platform.OS !== "web" && feedbackPreferences().haptics;

export function rulerHaptic(kind: "tick" | "snap") {
  if (!allowed()) return;
  void (kind === "tick" ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)).catch(() => undefined);
}

export function slideHaptic(kind: SlideHaptic) {
  if (!allowed()) return;
  const run =
    kind === "arm"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : kind === "commit"
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  void run.catch(() => undefined);
}
