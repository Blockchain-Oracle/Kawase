// A ring that empties as time runs out (21st.dev "Circle Progress — Countdown", id 1737, as Senryo's CountdownRing
// draws it): the arc drains counter-clockwise from `from` to `to`; the last stretch thickens instead of changing hue,
// so time never reads as gain or loss. react-native-svg, so one drawing serves iOS, Android and the web; it redraws
// once a second (a quote's freshness, an order's window), which reads as a sweep at this size without a frame loop.
import * as React from "react";
import Svg, { Circle } from "react-native-svg";

import { useThemeColors } from "@/theme/use-theme-colors";

const TICK_MS = 1000;
const HALF = 2;
const START_ANGLE = -90;
const LAST_SHARE = 0.2;

type Props = {
  /** Epoch ms the window opened and closes. */
  from: number;
  to: number;
  size?: number;
  stroke?: number;
  /** Spoken, e.g. "Price refreshes in 20 seconds". */
  accessibilityLabel?: string;
  /** Called once when the window closes. */
  onDone?: () => void;
};

export function DrainRing({ from, to, size = 18, stroke = 2, accessibilityLabel, onDone }: Props) {
  const colors = useThemeColors();
  const [now, setNow] = React.useState(() => Date.now());
  const done = React.useRef(false);
  React.useEffect(() => {
    done.current = false;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [from, to]);
  const span = Math.max(1, to - from);
  const left = Math.min(1, Math.max(0, (to - now) / span));
  React.useEffect(() => {
    if (left > 0 || done.current) return;
    done.current = true;
    onDone?.();
  }, [left, onDone]);
  const last = left <= LAST_SHARE;
  const width = last ? stroke + 1 : stroke;
  const r = (size - width) / HALF;
  const circumference = HALF * Math.PI * r;
  return (
    <Svg width={size} height={size} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={{ transform: [{ rotate: `${START_ANGLE}deg` }] }}>
      <Circle cx={size / HALF} cy={size / HALF} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / HALF}
        cy={size / HALF}
        r={r}
        stroke={colors.foreground}
        strokeWidth={width}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        // Draining toward the start: the visible arc is what is left.
        strokeDashoffset={circumference * (1 - left)}
        // Mirrored, so it drains counter-clockwise from the top.
        transform={`translate(0 ${size}) scale(1 -1)`}
      />
    </Svg>
  );
}
