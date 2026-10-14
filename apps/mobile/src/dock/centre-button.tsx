// The dock's centre (decision 1): one black disc with a plus. A tap opens the + fan and the plus turns to × while it
// is open; a hold opens the voice orb, which rises from this disc (the disc steps aside while the orb is up, so there is
// only ever one). The same glyph is drawn by the fan above its scrim, in the same place, so closing it is the same tap.
import * as React from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { Icon, Plus } from "@/components/kit/icons";
import { ELEVATION, SPRING, TIMING, useTheme } from "@/components/kit/theme";

export const CENTRE_SIZE = 44;
const HALF = 2;
const OPEN_DEG = 45;
const GLYPH = 24;
const GLYPH_STROKE = 2.4;

export function CentreGlyph({ open, away = false }: { open: boolean; away?: boolean }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  // Starts closed and turns to its state, so the copy the fan draws on opening turns with the dock's own.
  const turn = useSharedValue(0);
  React.useEffect(() => {
    turn.set(reduce ? (open ? 1 : 0) : withSpring(open ? 1 : 0, SPRING.fanLead));
  }, [open, reduce, turn]);
  const fade = useSharedValue(away ? 0 : 1);
  React.useEffect(() => {
    fade.set(withTiming(away ? 0 : 1, { duration: reduce ? TIMING.reducedMotion : TIMING.selection }));
  }, [away, reduce, fade]);
  const glyph = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * OPEN_DEG}deg` }] }));
  const disc = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <Animated.View style={[styles.disc, ELEVATION.button, { backgroundColor: color.primary }, disc]}>
      <Animated.View style={glyph}>
        <Icon icon={Plus} size={GLYPH} tint={color.primaryForeground} strokeWidth={GLYPH_STROKE} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: CENTRE_SIZE,
    height: CENTRE_SIZE,
    borderRadius: CENTRE_SIZE / HALF,
    alignItems: "center",
    justifyContent: "center",
  },
});
