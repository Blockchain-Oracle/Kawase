/**
 * React Native port of 21st:ddoemonn/progress-bar (#23549, the web's `progress-bar.tsx`): a labelled bar whose fill
 * springs to its value, the value in words on the right, a tone (calm · near · late) colouring the fill as time runs
 * down. VoiceOver reads it as an adjustable progress value. Reduce Motion sets the fill without the spring.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { SPACE, TYPE, useTheme } from "./theme";

const FILL = { damping: 34, stiffness: 210, mass: 0.9 };
const TRACK = 4;
const PERCENT = 100;

export function ProgressBar(p: {
  value: number;
  max: number;
  label: string;
  valueText: string;
  tone?: "calm" | "near" | "late";
}) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const fraction = p.max <= 0 ? 0 : Math.min(1, Math.max(0, p.value / p.max));
  const fill = useSharedValue(fraction);
  useEffect(() => {
    fill.value = reduce ? fraction : withSpring(fraction, FILL);
  }, [fraction, reduce, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * PERCENT}%` }));
  const ink = p.tone === "late" ? color.down : p.tone === "near" ? color.warn : color.up;
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={p.label}
      accessibilityValue={{ min: 0, max: p.max, now: p.value, text: p.valueText }}
    >
      <View style={styles.row}>
        <Text numberOfLines={1} style={[TYPE.caption, styles.flex, { color: color.inkMuted }]}>
          {p.label}
        </Text>
        <Text style={[TYPE.caption, { color: color.inkMuted }]}>{p.valueText}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: color.raised2 }]}>
        <Animated.View style={[styles.fill, { backgroundColor: ink }, style]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
  row: { flexDirection: "row", gap: SPACE.sm },
  flex: { flex: 1 },
  track: { height: TRACK, borderRadius: TRACK / 2, overflow: "hidden" },
  fill: { height: TRACK, borderRadius: TRACK / 2 },
});
