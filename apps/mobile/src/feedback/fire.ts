// The one call site for feedback (Senryo's `fire`, merged into Kawase's feedback module): a haptic word, optionally with a
// sound cue. Both respect Settings → Sound and touch (the person's switches) and the phone's silent switch. The rule from
// Senryo: no sound for ticks or navigation, haptics own those; a sound is for a moment that matters (money arrived, sent,
// confirmed, failed, the agent taking a step or finishing).
//
//   fire("tick")                                          keypad digit, chip, segmented control, list row
//   fire("press")                                         a plate going down
//   fire("confirm")                                       a hold completing, a slide committing
//   fire("filled", { sound: "received", identity })       money arrived (identity keeps a remount from replaying it)
//   fire("filled", { sound: "confirmed", identity })      a confirmed result
//   fire("filled", { sound: "send", identity })           money sent
//   fire("fail", { sound: "error" })                      a failure
//   fire("agentStep", { sound: "agentStep" })             the agent finished one tool call
//   fire("agentDone", { sound: "agentDone" })             the agent finished its run
//
// Nothing here blocks or throws into a money flow: every failure is swallowed.
import { type Cue, cue, hapticFeedback } from "./feedback";
import type { HapticEvent } from "./haptics";
import { loadFeedbackPreferences } from "./preferences";

export type { HapticEvent } from "./haptics";
export type { Cue as SoundName } from "./feedback";

export type FireOptions = {
  /** A sound cue to play with the haptic. Omit for ticks and navigation. */
  sound?: Cue;
  /** A stable id for an outcome (a tx hash, an intent id): the same outcome never plays its sound twice. */
  identity?: string;
};

let warmed = false;

export function fire(event: HapticEvent, options: FireOptions = {}): void {
  if (!warmed) {
    warmed = true;
    void loadFeedbackPreferences().catch(() => {
      warmed = false;
    });
  }
  try {
    if (options.sound) {
      // The cue plays the haptic word the caller named (not its own default), and an outcome seen before stays silent.
      void cue(options.sound, options.identity, { haptic: event });
      return;
    }
    hapticFeedback(event);
  } catch {
    // Feedback is decoration; the action it accompanies never depends on it.
  }
}
