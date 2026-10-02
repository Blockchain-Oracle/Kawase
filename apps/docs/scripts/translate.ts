// Translates the English docs into the app's nine other languages and writes the results into the repo.
//
//   pnpm --filter @kawase/docs translate                 # everything that is missing or out of date
//   pnpm --filter @kawase/docs translate -- --lang fr,es # some languages only
//   pnpm --filter @kawase/docs translate -- --force      # redo even up-to-date files
//
// What it writes:
// - content/docs/<lang>/**.mdx and meta.json — each page carries `sourceHash`, the hash of the English file it was made
//   from, so an unchanged page is skipped and a changed one is redone;
// - messages/<lang>.json — the docs' own interface strings plus Fumadocs' (search, "On this page", …);
// - messages/scope/<lang>.json — the CAPABILITY_SCOPE sentences, keyed by their exact English text (a reworded sentence
//   falls back to English instead of showing a stale translation);
// - messages/index.ts — the import map for the above.
//
// The OpenAI key is read from the nearest .env up the directory tree (OPENAI_API_KEY) and never printed.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { uiTranslations } from "fumadocs-ui/i18n";
import { CAPABILITY_SCOPE, DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { CATALOGS, LANGUAGE_NAMES } from "@kawase/i18n";

const MODEL = "gpt-5.6-luna";
const ENDPOINT = "https://api.openai.com/v1/responses";
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
const HASH_CHARS = 16;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
const ERROR_EXCERPT_CHARS = 300;
const JSON_INDENT = 2;
/** argv[0] is node, argv[1] the script. */
const FIRST_ARG = 2;
const FRONTMATTER_OPEN = "---\n";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = join(APP_DIR, "content/docs");
const MESSAGES_DIR = join(APP_DIR, "messages");

// ---------- setup ----------

function findEnvFile(start: string): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const envFile = findEnvFile(APP_DIR);
if (envFile) loadEnv({ path: envFile, quiet: true });
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set (looked for a .env file up from apps/docs).");
  process.exit(1);
}

const args = process.argv.slice(FIRST_ARG);
const force = args.includes("--force");
/** Only rewrite frontmatter and the index from what is on disk; no API calls. */
const normalizeOnly = args.includes("--normalize");
const langArg = args[args.indexOf("--lang") + 1];
const targets = (SUPPORTED_LOCALES.filter((lang) => lang !== DEFAULT_LOCALE) as SupportedLocale[]).filter(
  (lang) => !args.includes("--lang") || (langArg ?? "").split(",").includes(lang),
);

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, HASH_CHARS);
const ENGLISH_NAME: Record<SupportedLocale, string> = {
  en: "English",
  zh: "Simplified Chinese",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  bn: "Bengali",
  pt: "Portuguese (Brazil)",
  ru: "Russian",
  ur: "Urdu",
};

/** The app's own words for its features in this language, so the docs say exactly what the screens say. */
function glossary(lang: SupportedLocale): string {
  const en = CATALOGS.en;
  const target = CATALOGS[lang];
  const pairs: [string, string][] = [
    ...Object.entries(en.capability).map(([key, value]) => [value, target.capability[key as keyof typeof en.capability]] as [string, string]),
    [en.network.mainnet, target.network.mainnet],
    [en.network.testnet, target.network.testnet],
    [en.network.testnetStrip, target.network.testnetStrip],
    [en.network.realMoney, target.network.realMoney],
  ];
  return pairs.map(([from, to]) => `- "${from}" → "${to}"`).join("\n");
}

const KEEP = [
  "Kawase",
  "為替",
  "Arc",
  "USDC",
  "EURC",
  "Circle",
  "CCTP",
  "App Kit",
  "Onramp Kit",
  "Morpho",
  "Aave V4",
  "Across",
  "Relay",
  "LI.FI",
  "deBridge",
  "Turnkey",
  "MetaMask",
  "EIP-7702",
  "ERC-7710",
  "x402",
  "Face ID",
  "Apple Pay",
  "Google Pay",
  "LiveKit",
  "ElevenLabs",
  "OpenAI",
  "TestFlight",
  "Expo",
  "Hono",
  "Postgres",
  "Drizzle",
  "Coolify",
].join(", ");

