// Splits each language's catalog into one file per namespace with an index per language:
//   src/catalog/en/index.ts          the English catalog (the source of the keys) and the `Catalog` type
//   src/catalog/en/agent-wallet.ts   export const agentWallet = { … } as const;
//   src/catalog/fr/agent-wallet.ts   export const agentWallet: Catalog["agentWallet"] = { … };
// Re-runnable and merging: when a language has both a single-file catalog (`fr.ts`, e.g. another branch's additions
// restored in a merge) and a folder, the two are merged (the single file wins on a clash) and the single file is
// removed. Run: pnpm --filter @kawase/i18n catalogs:split (then prettier and the catalog tests run on their own).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LOCALES = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur"] as const;
const ROOT = new URL("../src/catalog/", import.meta.url).pathname;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const INDENT = "  ";

type Tree = { [key: string]: string | Tree };

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function literal(value: string | Tree, depth: number): string {
  if (typeof value === "string") return JSON.stringify(value);
  const inner = INDENT.repeat(depth + 1);
  const lines = Object.entries(value).map(([key, child]) => `${inner}${IDENT.test(key) ? key : JSON.stringify(key)}: ${literal(child, depth + 1)},`);
  return `{\n${lines.join("\n")}\n${INDENT.repeat(depth)}}`;
}

/** `b` over `a`, key by key (b's order for its keys, a's order otherwise). */
function merge(a: Tree, b: Tree): Tree {
  const out: Tree = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const before = out[key];
    out[key] = typeof value === "object" && typeof before === "object" ? merge(before, value) : value;
  }
  return out;
}

async function load(locale: string): Promise<{ tree: Tree; single: string | undefined }> {
  const single = join(ROOT, `${locale}.ts`);
  const folder = join(ROOT, locale, "index.ts");
  let tree: Tree = {};
  if (existsSync(folder)) tree = (await import(pathToFileURL(folder).href))[locale] as Tree;
  if (existsSync(single)) tree = merge(tree, (await import(pathToFileURL(single).href))[locale] as Tree);
  return { tree, single: existsSync(single) ? single : undefined };
}

function write(locale: string, tree: Tree, englishOrder: string[]) {
  const dir = join(ROOT, locale);
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(dir)) rmSync(join(dir, file));
  const english = locale === "en";
  const names = english ? Object.keys(tree) : englishOrder;
  for (const name of names) {
    const value = tree[name];
    if (value === undefined) throw new Error(`${locale} has no "${name}" (every language needs every English namespace)`);
    const body = english
      ? `export const ${name} = ${literal(value, 0)} as const;\n`
      : `import type { Catalog } from "../en/index";\n\nexport const ${name}: Catalog["${name}"] = ${literal(value, 0)};\n`;
    writeFileSync(join(dir, `${kebab(name)}.ts`), body);
  }
  const imports = names.map((name) => `import { ${name} } from "./${kebab(name)}";`).join("\n");
  const fields = names.join(",\n  ");
  const index = english
    ? `// The source catalog, one file per namespace. Every other language has exactly these keys (a test checks).
// A new namespace: a file here and in every language folder, and its line in each index (or write it into a single
// \`<locale>.ts\` and run \`pnpm --filter @kawase/i18n catalogs:split\`).
${imports}

export const en = {
  ${fields},
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every catalog must have: the English keys, with any string as the value. */
export type Catalog = Widen<typeof en>;
`
    : `import type { Catalog } from "../en/index";

${imports}

export const ${locale}: Catalog = {
  ${fields},
};
`;
  writeFileSync(join(dir, "index.ts"), index);
}

const english = await load("en");
const order = Object.keys(english.tree);
const loaded = new Map<string, Awaited<ReturnType<typeof load>>>([["en", english]]);
for (const locale of LOCALES.slice(1)) loaded.set(locale, await load(locale));
for (const locale of LOCALES) {
  const { tree, single } = loaded.get(locale)!;
  write(locale, tree, order);
  if (single) rmSync(single);
}
console.log(`split ${LOCALES.length} catalogs into ${order.length} namespaces each`);
