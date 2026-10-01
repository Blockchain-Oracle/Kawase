// The silver flag with 為替: "you're all set" (Solflare S13/M18's cloth, in Kawase's material). The cloth waves
// once when `wave` flips true — the path morphs between two curves and the highlight sweeps across — then rests.
// With reduced motion it rests from the start.
import { MOTION } from "@kawase/config";
import * as React from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { G, Path, Rect } from "react-native-svg";

import { KawaseGlyphs } from "./kawase-glyphs";
import { SILVER, StippleDefs } from "./stipple";

export const FLAG_VIEWBOX = { width: 240, height: 200 };
const POLE = { x: 28, y: 14, width: 6, height: 176, radius: 3 };
// Two cloth shapes: at rest and mid-wave. Same point count so the path morphs cleanly.
const CLOTH_REST = "M34 22 C 90 8, 150 36, 214 20 L 214 122 C 150 138, 90 110, 34 124 Z";
const CLOTH_WAVE = "M34 22 C 90 40, 150 0, 214 26 L 214 128 C 150 108, 90 146, 34 124 Z";
const GLYPH_SIZE = 44;
const GLYPH_GAP = 6;
const GLYPH_X = 78;
const GLYPH_Y = 50;
const HALF_WAVE_MS = MOTION.flagWaveMs / 2;

type FlagProps = {
  width?: number;
  id?: string;
  /** Flip to true to play the single wave. */
  wave?: boolean;
};

const DEFAULT_WIDTH = 200;

/** One still of the flag: the pole, the cloth in one of its two shapes, and the stamped 為替. */
function FlagLayer({ width, height, id, cloth }: { width: number; height: number; id: string; cloth: string }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${FLAG_VIEWBOX.width} ${FLAG_VIEWBOX.height}`}>
      <StippleDefs id={id} palette={SILVER} lightAngle={150} box={{ x: 0, y: 0, width: FLAG_VIEWBOX.width, height: FLAG_VIEWBOX.height }} />
      <Rect x={POLE.x} y={POLE.y} width={POLE.width} height={POLE.height} rx={POLE.radius} fill={`url(#${id}-metal)`} />
      <G>
        <Path d={cloth} fill={`url(#${id}-metal)`} />
        <Path d={cloth} fill={`url(#${id}-dots)`} mask={`url(#${id}-shade)`} />
        <KawaseGlyphs size={GLYPH_SIZE} gap={GLYPH_GAP} x={GLYPH_X} y={GLYPH_Y} fill={SILVER.deep} relief={{ color: SILVER.glint, dx: 1.2, dy: 1.2, opacity: 0.6 }} />
      </G>
    </Svg>
  );
}

export function Flag({ width = DEFAULT_WIDTH, id = "flag", wave = false }: FlagProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const height = (width * FLAG_VIEWBOX.height) / FLAG_VIEWBOX.width;

  React.useEffect(() => {
    if (!wave || reduced) return;
    progress.value = withSequence(
      withTiming(1, { duration: HALF_WAVE_MS, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: HALF_WAVE_MS, easing: Easing.inOut(Easing.sin) }),
    );
  }, [wave, reduced, progress]);

  // The wave cross-fades the resting cloth into the waving one and back. Opacity lives on plain views (animated
  // SVG props did not apply inside a page's entering animation), so the flag shows in every context.
  const restStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const waveStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={{ width, height }}>
      <Animated.View style={[{ position: "absolute", inset: 0 }, restStyle]}>
        <FlagLayer width={width} height={height} id={`${id}-rest`} cloth={CLOTH_REST} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", inset: 0 }, waveStyle]}>
        <FlagLayer width={width} height={height} id={`${id}-wave`} cloth={CLOTH_WAVE} />
      </Animated.View>
    </View>
  );
}

export type { FlagProps };
