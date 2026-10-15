// The edge glow (Abu, 10-16: "a gradient around the side… when I click on the AI part"): while voice is on, a ring of
// light runs round the screen's edge — magenta into violet into blue, turning slowly, brighter while Kawase speaks and
// breathing while it thinks — so the person knows Kawase is with them on any page (Apple Intelligence's grammar). Skia on
// the phone (edge-glow.web.tsx draws it in CSS). Still with reduced motion; never in the way of a touch.
import { BlurMask, Canvas, RoundedRect, SweepGradient, vec } from "@shopify/react-native-skia";
import * as React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { useVoice } from "./voice-store";

/** The glow's colours, round the ring (the brand magenta first). */
export const GLOW_COLORS = ["#FA00FF", "#8B5CF6", "#3B82F6", "#22D3EE", "#FA00FF"];
const TURN_MS = 5000;
const FADE_MS = 450;
const STROKE = 7;
const BLUR = 14;
/** A modern phone's screen corner. */
const CORNER = 46;
/** One turn of the ring, in radians. */
const FULL_TURN = 6.283185307179586;
const HALF = 2;
const LEVEL = { speaking: 1, thinking: 0.85, listening: 0.6, other: 0.45 } as const;

export function EdgeGlow({ active }: { active: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotionLive();
  const phase = useVoice((voice) => voice.phase);
  const turn = useSharedValue(0);
  const shown = useSharedValue(0);

  React.useEffect(() => {
    if (!active || reduced) return cancelAnimation(turn);
    turn.value = withRepeat(withTiming(FULL_TURN, { duration: TURN_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [active, reduced, turn]);
  React.useEffect(() => {
    const level = phase === "speaking" ? LEVEL.speaking : phase === "thinking" ? LEVEL.thinking : phase === "listening" ? LEVEL.listening : LEVEL.other;
    shown.value = withTiming(active ? level : 0, { duration: FADE_MS });
  }, [active, phase, shown]);

  const centre = vec(width / HALF, height / HALF);
  const transform = useDerivedValue(() => [{ rotate: turn.value }]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <RoundedRect x={STROKE / HALF} y={STROKE / HALF} width={width - STROKE} height={height - STROKE} r={CORNER} style="stroke" strokeWidth={STROKE}>
          <SweepGradient c={centre} colors={GLOW_COLORS} origin={centre} transform={transform} />
          <BlurMask blur={BLUR} style="normal" />
        </RoundedRect>
      </Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ layer: { zIndex: 50 } });
