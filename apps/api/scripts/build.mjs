// The api's production build (Abu, 10-16: "run it the recommended way"): our own TypeScript — the api and every
// @kawase package — bundled to plain JavaScript once, here, so production runs `node` on it: one process, no
// TypeScript compiled at runtime by tsx. Every npm package stays an import, installed as usual, so it behaves as it
// does today. The bundles keep their sources' depth (dist/bundle ~ src/public, dist/db ~ packages/db/src) so the paths
// they read relative to themselves — the email images, the migrations — land where they always did.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const OWN = /^@kawase\//;

/** Bundle our own workspace code; leave every other package (and node built-ins) to be imported at runtime. */
const externalNpm = {
  name: "external-npm",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => (OWN.test(args.path) ? undefined : { path: args.path, external: true }));
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

rmSync(here("../dist"), { recursive: true, force: true });
await build({ ...common, entryPoints: [here("../src/main.ts")], outfile: here("../dist/bundle/main.mjs") });
await build({ ...common, entryPoints: [here("../../../packages/db/src/migrate.ts")], outfile: here("../dist/db/migrate.mjs") });
// migrate reads "../migrations" next to itself, as packages/db/src/migrate.ts does.
cpSync(here("../../../packages/db/migrations"), here("../dist/migrations"), { recursive: true });
console.log("api built: dist/bundle/main.mjs, dist/db/migrate.mjs, dist/migrations");
