// The edge glow in the browser (see edge-glow.tsx): a turning conic gradient masked to a thin ring at the window's
// edge, with a softer, wider ring under it for the bloom. One CSS custom property animates the angle.
import * as React from "react";
import { StyleSheet, View } from "react-native";

import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

import { useVoice } from "./voice-store";

const GLOW = "conic-gradient(from var(--kw-glow-turn), #FA00FF, #8B5CF6, #3B82F6, #22D3EE, #FA00FF)";
const LEVEL = { speaking: 1, thinking: 0.85, listening: 0.6, other: 0.45 } as const;
const STYLE_ID = "kw-edge-glow";
const CSS = `@property --kw-glow-turn { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@keyframes kw-glow-turn { to { --kw-glow-turn: 360deg; } }
.kw-glow { position: absolute; inset: 0; border-radius: 18px; background: ${GLOW}; animation: kw-glow-turn 5s linear infinite;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.kw-glow.ring { padding: 3px; filter: blur(4px); }
.kw-glow.bloom { padding: 16px; filter: blur(22px); opacity: 0.7; }
@media (prefers-reduced-motion: reduce) { .kw-glow { animation: none; } }`;

function useGlowStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);
}

export function EdgeGlow({ active }: { active: boolean }) {
  useGlowStyles();
  const reduced = useReducedMotionLive();
  const phase = useVoice((voice) => voice.phase);
  const level = phase === "speaking" ? LEVEL.speaking : phase === "thinking" ? LEVEL.thinking : phase === "listening" ? LEVEL.listening : LEVEL.other;
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[StyleSheet.absoluteFill, styles.layer, { opacity: active ? level : 0, transition: reduced ? undefined : "opacity 450ms ease" } as object]}
    >
      {active ? (
        <>
          {React.createElement("div", { className: "kw-glow bloom" })}
          {React.createElement("div", { className: "kw-glow ring" })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ layer: { zIndex: 50 } });
