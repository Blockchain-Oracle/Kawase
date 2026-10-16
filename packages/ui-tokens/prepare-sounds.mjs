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
const INDUSTRIAL_SPRITE = `https://raw.githubusercontent.com/snd-lib/snd-lib/${SND_LIB_COMMIT}/assets/sounds/sprite/03/audioSprite`
const RATE = '44100'
/** dB to a linear gain. */
const DB = 20
const TEN = 10
const DECIMALS = 100

/**
 * cue → its source and its target level (the loudest 50 ms RMS window, in dBFS, after the player volume). `maxS` trims a
 * long tail, and `fadeS` fades that trimmed end out. Levels raised 6 dB (money 4 dB) on 10-16: on laptop speakers the
 * short interface cues were too quiet to notice ("is it even working?").
 */
const CUES = {
  // Interface — SND01 "sine"
  tap: { kit: 'sine', sound: 'tap_01', target: -24 },
  toggle: { kit: 'sine', sound: 'toggle_on', target: -26 },
  sheetOpen: { kit: 'sine', sound: 'transition_up', target: -26 },
  sheetClose: { kit: 'sine', sound: 'transition_down', target: -28 },
  fanOpen: { kit: 'sine', sound: 'swipe_01', target: -25 },
  scene: { kit: 'sine', sound: 'swipe_02', target: -28 },
  agentStep: { kit: 'sine', sound: 'select', target: -27 },
  agentDone: { kit: 'sine', sound: 'notification', target: -23 },
  voiceStart: { kit: 'sine', sound: 'toggle_on', target: -24 },
  voiceEnd: { kit: 'sine', sound: 'toggle_off', target: -25 },
  error: { kit: 'sine', sound: 'caution', target: -23 },
  // Money — SND02 "piano"
  received: { kit: 'piano', sound: 'notification', maxS: 1.6, fadeS: 0.6, target: -22 },
  send: { kit: 'piano', sound: 'transition_up', target: -23 },
  confirmed: { kit: 'piano', sound: 'button', target: -23 },
}

/**
 * The share card's film (apps/mobile/src/share-card, web MP4 only; Abu, 10-16: "excitement, something is going on…
 * then the stamp, bam"): written apart from the interface palette (assets/audio/film, src/share-card/film-sources.ts) so
 * the phone bundles never carry them. The sine kit's progress ticks build while the line draws, the industrial kit's
 * button is the hanko's hit, the piano's celebration plays under the held last frame.
 */
const FILM_CUES = {
  ticks: { kit: 'sine', sound: 'progress_loop', target: -24 },
  stamp: { kit: 'industrial', sound: 'button', target: -14 },
  celebrate: { kit: 'piano', sound: 'celebration', maxS: 3, fadeS: 1.2, target: -22 },
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
  await download(`${INDUSTRIAL_SPRITE}.m4a`, join(raw, 'industrial.m4a'))
  await download(`${INDUSTRIAL_SPRITE}.json`, join(raw, 'industrial.json'))
  const industrialSprite = JSON.parse(readFileSync(join(raw, 'industrial.json'), 'utf8'))
  const industrialMap = industrialSprite.spritemap ?? industrialSprite
  /** One cue's ffmpeg input: a file from the sine zip, or a slice of the piano or industrial sprite. */
  const inputOf = (cue) =>
    cue.kit === 'sine'
      ? ['-i', join(raw, 'sine', 'SND01_sine', `${cue.sound}.wav`)]
      : cue.kit === 'industrial'
        ? ['-ss', String(industrialMap[cue.sound].start), '-to', String(industrialMap[cue.sound].end), '-i', join(raw, 'industrial.m4a')]
        : ['-ss', String(spritemap[cue.sound].start), '-to', String(spritemap[cue.sound].end), '-i', join(raw, 'piano.m4a')]
  /** Writes one processed cue and returns the player volume that puts its loudest window on its target. */
  const prepare = (cue, out) => {
    const filters = []
    if (cue.maxS) filters.push(`atrim=end=${cue.maxS}`)
    if (cue.maxS && cue.fadeS) filters.push(`afade=t=out:st=${cue.maxS - cue.fadeS}:d=${cue.fadeS}`)
    ffmpeg([...inputOf(cue), ...(filters.length ? ['-af', filters.join(',')] : []), '-ac', '1', '-ar', RATE, '-sample_fmt', 's16', out])
    return Math.min(1, Math.round(DECIMALS * TEN ** ((cue.target - loudest(out)) / DB)) / DECIMALS)
  }

  const mobile = here('../../apps/mobile')
  const dir = join(mobile, 'assets', 'audio', 'cues')
  mkdirSync(dir, { recursive: true })
  const volume = {}
  for (const [name, cue] of Object.entries(CUES)) volume[name] = prepare(cue, join(dir, `${name}.wav`))

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

  const filmDir = join(mobile, 'assets', 'audio', 'film')
  mkdirSync(filmDir, { recursive: true })
  const filmVolume = {}
  for (const [name, cue] of Object.entries(FILM_CUES)) filmVolume[name] = prepare(cue, join(filmDir, `${name}.wav`))
  const filmNames = Object.keys(FILM_CUES)
  writeFileSync(
    join(mobile, 'src', 'share-card', 'film-sources.ts'),
    [
      '// GENERATED by packages/ui-tokens/prepare-sounds.mjs (SND\'s kits, processed). Do not edit; change the script and re-run.',
      '// The share card film\'s own sounds (web only: imported by the film\'s soundtrack, never by a phone bundle).',
      '/* eslint-disable @typescript-eslint/no-require-imports */',
      'export const FILM_SOURCES = {',
      ...filmNames.map((name) => `  ${name}: require("../../assets/audio/film/${name}.wav") as number,`),
      '} as const;',
      '',
      `export const FILM_VOLUME: Readonly<Record<keyof typeof FILM_SOURCES, number>> = ${JSON.stringify(filmVolume)};`,
      '',
    ].join('\n'),
  )
  console.log(`prepared ${filmNames.length} film cues -> apps/mobile/assets/audio/film, src/share-card/film-sources.ts`)
  console.log(filmVolume)
} finally {
  rmSync(work, { recursive: true, force: true })
}
