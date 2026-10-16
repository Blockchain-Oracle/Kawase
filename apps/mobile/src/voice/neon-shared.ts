// What the neon rings share (neon-ring.tsx on the phone, neon-ring.web.tsx in the browser): the colours round the ring,
// each phase's resting weight, and how the live voice level lifts it.
import type { VoicePhase } from "./voice-store";

/** Round the ring, the brand magenta first and last. */
export const NEON_COLORS = ["#FA00FF", "#B44CFF", "#6D5BFF", "#22D3EE", "#FA00FF"];

/** How bright each phase sits at rest: brightest while Kawase talks. */
export const NEON_WEIGHT: Record<VoicePhase, number> = { speaking: 1, thinking: 0.8, listening: 0.62, muted: 0.35, connecting: 0.45, failed: 0 };

const REST = 0.55;
const LIFT = 0.45;
/** The orb's level rarely passes ~0.6; this brings a normal voice to full lift. */
const GAIN = 1.7;

/** The ring's opacity for a phase weight and the live level: rests a little under the weight and breathes up to it. */
export function neonOpacity(weight: number, level: number): number {
  "worklet";
  return weight * (REST + LIFT * Math.min(1, Math.max(0, level * GAIN)));
}
