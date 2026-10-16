// Generate soundtrack candidates with ElevenLabs: music beds from composition plans built on the reference's measured
// shape (86 BPM, warm and low-heavy, steady from 0.2 s, a rise into a sub-bass drop at ~10 s, held, then a decay), and
// the effects mixed on top at exact times (two rising whooshes, the sub-bass hit). Every file lands in audio/work/
// (git-ignored); `analyze.py` measures them against the reference and `mix.mjs` builds the final track.
//
//   ELEVENLABS_API_KEY=… node audio/generate.mjs music A B C   # beds by plan name (see PLANS)
//   ELEVENLABS_API_KEY=… node audio/generate.mjs sfx            # whooshes and hits
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(HERE, "work");
const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set");

const NO = ["vocals", "singing", "hi-hats", "bright cymbals", "shakers", "harsh synth lead", "EDM", "trap hi-hats", "dubstep"];

// Each plan is 14.5 s: the glide (7 s), the rise into the drop (3 s, the drop lands at the chunk edge, 10 s), the
// drop held and decaying (4.5 s). The model does not keep chunk lengths exactly; analyze.py finds where the drop
// really lands and mix.mjs shifts the bed so it sits on 9.97 s.
const PLANS = {
  A: [
    {
      text: "[Intro groove]\nA warm, steady downtempo groove from the first beat. No build-up, no intro swell.",
      duration_ms: 7000,
      positive_styles: ["warm downtempo", "86 bpm", "deep round bass", "soft muted kick", "warm Rhodes electric piano chords", "analog tape warmth", "low lush pads", "instrumental", "premium tech product film"],
      negative_styles: [...NO, "build-up", "riser"],
      context_adherence: "high",
    },
    {
      text: "[Rise]\n{an airy whoosh swells upward into the drop}",
      duration_ms: 3000,
      positive_styles: ["rising filter sweep", "reverse swell", "anticipation", "same groove continues"],
      negative_styles: NO,
      context_adherence: "high",
    },
    {
      text: "[Drop]\n{one huge deep sub-bass boom on the first beat}\nThe groove lands full and warm, holds, then fades out to silence.",
      duration_ms: 4500,
      positive_styles: ["massive sub-bass boom", "808 drop", "warm full groove", "deep bass", "fade out"],
      negative_styles: NO,
      context_adherence: "high",
    },
  ],
  B: [
    {
      text: "[Groove]\nFelt piano and a deep bass line over a soft, unhurried beat, steady from the first second.",
      duration_ms: 7000,
      positive_styles: ["cinematic lo-fi", "86 bpm", "felt piano", "deep warm sub bass", "soft kick and rim", "vinyl warmth", "intimate", "instrumental", "luxury brand film"],
      negative_styles: [...NO, "build-up", "riser", "bright"],
      context_adherence: "high",
    },
    {
      text: "[Lift]\n{a soft rising whoosh and a reverse piano swell into the drop}",
      duration_ms: 3000,
      positive_styles: ["reverse swell", "rising air", "tension", "same tempo"],
      negative_styles: NO,
      context_adherence: "high",
    },
    {
      text: "[Landing]\n{a deep cinematic sub boom on the downbeat}\nThe full groove, warm and low, held for two bars, then a long fade to silence.",
      duration_ms: 4500,
      positive_styles: ["deep sub boom", "cinematic impact", "warm low end", "long tail", "fade out"],
      negative_styles: NO,
      context_adherence: "high",
    },
  ],
  C: [
    {
      text: "[Pulse]\nA dark-warm minimal groove: a low bass pulse, a soft kick, warm synth chords, steady and confident.",
      duration_ms: 7000,
      positive_styles: ["minimal electronic", "86 bpm", "warm analog synth chords", "deep sub bass pulse", "soft kick", "muffled", "modern fintech launch", "instrumental"],
      negative_styles: [...NO, "build-up", "riser", "arpeggio"],
      context_adherence: "high",
    },
    {
      text: "[Rise]\n{a rising whoosh, the filter opens}",
      duration_ms: 3000,
      positive_styles: ["filter opening", "rising whoosh", "anticipation"],
      negative_styles: NO,
      context_adherence: "high",
    },
    {
      text: "[Drop]\n{a deep sub-bass hit on the downbeat}\nThe groove opens up, held, then fades away.",
      duration_ms: 4500,
      positive_styles: ["sub-bass hit", "warm wide chords", "deep bass", "fade out to silence"],
      negative_styles: NO,
      context_adherence: "high",
    },
  ],
};

