// The budget's hero (D38): one ring for the week, filled by what Kawase spent on its own, with the spent figure rolling
// in the middle and "of $200 this week" under it. Ported from 21st.dev #1737 Circle Progress (the same spec as the kit's
// CountdownRing), drawn with react-native-svg so the phone and the web share one file; the per-action cap is a tick on
// the track, the "hard wall" idea of 21st.dev #36076 Budget Guard (a limit drawn as a mark, never only as a number).
// The arc grows on Senryo's number-change timing; under Reduce Motion it is set at once.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line } from "react-native-svg";

import { EASE, RollingFigure, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE_DEFAULT = 224;
const STROKE = 14;
const HALF = 2;
const TAU = Math.PI * HALF;
const QUARTER_TURN = -90;
const DEGREES = 360;
/** From this share of the week on, the arc takes the warning ink (and its words say so). */
const NEAR_SHARE = 0.85;
const TICK_INSET = 3;
/** Shares are worked out in basis points (bigint dollars → a fraction). */
const BPS = 10_000n;
const BPS_NUMBER = 10_000;
const PERCENT = 100;
const NONE = 0n;

const shareOf = (part: bigint, whole: bigint) => (whole > NONE ? Math.min(1, Number((part * BPS) / whole) / BPS_NUMBER) : 0);

export function BudgetRing({
  spent,
  cap,
  perAction,
  figure,
  caption,
  paused,
  size = SIZE_DEFAULT,
  accessibilityLabel,
}: {
  /** US dollar base units spent this week, and the week's cap. */
  spent: bigint;
  cap: bigint;
  /** The per-action cap, drawn as a tick on the track (its share of the week). */
  perAction?: bigint | undefined;
  /** The spent figure as the person reads it ("$34"). */
  figure: string;
  /** "of $200 this week". */
  caption: string;
  /** A paused budget's arc is drawn in the quiet ink. */
  paused?: boolean | undefined;
  size?: number;
  accessibilityLabel: string;
}) {
  const { color } = useTheme();
  const share = shareOf(spent, cap);
  const radius = (size - STROKE) / HALF;
  const length = TAU * radius;
  const centre = size / HALF;
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.set(withTiming(share, { duration: TIMING.chartReveal, easing: EASE, reduceMotion: ReduceMotion.System }));
  }, [share, progress]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.get()) }));
  const tint = paused ? color.text3 : share >= NEAR_SHARE ? color.warn : color.ink;
  const tickShare = perAction ? shareOf(perAction, cap) : undefined;
  const tickAngle = tickShare !== undefined ? ((tickShare * DEGREES + QUARTER_TURN) * Math.PI) / (DEGREES / HALF) : undefined;
  const inner = radius - STROKE / HALF + TICK_INSET;
  const outer = radius + STROKE / HALF - TICK_INSET;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(share * PERCENT) }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill} aria-hidden>
        <Circle cx={centre} cy={centre} r={radius} stroke={color.raised2} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={tint}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          animatedProps={arcProps}
          transform={`rotate(${QUARTER_TURN} ${centre} ${centre})`}
        />
        {tickAngle !== undefined && tickShare !== undefined && tickShare < 1 ? (
          <Line
            x1={centre + inner * Math.cos(tickAngle)}
            y1={centre + inner * Math.sin(tickAngle)}
            x2={centre + outer * Math.cos(tickAngle)}
            y2={centre + outer * Math.sin(tickAngle)}
            stroke={color.ground}
            strokeWidth={HALF}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        <RollingFigure text={figure} value={spent} color={color.ink} height={TYPE.displayBalance.lineHeight ?? SPACE.xxxl} />
        <Text style={[TYPE.rowDetail, { color: color.text2 }]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", alignItems: "center", justifyContent: "center" },
  centre: { alignItems: "center", gap: SPACE.xxs, paddingHorizontal: SPACE.xl },
});
