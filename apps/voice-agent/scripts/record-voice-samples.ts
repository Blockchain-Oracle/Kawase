// Records Settings → Voice's samples: each GPT-Live voice says one fixed line, straight from GPT-Live (no LiveKit room:
// the session hears silence as its microphone and is asked to speak). Five of the six voices exist only in GPT-Live,
// so this is the only way to hear them before a conversation. Writes apps/mobile/assets/audio/voices/<voice>.m4a and
// apps/mobile/src/voice/voice-samples.ts (the clip, its length, what was said, and a loudness curve that moves the orb
// while it plays). Needs OPENAI_API_KEY and ffmpeg. Run: pnpm --filter @kawase/voice-agent exec tsx scripts/record-voice-samples.ts [voice…]
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeLogger } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { AudioFrame } from "@livekit/rtc-node";
import { config } from "dotenv";

import { GPT_LIVE_VOICES, type GptLiveVoice } from "@kawase/config";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
initializeLogger({ pretty: false, level: "warn" });

const LINE = "Hi, I'm Kawase. I can send money, swap dollars for euros, or tell you what you hold, just by asking. What would you like to do?";
const SAMPLE_RATE = 24_000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const LOUD = 500;
/** The clip ends after this much quiet once speech began. */
const TAIL_MS = 1200;
const TIMEOUT_MS = 30_000;
const PREROLL_S = 0.15;
/** One loudness value per window: the orb reads the one under the playhead. */
const ENVELOPE_MS = 50;
const ROOT = new URL("../../../", import.meta.url).pathname;
const AUDIO_DIR = join(ROOT, "apps/mobile/assets/audio/voices");
const MODULE = join(ROOT, "apps/mobile/src/voice/voice-samples.ts");

type Take = { pcm: Int16Array; said: string };

async function record(voice: GptLiveVoice): Promise<Take> {
  const model = new openai.realtime.GPTLiveModel({ voice, delegation: "client" });
  const live = model.session();
  await live._updateSession("You are the voice of Kawase, a money app. Speak English, warmly and naturally.");
  const silence = setInterval(() => live.pushAudio(new AudioFrame(new Int16Array(FRAME_SAMPLES), SAMPLE_RATE, 1, FRAME_SAMPLES)), FRAME_MS);
  let said = "";
  // A dropped connection is an error event; without a listener it would throw out of the emitter.
  live.on("error", (event) => console.warn(`${voice}: GPT-Live error`, JSON.stringify((event.error as { body?: unknown }).body ?? String(event.error))));
  live.on("transcript_delta", ({ text }) => (said += text));
  try {
    const deadline = Date.now() + TIMEOUT_MS;
    while (live.sessionId === undefined && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    if (live.sessionId === undefined) throw new Error(`${voice}: GPT-Live did not start`);
    live._generateReply(`Say exactly this line once, in a warm, natural, unhurried voice, then stop: "${LINE}"`);
    const chunks: Int16Array[] = [];
    /** The quiet just before the first loud frame: a soft onset ("H" in "Hi") is kept. */
    const preroll: Int16Array[] = [];
    let heard = false;
    let quietMs = 0;
    const reader = live.audioStream.getReader();
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      const { frame } = value;
      const mono = frame.channels === 1 ? frame.data : frame.data.filter((_, i) => i % frame.channels === 0);
      const loud = mono.some((sample) => Math.abs(sample) > LOUD);
      if (!heard && !loud) {
        preroll.push(Int16Array.from(mono));
        while (preroll.reduce((sum, chunk) => sum + chunk.length, 0) > SAMPLE_RATE * PREROLL_S) preroll.shift();
        continue;
      }
      if (!heard) chunks.push(...preroll);
      heard = true;
      chunks.push(Int16Array.from(mono));
      quietMs = loud ? 0 : quietMs + (mono.length / frame.sampleRate) * 1000;
      if (quietMs >= TAIL_MS) break;
    }
    reader.releaseLock();
    if (!heard) throw new Error(`${voice}: nothing was said`);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Int16Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    // Trim the trailing quiet down to a short tail.
    let end = pcm.length;
    while (end > 0 && Math.abs(pcm[end - 1]!) <= LOUD) end -= 1;
    return { pcm: pcm.slice(0, Math.min(pcm.length, end + SAMPLE_RATE / 5)), said: said.trim() };
  } finally {
    clearInterval(silence);
    await live.close().catch(() => undefined);
  }
}