// Two-section tracks (the method that works): a groove long enough to cut 10 s from its end, then the drop. The model
// puts the drop near, not at, the chunk edge; analyze.py finds where it really lands and mix.mjs takes the 14.5 s
// window around it, so the bed is one continuous take whose own drop sits on the film's hit.
const groove = (text, styles) => ({ text, duration_ms: 14000, positive_styles: styles, negative_styles: [...NO, "build-up", "riser", "intro", "fade in"], context_adherence: "high" });
const drop = (text, styles) => ({ text, duration_ms: 12000, positive_styles: styles, negative_styles: NO, context_adherence: "high" });
Object.assign(PLANS, {
  D: [
    groove("[Groove]\nA warm lo-fi groove, steady from the first beat: dusty muted kick and snare, a deep round bass line, warm Rhodes chords.", ["warm lo-fi hip hop", "86 bpm", "deep round bass", "muted dusty drums", "warm Rhodes chords", "tape saturation", "low and warm", "instrumental"]),
    drop("[Drop]\n{a heavy 808 sub-bass enters on the downbeat}\nThe same groove, fuller and lower, the sub holding under it.", ["808 sub bass", "heavy low end", "fuller groove", "warm Rhodes", "head-nodding"]),
  ],
  E: [
    groove("[Groove]\nFelt piano chords and a deep bass over a soft, unhurried kick, steady and warm, no intro.", ["cinematic downtempo", "86 bpm", "felt piano", "deep warm bass", "soft kick", "low pads", "premium brand film", "instrumental"]),
    drop("[Drop]\n{a deep cinematic sub boom on the downbeat}\nThe groove lands: the bass doubles with a sub, chords wider, still warm and low.", ["cinematic sub boom", "massive low end", "wide warm chords", "full groove"]),
  ],
  F: [
    groove("[Groove]\nA warm neo-soul groove: electric piano, round bass guitar, soft brushed kit, steady from the first second.", ["neo-soul", "chillhop", "86 bpm", "warm electric piano", "round bass guitar", "soft brushed drums", "mellow", "instrumental"]),
    drop("[Drop]\n{an 808 sub drop on the downbeat}\nThe groove opens up, the sub carrying it, warm and full.", ["808 sub", "full warm groove", "deep bass", "confident"]),
  ],
  G: [
    groove("[Groove]\nA half-time warm electronic groove: soft kick, warm analog chords, a low bass pulse, smooth and steady.", ["warm electronic downtempo", "86 bpm half-time", "analog synth chords", "low bass pulse", "soft kick", "smooth", "fintech launch film", "instrumental"]),
    drop("[Drop]\n{a huge sub-bass drop on the downbeat}\nEverything lands: sub bass, wide warm chords, the groove at full weight.", ["sub-bass drop", "wide warm chords", "heavy low end", "full groove"]),
  ],
  // Third round: the glide needs sub from the first beat (the reference's glide is 34 % under 120 Hz, ours had ~1–9 %).
  H: [
    groove("[Groove]\nA warm, deep, slow groove from the first beat: a round sub-bass line, a soft muffled kick, warm Rhodes chords, mellow and steady.", ["deep warm downtempo", "86 bpm", "round sub-bass line", "muffled soft kick", "warm Rhodes chords", "lowpassed", "mellow", "instrumental"]),
    drop("[Drop]\n{a huge sub-bass boom on the downbeat}\nThe groove lands fuller: the sub doubles, the chords open, still warm and low.", ["huge sub bass", "808 boom", "fuller warm groove", "deep low end"]),
  ],
  I: [
    groove("[Groove]\nWarm chillhop with a deep sub bass under every bar: dusty soft kick, mellow keys, nothing bright, steady from the first second.", ["chillhop", "86 bpm", "deep sub bass", "dusty soft kick", "mellow keys", "warm tape", "no hi-hats", "instrumental"]),
    drop("[Drop]\n{an 808 sub drop on the downbeat}\nThe beat opens up with a heavier 808 and wider warm chords.", ["heavy 808", "sub drop", "wider warm chords", "full groove"]),
  ],
  J: [
    groove("[Pulse]\nA warm cinematic pulse: a deep sub-bass note on every beat, soft low piano chords, a gentle kick, steady and confident.", ["cinematic", "86 bpm", "deep sub-bass pulse", "soft low piano", "gentle kick", "warm", "premium product film", "instrumental"]),
    drop("[Drop]\n{a deep cinematic boom on the downbeat}\nThe pulse lands full and wide: sub, piano and pads together, warm and low.", ["cinematic boom", "massive warm low end", "wide pads", "full"]),
  ],
  K: [
    groove("[Groove]\nA warm neo-soul groove with an 808 sub bass from the start, soft Rhodes, a muted kick and rim, unhurried.", ["neo-soul", "86 bpm", "808 sub bass", "soft Rhodes", "muted kick", "rim click", "warm", "instrumental"]),
    drop("[Drop]\n{a big 808 hit on the downbeat}\nThe groove lands heavier and wider, the 808 carrying it.", ["big 808", "heavier groove", "wide warm chords", "deep"]),
  ],
});

