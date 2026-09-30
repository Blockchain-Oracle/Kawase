// Screenshot each phone frame of /dev/directions into plan/design/directions/.
import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL ?? 'http://localhost:8081'
const OUT = new URL('../../../design/directions/', import.meta.url).pathname
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
for (const id of ['tegami', 'choba', 'koe']) {
  await page.goto(`${BASE}/dev/directions?only=${id}`, { waitUntil: 'load', timeout: 180000 })
  await page.waitForSelector('[data-frame]', { timeout: 120000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(7000) // fonts, framer-motion, the orb
  for (const frame of await page.locator('[data-frame]').all()) {
    const name = await frame.getAttribute('data-frame')
    await frame.screenshot({ path: `${OUT}${name}.png` })
    console.log('shot', name)
  }
}
if (errors.length) console.log('page errors:', [...new Set(errors)])
await browser.close()
