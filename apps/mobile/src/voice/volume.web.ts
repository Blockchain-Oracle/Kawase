// A track's loudness in the browser: a Web Audio analyser read once per animation frame into a callback — no React
// state per tick, so the orb's shared value follows the voice without re-rendering the overlay.
import type { Track } from "livekit-client";
import * as React from "react";

const FFT_SIZE = 256;
const BYTE_MIDPOINT = 128;
/** Speech rarely fills the scale: lift typical levels into 0–1. */
const GAIN = 4;

export function useVolume(track: Track | undefined, onVolume: (volume: number) => void) {
  const callback = React.useRef(onVolume);
  callback.current = onVolume;
  const media = track?.mediaStreamTrack;

  React.useEffect(() => {
    if (!media || typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(new MediaStream([media]));
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const read = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centred = (sample - BYTE_MIDPOINT) / BYTE_MIDPOINT;
        sum += centred * centred;
      }
      callback.current(Math.min(1, Math.sqrt(sum / samples.length) * GAIN));
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
      callback.current(0);
    };
  }, [media]);
}
