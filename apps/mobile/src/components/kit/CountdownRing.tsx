/**
 * The window's countdown ring (21st.dev #1737 Circle Progress, ported to Skia): the arc empties counter-clockwise from
 * the window's start to the moment calls close, on the server's clock (`offsetMs`), redrawn on the UI thread — no React
 * render per second. The last ten seconds tint it the warning colour (or, for a position, thicken it). Under Reduce
 * Motion it steps once a second instead of sweeping every frame (P2): the time still shows, the motion doesn't.
 * Quote age, the next scheduled agent run, an approval's time to live. Colours default to the theme (ink arc, warn
 * tint, raised-2 track). The web twin (`CountdownRing.web.tsx`) draws the same ring as SVG, so the web never loads Skia.
 */
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
  type SharedValue,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

import { useTheme } from "./theme";

const MS = 1000;
const LAST_SECONDS = 10;
const FULL_TURN = 360;
const START_ANGLE = -90;
const HALF = 2;
const DEFAULT_SIZE = 40;
const DEFAULT_STROKE = 3;

export type CountdownRingProps = {
  fromSec: number;
  toSec: number;
  /** The server clock's offset from this device (ms); 0 when omitted. */
  offsetMs?: SharedValue<number>;
  size?: number;
  stroke?: number;
  color?: string;
  warn?: string;
  track?: string;
  /** The arc's width in the last ten seconds (a position's ring thickens instead of turning a warning colour). */
  lastStroke?: number;
};

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
  const color = colorGiven ?? theme.ink;
  const warn = warnGiven ?? theme.warn;
  const track = trackGiven ?? theme.raised2;
  const noOffset = useSharedValue(0);
  const offsetMs = offsetGiven ?? noOffset;
  const now = useSharedValue(Date.now());
  const reduce = useReducedMotion();
  const frame = useFrameCallback(() => {
    "worklet";
    now.set(Date.now() + offsetMs.get());
  }, !reduce);
  useEffect(() => {
    frame.setActive(!reduce);
    if (!reduce) return;
    const tick = () => {
      now.set(Date.now() + offsetMs.get());
    };
    tick();
    const id = setInterval(tick, MS);
    return () => clearInterval(id);
  }, [reduce, frame, now, offsetMs]);
  const r = (size - stroke) / HALF;
  const rect = useMemo(() => Skia.XYWHRect(stroke / HALF, stroke / HALF, size - stroke, size - stroke), [size, stroke]);
  const circle = useMemo(() => Skia.Path.Circle(size / HALF, size / HALF, r), [size, r]);
  const arc = useDerivedValue(() => {
    const span = Math.max(1, (toSec - fromSec) * MS);
    const left = Math.min(1, Math.max(0, (toSec * MS - now.get()) / span));
    return Skia.PathBuilder.Make()
      .addArc(rect, START_ANGLE, -FULL_TURN * left)
      .build();
  });
  const tint = useDerivedValue(() => (toSec * MS - now.get() <= LAST_SECONDS * MS ? warn : color));
  const width = useDerivedValue(() => (toSec * MS - now.get() <= LAST_SECONDS * MS ? lastStroke : stroke));
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={circle} style="stroke" strokeWidth={stroke} color={track} />
      <Path path={arc} style="stroke" strokeWidth={width} strokeCap="round" color={tint} />
    </Canvas>
  );
}