function envelope(pcm: Int16Array): number[] {
  const window = (SAMPLE_RATE * ENVELOPE_MS) / 1000;
  const rms: number[] = [];
  for (let start = 0; start < pcm.length; start += window) {
    let sum = 0;
    const end = Math.min(pcm.length, start + window);
    for (let i = start; i < end; i++) sum += pcm[i]! * pcm[i]!;
    rms.push(Math.sqrt(sum / (end - start)));
  }
  const peak = Math.max(...rms, 1);
  return rms.map((value) => Math.round((value / peak) * 100) / 100);
}

async function encode(voice: GptLiveVoice, pcm: Int16Array): Promise<void> {
  const raw = join(tmpdir(), `kawase-voice-${voice}.pcm`);
  await writeFile(raw, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  // AAC in an MP4 container plays on iOS, Android and every browser; mono 64 kb/s is plenty for speech.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", raw,
    "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
    join(AUDIO_DIR, `${voice}.m4a`)]);
}

const wanted = (process.argv.slice(2).length ? process.argv.slice(2) : GPT_LIVE_VOICES) as GptLiveVoice[];
await mkdir(AUDIO_DIR, { recursive: true });
const previous = await readFile(join(tmpdir(), "kawase-voice-samples.json"), "utf8").then((text) => JSON.parse(text) as Record<string, unknown>).catch(() => ({}));
const takes: Record<string, { durationMs: number; said: string; envelope: number[] }> = { ...previous } as never;
const ATTEMPTS = 3;
for (const voice of wanted) {
  let take: Take | undefined;
  for (let attempt = 1; !take; attempt++)
    take = await record(voice).catch((error: unknown) => {
      if (attempt >= ATTEMPTS) throw error;
      console.warn(`${voice}: attempt ${attempt} failed, retrying`, error);
      return undefined;
    });
  await encode(voice, take.pcm);
  takes[voice] = { durationMs: Math.round((take.pcm.length / SAMPLE_RATE) * 1000), said: take.said, envelope: envelope(take.pcm) };
  await writeFile(join(tmpdir(), "kawase-voice-samples.json"), JSON.stringify(takes));
  console.log(`${voice}: ${takes[voice]!.durationMs} ms, "${take.said}"`);
}

const entries = GPT_LIVE_VOICES.filter((voice) => takes[voice]).map((voice) => {
  const take = takes[voice]!;
  return `  ${voice}: {\n    source: require("../../assets/audio/voices/${voice}.m4a") as number,\n    durationMs: ${take.durationMs},\n    said: ${JSON.stringify(take.said)},\n    envelope: [${take.envelope.join(",")}],\n  },`;
});
await writeFile(
  MODULE,
  `// GENERATED by apps/voice-agent/scripts/record-voice-samples.ts (each GPT-Live voice, recorded from GPT-Live). Do not edit.
// \`envelope\`: the clip's loudness every ${ENVELOPE_MS} ms (0–1), which moves the orb while the sample plays.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-magic-numbers */
import type { GptLiveVoice } from "@kawase/config";

export type VoiceSample = { source: number; durationMs: number; said: string; envelope: readonly number[] };

export const VOICE_SAMPLE_ENVELOPE_MS = ${ENVELOPE_MS};

export const VOICE_SAMPLES: Partial<Record<GptLiveVoice, VoiceSample>> = {
${entries.join("\n")}
};
`,
);
console.log(`wrote ${MODULE}`);
process.exit(0);
