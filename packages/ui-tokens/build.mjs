// Generates native.css (Uniwind), web.css (plain Tailwind 4 / shadcn) and tokens.ts from tokens.json.
// Run: node packages/ui-tokens/build.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const here = (file) => new URL(file, import.meta.url)
const tokens = JSON.parse(readFileSync(here('tokens.json'), 'utf8'))
const HEADER = '/* GENERATED from tokens.json by build.mjs. Do not edit; change tokens.json and rebuild. */\n'
const RADIUS_STEP = 4

// Testnet is a layer: it overrides a few tokens on top of the matching base theme.
const themes = {
  light: tokens.themes.light,
  dark: tokens.themes.dark,
  testnet: { ...tokens.themes.light, ...tokens.themes.testnet },
  'testnet-dark': { ...tokens.themes.dark, ...tokens.themes['testnet-dark'] },
}
const names = Object.keys(themes.light)
for (const [theme, values] of Object.entries(themes)) {
  const missing = names.filter((name) => !(name in values))
  if (missing.length) throw new Error(`theme ${theme} is missing: ${missing.join(', ')}`)
}
const radius = tokens.radius
const radii = { sm: radius - RADIUS_STEP, md: radius - RADIUS_STEP / 2, lg: radius, xl: radius + RADIUS_STEP }
// Senryo's own corner scale (8/12/16/24/32/pill) rides along as --radius-s-* for code that wants the exact steps.
const senryoRadii = Object.entries(tokens.scale.radius).filter(([, v]) => v < 999).map(([k, v]) => [`s-${k}`, v])
const lines = (values, indent, prefix) => Object.entries(values).map(([k, v]) => `${indent}--${prefix}${k}: ${v};`).join('\n')

// Fonts. React Native takes exactly one family per style (no fallback list), and picks the weight from the
// family's embedded faces. The browser gets the full stack, with the Noto families for other scripts.
const stack = (font) => `"${font}", ${tokens.fonts.scripts.map((s) => `"${s}"`).join(', ')}, system-ui, sans-serif`
const monoStack = `"${tokens.fonts.mono}", ui-monospace, monospace`

// Native (Uniwind): four flat themes, each defining every variable.
const native = `${HEADER}@theme {
  --radius: ${radius}px;
${[...Object.entries(radii), ...senryoRadii].map(([k, v]) => `  --radius-${k}: ${v}px;`).join('\n')}
  --font-sans: '${tokens.fonts.body}';
  --font-display: '${tokens.fonts.display}';
  --font-mono: '${tokens.fonts.mono}';
}

@layer theme {
  :root {
    @variant web {
      --font-sans: ${stack(tokens.fonts.body)};
      --font-display: ${stack(tokens.fonts.display)};
      --font-mono: ${monoStack};
    }

${Object.entries(themes).map(([theme, values]) => `    @variant ${theme} {\n${lines(values, '      ', 'color-')}\n    }`).join('\n\n')}
  }
}
`

// Web (docs, landing): shadcn's :root/.dark contract, with testnet as a data attribute on top.
const web = `${HEADER}:root {
${lines(themes.light, '  ', '')}
  --radius: ${radius}px;
}

.dark {
${lines(themes.dark, '  ', '')}
}

[data-network='testnet'] {
${lines(tokens.themes.testnet, '  ', '')}
}

.dark [data-network='testnet'],
.dark[data-network='testnet'] {
${lines(tokens.themes['testnet-dark'], '  ', '')}
}

@theme inline {
${names.map((name) => `  --color-${name}: var(--${name});`).join('\n')}
${[...Object.entries(radii), ...senryoRadii].map(([k, v]) => `  --radius-${k}: ${v}px;`).join('\n')}
  --font-sans: ${stack(tokens.fonts.body)};
  --font-display: ${stack(tokens.fonts.display)};
  --font-mono: ${monoStack};
}
`

// The browser loads the fonts from Google Fonts; the native apps embed the brand fonts and use the system's
// fonts for other scripts.
const googleFontsHref = `https://fonts.googleapis.com/css2?${Object.entries(tokens.fonts.googleFontsAxes)
  .map(([family, axes]) => `family=${family.replaceAll(' ', '+')}:${axes}`)
  .join('&')}&display=swap`
const { googleFontsAxes: _axes, ...fonts } = tokens.fonts

const ts = `// GENERATED from tokens.json by build.mjs. Do not edit; change tokens.json and rebuild.
// For code that cannot use class names: the orb shader, charts, Skia, the status bar, the story colour fields, and the
// Senryo scales (type, space, radius, elevation, motion, spring, layout) the kit builds its styles from.
export const tokens = ${JSON.stringify({ name: tokens.name, defaultMode: tokens.defaultMode, radius, fonts: { ...fonts, googleFontsHref }, orb: tokens.orb, scale: tokens.scale, story: { ink: tokens.story.ink, fields: tokens.story.fields }, themes }, null, 2)} as const;

export type ThemeName = keyof typeof tokens.themes;
export type TokenName = keyof typeof tokens.themes.light;
`

writeFileSync(here('native.css'), native)
writeFileSync(here('web.css'), web)
writeFileSync(here('tokens.ts'), ts)
console.log(`ui-tokens: ${names.length} tokens x ${Object.keys(themes).length} themes -> native.css, web.css, tokens.ts`)
