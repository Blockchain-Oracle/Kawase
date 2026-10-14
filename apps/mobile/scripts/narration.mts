// Onboarding narration (plan §1.5): one clip per story scene and language, spoken by ElevenLabs (eleven_v3, which
// covers all ten languages including Bengali and Urdu, with the language enforced per clip) in one warm voice, from the
// app's own story copy (packages/i18n catalogs: story.<scene>Title + story.<scene>Body). Clips are small mono AAC
// (.m4a) in assets/audio/narration/<lang>/, and src/narration/clips.ts maps them for the story screen.
//
//   pnpm --filter @kawase/mobile narration            # missing or changed clips only
//   pnpm --filter @kawase/mobile narration -- --force # all of them
//
// A clip is redone only when its text changes (the hash is kept in assets/audio/narration/manifest.json); clips of
// scenes that no longer exist are removed. The ElevenLabs key comes from the nearest .env up the directory tree and is
// never printed.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { config as loadEnv } from "dotenv";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { CATALOGS } from "@kawase/i18n";

const MODEL = "eleven_v3";
/** "Sarah": soft, warm and clear; one voice for every language. */
const VOICE = "EXAVITQu4vr4xnSDxMaL";
const ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`;
const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
const HASH_CHARS = 16;
const ERROR_CHARS = 200;
/** AAC bit rate for a spoken, mono clip: small and clean. */
const AAC_BITS_PER_SECOND = 48_000;
const MONO = 1;
const JSON_INDENT = 2;
/** Bump when the voice settings change, so every clip is redone. */
const VOICE_VERSION = 1;
const SETTINGS = { stability: 0.5, similarity_boost: 0.75 } as const;

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(APP_DIR, "assets/audio/narration");
const MANIFEST = join(OUT_DIR, "manifest.json");
const CLIPS_MODULE = join(APP_DIR, "src/narration/clips.ts");
const run = promisify(execFile);

/** The five scenes in order, with the catalog keys they read. */
const SCENES = [
  { scene: 1, key: "ask" },
  { scene: 2, key: "race" },
  { scene: 3, key: "budget" },
  { scene: 4, key: "arc" },
  { scene: 5, key: "test" },
] as const;

function findEnvFile(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".env"))) return join(dir, ".env");
    if (dirname(dir) === dir) return undefined;
  }
}
const envFile = findEnvFile(APP_DIR);
if (envFile) loadEnv({ path: envFile, quiet: true });
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set (looked for a .env file up from apps/mobile).");
  process.exit(1);
}
const force = process.argv.includes("--force");

type Clip = { locale: SupportedLocale; key: string; file: string; text: string };

/** "Kawase" is said kah-WAH-seh; the right-to-left mark some catalogs carry is not spoken. */
const spoken = (text: string) => text.replace(/‏/g, "");

const clips: Clip[] = SUPPORTED_LOCALES.flatMap((locale) =>
  SCENES.map(({ scene, key }) => {
    const story = CATALOGS[locale].story as Record<string, string>;
    return {
      locale,
      key,
      file: `${locale}/${scene}-${key}.m4a`,
      text: spoken(`${story[`${key}Title`] ?? ""} ${story[`${key}Body`] ?? ""}`.trim()),
    };
  }),
);

const hash = (text: string) =>
  createHash("sha256").update(`${MODEL}:${VOICE}:${VOICE_VERSION}:${text}`).digest("hex").slice(0, HASH_CHARS);

async function speak(clip: Clip): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": apiKey!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: clip.text, model_id: MODEL, language_code: clip.locale, voice_settings: SETTINGS }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt >= MAX_ATTEMPTS) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, ERROR_CHARS)}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
  }
}

async function render(clip: Clip): Promise<void> {
  const mp3 = join(tmpdir(), `kawase-narration-${clip.locale}-${clip.key}.mp3`);
  const out = join(OUT_DIR, clip.file);
  await writeFile(mp3, await speak(clip));
  await mkdir(dirname(out), { recursive: true });
  // macOS afconvert: mono AAC in an MPEG-4 container (.m4a), played by expo-audio on iOS, Android and the web.
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", String(AAC_BITS_PER_SECOND), "-c", String(MONO), mp3, out]);
  await rm(mp3, { force: true });
}

const previous: Record<string, string> = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : {};
const manifest: Record<string, string> = {};
const queue = [...clips];
let made = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let clip = queue.shift(); clip; clip = queue.shift()) {
      const digest = hash(clip.text);
      if (!force && previous[clip.file] === digest && existsSync(join(OUT_DIR, clip.file))) {
        manifest[clip.file] = digest;
        continue;
      }
      await render(clip);
      manifest[clip.file] = digest;
      made += 1;
      console.log(`${clip.file}`);
    }
  }),
);

// Clips of scenes that no longer exist.
const wanted = new Set(clips.map((clip) => clip.file));
for (const locale of SUPPORTED_LOCALES) {
  const folder = join(OUT_DIR, locale);
  if (!existsSync(folder)) continue;
  for (const name of await readdir(folder)) {
    if (!wanted.has(`${locale}/${name}`)) await rm(join(folder, name), { force: true });
  }
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(MANIFEST, `${JSON.stringify(sorted, null, JSON_INDENT)}\n`);

// The clips module: static requires so Metro bundles every clip.
const lines = [
  "// GENERATED by scripts/narration.mts. Do not edit: run `pnpm --filter @kawase/mobile narration`.",
  'import type { SupportedLocale } from "@kawase/config";',
  "",
  "/** One clip per story scene (1–5). */",
  "export type NarrationPanel = { clip: number };",
  "",
  "/* eslint-disable @typescript-eslint/no-require-imports */",
  "export const NARRATION_CLIPS: Record<SupportedLocale, readonly NarrationPanel[]> = {",
  ...SUPPORTED_LOCALES.map((locale) => {
    const scenes = SCENES.map(
      ({ scene, key }) => `    { clip: require("../../assets/audio/narration/${locale}/${scene}-${key}.m4a") },`,
    );
    return [`  ${locale}: [`, ...scenes, "  ],"].join("\n");
  }),
  "};",
  "/* eslint-enable @typescript-eslint/no-require-imports */",
  "",
];
await writeFile(CLIPS_MODULE, lines.join("\n"));
console.log(`\n${made} clip(s) generated, ${clips.length - made} unchanged; ${clips.length} in total.`);
