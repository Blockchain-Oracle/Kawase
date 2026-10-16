// The neon (Abu, 10-16: "not outside of the app… around where the agent is talking… it glows with" the voice): a ring of
// light round the box it fills — magenta through violet into cyan, turning slowly — a bright core line over a tight glow,
// breathing with the voice's live level. The full view draws it round the conversation and the island round itself.
// Skia on the phone (neon-ring.web.tsx draws it in CSS). Still with reduced motion; never in the way of a touch.
import { BlurMask, Canvas, RoundedRect, SweepGradient, vec } from "@shopify/react-native-skia";
import * as React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";

import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { NEON_COLORS, neonOpacity } from "./neon-shared";

const TURN_MS = 6000;
/** One turn, in radians. */
const FULL_TURN = 6.283185307179586;
const HALF = 2;
/** The core line, the glow under it, and the faint halo: widths and blurs in points. */
const CORE = { stroke: 1.5, blur: 0 } as const;
const GLOW = { stroke: 4, blur: 5 } as const;
const HALO = { stroke: 10, blur: 12, opacity: 0.45 } as const;
/** Room round the box for the halo to spread into. */
const BLEED = 14;

export type NeonRingProps = {
  /** How bright it sits at rest (0–1): the phase's weight. */
  intensity: number;
  /** The live voice level (the orb's), which the neon breathes with. */
  level: SharedValue<number>;
  radius: number;
  /** Where it sits; it fills this box (absolutely positioned by the caller or by `style`). */
  style?: StyleProp<ViewStyle>;
};

export function NeonRing({ intensity, level, radius, style }: NeonRingProps) {
  const reduced = useReducedMotionLive();
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const turn = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return cancelAnimation(turn);
    turn.value = withRepeat(withTiming(FULL_TURN, { duration: TURN_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const breathe = useAnimatedStyle(() => ({ opacity: neonOpacity(intensity, level.value) }));
  const onLayout = (event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });

  const width = (size?.width ?? 0) + BLEED * HALF;
  const height = (size?.height ?? 0) + BLEED * HALF;
  const centre = vec(width / HALF, height / HALF);
  const transform = useDerivedValue(() => [{ rotate: turn.value }]);
  const ring = (stroke: number, blur: number, opacity = 1) => (
    <RoundedRect x={BLEED} y={BLEED} width={width - BLEED * HALF} height={height - BLEED * HALF} r={radius} style="stroke" strokeWidth={stroke} opacity={opacity}>
      <SweepGradient c={centre} colors={NEON_COLORS} origin={centre} transform={transform} />
      {blur > 0 ? <BlurMask blur={blur} style="normal" /> : null}
    </RoundedRect>
  );

  return (
    <View pointerEvents="none" onLayout={onLayout} style={[{ position: "absolute" }, style]}>
      {size ? (
        <Animated.View style={[{ position: "absolute", left: -BLEED, top: -BLEED, width, height }, breathe]}>
          <Canvas style={{ width, height }}>
            {ring(HALO.stroke, HALO.blur, HALO.opacity)}
            {ring(GLOW.stroke, GLOW.blur)}
            {ring(CORE.stroke, CORE.blur)}
          </Canvas>
        </Animated.View>
      ) : null}
    </View>
  );
}
