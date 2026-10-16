// The neon in the browser (see neon-ring.tsx): three rings of one turning conic gradient — a bright core line, a tight
// glow and a faint halo — masked to the outline of the box they fill. Small blurs keep it neon, not frosted glass. One CSS
// custom property turns the gradient; the voice's level (the orb's shared value) breathes its opacity.
import * as React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { NEON_COLORS, neonOpacity } from "./neon-shared";

const STYLE_ID = "kw-neon";
const CSS = `@property --kw-neon-turn { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@keyframes kw-neon-turn { to { --kw-neon-turn: 360deg; } }
.kw-neon { position: absolute; inset: 0; border-radius: inherit; background: conic-gradient(from var(--kw-neon-turn), ${NEON_COLORS.join(", ")});
  animation: kw-neon-turn 6s linear infinite;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.kw-neon.core { padding: 1.5px; filter: saturate(1.4) brightness(1.35); }
.kw-neon.glow { padding: 3px; filter: blur(5px) saturate(1.3); }
.kw-neon.halo { inset: -6px; padding: 10px; filter: blur(14px); opacity: 0.45; }
@media (prefers-reduced-motion: reduce) { .kw-neon { animation: none; } }`;

function useNeonStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);
}

export type NeonRingProps = {
  /** How bright it sits at rest (0–1): the phase's weight. */
  intensity: number;
  /** The live voice level (the orb's), which the neon breathes with. */
  level: SharedValue<number>;
  radius: number;
  /** Where it sits; it fills this box (absolutely positioned by the caller or by `style`). */
  style?: StyleProp<ViewStyle>;
};

export function NeonRing({ intensity, level, radius, style }: NeonRingProps) {
  useNeonStyles();
  const reduced = useReducedMotionLive();
  const breathe = useAnimatedStyle(() => ({ opacity: neonOpacity(intensity, level.value) }));
  return (
    <View pointerEvents="none" aria-hidden style={[styles.box, { borderRadius: radius }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, transition: reduced ? undefined : "opacity 160ms linear" } as object, breathe]}>
        {React.createElement("div", { className: "kw-neon halo" })}
        {React.createElement("div", { className: "kw-neon glow" })}
        {React.createElement("div", { className: "kw-neon core" })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ box: { position: "absolute" } });
