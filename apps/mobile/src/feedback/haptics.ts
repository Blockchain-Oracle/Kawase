// The app's haptic words (Senryo's table), the one place that talks to the Taptic Engine (expo-haptics). Call sites
// go through `fire()` so the person's haptics switch applies. iOS uses the semantic feedback generators; Android the
// system constants. Haptics are no-ops on desktop browsers. Navigation and ticks are haptics only: they never get a sound.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticEvent =
  /** A keypad digit, a chip, a segmented control: the lightest detent. */
  | "tick"
  /** A press on a plate (button down). */
  | "press"
  /** A drag snaps to a detent (a sheet settling, a ruler). */
  | "snap"
  /** A deliberate confirm (a hold completing, a slide committing). */
  | "confirm"
  /** Money arrived or a result was confirmed. */
  | "filled"
  /** A position or a flow closed. */
  | "close"
  | "warn"
  | "fail"
  | "surge"
  | "impact"
  /** The agent finished one tool call: a quiet selection tick. */
  | "agentStep"
  /** The agent finished its whole run. */
  | "agentDone";

const android = Platform.OS === "android";
const A = Haptics.AndroidHaptics;

function ios(event: HapticEvent): Promise<void> {
  switch (event) {
    case "tick":
    case "agentStep":
      return Haptics.selectionAsync();
    case "press":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case "snap":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    case "confirm":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    case "filled":
    case "agentDone":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case "warn":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case "fail":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    case "close":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case "surge":
    case "impact":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

const ANDROID: Record<HapticEvent, Haptics.AndroidHaptics> = {
  tick: A.Segment_Tick,
  press: A.Virtual_Key,
  snap: A.Gesture_End,
  confirm: A.Confirm,
  filled: A.Confirm,
  close: A.Virtual_Key,
  warn: A.Reject,
  fail: A.Reject,
  surge: A.Confirm,
  impact: A.Long_Press,
  agentStep: A.Clock_Tick,
  agentDone: A.Confirm,
};

/** Plays one haptic word; failures (Low Power Mode, Taptic off, camera active) are silent by design. */
export function playHaptic(event: HapticEvent): void {
  if (Platform.OS === "web") return;
  const run = android ? Haptics.performAndroidHapticsAsync(ANDROID[event]) : ios(event);
  run.catch(() => undefined);
}
