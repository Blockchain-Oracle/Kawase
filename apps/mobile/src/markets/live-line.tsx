// A price's live line against a reference level (Owarine's LiveLine, mobile/src/features/markets/chart/LiveLine.tsx,
// drawn for Kawase's long/short cards): the line since the reference, green while it sits above it and red below, the
// band between them washed in the same ink, a dashed reference, and a pulsing head on the newest price. For a market,
// the reference is the hour's open, so the picture answers "are longs or shorts ahead right now?" at a glance.
import * as React from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/components/kit";

export type LinePoint = { t: number; v: number };

const PAD_Y = 6;
const STROKE = 2;
const HEAD = 3.5;
const RING = 22;
const PULSE_MS = 1400;
const BAND_TOP = 0.28;
const BAND_BOTTOM = 0.02;
const DASH = "4 4";
const HALF = 2;
const MIN_POINTS = 2;
/** The ring starts small and faint-solid and grows out to nothing. */
const PULSE_OPACITY = 0.45;
const PULSE_FROM = 0.3;
const PULSE_GROW = 0.9;

function plot(points: readonly LinePoint[], reference: number | null, width: number, height: number) {
  if (points.length < MIN_POINTS || width <= 0) return null;
  let low = Math.min(...points.map((point) => point.v));
  let high = Math.max(...points.map((point) => point.v));
  if (reference !== null) {
    low = Math.min(low, reference);
    high = Math.max(high, reference);
  }
  const span = high - low;
  const inner = height - PAD_Y * HALF;
  const y = (value: number) => (span === 0 ? height / HALF : PAD_Y + inner - ((value - low) / span) * inner);
  const from = points[0]!.t;
  const to = Math.max(points.at(-1)!.t, from + 1);
  const x = (time: number) => ((time - from) / (to - from)) * width;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  return { path, refY: reference === null ? null : y(reference), first: { x: x(from), y: y(points[0]!.v) }, last: { x: x(last.t), y: y(last.v) }, ahead: reference === null ? last.v >= points[0]!.v : last.v >= reference };
}

export function LiveLine({ points, reference, height, label }: { points: readonly LinePoint[]; reference: number | null; height: number; label: string }) {
  const { color } = useTheme();
  const [width, setWidth] = React.useState(0);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  const drawn = plot(points, reference, width, height);
  if (!drawn) return <View style={{ height }} onLayout={onLayout} accessibilityLabel={label} />;
  const tone = drawn.ahead ? color.up : color.down;
  const band = drawn.refY === null ? null : `${drawn.path} L${drawn.last.x.toFixed(1)},${drawn.refY.toFixed(1)} L${drawn.first.x.toFixed(1)},${drawn.refY.toFixed(1)} Z`;
  return (
    <View style={{ height }} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`up${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.up} stopOpacity={BAND_TOP} />
            <Stop offset="1" stopColor={color.up} stopOpacity={BAND_BOTTOM} />
          </LinearGradient>
          <LinearGradient id={`down${id}`} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={color.down} stopOpacity={BAND_TOP} />
            <Stop offset="1" stopColor={color.down} stopOpacity={BAND_BOTTOM} />
          </LinearGradient>
          {drawn.refY !== null ? (
            <>
              <ClipPath id={`above${id}`}>
                <Rect x={0} y={0} width={width} height={Math.max(drawn.refY, 0)} />
              </ClipPath>
              <ClipPath id={`below${id}`}>
                <Rect x={0} y={drawn.refY} width={width} height={Math.max(height - drawn.refY, 0)} />
              </ClipPath>
            </>
          ) : null}
        </Defs>
        {band && drawn.refY !== null ? (
          <>
            <Path d={band} fill={`url(#up${id})`} clipPath={`url(#above${id})`} />
            <Path d={band} fill={`url(#down${id})`} clipPath={`url(#below${id})`} />
            <Line x1={0} x2={width} y1={drawn.refY} y2={drawn.refY} stroke={color.text3} strokeWidth={1} strokeDasharray={DASH} />
            <Path d={drawn.path} stroke={color.up} strokeWidth={STROKE} fill="none" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#above${id})`} />
            <Path d={drawn.path} stroke={color.down} strokeWidth={STROKE} fill="none" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#below${id})`} />
          </>
        ) : (
          <Path d={drawn.path} stroke={color.ink} strokeWidth={STROKE} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}
        <Circle cx={drawn.last.x} cy={drawn.last.y} r={HEAD} fill={tone} />
      </Svg>
      <Pulse x={drawn.last.x} y={drawn.last.y} ink={tone} />
    </View>
  );
}

/** The ring breathing out of the newest price (held still under Reduce Motion). */
function Pulse({ x, y, ink }: { x: number; y: number; ink: string }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return;
    progress.set(withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }), -1, false));
  }, [reduced, progress]);
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 0 : PULSE_OPACITY * (1 - progress.get()), transform: [{ scale: PULSE_FROM + progress.get() * PULSE_GROW }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { left: x - RING / HALF, top: y - RING / HALF, backgroundColor: ink }, style]} />;
}

const styles = StyleSheet.create({
  ring: { position: "absolute", width: RING, height: RING, borderRadius: RING / HALF },
});
