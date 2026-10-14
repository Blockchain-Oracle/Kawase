// A live market's mark: a small dot in the rising colour with a ring that breathes out of it every couple of seconds
// (the "live" pip of Robinhood's and Coinbase's price heroes). Still under Reduce Motion: the dot alone says it.
import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useTheme } from "./theme";

const DOT = 6;
const RING_SCALE = 2.6;
const PERIOD_MS = 1_800;
const HALF = 2;

export function LiveDot({ tint }: { tint?: string }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const beat = useSharedValue(0);
  React.useEffect(() => {
    if (reduce) return;
    beat.set(withRepeat(withTiming(1, { duration: PERIOD_MS, easing: Easing.out(Easing.quad) }), -1, false));
  }, [reduce, beat]);
  const ring = useAnimatedStyle(() => ({ opacity: reduce ? 0 : 1 - beat.get(), transform: [{ scale: 1 + (RING_SCALE - 1) * beat.get() }] }));
  const fill = tint ?? color.up;
  return (
    <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.dot, { backgroundColor: fill }, ring]} />
      <View style={[styles.dot, { backgroundColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: DOT, height: DOT, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / HALF },
});
