// Onboarding narration (plan §1.5): one clip per story panel and language, spoken by OpenAI gpt-4o-mini-tts in the
// "marin" voice (GPT-Live's voice family), from the app's own story copy (packages/i18n catalogs: story.*Title +
// story.*Body; panel 2 also in its web and Android wording). Clips are small mono AAC (.m4a) in
// assets/audio/narration/<lang>/, and src/narration/clips.ts maps them for the story screen.
//
//   pnpm --filter @kawase/mobile narration            # missing or changed clips only
//   pnpm --filter @kawase/mobile narration -- --force # all of them
//
// A clip is redone only when its text changes (the hash is kept in assets/audio/narration/manifest.json). The OpenAI
// key comes from the nearest .env up the directory tree and is never printed.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { config as loadEnv } from "dotenv";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { CATALOGS } from "@kawase/i18n";

const MODEL = "gpt-4o-mini-tts";
const VOICE = "marin";
const ENDPOINT = "https://api.openai.com/v1/audio/speech";
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
const HASH_CHARS = 16;
/** AAC bit rate for a spoken, mono clip: small and clean. */
const AAC_BITS_PER_SECOND = 48_000;
const MONO = 1;
const JSON_INDENT = 2;
/** Bump when the speaking instructions change, so every clip is redone. */
const PRONUNCIATION_VERSION = 2;

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(APP_DIR, "assets/audio/narration");
const MANIFEST = join(OUT_DIR, "manifest.json");
const CLIPS_MODULE = join(APP_DIR, "src/narration/clips.ts");
const run = promisify(execFile);

const LANGUAGE: Record<SupportedLocale, string> = {
  en: "English",
  zh: "Mandarin Chinese",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  bn: "Bengali",
  pt: "Portuguese",
  ru: "Russian",
  ur: "Urdu",
};

/** The five panels in order, with the catalog keys they read; panel 2 has platform twins (i18n TWIN_SUFFIX). */
const PANELS = [
  { panel: 1, key: "request", variants: [""] },
  { panel: 2, key: "bounds", variants: ["", "Web", "Android"] },
  { panel: 3, key: "practice", variants: [""] },
  { panel: 4, key: "language", variants: [""] },
  // Panel 5 became "Everything on Arc" (B2-3); the shipped 5-first clips predate it until this script is run again.
  { panel: 5, key: "everything", variants: [""] },
] as const;

function findEnvFile(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".env"))) return join(dir, ".env");
    if (dirname(dir) === dir) return undefined;
  }
}
const envFile = findEnvFile(APP_DIR);
if (envFile) loadEnv({ path: envFile, quiet: true });
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set (looked for a .env file up from apps/mobile).");
  process.exit(1);
}
const force = process.argv.includes("--force");

type Clip = { locale: SupportedLocale; panel: number; key: string; variant: string; file: string; text: string };

const clips: Clip[] = SUPPORTED_LOCALES.flatMap((locale) =>
  PANELS.flatMap(({ panel, key, variants }) =>
    variants.map((variant) => {
      const story = CATALOGS[locale].story as Record<string, string>;
      const title = story[`${key}Title`] ?? "";
      const body = story[`${key}Body${variant}`] ?? story[`${key}Body`] ?? "";
      const suffix = variant ? `-${variant.toLowerCase()}` : "";
      return {
        locale,
        panel,
        key,
        variant,
        file: `${locale}/${panel}-${key}${suffix}.m4a`,
        text: `${title} ${body}`.trim(),
      };
    }),
  ),
);

const hash = (text: string) =>
  createHash("sha256").update(`${MODEL}:${VOICE}:${PRONUNCIATION_VERSION}:${text}`).digest("hex").slice(0, HASH_CHARS);

async function speak(clip: Clip): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: clip.text,
        instructions: `Speak ${LANGUAGE[clip.locale]}. A warm, calm, friendly voice introducing a money app to someone new; natural pace, clear, never salesy. Say the app's name "Kawase" as kah-WAH-seh (the Japanese word 為替).`,
        response_format: "wav",
      }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt >= MAX_ATTEMPTS) throw new Error(`OpenAI ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
  }
}

async function render(clip: Clip): Promise<void> {
  const wav = join(tmpdir(), `kawase-narration-${clip.locale}-${clip.panel}-${clip.variant || "base"}.wav`);
  const out = join(OUT_DIR, clip.file);
  await writeFile(wav, await speak(clip));
  await mkdir(dirname(out), { recursive: true });
  // macOS afconvert: mono AAC in an MPEG-4 container (.m4a), played by expo-audio on iOS, Android and the web.
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", String(AAC_BITS_PER_SECOND), "-c", String(MONO), wav, out]);
  await rm(wav, { force: true });
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
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(MANIFEST, `${JSON.stringify(sorted, null, JSON_INDENT)}\n`);

// The clips module: static requires so Metro bundles every clip.
const lines = [
  "// GENERATED by scripts/narration.mts. Do not edit: run `pnpm --filter @kawase/mobile narration`.",
  'import type { SupportedLocale } from "@kawase/config";',
  "",
  "/** One clip per story panel (1–5); panel 2 also in its web and Android wording. */",
  "export type NarrationPanel = { clip: number; web?: number; android?: number };",
  "",
  "/* eslint-disable @typescript-eslint/no-require-imports */",
  "export const NARRATION_CLIPS: Record<SupportedLocale, readonly NarrationPanel[]> = {",
  ...SUPPORTED_LOCALES.map((locale) => {
    const panels = PANELS.map(({ panel, key, variants }) => {
      const entry = variants.map((variant) => {
        const suffix = variant ? `-${variant.toLowerCase()}` : "";
        const name = variant ? variant.toLowerCase() : "clip";
        return `${name}: require("../../assets/audio/narration/${locale}/${panel}-${key}${suffix}.m4a")`;
      });
      return `    { ${entry.join(", ")} },`;
    });
    return [`  ${locale}: [`, ...panels, "  ],"].join("\n");
  }),
  "};",
  "/* eslint-enable @typescript-eslint/no-require-imports */",
  "",
];
await writeFile(CLIPS_MODULE, lines.join("\n"));
console.log(`\n${made} clip(s) generated, ${clips.length - made} unchanged; ${clips.length} in total.`);
