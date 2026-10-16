// The film's soundtrack (Abu, 10-16: "excitement, something is going on… once you finish, the stamp: bam"), rendered
// offline on the film's own clock, so the MP4 and a replay on the page sound the same and land on the same frames:
//   - a whoosh as the chart starts; then while the line draws, SND's sine ticks quicken (about 4 a second to 18) and
//     rise in pitch and level, an odometer winding up, and stop as the line lands;
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
/** The ticks: from one every 240 ms to one every 55 ms, pitch from 0.85× to 1.85×, level from 45 % to full. */
const TICK_FROM_MS = 240;
const TICK_TO_MS = 55;
const TICK_PITCH_FROM = 0.85;
const TICK_PITCH_RISE = 1;
const TICK_GAIN_FROM = 0.45;
/** The ticks sit forward in the mix (the compressor keeps the stamp on top). */
const TICK_LEVEL = 1.6;
const WHOOSH_AT_MS = 260;
/** The hanko meets the paper a moment into its press; the hit lands there. */
const STAMP_CONTACT_MS = 140;
const CELEBRATE_AFTER_MS = 320;
const STAMP_DEEP_RATE = 0.5;
const STAMP_DEEP_GAIN = 0.85;
const MASTER = 0.9;
const COMPRESSOR = { threshold: -18, ratio: 3, attack: 0.004, release: 0.18 } as const;

type Buffers = Record<"tick" | "whoosh" | "stamp" | "celebrate" | "received" | "send" | "confirmed", AudioBuffer>;

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
    const [tick, whoosh, stamp, celebrate, received, send, confirmed] = await Promise.all([
      fetchOne(CUE_SOURCES.agentStep),
      fetchOne(CUE_SOURCES.scene),
      fetchOne(FILM_SOURCES.stamp),
      fetchOne(FILM_SOURCES.celebrate),
      fetchOne(CUE_SOURCES.received),
      fetchOne(CUE_SOURCES.send),
      fetchOne(CUE_SOURCES.confirmed),
    ]);
    return { tick, whoosh, stamp, celebrate, received, send, confirmed };
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

  // The build: a whoosh as the chart starts, then ticks that quicken, rise and grow until the line lands.
  play(ctx, compressor, b.whoosh, WHOOSH_AT_MS / MS, CUE_VOLUME.scene);
  const fromS = FILM.drawFrom / MS;
  const toS = FILM.drawTo / MS;
  for (let at = fromS; at < toS; ) {
    const share = (at - fromS) / (toS - fromS);
    // Squared, so most of the quickening comes late, as the figure climbs to its end.
    const late = share * share;
    play(ctx, compressor, b.tick, at, TICK_LEVEL * CUE_VOLUME.agentStep * (TICK_GAIN_FROM + (1 - TICK_GAIN_FROM) * share), TICK_PITCH_FROM + TICK_PITCH_RISE * late);
    at += (TICK_FROM_MS + (TICK_TO_MS - TICK_FROM_MS) * late) / MS;
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
