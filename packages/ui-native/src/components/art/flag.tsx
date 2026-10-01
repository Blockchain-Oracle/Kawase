// The silver flag with 為替: "you're all set" (Solflare S13/M18's cloth, in Kawase's material). When `wave` flips
// true the cloth ripples once, continuously (Codex review R16: one deformation, not two shapes crossfading). The
// cloth is drawn as narrow vertical strips of the same artwork; a wave that grows away from the pole runs along
// them, each strip riding and tilting with it so neighbours meet, and the strips turned towards the light catch it,
// so the light travels with the fold. It starts and ends at rest, then stays still; with reduced motion (read live)
// it is a still from the start. Only views move — animated SVG props did not apply inside a page's entering
// animation — and each strip draws only its own slice, so the strips together cost one flag.
import { MOTION } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import * as React from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";

import { KawaseGlyphs } from "./kawase-glyphs";
import { SILVER, StippleDefs } from "./stipple";

export const FLAG_VIEWBOX = { width: 240, height: 200 };
const POLE = { x: 28, y: 14, width: 6, height: 176, radius: 3 };
const CLOTH = "M34 22 C 90 8, 150 36, 214 20 L 214 122 C 150 138, 90 110, 34 124 Z";
const CLOTH_START = 34;
const CLOTH_END = 214;
const STRIPS = 12;
const STRIP_WIDTH = (CLOTH_END - CLOTH_START) / STRIPS;
/** Each strip draws a little past its edges, so neighbours overlap and no hairline shows between them. */
const BLEED = 0.75;
const GLYPH_SIZE = 44;
const GLYPH_GAP = 6;
const GLYPH_X = 78;
const GLYPH_Y = 50;
/** The wave: its height at the free edge (viewBox units), the wavelengths across the cloth, the cycles that pass. */
const AMPLITUDE = 9;
const WAVELENGTHS = 0.9;
const CYCLES = 1.5;
/** How brightly a strip turned towards the light catches it. */
const GLINT_GAIN = 1.6;
const GLINT_MAX = 0.4;
const DEFAULT_WIDTH = 200;

type FlagProps = {
  width?: number;
  id?: string;
  /** Flip to true to play the single wave. */
  wave?: boolean;
};

/** Where the fold puts one strip at time `t` (0…1): its centre's lift and its tilt, for strip edges `from`…`to` (0 at the pole, 1 at the free edge). */
function fold(from: number, to: number, t: number) {
  "worklet";
  // Grows away from the pole (pinned) and in and out over the wave, so it starts and ends exactly at rest.
  const swell = Math.sin(Math.PI * t);
  const lift = (u: number) => AMPLITUDE * u * swell * Math.sin(2 * Math.PI * (WAVELENGTHS * u - CYCLES * t));
  const start = lift(from);
  const end = lift(to);
  return { centre: (start + end) / 2, slope: (end - start) / STRIP_WIDTH };
}

/** One slice of the artwork, `x`…`x + width` in viewBox units, drawn at `scale`. */
function Slice({ x, width, scale, id, children }: { x: number; width: number; scale: number; id: string; children: React.ReactNode }) {
  return (
    <Svg width={width * scale} height={FLAG_VIEWBOX.height * scale} viewBox={`${x} 0 ${width} ${FLAG_VIEWBOX.height}`}>
      <StippleDefs id={id} palette={SILVER} lightAngle={150} box={{ x: 0, y: 0, width: FLAG_VIEWBOX.width, height: FLAG_VIEWBOX.height }} />
      {children}
    </Svg>
  );
}

function ClothStrip({ index, progress, scale, id }: { index: number; progress: SharedValue<number>; scale: number; id: string }) {
  const x = CLOTH_START + index * STRIP_WIDTH - BLEED;
  const width = STRIP_WIDTH + 2 * BLEED;
  const from = index / STRIPS;
  const to = (index + 1) / STRIPS;
  const ride = useAnimatedStyle(() => {
    const { centre, slope } = fold(from, to, progress.value);
    return { transform: [{ translateY: centre * scale }, { skewY: `${Math.atan(slope)}rad` }] };
  });
  const glint = useAnimatedStyle(() => {
    const { slope } = fold(from, to, progress.value);
    return { opacity: Math.min(GLINT_MAX, Math.max(0, -slope * GLINT_GAIN)) };
  });
  const sliceId = `${id}-${index}`;
  return (
    <Animated.View style={[{ position: "absolute", top: 0, left: x * scale }, ride]}>
      <Slice x={x} width={width} scale={scale} id={sliceId}>
        <Path d={CLOTH} fill={`url(#${sliceId}-metal)`} />
        <Path d={CLOTH} fill={`url(#${sliceId}-dots)`} mask={`url(#${sliceId}-shade)`} />
        <KawaseGlyphs size={GLYPH_SIZE} gap={GLYPH_GAP} x={GLYPH_X} y={GLYPH_Y} fill={SILVER.deep} relief={{ color: SILVER.glint, dx: 1.2, dy: 1.2, opacity: 0.6 }} />
      </Slice>
      <Animated.View style={[{ position: "absolute", inset: 0 }, glint]}>
        <Svg width={width * scale} height={FLAG_VIEWBOX.height * scale} viewBox={`${x} 0 ${width} ${FLAG_VIEWBOX.height}`}>
          <Path d={CLOTH} fill={SILVER.glint} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export function Flag({ width = DEFAULT_WIDTH, id = "flag", wave = false }: FlagProps) {
  const reduced = useReducedMotionLive();
  const progress = useSharedValue(0);
  const scale = width / FLAG_VIEWBOX.width;

  React.useEffect(() => {
    if (!wave || reduced) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: MOTION.flagWaveMs, easing: Easing.linear });
  }, [wave, reduced, progress]);

  return (
    <View aria-hidden style={{ width, height: FLAG_VIEWBOX.height * scale }}>
      <View style={{ position: "absolute", top: 0, left: (POLE.x - 1) * scale }}>
        <Slice x={POLE.x - 1} width={POLE.width + 2} scale={scale} id={`${id}-pole`}>
          <Rect x={POLE.x} y={POLE.y} width={POLE.width} height={POLE.height} rx={POLE.radius} fill={`url(#${id}-pole-metal)`} />
        </Slice>
      </View>
      {Array.from({ length: STRIPS }, (_, index) => (
        <ClothStrip key={index} index={index} progress={progress} scale={scale} id={id} />
      ))}
    </View>
  );
}

export type { FlagProps };
