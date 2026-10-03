// Narration as you swipe (plan §1.5, decision X19). Once the person turns it on (the speaker button beside the
// language pill; the choice persists with the other sound settings), each story panel speaks as it lands, in the
// person's language, and the story's auto-advance waits for the clip to end. A swipe cuts the clip: `cut` runs from
// the gesture's start and never re-renders (the drag stays on the UI thread); `settle` runs on release, so a page
// that settles back counts as heard and the dwell starts again. Changing the language replays the panel in the new
// language. The speaking level is a shared value, so the speaker's bars rise and fall without a React render.
import * as React from "react";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { MOTION } from "@kawase/config";

import { narrate } from "@/feedback/feedback";
import { setFeedbackPreference, useFeedbackPreferences } from "@/feedback/preferences";

import { narrationClip } from "./index";

type Heard = { key: string; whole: boolean };

export type StoryNarration = {
  /** Narration is on (the person's saved choice). */
  enabled: boolean;
  /** Auto-advance must wait: this panel's clip is due or playing. */
  holding: boolean;
  /** This panel's clip played to its end (the story then moves on after a short pause, not the full dwell). */
  heard: boolean;
  /** 0 → 1 while a clip is audible. */
  level: SharedValue<number>;
  toggle: () => void;
  /** A drag started: stop speaking now, without a render. */
  cut: () => void;
  /** The drag ended: a cut panel counts as heard. */
  settle: () => void;
};

export function useStoryNarration({
  locale,
  index,
  active,
}: {
  locale: string;
  index: number;
  /** The story is on screen and uncovered, with the app in the foreground. */
  active: boolean;
}): StoryNarration {
  const { narration: enabled } = useFeedbackPreferences();
  const source = narrationClip(locale, index);
  const key = `${locale}:${index}`;
  const [heardClip, setHeardClip] = React.useState<Heard>();
  const level = useSharedValue(0);
  const stop = React.useRef<(() => void) | undefined>(undefined);
  const speaking = React.useRef<string | undefined>(undefined);
  const cutKey = React.useRef<string | undefined>(undefined);
  const due = enabled && active && source !== undefined && heardClip?.key !== key;

  React.useEffect(() => {
    if (!due || source === undefined) return undefined;
    const quiet = () => {
      level.value = withTiming(0, { duration: MOTION.pressMs });
    };
    speaking.current = key;
    stop.current = narrate(source, {
      onStart: () => {
        level.value = withTiming(1, { duration: MOTION.pressMs });
      },
      onEnd: () => {
        speaking.current = undefined;
        quiet();
        setHeardClip({ key, whole: true });
      },
    });
    return () => {
      stop.current?.();
      stop.current = undefined;
      speaking.current = undefined;
      quiet();
    };
  }, [due, source, key, level]);

  const cut = React.useCallback(() => {
    if (!speaking.current) return;
    cutKey.current = speaking.current;
    speaking.current = undefined;
    stop.current?.();
    stop.current = undefined;
    level.value = withTiming(0, { duration: MOTION.pressMs });
  }, [level]);

  const settle = React.useCallback(() => {
    const was = cutKey.current;
    cutKey.current = undefined;
    // A cut clip counts as heard; a whole one counts as an interaction now, so the full dwell applies again.
    setHeardClip((previous) =>
      was ? { key: was, whole: false } : previous?.whole ? { key: previous.key, whole: false } : previous,
    );
  }, []);

  const toggle = React.useCallback(() => {
    // Turning it on speaks the panel on screen right away, even one heard before.
    if (!enabled) setHeardClip(undefined);
    void setFeedbackPreference("narration", !enabled).catch(() => undefined);
  }, [enabled]);

  return {
    enabled,
    holding: due,
    heard: heardClip?.key === key && heardClip.whole,
    level,
    toggle,
    cut,
    settle,
  };
}
