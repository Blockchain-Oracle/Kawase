// Generates React components from svg/*.svg: src/generated/native/* (react-native-svg) and src/generated/web/* (DOM),
// each with an index that maps the file stem to its component. Run: node packages/identity/build.mjs
// Sources are the brand kits' own files (see PROVENANCE.md); this script never edits their shapes. Files whose stem
// ends in "-mono" get their black/white fills replaced by currentColor so the app can tint them (and only them).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "@svgr/core";

const here = (file) => new URL(file, import.meta.url);
const SVG_DIR = here("svg/");
const OUT = { native: here("src/generated/native/"), web: here("src/generated/web/") };
const HEADER = "// GENERATED from svg/ by build.mjs. Do not edit; replace the SVG and rebuild.\n";
const MONO_COLORS = ["#000", "#000000", "#fff", "#ffffff", "#FFF", "#FFFFFF", "black", "white"];

const stems = readdirSync(SVG_DIR)
  .filter((file) => file.endsWith(".svg"))
  .map((file) => file.replace(/\.svg$/, ""))
  .sort();

const componentName = (stem) =>
  "Mark" +
  stem
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");

for (const target of Object.keys(OUT)) {
  rmSync(OUT[target], { recursive: true, force: true });
  mkdirSync(OUT[target], { recursive: true });
}

for (const stem of stems) {
  const svg = readFileSync(new URL(`${stem}.svg`, SVG_DIR), "utf8");
  const mono = stem.endsWith("-mono");
  const replaceAttrValues = mono ? Object.fromEntries(MONO_COLORS.map((c) => [c, "currentColor"])) : {};
  const name = componentName(stem);
  const shared = {
    plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
    typescript: true,
    replaceAttrValues,
    svgoConfig: {
      plugins: [
        { name: "preset-default", params: { overrides: { removeViewBox: false } } },
        "convertStyleToAttrs",
        "removeXMLNS",
        { name: "removeAttrs", params: { attrs: ["data-name", "enable-background"] } },
      ],
    },
    svgProps: { width: "100%", height: "100%" },
  };
  const native = await transform(svg, { ...shared, native: true, expandProps: "end" }, { componentName: name });
  const web = await transform(svg, { ...shared, expandProps: "end" }, { componentName: name });
  writeFileSync(new URL(`${stem}.tsx`, OUT.native), HEADER + native);
  writeFileSync(new URL(`${stem}.tsx`, OUT.web), HEADER + web);
}

for (const target of Object.keys(OUT)) {
  const index =
    HEADER +
    stems.map((stem) => `import ${componentName(stem)} from "./${stem}";`).join("\n") +
    (stems.length ? "\n\n" : "") +
    `/** File stem → component. Absent stems have not been delivered (see PROVENANCE.md). */\n` +
    `export const MARKS = {\n${stems.map((stem) => `  "${stem}": ${componentName(stem)},`).join("\n")}\n} as const;\n\n` +
    `export type MarkStem = keyof typeof MARKS;\n`;
  writeFileSync(new URL("index.ts", OUT[target]), index);
}
console.log(`identity: ${stems.length} mark(s) -> native + web components`);
