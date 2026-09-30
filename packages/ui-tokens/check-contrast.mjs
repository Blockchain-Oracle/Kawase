// Checks every text pair of every theme against WCAG AA (4.5:1) and every UI boundary against 3:1.
// Run: node packages/ui-tokens/check-contrast.mjs  (exits 1 on any failure)
import { readFileSync } from 'node:fs'

const tokens = JSON.parse(readFileSync(new URL('tokens.json', import.meta.url), 'utf8'))

const AA_TEXT = 4.5
const AA_UI = 3
const HEX_RADIX = 16
const CHANNEL_MAX = 255
const SRGB_THRESHOLD = 0.04045
const SRGB_DIVISOR = 12.92
const SRGB_OFFSET = 0.055
const SRGB_SCALE = 1.055
const SRGB_GAMMA = 2.4
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 }
const CONTRAST_OFFSET = 0.05
const HEX_SHORT = 6
const ALPHA_DIGITS = 2
const DECIMALS = 2

const channel = (hex, index) => parseInt(hex.slice(index, index + ALPHA_DIGITS), HEX_RADIX) / CHANNEL_MAX
const linear = (c) => (c <= SRGB_THRESHOLD ? c / SRGB_DIVISOR : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA)
const rgb = (hex) => {
  const body = hex.replace('#', '')
  return { r: channel(body, 0), g: channel(body, 2), b: channel(body, 4), a: body.length > HEX_SHORT ? channel(body, HEX_SHORT) : 1 }
}
// Translucent tokens are composited on the theme background before measuring.
const over = (top, base) => ({
  r: top.r * top.a + base.r * (1 - top.a),
  g: top.g * top.a + base.g * (1 - top.a),
  b: top.b * top.a + base.b * (1 - top.a),
  a: 1,
})
const luminance = ({ r, g, b }) => LUMA.r * linear(r) + LUMA.g * linear(g) + LUMA.b * linear(b)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + CONTRAST_OFFSET) / (lo + CONTRAST_OFFSET)
}

const themes = {
  light: tokens.themes.light,
  dark: tokens.themes.dark,
  testnet: { ...tokens.themes.light, ...tokens.themes.testnet },
  'testnet-dark': { ...tokens.themes.dark, ...tokens.themes['testnet-dark'] },
}

// [text, surface] pairs that carry words; [edge, surface] pairs that only need to be seen.
const TEXT_PAIRS = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'popover'],
  ['foreground', 'secondary'],
  ['foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['accent-foreground', 'accent'],
  ['accent', 'background'],
  ['accent', 'card'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['success', 'background'],
  ['success', 'card'],
  ['network-foreground', 'network'],
  ['network', 'background'],
  ['network', 'network-surface'],
  ['foreground', 'network-surface'],
  ['foreground', 'glass'],
  ['muted-foreground', 'glass'],
]
const UI_PAIRS = [
  ['ring', 'background'],
  ['primary', 'background'],
  ['silver-deep', 'background'],
]
// Hairlines and decorative silver are meant to be faint; inputs and cards also carry a fill, so these are
// reported for the eye, not enforced.
const HAIRLINE_PAIRS = [
  ['border', 'background'],
  ['border', 'card'],
  ['silver', 'background'],
]

let failures = 0
for (const [theme, values] of Object.entries(themes)) {
  const bg = rgb(values.background)
  const resolve = (name) => over(rgb(values[name]), bg)
  const report = (pairs, floor, kind, enforce = true) => {
    for (const [a, b] of pairs) {
      const ratio = contrast(resolve(a), resolve(b))
      const ok = ratio >= floor
      if (!ok && enforce) failures += 1
      const mark = ok ? 'ok  ' : enforce ? 'FAIL' : 'info'
      console.log(`${mark} ${theme.padEnd(12)} ${kind.padEnd(4)} ${a} on ${b}: ${ratio.toFixed(DECIMALS)}`)
    }
  }
  report(TEXT_PAIRS, AA_TEXT, 'text')
  report(UI_PAIRS, AA_UI, 'ui')
  report(HAIRLINE_PAIRS, AA_UI, 'hair', false)
}
// Story fields carry ink text.
for (const [name, hex] of Object.entries(tokens.story.fields)) {
  const ratio = contrast(rgb(tokens.story.ink), rgb(hex))
  const ok = ratio >= AA_TEXT
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} story        text ink on ${name}: ${ratio.toFixed(DECIMALS)}`)
}

if (failures) {
  console.error(`\n${failures} pair(s) below the floor`)
  process.exit(1)
}
console.log('\nall pairs pass')
