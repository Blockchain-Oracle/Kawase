// The demo seller's production build (the same as apps/api/scripts/build.mjs): our TypeScript bundled to JavaScript
// once, so production runs `node` on it — one process, no TypeScript compiled at runtime by tsx (it was pnpm → tsx →
// node). Every npm package stays an import, installed as usual. Files read relative to themselves
// (`new URL("../…", import.meta.url)`) are re-aimed at the same file from the bundle's folder, and a small resolve hook
// adds the extension a dependency's ESM may leave off (what tsx forgave).
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
// Ours: the @kawase workspace packages.
const OWN = /^@kawase\//;
/** npm packages bundled with our code instead of installed (their installed version differed from the one our code resolves). */
const BUNDLED = new Set([]);
/** The package.json Node would load for `name` from `dir`: node_modules/<name> in this folder or the nearest above. */
function findManifest(dir, name) {
  for (let at = dir; ; at = dirname(at)) {
    const manifest = resolve(at, "node_modules", name, "package.json");
    if (existsSync(manifest)) return manifest;
    if (dirname(at) === at) return null;
  }
}
const packageName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);


const externalNpm = {
  name: "external-npm",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      // Only bundled files are ever importers here, so a package's own imports follow it into the bundle.
      if (OWN.test(args.path) || BUNDLED.has(packageName(args.path)) || args.importer.includes("node_modules")) return undefined;
      {
        const manifest = findManifest(dirname(args.importer), packageName(args.path));
        if (manifest) expected.set(packageName(args.path), JSON.parse(readFileSync(manifest, "utf8")).version);
      }
      return { path: args.path, external: true };
    });
  },
};

const OUT_DIR = here("../dist/bundle");
const RELATIVE_URL = /new URL\((["'])(\.\.?\/[^"']+)\1,\s*import\.meta\.url\)/g;

/** Rewrites each relative `new URL("…", import.meta.url)` so it names the same file from the bundle's folder. */
const reaim = {
  name: "reaim-relative-urls",
  setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.includes("node_modules")) return undefined;
      const source = readFileSync(args.path, "utf8");
      if (!source.includes("import.meta.url")) return undefined;
      const contents = source.replace(RELATIVE_URL, (_match, quote, rel) => {
        let target = relative(OUT_DIR, resolve(dirname(args.path), rel));
        if (!target.startsWith(".")) target = `./${target}`;
        return `new URL(${quote}${target}${quote}, import.meta.url)`;
      });
      return { contents, loader: "ts" };
    });
  },
};

// `--check <dir>`: after `pnpm deploy`, every external package our code imports must be installed at the version our
// code resolved when it was bundled; a different one (a flat install's hoisting pick) fails the image build.
if (process.argv[2] === "--check") {
  const installed = process.argv[3];
  const wanted = JSON.parse(readFileSync(here("../dist/bundle/externals.json"), "utf8"));
  const wrong = Object.entries(wanted).filter(([name, version]) => {
    const manifest = `${installed}/node_modules/${name}/package.json`;
    return !existsSync(manifest) || JSON.parse(readFileSync(manifest, "utf8")).version !== version;
  });
  if (wrong.length > 0) {
    console.error(`installed versions differ from the bundle's: ${wrong.map(([name, version]) => `${name}@${version}`).join(", ")} — add them to BUNDLED`);
    process.exit(1);
  }
  console.log(`${Object.keys(wanted).length} external packages at the versions the bundle expects`);
  process.exit(0);
}

const expected = new Map();
rmSync(here("../dist"), { recursive: true, force: true });
await build({
  entryPoints: { main: here("../src/main.ts") },
  outdir: OUT_DIR,
  // Dynamic import()s become their own chunks with Node's own module order (one-file output wraps modules in lazy
  // initialisers, and a constant read before its wrapper ran is undefined: Agari's ops crash-looped on that, 16 Oct).
  // Chunks sit beside main.mjs, so paths re-aimed from the bundle's folder hold in every chunk.
  splitting: true,
  outExtension: { ".js": ".mjs" },
  chunkNames: "[name]-[hash]",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  logLevel: "warning",
  plugins: [externalNpm, reaim],
  banner: { js: "import { createRequire as __kawaseRequire } from 'node:module'; const require = __kawaseRequire(import.meta.url);" },
});
// A dependency's ESM build imports a deep path without its extension (@pythnetwork/solana-utils → "jito-ts/dist/sdk/
// block-engine/types"): tsx's resolver forgave it, Node's does not. This hook, loaded with --import, retries only a
// failed lookup with ".js" or "/index.js" — what tsx did, without compiling anything.
writeFileSync(here("../dist/bundle/externals.json"), `${JSON.stringify(Object.fromEntries([...expected].sort()), null, 2)}\n`);
writeFileSync(here("../dist/bundle/resolve.mjs"), `export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const code = error && error.code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw error;
    if (specifier.startsWith("node:") || /\\.(c|m)?js$|\\.json$/.test(specifier)) throw error;
    for (const suffix of [".js", "/index.js"]) {
      try {
        return await next(specifier + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`);
writeFileSync(here("../dist/bundle/register.mjs"), 'import { register } from "node:module";\nregister("./resolve.mjs", import.meta.url);\n');
console.log("seller built: dist/bundle/main.mjs (+ register.mjs, resolve.mjs)");
