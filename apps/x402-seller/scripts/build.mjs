// The demo seller's production build (the same as apps/api/scripts/build.mjs): our TypeScript bundled to JavaScript
// once, so production runs `node` on it — one process, no TypeScript compiled at runtime by tsx (it was pnpm → tsx →
// node). Every npm package stays an import, installed as usual. Files read relative to themselves
// (`new URL("../…", import.meta.url)`) are re-aimed at the same file from the bundle's folder, and a small resolve hook
// adds the extension a dependency's ESM may leave off (what tsx forgave).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
// Ours: the @kawase workspace packages.
const OWN = /^@kawase\//;

const externalNpm = {
  name: "external-npm",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => (OWN.test(args.path) ? undefined : { path: args.path, external: true }));
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

rmSync(here("../dist"), { recursive: true, force: true });
await build({
  entryPoints: [here("../src/main.ts")],
  outfile: here("../dist/bundle/main.mjs"),
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
