// The film's soundtrack (Abu, 10-16: "excitement, something is going on… once you finish, the stamp: bam"), rendered
// offline on the film's own clock, so the MP4 and a replay on the page sound the same and land on the same frames:
//   - while the line draws, SND's sine progress ticks run back to back, quickening and rising (rate 1 → 1.5) as the
//     balance climbs, and swell, then stop as the line lands;
//   - each coin that pops on plays the app's own money cue for it: the bell when money came in, the chord when it left,
//     the piano C for a swap, a deposit or a trade;
//   - the figure landing is the piano C again; the hanko is SND's industrial hit with an octave-down copy under it for
//     weight; the piano celebration plays under the held last frame.
// Every sound is a processed SND cue from the app (no generated music); a light compressor glues the mix.
import { Asset } from "expo-asset";

import { CUE_SOURCES, CUE_VOLUME } from "@/feedback/cue-sources";

import { FILM_SOURCES, FILM_VOLUME } from "./film-sources";
import { FILM } from "./layout";
import type { CardData, MarkerKind } from "./model";

const RATE = 44_100;
const CHANNELS = 2;
const MS = 1000;
const TICK_RATE_FROM = 1;
const TICK_RATE_TO = 1.5;
const TICK_GAIN_FROM = 0.55;
const TICK_FADE_MS = 300;
/** The hanko meets the paper a moment into its press; the hit lands there. */
const STAMP_CONTACT_MS = 140;
const CELEBRATE_AFTER_MS = 320;
const STAMP_DEEP_RATE = 0.5;
const STAMP_DEEP_GAIN = 0.85;
const MASTER = 0.9;
const COMPRESSOR = { threshold: -18, ratio: 3, attack: 0.004, release: 0.18 } as const;

type Buffers = Record<"ticks" | "stamp" | "celebrate" | "received" | "send" | "confirmed", AudioBuffer>;

const POP_CUE: Record<MarkerKind, "received" | "send" | "confirmed"> = {
  in: "received",
  out: "send",
  bridge: "send",
  swap: "confirmed",
  earn: "confirmed",
  trade: "confirmed",
};

let raw: Promise<Record<keyof Buffers, ArrayBuffer>> | null = null;

/** The cue files, fetched once per page (decoded per render: each context decodes its own copy). */
function files(): Promise<Record<keyof Buffers, ArrayBuffer>> {
  const fetchOne = async (module: number) => {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    const response = await fetch(asset.localUri ?? asset.uri);
    return response.arrayBuffer();
  };
  raw ??= (async () => {
    const [ticks, stamp, celebrate, received, send, confirmed] = await Promise.all([
      fetchOne(FILM_SOURCES.ticks),
      fetchOne(FILM_SOURCES.stamp),
      fetchOne(FILM_SOURCES.celebrate),
      fetchOne(CUE_SOURCES.received),
      fetchOne(CUE_SOURCES.send),
      fetchOne(CUE_SOURCES.confirmed),
    ]);
    return { ticks, stamp, celebrate, received, send, confirmed };
  })().catch((error) => {
    raw = null;
    throw error;
  });
  return raw;
}

async function decode(ctx: BaseAudioContext): Promise<Buffers> {
  const source = await files();
  const entries = await Promise.all(Object.entries(source).map(async ([name, data]) => [name, await ctx.decodeAudioData(data.slice(0))] as const));
  return Object.fromEntries(entries) as Buffers;
}

function play(ctx: BaseAudioContext, out: AudioNode, buffer: AudioBuffer, atS: number, gain: number, rate = 1) {
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.playbackRate.value = rate;
  const level = ctx.createGain();
  level.gain.value = gain;
  node.connect(level).connect(out);
  node.start(atS);
}

/** When the head passes a moment of the card (the same mapping the drawing uses). */
const passedAtMs = (card: CardData, t: number) => FILM.drawFrom + ((t - card.from) / Math.max(1, card.to - card.from)) * (FILM.drawTo - FILM.drawFrom);

function schedule(ctx: BaseAudioContext, b: Buffers, card: CardData) {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR.threshold;
  compressor.ratio.value = COMPRESSOR.ratio;
  compressor.attack.value = COMPRESSOR.attack;
  compressor.release.value = COMPRESSOR.release;
  const master = ctx.createGain();
  master.gain.value = MASTER;
  compressor.connect(master).connect(ctx.destination);

  // The build: ticks back to back over the draw, quicker, higher and louder as it goes, faded out as the line lands.
  const bed = ctx.createGain();
  bed.connect(compressor);
  const fromS = FILM.drawFrom / MS;
  const toS = FILM.drawTo / MS;
  bed.gain.setValueAtTime(TICK_GAIN_FROM * FILM_VOLUME.ticks, fromS);
  bed.gain.linearRampToValueAtTime(FILM_VOLUME.ticks, toS - TICK_FADE_MS / MS);
  bed.gain.linearRampToValueAtTime(0, toS);
  for (let at = fromS; at < toS; ) {
    const share = (at - fromS) / (toS - fromS);
    const rate = TICK_RATE_FROM + (TICK_RATE_TO - TICK_RATE_FROM) * share;
    play(ctx, bed, b.ticks, at, 1, rate);
    at += b.ticks.duration / rate;
  }

  // Each coin's own money cue as it pops on.
  for (const marker of card.markers) {
    const cue = POP_CUE[marker.kind];
    play(ctx, compressor, b[cue], passedAtMs(card, marker.t) / MS, CUE_VOLUME[cue]);
  }
  play(ctx, compressor, b.confirmed, FILM.pctAt / MS, CUE_VOLUME.confirmed);

  // The hanko: bam, and the celebration under the hold.
  const stampS = (FILM.hankoAt + STAMP_CONTACT_MS) / MS;
  play(ctx, compressor, b.stamp, stampS, FILM_VOLUME.stamp);
  play(ctx, compressor, b.stamp, stampS, FILM_VOLUME.stamp * STAMP_DEEP_GAIN, STAMP_DEEP_RATE);
  play(ctx, compressor, b.celebrate, (FILM.hankoAt + CELEBRATE_AFTER_MS) / MS, FILM_VOLUME.celebrate);
}

/** The whole soundtrack as one buffer, for the MP4's audio track. */
export async function renderSoundtrack(card: CardData): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(CHANNELS, Math.ceil((RATE * FILM.totalMs) / MS), RATE);
  schedule(ctx, await decode(ctx), card);
  return ctx.startRendering();
}

/** Plays the soundtrack live from now (Play again on the page); returns a stop. */
export async function playSoundtrack(card: CardData): Promise<() => void> {
  const ctx = new AudioContext();
  const buffer = await renderSoundtrack(card);
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  node.start();
  return () => {
    node.stop();
    void ctx.close();
  };
}
