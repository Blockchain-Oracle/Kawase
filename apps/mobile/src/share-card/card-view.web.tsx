// The card on the web: one <canvas> that is the preview, the PNG and every MP4 frame (draw.web.ts), so what the person
// sees is exactly what they share. The film plays once when the card appears (the line draws, the coins pop on, the
// figure counts, the hanko presses), then rests on its last frame; Reduced Motion shows the last frame at once. The MP4
// is drawn frame by frame at t = i / 30 into its own canvas and encoded with Mediabunny (WebCodecs, H.264), never a
// screen recording; a browser that cannot encode H.264 at this size says so and keeps the image.
import * as React from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "@/components/kit/theme";
import { useLocale } from "@/i18n/locale-provider";
import type { Fx } from "@/portfolio/format";

import { CardArt, type CardImages } from "./art.web";
import { fileStem, type CardHandle } from "./card-handle";
import { drawCard, loadCardFonts, type CardColors, type CardScene } from "./draw.web";
import { chartGeometry, FILM, FINAL_MS, FRAME, L } from "./layout";
import type { CardData, ShareToken } from "./model";
import { CARD_URL, type CardWords } from "./words";

const VIDEO_BITRATE = 6_000_000;
const MS = 1000;

export class VideoUnavailable extends Error {
  override name = "VideoUnavailable";
}

function useCardColors(): CardColors {
  const { color } = useTheme();
  return React.useMemo(
    () => ({
      ground: color.ground,
      paper: color.card,
      ink: color.ink,
      muted: color.text2,
      hairline: color.hairline,
      up: color.up,
      down: color.down,
      onUp: color.upForeground,
      onDown: color.downForeground,
      accent: color.accent,
      onAccent: color.accentForeground,
      chip: color.selectedRow,
      chipInk: color.link,
      qrPaper: color.paper,
      qrInk: color.paperInk,
      raised: color.raised2,
    }),
    [color],
  );
}

function tokensOf(card: CardData): ShareToken[] {
  const seen = new Map<string, ShareToken>();
  for (const m of card.markers) for (const token of [m.token, m.other]) if (token) seen.set(`${token.chainId}:${token.address.toLowerCase()}`, token);
  return [...seen.values()];
}

async function encodeVideo(scene: CardScene, onProgress: (share: number) => void, signal: AbortSignal): Promise<Blob> {
  const mb = await import("mediabunny");
  const size = { width: FRAME.w, height: FRAME.h, bitrate: VIDEO_BITRATE };
  if (typeof OffscreenCanvas === "undefined" || !(await mb.canEncodeVideo("avc", size))) throw new VideoUnavailable();
  const canvas = new OffscreenCanvas(FRAME.w, FRAME.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new VideoUnavailable();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: VIDEO_BITRATE });
  output.addVideoTrack(video, { frameRate: FILM.fps });
  await output.start();
  const frames = Math.round((FILM.totalMs / MS) * FILM.fps);
  try {
    for (let i = 0; i < frames; i += 1) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      drawCard(ctx, scene, (i / FILM.fps) * MS, CARD_URL);
      await video.add(i / FILM.fps, 1 / FILM.fps);
      onProgress(i / frames);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new VideoUnavailable();
  onProgress(1);
  return new Blob([buffer], { type: "video/mp4" });
}

export const ShareCardView = React.forwardRef<
  CardHandle,
  { card: CardData; words: CardWords; fx: Fx; seed: string; width: number }
>(function ShareCardView({ card, words, fx, seed, width }, ref) {
  const { locale, rtl } = useLocale();
  const colors = useCardColors();
  const reduced = useReducedMotion();
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const [images, setImages] = React.useState<CardImages | null>(null);
  const [fontsReady, setFontsReady] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const tokens = React.useMemo(() => tokensOf(card), [card]);
  const scene = React.useMemo<CardScene | null>(
    () => (images && fontsReady ? { card, words, geometry: chartGeometry(card.series, card.markers, card.from, card.to, card.level), colors, images, fx, locale, rtl } : null),
    [card, words, colors, images, fx, locale, rtl, fontsReady],
  );

  React.useEffect(() => {
    let live = true;
    void loadCardFonts(words).then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, [words]);

  // The film plays once per card (and on Play again); it rests on the last frame.
  React.useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!scene || !ctx) return undefined;
    if (reduced) {
      drawCard(ctx, scene, FINAL_MS, CARD_URL);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const ms = Math.min(FINAL_MS, now - start);
      drawCard(ctx, scene, ms, CARD_URL);
      if (ms < FINAL_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, reduced, run]);

  React.useImperativeHandle(
    ref,
    () => ({
      replay: () => setRun((n) => n + 1),
      image: async () => {
        if (!scene) throw new Error("not drawn yet");
        const still = document.createElement("canvas");
        still.width = FRAME.w;
        still.height = FRAME.h;
        const ctx = still.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        drawCard(ctx, scene, FINAL_MS, CARD_URL);
        const blob = await new Promise<Blob | null>((resolve) => still.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("no image");
        return { kind: "blob", blob, name: `${fileStem(card.period)}.png` };
      },
      video: async (onProgress, signal) => {
        if (!scene) throw new Error("not drawn yet");
        const blob = await encodeVideo(scene, onProgress, signal);
        return { kind: "blob", blob, name: `${fileStem(card.period)}.mp4` };
      },
    }),
    [scene, card.period],
  );

  // Development only: the drawn files, for checking frames outside the page (never in a production build).
  React.useEffect(() => {
    if (!__DEV__ || !scene) return undefined;
    const debug = globalThis as { __kawaseShareCard?: unknown };
    debug.__kawaseShareCard = {
      frame: async (ms: number) => {
        const still = document.createElement("canvas");
        still.width = FRAME.w;
        still.height = FRAME.h;
        const ctx = still.getContext("2d");
        if (ctx) drawCard(ctx, scene, ms, CARD_URL);
        return new Promise<Blob | null>((resolve) => still.toBlob(resolve, "image/png"));
      },
      video: (onProgress: (share: number) => void) => encodeVideo(scene, onProgress, new AbortController().signal),
    };
    return () => {
      delete debug.__kawaseShareCard;
    };
  }, [scene]);

  const height = (width * FRAME.h) / FRAME.w;
  return (
    <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={words.alt}>
      <canvas ref={canvas} width={FRAME.w} height={FRAME.h} style={{ width, height, display: "block", borderRadius: (width / FRAME.w) * L.paper.r }} />
      <CardArt seed={seed} tokens={tokens} onReady={setImages} />
    </View>
  );
});
