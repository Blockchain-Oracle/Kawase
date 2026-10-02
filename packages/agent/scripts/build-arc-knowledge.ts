// Builds the agent's curated Arc knowledge file (A5, arc_knowledge) from the researched Arc notes
// (context/01-arc/*.md, each sourced from docs.arc.io and Circle's docs) and Kawase's own English docs
// (apps/docs/content/docs/en). Developer-only notes (contract deployment, tutorial indexes, sample apps) are left out:
// the agent answers people using money, not builders. Code blocks are dropped; each "##" section is one entry.
// Run: pnpm --filter @kawase/agent knowledge:build
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OUT = new URL("../src/knowledge/arc-knowledge.json", import.meta.url).pathname;
const ARC_NOTES = join(ROOT, "context/01-arc");
const DOCS = join(ROOT, "apps/docs/content/docs/en");
const DOCS_SITE = "https://docs.getkawase.xyz";
const SKIP = new Set(["README.md", "deploying-contracts.md", "tutorials-index.md", "sample-applications.md"]);
/** Sections about building Kawase rather than using it. */
const SKIP_SECTIONS = /monorepo|hosting|tests that prove|public api/i;
/** One entry stays readable in a tool result. */
const ENTRY_CHARS = 1_400;
const MIN_CHARS = 80;

type Entry = { id: string; title: string; source: string; text: string };

function clean(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^import .*$/gm, "")
    .replace(/<\/?[A-Z][A-Za-z]*[^>]*>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sections(markdown: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  let heading = "";
  let body: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^#{1,2}\s+(.*)$/.exec(line);
    if (match) {
      if (body.join("").trim()) out.push({ heading, body: body.join("\n") });
      heading = match[1]!.trim();
      body = [];
    } else body.push(line);
  }
  if (body.join("").trim()) out.push({ heading, body: body.join("\n") });
  return out;
}

function firstSource(markdown: string, fallback: string): string {
  return /https:\/\/docs\.arc\.io[^\s)`,]*/.exec(markdown)?.[0] ?? /https:\/\/[^\s)`,]+/.exec(markdown)?.[0] ?? fallback;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith(".md") || entry.name.endsWith(".mdx") ? [join(dir, entry.name)] : [],
  );
}

const entries: Entry[] = [];
const add = (file: string, title: string, source: string, raw: string) => {
  const docTitle = /^title:\s*(.*)$/m.exec(raw)?.[1] ?? /^#\s+(.*)$/m.exec(raw)?.[1] ?? title;
  for (const [index, section] of sections(clean(raw)).entries()) {
    const text = section.body.replace(/^Purpose:.*$/m, "").replace(/^Sources?:[\s\S]*?(?=\n\n)/m, "").replace(/^Verified:.*$/m, "").trim();
    if (text.length < MIN_CHARS || SKIP_SECTIONS.test(section.heading)) continue;
    entries.push({
      id: `${relative(ROOT, file).replace(/[^a-z0-9]+/gi, "-")}-${index}`,
      title: section.heading && section.heading !== docTitle ? `${docTitle}: ${section.heading}` : docTitle,
      source,
      text: text.length > ENTRY_CHARS ? `${text.slice(0, ENTRY_CHARS)}…` : text,
    });
  }
};

for (const name of readdirSync(ARC_NOTES).sort()) {
  if (!name.endsWith(".md") || SKIP.has(name)) continue;
  const raw = readFileSync(join(ARC_NOTES, name), "utf8");
  add(join(ARC_NOTES, name), name.replace(/\.md$/, ""), firstSource(raw, "https://docs.arc.io"), raw);
}
for (const file of walk(DOCS).sort()) {
  const slug = relative(DOCS, file).replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "");
  add(file, slug, `${DOCS_SITE}/docs/${slug}`.replace(/\/$/, ""), readFileSync(file, "utf8"));
}

writeFileSync(OUT, `${JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), entries }, null, 1)}\n`);
console.log(`arc knowledge: ${entries.length} entries → ${relative(ROOT, OUT)}`);
