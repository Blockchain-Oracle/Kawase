/**
 * The one switch on the phone (21st.dev #21948 serafimcloud/switch — a track and a sliding thumb — rebuilt with
 * Pressable and Reanimated; the web's `SwitchRow` track). The native UISwitch on iOS 26 draws outside its React frame
 * and loses taps inside a sheet's drag (the Leverage switch couldn't be turned off, Q1), so every switch is this one.
 * On: the primary's track with its own ink as the thumb, as the web; off: a quiet track, a light thumb.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { fire } from "@/feedback/fire";
import { EASE, TIMING, useTheme } from "./theme";

const W = 48;
const H = 28;
const THUMB = 24;
const PAD = 2;
const HALF = 2;
const TRAVEL = W - THUMB - PAD * HALF;
const DISABLED = 0.4;

export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  tone,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  /** The on track's colour (a profile's visibility uses its tone); the primary otherwise. */
  tone?: string;
  disabled?: boolean;
}) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const x = useSharedValue(value ? TRAVEL : 0);
  useEffect(() => {
    x.set(reduce ? (value ? TRAVEL : 0) : withTiming(value ? TRAVEL : 0, { duration: TIMING.press, easing: EASE }));
  }, [value, reduce, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={PAD * HALF * HALF}
      onPress={() => {
        fire("tick", { sound: "toggle" });
        onValueChange(!value);
      }}
      style={[
        styles.track,
        { backgroundColor: value ? (tone ?? color.primary) : color.rowPressed, opacity: disabled ? DISABLED : 1 },
      ]}
    >
      <Animated.View
        style={[styles.thumb, { backgroundColor: value ? color.primaryForeground : color.paper }, thumb]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / HALF, padding: PAD, justifyContent: "center" },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / HALF },
});