function instructions(lang: SupportedLocale, kind: "mdx" | "json"): string {
  const common = [
    `You translate the documentation of Kawase, a money app, from English into ${ENGLISH_NAME[lang]} (${LANGUAGE_NAMES[lang]}).`,
    "Write natural, plain, friendly language for everyday people, as a native speaker would; keep sentences short.",
    `Keep these names exactly as written, untranslated: ${KEEP}.`,
    "Keep amounts, numbers, chain IDs, addresses (0x…), transaction hashes, @handles, URLs, file paths and anything in backticks exactly as they are.",
    "Use the app's own wording for these terms:",
    glossary(lang),
  ];
  if (kind === "json") {
    return [
      ...common,
      "You receive a JSON object. Return a JSON object with exactly the same keys and nesting, every string value translated. Keep {placeholders} as they are. Return only the JSON.",
    ].join("\n");
  }
  return [
    ...common,
    "You receive an MDX file. Return the complete translated MDX file and nothing else (no code fences around it, no comments).",
    "Rules for MDX:",
    "- Frontmatter: translate the values of `title` and `description` only; keep every other line exactly.",
    "- Keep every JSX/MDX component tag and its props exactly, e.g. <Status ids=\"send request\" />, <Marks names=\"usdc eurc\" />, <AvailabilityMatrix />, <Tabs items={['Web', 'iPhone', 'Android']}>, <Tab value=\"Web\">, <Steps>, <Step>. Translate only the text between tags.",
    "- Keep code blocks (``` … ```) unchanged, except translate plain English sentences inside a ```text block's labels only if they are prose.",
    "- Keep Markdown links' targets unchanged; translate the link text.",
    "- Keep the same headings, lists, tables (same number of columns and rows) and blank lines.",
  ].join("\n");
}

// ---------- OpenAI ----------

type ResponsesOutput = { output?: { type: string; content?: { type: string; text?: string }[] }[]; output_text?: string };

async function callModel(system: string, input: string, json: boolean): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        instructions: system,
        input,
        ...(json ? { text: { format: { type: "json_object" } } } : {}),
      }),
    });
    if (response.ok) {
      const body = (await response.json()) as ResponsesOutput;
      const text =
        body.output_text ??
        (body.output ?? [])
          .flatMap((item) => item.content ?? [])
          .filter((part) => part.type === "output_text")
          .map((part) => part.text ?? "")
          .join("");
      if (text.trim()) return text;
    }
    const retryable = !response.ok && (response.status === HTTP_TOO_MANY || response.status >= HTTP_SERVER_ERROR);
    if (attempt >= MAX_ATTEMPTS || (!response.ok && !retryable)) {
      throw new Error(`OpenAI ${response.status}: ${(await response.text().catch(() => "")).slice(0, ERROR_EXCERPT_CHARS)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
  }
}

// ---------- MDX ----------

const stripFence = (text: string) => text.replace(/^```(?:mdx|markdown|md)?\n([\s\S]*?)\n```\s*$/u, "$1").trim() + "\n";

/** Structural fingerprint that must survive translation: component tags, code fences, links, table rows. */
function shape(mdx: string) {
  const count = (pattern: RegExp) => (mdx.match(pattern) ?? []).length;
  return {
    components: count(/<\/?[A-Z][A-Za-z]*/g),
    fences: count(/^```/gm),
    links: count(/\]\(/g),
    tableRows: count(/^\|/gm),
    frontmatter: mdx.startsWith("---\n") ? 1 : 0,
  };
}

const sameShape = (a: ReturnType<typeof shape>, b: ReturnType<typeof shape>) =>
  (Object.keys(a) as (keyof typeof a)[]).every((key) => a[key] === b[key]);

function withSourceHash(mdx: string, sourceHash: string): string {
  const end = mdx.indexOf("\n---", FRONTMATTER_OPEN.length - 1);
  const front = mdx.slice(0, end).replace(/^sourceHash:.*\n?/m, "");
  return `${front.trimEnd()}\nsourceHash: ${sourceHash}${mdx.slice(end)}`;
}

