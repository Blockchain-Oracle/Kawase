// Screenshots the internal gallery and the home sample on web, in each theme and in Arabic right-to-left,
// and reports console errors and any horizontal overflow.
// Run (with the dev server on :8081): node plan/design/gallery/shoot-web.mjs
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

// playwright-core is installed with the spike 8 code, not in the workspace.
const require = createRequire(new URL('../../spikes/code/08-ui-stack/', import.meta.url))
const { chromium } = require('playwright-core')

const BASE = process.env.BASE_URL ?? 'http://localhost:8081'
const out = (name) => new URL(name, import.meta.url).pathname
const STATES = [
  { mode: 'dark', network: 'mainnet', lang: 'en' },
  { mode: 'light', network: 'mainnet', lang: 'en' },
  { mode: 'dark', network: 'testnet', lang: 'en' },
  { mode: 'light', network: 'testnet', lang: 'ar' },
]
const PAGES = [
  { route: 'dev/gallery', name: 'gallery', fullPage: true },

]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))

const results = []
for (const { route, name, fullPage } of PAGES) {
  for (const { mode, network, lang } of STATES) {
    await page.goto(`${BASE}/${route}?mode=${mode}&network=${network}&lang=${lang}`, { waitUntil: 'load', timeout: 180000 })
    await page.waitForSelector('canvas', { timeout: 120000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(3500) // captions and entrance motion
    const info = await page.evaluate(() => {
      const cs = (el) => getComputedStyle(el)
      const root = document.documentElement
      const surface = document.querySelector('.bg-background')
      return {
        rootClass: root.className,
        background: surface ? cs(surface).backgroundColor : null,
        bodyFont: surface ? cs(surface).fontFamily.split(',')[0] : null,
        displayFont: cs(document.querySelector('.font-display')).fontFamily.split(',')[0],
        monoFont: cs(document.querySelector('.font-mono')).fontFamily.split(',')[0],
        fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', '')).filter((v, i, a) => a.indexOf(v) === i),
        overflowX: root.scrollWidth - root.clientWidth,
        direction: cs(document.querySelector('[dir]') ?? root).direction,
      }
    })
    const file = `web-${name}-${mode}-${network}-${lang}.png`
    if (fullPage) {
      // The gallery scrolls inside its own container, so the window is made as tall as the content.
      const height = await page.evaluate(() => document.querySelector('[data-gallery-scroll]').scrollHeight)
      await page.setViewportSize({ width: 430, height })
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: out(file) })
    await page.setViewportSize({ width: 430, height: 880 })
    results.push({ route, mode, network, lang, file, ...info })
    console.log(file, JSON.stringify(info))
  }
}
writeFileSync(out('results.web.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results, errors }, null, 2))
console.log(errors.length ? `console errors (${errors.length}): ${JSON.stringify(errors.slice(0, 8))}` : 'no console errors')
await browser.close()
