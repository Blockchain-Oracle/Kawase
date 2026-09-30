// Ambient motion for an art object (Solflare M05's layers): a slow float and a slight rotation with its own phase,
// so several objects never move in step. Still with reduced motion. Wrap any art component in it.
import { MOTION } from "@kawase/config";
import * as React from "react";
import type { ViewStyle } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

type FloatProps = {
  children: React.ReactNode;
  /** Vertical travel in points. */
  amplitude?: number;
  /** Rotation in degrees at the extremes. */
  tilt?: number;
  /** 0–1: where in the cycle this object starts. */
  phase?: number;
  /** Cycle length in ms; defaults to the motion constant. */
  cycleMs?: number;
  style?: ViewStyle;
};

const DEFAULT_AMPLITUDE = 8;
const DEFAULT_TILT = 2;
const HALF = 0.5;

function Float({ children, amplitude = DEFAULT_AMPLITUDE, tilt = DEFAULT_TILT, phase = 0, cycleMs = MOTION.ambientCycleMs, style }: FloatProps) {
  const reduced = useReducedMotion();
  const t = useSharedValue(phase);

  React.useEffect(() => {
    if (reduced) return undefined;
    const halfCycle = cycleMs * HALF;
    // Start from the phase, then bounce between 0 and 1 forever.
    t.value = withDelay(
      0,
      withRepeat(withTiming(phase < HALF ? 1 : 0, { duration: halfCycle, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(t);
  }, [reduced, cycleMs, phase, t]);

  const animated = useAnimatedStyle(() => {
    const swing = t.value * 2 - 1;
    return { transform: [{ translateY: swing * amplitude }, { rotate: `${swing * tilt}deg` }] };
  });

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

export { Float };
export type { FloatProps };