const SFX = {
  whoosh_a: { text: "A smooth, soft airy whoosh rising in pitch, cinematic transition, clean, no impact at the end", duration_seconds: 1.4, prompt_influence: 0.6 },
  whoosh_b: { text: "Short fast airy swish upward, soft and warm, camera fly-by, no impact", duration_seconds: 0.8, prompt_influence: 0.6 },
  hit_a: { text: "One deep cinematic sub-bass boom impact, very low, warm and clean, long smooth tail, no high end, no crackle", duration_seconds: 3.0, prompt_influence: 0.7 },
  hit_b: { text: "Deep 808 sub drop boom, a single low hit with a long round tail, clean, warm, no distortion", duration_seconds: 2.5, prompt_influence: 0.7 },
  // Second round (the first whooshes did not rise; the hits were bare sines with no attack).
  riser_a: { text: "Reverse cymbal swell rising to a peak, airy and smooth, building up and stopping abruptly at the end", duration_seconds: 1.4, prompt_influence: 0.75 },
  riser_b: { text: "Fast airy whoosh rising upward, cinematic camera swoosh that builds and cuts off sharply", duration_seconds: 1.3, prompt_influence: 0.75 },
  riser_c: { text: "Smooth white noise riser, a filter sweep opening upward, soft, ends sharply", duration_seconds: 1.3, prompt_influence: 0.75 },
  swish_a: { text: "One quick soft whoosh pass-by, airy and warm, very short", duration_seconds: 0.6, prompt_influence: 0.7 },
  impact_a: { text: "Deep cinematic boom impact: a soft punchy transient and a long warm sub-bass tail, clean, no metal, no crash cymbal", duration_seconds: 3.5, prompt_influence: 0.75 },
  impact_b: { text: "Trailer hit: a low punchy boom with a sub drop and a long low tail, soft transient, clean, no cymbals", duration_seconds: 3.5, prompt_influence: 0.75 },
};

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

mkdirSync(WORK, { recursive: true });
const [kind, ...names] = process.argv.slice(2);
if (kind === "music") {
  // One at a time: the plan allows two requests in flight.
  for (const name of names.length ? names : Object.keys(PLANS)) {
    const take = process.env.TAKE ?? "1";
    const audio = await post("/music?output_format=mp3_48000_320", { composition_plan: { chunks: PLANS[name] }, model_id: "music_v2_5" });
    const file = join(WORK, `bed-${name}${take}.mp3`);
    writeFileSync(file, audio);
    console.log("wrote", file, audio.length);
  }
} else if (kind === "sfx") {
  for (const [name, body] of Object.entries(SFX)) {
    if (names.length && !names.includes(name)) continue;
    const audio = await post("/sound-generation?output_format=mp3_44100_192", { ...body, model_id: "eleven_text_to_sound_v2" });
    const file = join(WORK, `sfx-${name}.mp3`);
    writeFileSync(file, audio);
    console.log("wrote", file, audio.length);
  }
} else {
  throw new Error("usage: generate.mjs music [A B C] | sfx [names]");
}
