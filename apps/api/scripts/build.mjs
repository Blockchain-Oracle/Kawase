// The api's production build (Abu, 10-16: "run it the recommended way"): our own TypeScript — the api and every
// @kawase package — bundled to plain JavaScript once, here, so production runs `node` on it: one process, no
// TypeScript compiled at runtime by tsx. Every npm package stays an import, installed as usual, so it behaves as it
// does today. The bundles keep their sources' depth (dist/bundle ~ src/public, dist/db ~ packages/db/src) so the paths
// they read relative to themselves — the email images, the migrations — land where they always did.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const OWN = /^@kawase\//;
/** The package.json Node would load for `name` from `dir`: node_modules/<name> in this folder or the nearest above. */
function findManifest(dir, name) {
  for (let at = dir; ; at = dirname(at)) {
    const manifest = resolve(at, "node_modules", name, "package.json");
    if (existsSync(manifest)) return manifest;
    if (dirname(at) === at) return null;
  }
}
const packageName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
/** npm packages bundled with our code instead of installed (their installed version differed from the one our code resolves). */
const BUNDLED = new Set(["pino"]);


/** Bundle our own workspace code; leave every other package (and node built-ins) to be imported at runtime. */
const externalNpm = {
  name: "external-npm",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      // Only bundled files are ever importers here, so a bundled package's own imports follow it into the bundle.
      if (OWN.test(args.path) || BUNDLED.has(packageName(args.path)) || args.importer.includes("node_modules")) return undefined;
      const manifest = findManifest(dirname(args.importer), packageName(args.path));
      if (manifest) expected.set(packageName(args.path), JSON.parse(readFileSync(manifest, "utf8")).version);
      return { path: args.path, external: true };
    });
  },
};

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  logLevel: "warning",
  plugins: [externalNpm],
  // An ESM bundle has no require; the few CommonJS paths that ask for one get Node's.
  banner: { js: "import { createRequire as __kawaseRequire } from 'node:module'; const require = __kawaseRequire(import.meta.url);" },
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
  ...common,
  entryPoints: { main: here("../src/main.ts") },
  outdir: here("../dist/bundle"),
  // Dynamic import()s become their own chunks with Node's own module order (one-file output wraps modules in lazy
  // initialisers, and a constant read before its wrapper ran is undefined: Agari's ops crash-looped on that, 16 Oct).
  // Chunks sit beside main.mjs, so paths re-aimed from the bundle's folder hold in every chunk.
  splitting: true,
  outExtension: { ".js": ".mjs" },
  chunkNames: "[name]-[hash]",
});
await build({ ...common, entryPoints: [here("../../../packages/db/src/migrate.ts")], outfile: here("../dist/db/migrate.mjs") });
// migrate reads "../migrations" next to itself, as packages/db/src/migrate.ts does.
cpSync(here("../../../packages/db/migrations"), here("../dist/migrations"), { recursive: true });
writeFileSync(here("../dist/bundle/externals.json"), `${JSON.stringify(Object.fromEntries([...expected].sort()), null, 2)}\n`);
console.log("api built: dist/bundle/main.mjs, dist/db/migrate.mjs, dist/migrations");
