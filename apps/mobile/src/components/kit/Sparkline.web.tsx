// The web twin of Sparkline: the same geometry (`spark-geometry.ts`) drawn with react-native-svg, so the web build never
// loads CanvasKit. Metro picks this file on web.
import { useMemo } from "react";
import Svg, { Path } from "react-native-svg";

import type { SparklineProps } from "./Sparkline";
import { sparkGeometry } from "./spark-geometry";
import { SIZE, useTheme, withAlpha } from "./theme";

const PAD = 2;
const STROKE = 1.6;
const FILL_ALPHA = 0.08;
const BASE_ALPHA = 0.5;
const DASH = "2 3";

export function Sparkline({
  points,
  baseline,
  width = SIZE.sparklineWidth,
  height = SIZE.sparkline,
  tone,
}: SparklineProps) {
  const { color } = useTheme();
  const g = useMemo(() => sparkGeometry(points, width, height, PAD, baseline), [points, width, height, baseline]);
  if (!g) return null;
  const direction = tone ?? g.tone;
  const hue = direction === "up" ? color.up : direction === "down" ? color.down : color.text3;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <Path d={g.area} fill={withAlpha(hue, FILL_ALPHA)} />
      <Path
        d={`M0 ${g.baseY} L${width} ${g.baseY}`}
        stroke={withAlpha(color.text3, BASE_ALPHA)}
        strokeWidth={1}
        strokeDasharray={DASH}
        fill="none"
      />
      <Path d={g.d} stroke={hue} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
