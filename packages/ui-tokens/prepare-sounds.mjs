// Kawase's interface sounds (Abu, 10-16: the old ones were "mediocre"). The bare sine blips this replaces were one
// oscillator each, peaking near 0 dBFS. These are SND's designed kits (snd.dev, dentsu lab Tokyo; free for commercial
// use inside a service, no attribution required, no redistributing the raw files and no sound-logo use). Two layers
// follow one rule:
//   - the interface (sheets, the fan, agent steps, voice on and off, an error) uses SND01 "sine". These are short, tight
//     transients, forgettable because they are heard the most.
//   - money (received, sent, confirmed) uses SND02 "piano", a Steinway, all in C major. A high C bell when money
//     arrives, a C–E–G chord when it leaves, a C when a result is confirmed. Money moments carry weight; navigation
//     doesn't.
// The repo is public, so the raw kits never enter it: this script fetches them from SND's own sources (the snd.dev zip,
// and the snd-lib sprite pinned to a commit), trims, fades and folds each one to mono, and writes only the processed cues
// to apps/mobile/assets/audio/cues. Each cue's player volume is set so its loudest 50 ms window lands on its target
// level, which keeps the palette level as one set. Needs ffmpeg and unzip.
// Run: node packages/ui-tokens/prepare-sounds.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SINE_ZIP = 'https://snd.dev/assets/sounds/SND01_sine.zip'
const SND_LIB_COMMIT = 'ecd8ada30acf846b3dcd4f3bfd77b756addd84d9'
const PIANO_SPRITE = `https://raw.githubusercontent.com/snd-lib/snd-lib/${SND_LIB_COMMIT}/assets/sounds/sprite/02/audioSprite`
const RATE = '44100'
/** dB to a linear gain. */
const DB = 20
const TEN = 10
const DECIMALS = 100

/**
 * cue → its source and its target level (the loudest 50 ms RMS window, in dBFS, after the player volume). `maxS` trims a
 * long tail, and `fadeS` fades that trimmed end out.
 */
const CUES = {
  // Interface — SND01 "sine"
  tap: { kit: 'sine', sound: 'tap_01', target: -30 },
  toggle: { kit: 'sine', sound: 'toggle_on', target: -32 },
  sheetOpen: { kit: 'sine', sound: 'transition_up', target: -32 },
  sheetClose: { kit: 'sine', sound: 'transition_down', target: -34 },
  fanOpen: { kit: 'sine', sound: 'swipe_01', target: -31 },
  scene: { kit: 'sine', sound: 'swipe_02', target: -34 },
  agentStep: { kit: 'sine', sound: 'select', target: -33 },
  agentDone: { kit: 'sine', sound: 'notification', target: -29 },
  voiceStart: { kit: 'sine', sound: 'toggle_on', target: -30 },
  voiceEnd: { kit: 'sine', sound: 'toggle_off', target: -31 },
  error: { kit: 'sine', sound: 'caution', target: -29 },
  // Money — SND02 "piano"
  received: { kit: 'piano', sound: 'notification', maxS: 1.6, fadeS: 0.6, target: -26 },
  send: { kit: 'piano', sound: 'transition_up', target: -27 },
  confirmed: { kit: 'piano', sound: 'button', target: -27 },
}

const here = (file) => fileURLToPath(new URL(file, import.meta.url))
const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })

async function download(url, path) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

/** The loudest 50 ms RMS window of a file, in dBFS. */
function loudest(path) {
  // astats reports on stderr; the last "RMS peak dB" is the overall one.
  const { stderr } = spawnSync('ffmpeg', ['-v', 'info', '-i', path, '-af', 'astats=metadata=0:length=0.05', '-f', 'null', '-'], { encoding: 'utf8' })
  const found = [...stderr.matchAll(/RMS peak dB: (-?[\d.]+)/g)].at(-1)
  if (!found) throw new Error(`${path}: no level`)
  return Number(found[1])
}

const work = mkdtempSync(join(tmpdir(), 'kawase-snd-'))
try {
  // The downloads sit in their own folder; ffmpeg reads them as audio and nothing in them runs.
  const raw = join(work, 'raw')
  mkdirSync(raw)
  await download(SINE_ZIP, join(raw, 'sine.zip'))
  execFileSync('unzip', ['-q', '-o', join(raw, 'sine.zip'), '-x', '__MACOSX/*', '-d', join(raw, 'sine')])
  await download(`${PIANO_SPRITE}.m4a`, join(raw, 'piano.m4a'))
  await download(`${PIANO_SPRITE}.json`, join(raw, 'piano.json'))
  const sprite = JSON.parse(readFileSync(join(raw, 'piano.json'), 'utf8'))
  const spritemap = sprite.spritemap ?? sprite

  const mobile = here('../../apps/mobile')
  const dir = join(mobile, 'assets', 'audio', 'cues')
  mkdirSync(dir, { recursive: true })
  const volume = {}
  for (const [name, cue] of Object.entries(CUES)) {
    const out = join(dir, `${name}.wav`)
    const input =
      cue.kit === 'sine'
        ? ['-i', join(raw, 'sine', 'SND01_sine', `${cue.sound}.wav`)]
        : ['-ss', String(spritemap[cue.sound].start), '-to', String(spritemap[cue.sound].end), '-i', join(raw, 'piano.m4a')]
    const filters = []
    if (cue.maxS) filters.push(`atrim=end=${cue.maxS}`)
    if (cue.maxS && cue.fadeS) filters.push(`afade=t=out:st=${cue.maxS - cue.fadeS}:d=${cue.fadeS}`)
    ffmpeg([...input, ...(filters.length ? ['-af', filters.join(',')] : []), '-ac', '1', '-ar', RATE, '-sample_fmt', 's16', out])
    volume[name] = Math.min(1, Math.round(DECIMALS * TEN ** ((cue.target - loudest(out)) / DB)) / DECIMALS)
  }

  const names = Object.keys(CUES)
  const lines = [
    '// GENERATED by packages/ui-tokens/prepare-sounds.mjs (SND\'s kits, processed). Do not edit; change the script and re-run.',
    '// Metro needs static `require`s, so every cue is listed here, with the player volume that levels the palette.',
    '/* eslint-disable @typescript-eslint/no-require-imports */',
    'export const CUE_SOURCES = {',
    ...names.map((name) => `  ${name}: require("../../assets/audio/cues/${name}.wav") as number,`),
    '} as const;',
    '',
    `export const CUE_VOLUME: Readonly<Record<keyof typeof CUE_SOURCES, number>> = ${JSON.stringify(volume)};`,
    '',
  ]
  writeFileSync(join(mobile, 'src', 'feedback', 'cue-sources.ts'), lines.join('\n'))
  console.log(`prepared ${names.length} cues -> apps/mobile/assets/audio/cues, src/feedback/cue-sources.ts`)
  console.log(volume)
} finally {
  rmSync(work, { recursive: true, force: true })
}
