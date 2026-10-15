/**
 * The action you just took confirms in place: once it lands, the CTA block morphs into its receipt. The CTA fades out
 * (160 ms), the receipt fades in with a small rise (220 ms, 60 ms late), and the box eases from one height to the other
 * (240 ms, a layout transition). Under Reduce Motion it is a 100 ms crossfade, no travel. One host can wrap a whole
 * compose body the same way TxCta wraps its own plate.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { EASE, STAGGER_RISE } from "../kit/theme";

const LEAVE_MS = 160;
const ENTER_MS = 220;
const ENTER_DELAY_MS = 60;
const BOX_MS = 240;
const CROSSFADE_MS = 100;
const HALF = 2;

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
    <Animated.View layout={reduce ? undefined : LinearTransition.duration(BOX_MS).easing(EASE)} style={styles.box}>
      {phase !== "to" ? (
        <Animated.View style={leaving} pointerEvents={phase === "leaving" ? "none" : "auto"}>
          {children}
        </Animated.View>
      ) : (
        <Animated.View
          entering={
            reduce
              ? FadeIn.duration(CROSSFADE_MS)
              : Platform.OS === "web"
                ? // A custom entering animation is pinned absolute on the web (see SheetRow): the predefined one isn't.
                  FadeInDown.duration(ENTER_MS).delay(ENTER_DELAY_MS)
                : FadeInDown.duration(ENTER_MS)
                    .delay(ENTER_DELAY_MS)
                    .withInitialValues({ transform: [{ translateY: STAGGER_RISE / HALF }] })
          }
        >
          {receipt}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ box: { alignSelf: "stretch", overflow: "hidden" } });