const existingHash = (mdx: string) => /^sourceHash:\s*(\S+)/m.exec(mdx)?.[1];

/** Re-emits `title` and `description` as JSON strings (valid YAML), so a translated colon can never break the page. */
function normalizeFrontmatter(mdx: string): string {
  const end = mdx.indexOf("\n---", FRONTMATTER_OPEN.length - 1);
  if (!mdx.startsWith("---\n") || end < 0) return mdx;
  const lines = mdx
    .slice("---\n".length, end)
    .split("\n")
    .map((line) => {
      const match = /^(title|description):\s*(.*)$/.exec(line);
      if (!match) return line;
      let value = (match[2] ?? "").trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          value = JSON.parse(value) as string;
        } catch {
          value = value.slice(1, -1);
        }
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1).replace(/''/g, "'");
      }
      return `${match[1]}: ${JSON.stringify(value)}`;
    });
  return `---\n${lines.join("\n")}${mdx.slice(end)}`;
}

/** Applies normalizeFrontmatter to every translated page already on disk (no API calls). */
async function normalizeAll(): Promise<void> {
  for (const lang of targets) {
    const dir = join(CONTENT_DIR, lang);
    if (!existsSync(dir)) continue;
    for (const file of await listFiles(dir)) {
      if (!file.endsWith(".mdx")) continue;
      const path = join(dir, file);
      const before = await readFile(path, "utf8");
      const after = normalizeFrontmatter(before);
      if (after !== before) await writeFile(path, after);
    }
  }
}

async function translateMdx(lang: SupportedLocale, file: string): Promise<string> {
  const english = await readFile(join(CONTENT_DIR, "en", file), "utf8");
  const sourceHash = hash(english);
  const out = join(CONTENT_DIR, lang, file);
  if (!force && existsSync(out) && existingHash(await readFile(out, "utf8")) === sourceHash) return "up to date";

  const expected = shape(english);
  let lastProblem = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const input = lastProblem
      ? `${english}\n\n(Your previous answer changed the file's structure: ${lastProblem}. Keep every tag, code fence, link and table row.)`
      : english;
    const translated = stripFence(await callModel(instructions(lang, "mdx"), input, false));
    const got = shape(translated);
    if (sameShape(expected, got)) {
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, normalizeFrontmatter(withSourceHash(translated, sourceHash)));
      return "written";
    }
    lastProblem = JSON.stringify({ expected, got });
  }
  throw new Error(`structure changed after ${MAX_ATTEMPTS} attempts: ${lastProblem}`);
}

// ---------- JSON (meta, messages, scope) ----------

async function translateJson<T>(lang: SupportedLocale, value: T): Promise<T> {
  const text = await callModel(instructions(lang, "json"), `Translate this JSON object:\n${JSON.stringify(value, null, JSON_INDENT)}`, true);
  return JSON.parse(text) as T;
}

type Meta = { title?: string; pages?: string[] };
const SEPARATOR = /^---(.+)---$/;

