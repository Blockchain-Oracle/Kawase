/**
 * A price's 24-hour graph (21st.dev ssychui/balance-chart #30538, drawn as a Skia path): the geometry from
 * `spark-geometry.ts`, a faint fill under the line, a dashed baseline at the price at the start of the window, and the
 * line in the direction ink. Native only; the web twin (`Sparkline.web.tsx`) draws the same geometry as SVG, because
 * Skia on the web means loading CanvasKit WASM. The data comes from the caller (any price feed); this only draws.
 */
import { Canvas, DashPathEffect, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";

import { type SparkTone, sparkGeometry } from "./spark-geometry";
import { SIZE, useTheme, withAlpha } from "./theme";

const PAD = 2;
const STROKE = 1.6;
const FILL_ALPHA = 0.08;
const BASE_ALPHA = 0.5;
const DASH_ON = 2;
const DASH_OFF = 3;
const DASH = [DASH_ON, DASH_OFF];

export type SparklineProps = {
  /** The series, oldest first; null is a gap. */
  points: readonly (number | null)[];
  /** The price at the start of the window, for the dashed baseline and the tone (the first point by default). */
  baseline?: number;
  width?: number;
  height?: number;
  /** Override the direction tone (a neutral grey draws as "flat"). */
  tone?: SparkTone;
};

export function Sparkline({ points, baseline, width = SIZE.sparklineWidth, height = SIZE.sparkline, tone }: SparklineProps) {
  const { color } = useTheme();
  const g = useMemo(() => sparkGeometry(points, width, height, PAD, baseline), [points, width, height, baseline]);
  const paths = useMemo(() => (g ? { line: Skia.Path.MakeFromSVGString(g.d), area: Skia.Path.MakeFromSVGString(g.area) } : null), [g]);
  if (!g || !paths?.line || !paths.area) return null;
  const direction = tone ?? g.tone;
  const hue = direction === "up" ? color.up : direction === "down" ? color.down : color.text3;
  return (
    <Canvas style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path path={paths.area} color={withAlpha(hue, FILL_ALPHA)} />
      <Line p1={vec(0, g.baseY)} p2={vec(width, g.baseY)} color={withAlpha(color.text3, BASE_ALPHA)} strokeWidth={1}>
        <DashPathEffect intervals={DASH} />
      </Line>
      <Path path={paths.line} color={hue} style="stroke" strokeWidth={STROKE} strokeCap="round" strokeJoin="round" />
    </Canvas>
  );
}
