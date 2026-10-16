// Build the film's soundtrack from a generated bed and the effects, with ffmpeg only.
//
//   node audio/mix.mjs                 # every variant in VARIANTS → audio/out/<name>.wav + .m4a
//   node audio/mix.mjs G1              # one variant
//
// The bed is cut so its own drop (measured with find_drop.py) lands on the film's hit at 9.97 s, faded in over the first
// 0.2 s and decayed from 12.0 s to silence at 14.45 s (dB-linear, about 16 dB/s, as the reference). On top: the riser
// from 8.66 s (its peak lands on 9.96), the swish at 9.80, the sub boom and the punch on 9.97. Then loudness: −14 LUFS
// integrated, true peak ≤ −1 dBTP (a 4× oversampled limiter only if the gain would push it over).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(HERE, "work");
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

const HIT = 9.97;
const DUR = 14.5;
// Each effect: file, where its own peak/attack is (s into the file), where that lands in the film, gain, filters.
const FX = {
  riser: { file: "sfx-riser_a.mp3", at: 1.3, to: 9.96, gain: -15, filters: "highpass=f=400,lowpass=f=9000" },
  swish: { file: "sfx-whoosh_b.mp3", at: 0.125, to: 9.8, gain: -12, filters: "lowpass=f=8000" },
  boom: { file: "sfx-impact_a.mp3", at: 0, to: HIT, gain: -1, filters: "lowpass=f=160" },
  punch: { file: "sfx-riser_b.mp3", at: 0.15, to: HIT + 0.02, gain: -7, filters: "highpass=f=70,lowpass=f=2500" },
};
// Beds: the generated file and where its drop really is (find_drop.py's attack).
// `lift` raises the bed from the hit (dB) where its own drop is too small to carry the landing.
const VARIANTS = {
  G1: { bed: "bed-G1.mp3", drop: 11.39, bedGain: 0, lift: 0, fx: ["riser", "swish", "boom", "punch"] },
  I1: { bed: "bed-I1.mp3", drop: 11.325, bedGain: 0, lift: 0, fx: ["riser", "swish", "boom", "punch"] },
  J1: { bed: "bed-J1.mp3", drop: 11.52, bedGain: 0, lift: 3, fx: ["riser", "swish", "boom", "punch"] },
};

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function measure(file) {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out;
}
function loudness(file) {
  let err = "";
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    err = String(e.stderr);
  }
  const res = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128=peak=true -f null - 2>&1`], { encoding: "utf8" });
  const tail = res.slice(res.lastIndexOf("Summary:"));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]);
  return { I, TP, err };
}

function build(name) {
  const v = VARIANTS[name];
  const start = v.drop - HIT;
  if (start < 0) throw new Error(`${name}: the drop is too early to land on ${HIT}s`);
  const inputs = ["-i", join(WORK, v.bed)];
  const chains = [
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=${start.toFixed(3)}:duration=${DUR + 0.1},asetpts=PTS-STARTPTS,` +
      `volume=${v.bedGain}dB,afade=t=in:st=0:d=0.2,` +
      (v.lift ? `volume='if(lt(t,${HIT - 0.01}),1,${10 ** (v.lift / 20)})':eval=frame,` : "") +
      `volume='if(lt(t,12),1,if(lt(t,14.45),pow(10,-(t-12)*16/20),0))':eval=frame[bed]`,
  ];
  const labels = ["[bed]"];
  v.fx.forEach((key, i) => {
    const fx = FX[key];
    inputs.push("-i", join(WORK, fx.file));
    const delay = Math.round((fx.to - fx.at) * 1000);
    chains.push(
      `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,${fx.filters},volume=${fx.gain}dB,adelay=${delay}|${delay},` +
        `volume='if(lt(t,12.2),1,if(lt(t,14.45),pow(10,-(t-12.2)*14/20),0))':eval=frame[f${i}]`,
    );
    labels.push(`[f${i}]`);
  });
  chains.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=duration=${DUR},afade=t=out:st=${DUR - 0.08}:d=0.08[mix]`);
  const raw = join(OUT, `${name}-raw.wav`);
  ff(["-y", ...inputs, "-filter_complex", chains.join(";"), "-map", "[mix]", "-c:a", "pcm_f32le", raw]);

  // Loudness: gain to −14 LUFS; limit (4× oversampled) only if that would cross −1 dBTP.
  const m = loudness(raw);
  const gain = -14 - m.I;
  const wav = join(OUT, `${name}.wav`);
  const limit = m.TP + gain > -1.2;
  const chain = limit
    ? `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${10 ** (-1.4 / 20)}:attack=1:release=60:level=disabled,aresample=48000`
    : `volume=${gain.toFixed(2)}dB`;
  ff(["-y", "-i", raw, "-af", chain, "-c:a", "pcm_s24le", "-ar", "48000", wav]);
  ff(["-y", "-i", wav, "-c:a", "aac", "-b:a", "256k", join(OUT, `${name}.m4a`)]);
  const f = loudness(wav);
  console.log(`${name}: bed ${v.bed} from ${start.toFixed(2)}s, gain ${gain.toFixed(1)} dB${limit ? " + limiter" : ""} → ${f.I} LUFS, true peak ${f.TP} dBTP`);
}

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS)) build(name);