async function translateMeta(lang: SupportedLocale, file: string): Promise<string> {
  const meta = JSON.parse(await readFile(join(CONTENT_DIR, "en", file), "utf8")) as Meta;
  const labels: Record<string, string> = {};
  if (meta.title) labels.title = meta.title;
  for (const page of meta.pages ?? []) {
    const match = SEPARATOR.exec(page);
    if (match?.[1]) labels[`separator:${match[1]}`] = match[1];
  }
  const translated = await translateJson(lang, labels);
  const result: Meta = {
    ...meta,
    ...(meta.title ? { title: translated.title ?? meta.title } : {}),
    pages: (meta.pages ?? []).map((page) => {
      const match = SEPARATOR.exec(page);
      return match?.[1] ? `---${translated[`separator:${match[1]}`] ?? match[1]}---` : page;
    }),
  };
  const out = join(CONTENT_DIR, lang, file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(result, null, JSON_INDENT)}\n`);
  return "written";
}

/** Fumadocs' interface labels, e.g. "Search(search trigger)" → the translated "Search". */
function fumadocsLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const key of uiTranslations().keys) {
    if (key === "displayName") continue;
    labels[key] = key.replace(/(\([^)]*\))+$/u, "");
  }
  return labels;
}

async function translateMessages(lang: SupportedLocale): Promise<string> {
  const english = JSON.parse(await readFile(join(MESSAGES_DIR, "en.json"), "utf8")) as Record<string, unknown>;
  const translated = await translateJson(lang, { ...english, fumadocs: fumadocsLabels() });
  await writeFile(join(MESSAGES_DIR, `${lang}.json`), `${JSON.stringify(translated, null, JSON_INDENT)}\n`);
  return "written";
}

async function translateScope(lang: SupportedLocale): Promise<string> {
  const sentences = [
    ...new Set(Object.values(CAPABILITY_SCOPE).flatMap((scope) => (scope ? [...scope.supports, ...scope.notYet] : []))),
  ];
  const keyed = Object.fromEntries(sentences.map((sentence, index) => [`s${index}`, sentence]));
  const translated = await translateJson(lang, keyed);
  const bySentence = Object.fromEntries(sentences.map((sentence, index) => [sentence, translated[`s${index}`] ?? sentence]));
  await mkdir(join(MESSAGES_DIR, "scope"), { recursive: true });
  await writeFile(join(MESSAGES_DIR, "scope", `${lang}.json`), `${JSON.stringify(bySentence, null, JSON_INDENT)}\n`);
  return "written";
}

async function writeIndex(): Promise<void> {
  const langs = SUPPORTED_LOCALES.filter((lang) => lang !== DEFAULT_LOCALE);
  const messages = langs.filter((lang) => existsSync(join(MESSAGES_DIR, `${lang}.json`)));
  const scopes = langs.filter((lang) => existsSync(join(MESSAGES_DIR, "scope", `${lang}.json`)));
  const lines = [
    "// GENERATED by scripts/translate.ts. Do not edit: run `pnpm --filter @kawase/docs translate`.",
    "// The translated UI strings per language, and the capability-scope sentences keyed by their English text.",
    ...messages.map((lang) => `import ${lang} from "./${lang}.json";`),
    ...scopes.map((lang) => `import scope_${lang} from "./scope/${lang}.json";`),
    "",
    `export const MESSAGES: Record<string, unknown> = { ${messages.join(", ")} };`,
    `export const SCOPE: Record<string, Record<string, string>> = { ${scopes.map((lang) => `${lang}: scope_${lang}`).join(", ")} };`,
    "",
  ];
  await writeFile(join(MESSAGES_DIR, "index.ts"), lines.join("\n"));
}

// ---------- run ----------

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(dir, entry.name), base) : Promise.resolve([relative(base, join(dir, entry.name))]),
    ),
  );
  return nested.flat();
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
    }),
  );
}

const files = await listFiles(join(CONTENT_DIR, "en"));
type Job = { lang: SupportedLocale; label: string; run: () => Promise<string> };
const jobs: Job[] = targets.flatMap((lang) => [
  { lang, label: "messages", run: () => translateMessages(lang) },
  { lang, label: "scope", run: () => translateScope(lang) },
  ...files.map((file) => ({
    lang,
    label: file,
    run: () => (file.endsWith(".json") ? translateMeta(lang, file) : translateMdx(lang, file)),
  })),
]);

const failures: string[] = [];
await pool(normalizeOnly ? [] : jobs, async (job) => {
  try {
    const result = await job.run();
    console.log(`${job.lang} ${job.label}: ${result}`);
  } catch (error) {
    failures.push(`${job.lang} ${job.label}: ${(error as Error).message}`);
    console.error(`${job.lang} ${job.label}: FAILED ${(error as Error).message}`);
  }
});
await normalizeAll();
await writeIndex();
console.log(
  normalizeOnly
    ? "Frontmatter and messages/index.ts rewritten from disk."
    : `\nDone: ${jobs.length - failures.length}/${jobs.length} jobs. Missing pages fall back to English.`,
);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exitCode = 1;
}
