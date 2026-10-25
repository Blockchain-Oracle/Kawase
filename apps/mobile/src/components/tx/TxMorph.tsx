/**
 * The action you just took confirms in place: once it lands, the CTA block morphs into its receipt. The CTA fades out
 * (160 ms), the receipt fades in with a small rise (220 ms, 60 ms late), and on the web the box eases from one height to
 * the other (240 ms, a layout transition). Under Reduce Motion it is a 100 ms crossfade, no travel. One host can wrap a
 * whole compose body the same way TxCta wraps its own plate.
 *
 * The receipt's arrival runs on a shared value, never a layout animation. On the phone (Reanimated 4.5, Fabric) the
 * receipt's entering animation inside this box's layout transition stayed on its first frame, at opacity 0: every
 * confirmed buy and sell drew a blank page under the header (Abu, 10-25). A value the receipt animates itself always
 * reaches 1.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { EASE, STAGGER_RISE } from "../kit/theme";

const LEAVE_MS = 160;
const ENTER_MS = 220;
const ENTER_DELAY_MS = 60;
const BOX_MS = 240;
const CROSSFADE_MS = 100;
const HALF = 2;
const RISE = STAGGER_RISE / HALF;

type Phase = "from" | "leaving" | "to";

export function TxMorph({ morphed, receipt, children }: { morphed: boolean; receipt: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(morphed ? "to" : "from");
  const fade = useSharedValue(1);

  // The direction: forward fades the CTA out first; back (another action) is an instant swap.
  if (morphed && phase === "from") setPhase(reduce ? "to" : "leaving");
  else if (!morphed && phase !== "from") setPhase("from");

  useEffect(() => {
    if (phase !== "leaving") {
      fade.set(1);
      return;
    }
    fade.set(withTiming(0, { duration: LEAVE_MS, easing: EASE }));
    const timer = setTimeout(() => setPhase("to"), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [phase, fade]);

  const leaving = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <Animated.View layout={reduce || Platform.OS !== "web" ? undefined : LinearTransition.duration(BOX_MS).easing(EASE)} style={styles.box}>
      {phase !== "to" ? (
        <Animated.View style={leaving} pointerEvents={phase === "leaving" ? "none" : "auto"}>
          {children}
        </Animated.View>
      ) : (
        <TxArrive>{receipt}</TxArrive>
      )}
    </Animated.View>
  );
}

/** A receipt fading up into place, driven by its own value from 0 to 1 (also a ticket's receipt shown in its body). */
export function TxArrive({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(reduce ? withTiming(1, { duration: CROSSFADE_MS }) : withDelay(ENTER_DELAY_MS, withTiming(1, { duration: ENTER_MS, easing: EASE })));
  }, [reduce, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: reduce ? 0 : (1 - shown.get()) * RISE }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ box: { alignSelf: "stretch", overflow: "hidden" } });
