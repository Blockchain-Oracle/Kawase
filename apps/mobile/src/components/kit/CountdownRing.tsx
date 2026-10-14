/**
 * The window's countdown ring (21st.dev #1737 Circle Progress, ported to Skia): the arc empties counter-clockwise from
 * the window's start to the moment calls close, on the server's clock (`offsetMs`), redrawn on the UI thread — no React
 * render per second. The last ten seconds tint it the warning colour (or, for a position, thicken it). Under Reduce
 * Motion it steps once a second instead of sweeping every frame (P2): the time still shows, the motion doesn't.
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

const MS = 1000;
const LAST_SECONDS = 10;
const FULL_TURN = 360;
const START_ANGLE = -90;
const HALF = 2;

export function CountdownRing({
  fromSec,
  toSec,
  offsetMs,
  size = 40,
  stroke = 3,
  color,
  warn,
  track,
  lastStroke = stroke,
}: {
  fromSec: number;
  toSec: number;
  offsetMs: SharedValue<number>;
  size?: number;
  stroke?: number;
  color: string;
  warn: string;
  track: string;
  /** The arc's width in the last ten seconds (a position's ring thickens instead of turning a warning colour). */
  lastStroke?: number;
}) {
  const now = useSharedValue(Date.now());
  const reduce = useReducedMotion();
  const frame = useFrameCallback(() => {
    "worklet";
    now.value = Date.now() + offsetMs.value;
  }, !reduce);
  useEffect(() => {
    frame.setActive(!reduce);
    if (!reduce) return;
    const tick = () => {
      now.value = Date.now() + offsetMs.value;
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
    const left = Math.min(1, Math.max(0, (toSec * MS - now.value) / span));
    return Skia.PathBuilder.Make()
      .addArc(rect, START_ANGLE, -FULL_TURN * left)
      .build();
  });
  const tint = useDerivedValue(() => (toSec * MS - now.value <= LAST_SECONDS * MS ? warn : color));
  const width = useDerivedValue(() => (toSec * MS - now.value <= LAST_SECONDS * MS ? lastStroke : stroke));
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={circle} style="stroke" strokeWidth={stroke} color={track} />
      <Path path={arc} style="stroke" strokeWidth={width} strokeCap="round" color={tint} />
    </Canvas>
  );
}
