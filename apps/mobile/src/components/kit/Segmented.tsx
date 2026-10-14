import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { fire } from "@/feedback/fire";
import { BUTTON, CONTROL_FONT_SCALE, EASE, RADIUS, SIZE, SPACE, TIMING, TYPE, useTheme } from "./theme";

const HALF = 2;

/**
 * Segmented control (asset filter, Long/Short, timeframe; Fomo F37's keypad/chart switch, Codex consult 1 Oct): a
 * 44 pt borderless track with a raised plate that slides to the selection in 170 ms while the labels change colour.
 * A `tick` on every change.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  /** Group name for VoiceOver ("Asset class"). */
  label: string;
  /** Colour of the selected cell's text (Long green / Short red); defaults to the ink. */
  tone?: (value: T) => string;
}) {
  const { color } = useTheme();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const cell = useSharedValue(0);
  const at = useSharedValue(index);
  useEffect(() => {
    at.set(withTiming(index, { duration: TIMING.selection, easing: EASE }));
  }, [index, at]);
  const plate = useAnimatedStyle(() => ({
    width: cell.get(),
    transform: [{ translateX: at.get() * (cell.get() + SPACE.xs) }],
  }));
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(e) => {
        const inner = e.nativeEvent.layout.width - HALF * SPACE.xs - (options.length - 1) * SPACE.xs;
        cell.set(inner / options.length);
      }}
      style={[styles.track, { backgroundColor: color.muted }]}
    >
      <Animated.View style={[styles.plate, { backgroundColor: color.rowPressed }, plate]} />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              fire("tick", { sound: "toggle" });
              onChange(o.value);
            }}
            style={styles.cell}
          >
            <Text
              maxFontSizeMultiplier={CONTROL_FONT_SCALE}
              style={[TYPE.chipCategory, { color: selected ? (tone?.(o.value) ?? color.ink) : color.text3 }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: SPACE.xs,
    gap: SPACE.xs,
    borderRadius: BUTTON.radius.md,
    minHeight: SIZE.touch,
  },
  plate: {
    position: "absolute",
    top: SPACE.xs,
    bottom: SPACE.xs,
    left: SPACE.xs,
    borderRadius: RADIUS.xs,
  },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.xs },
});
