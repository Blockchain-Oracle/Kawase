"use client";

// The glass orb, Kawase's voice symbol: the same WebGL component the web app uses (ui-web's VoicePoweredOrb, sourced
// from 21st.dev isaiahbjork/voice-powered-orb). Here it never opens the microphone: the page drives a slow "speaking"
// level instead, and with reduced motion the orb holds its still frame.
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { tokens } from "@kawase/ui-tokens";
import type { NetworkId } from "@kawase/networks";

const VoicePoweredOrb = dynamic(
  () => import("@kawase/ui-web/components/ui/voice-powered-orb").then((module) => module.VoicePoweredOrb),
  { ssr: false },
);

const SPEAKING_PERIOD_MS = 2600;
const SPEAKING_FLOOR = 0.12;
const SPEAKING_RANGE = 0.38;
const FULL_TURN = Math.PI * 2;
/** sin() spans −1…1; (1 + sin) × HALF spans 0…1. */
const HALF = 0.5;

export function Orb({ network = "mainnet", speaking = true }: { network?: NetworkId; speaking?: boolean }) {
  const reduced = useReducedMotion();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (reduced || !speaking) {
      setLevel(0);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const phase = ((now - started) % SPEAKING_PERIOD_MS) / SPEAKING_PERIOD_MS;
      setLevel(SPEAKING_FLOOR + SPEAKING_RANGE * (1 + Math.sin(phase * FULL_TURN)) * HALF);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, speaking]);

  return (
    <div className="relative size-full" aria-hidden="true">
      <div className="absolute inset-0">
        <VoicePoweredOrb colors={tokens.orb[network]} level={level} enableVoiceControl={false} />
      </div>
    </div>
  );
}
