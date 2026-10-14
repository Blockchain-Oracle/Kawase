// Web twin of CountdownRing: the same ring as SVG (react-native-svg renders DOM SVG on the web), so the web build never
// loads Skia/CanvasKit. The arc empties counter-clockwise from the top toward the deadline on the server's clock, ticking
// four times a second (once a second under Reduce Motion); the last ten seconds take the warn ink or the thicker stroke.
import { useEffect, useState } from "react";
import { useReducedMotion, useSharedValue } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import type { CountdownRingProps } from "./CountdownRing";
import { useTheme } from "./theme";

const MS = 1000;
const LAST_SECONDS = 10;
const HALF = 2;
const DEFAULT_SIZE = 40;
const DEFAULT_STROKE = 3;
const TICK_MS = 250;
const QUARTER_TURN = -90;
/** A circle's length per unit of radius (2π). */
const TAU = Math.PI * HALF;

export function CountdownRing({
  fromSec,
  toSec,
  offsetMs: offsetGiven,
  size = DEFAULT_SIZE,
  stroke = DEFAULT_STROKE,
  color: colorGiven,
  warn: warnGiven,
  track: trackGiven,
  lastStroke = stroke,
}: CountdownRingProps) {
  const theme = useTheme().color;
  const reduce = useReducedMotion();
  const noOffset = useSharedValue(0);
  const offsetMs = offsetGiven ?? noOffset;
  const [now, setNow] = useState(() => Date.now() + offsetMs.get());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs.get()), reduce ? MS : TICK_MS);
    return () => clearInterval(id);
  }, [offsetMs, reduce]);
  const span = Math.max(1, (toSec - fromSec) * MS);
  const left = Math.min(1, Math.max(0, (toSec * MS - now) / span));
  const last = toSec * MS - now <= LAST_SECONDS * MS;
  const r = (size - stroke) / HALF;
  const length = TAU * r;
  const centre = size / HALF;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <Circle cx={centre} cy={centre} r={r} stroke={trackGiven ?? theme.raised2} strokeWidth={stroke} fill="none" />
      <Circle
        cx={centre}
        cy={centre}
        r={r}
        stroke={last ? (warnGiven ?? theme.warn) : (colorGiven ?? theme.ink)}
        strokeWidth={last ? lastStroke : stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${length * left} ${length}`}
        transform={`rotate(${QUARTER_TURN} ${centre} ${centre}) scale(-1 1) translate(${-size} 0)`}
      />
    </Svg>
  );
}
