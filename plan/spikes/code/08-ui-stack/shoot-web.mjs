// Spike 08: screenshot the web twin in every theme + RTL, and read back the computed token values.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const BASE = process.env.BASE_URL ?? 'http://localhost:8081'
const TAG = process.env.TAG ?? 'dev'
const shots = [['light', 'ltr'], ['dark', 'ltr'], ['testnet', 'ltr'], ['testnet-dark', 'ltr'], ['testnet', 'rtl']]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 430, height: 820 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))
const results = []
for (const [theme, dir] of shots) {
  await page.goto(`${BASE}/spike-ui?theme=${theme}${dir === 'rtl' ? '&dir=rtl' : ''}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('h2', { timeout: 60000 })
  await page.waitForTimeout(1200) // let framer-motion settle
  const info = await page.evaluate(() => {
    const h2 = document.querySelector('h2')
    const card = h2.closest('div[aria-live]')
    const button = card.querySelector('button')
    const badge = card.querySelector('span.rounded-full')
    const cs = (el) => getComputedStyle(el)
    return {
      rootClass: document.documentElement.className,
      cardTag: card.tagName, title: h2.textContent,
      cardBg: cs(card).backgroundColor, cardText: cs(card).color, cardRadius: cs(card).borderRadius,
      buttonBg: cs(button).backgroundColor, badgeBg: cs(badge).backgroundColor, badgeText: cs(badge).color,
      pageBg: cs(card.parentElement.parentElement.parentElement).backgroundColor,
      direction: cs(card).direction,
      firstRowLabelLeft: Math.round(card.querySelector('div.flex.items-center.justify-between span').getBoundingClientRect().left),
    }
  })
  const file = `web-${TAG}-${theme}${dir === 'rtl' ? '-rtl' : ''}.png`
  await page.screenshot({ path: file })
  results.push({ theme, dir, file, ...info })
  console.log(theme, dir, JSON.stringify(info))
}
await page.goto(`${BASE}/spike-ui?theme=testnet`, { waitUntil: 'load', timeout: 120000 })
await page.click('button')
await page.waitForTimeout(300)
const pressed = await page.evaluate(() => document.body.innerText.match(/pressed=(\S+)/)?.[1])
console.log('action round trip:', pressed)
writeFileSync(`results.web-${TAG}.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results, pressed, errors }, null, 2))
if (errors.length) console.log('console errors:', errors)
await browser.close()
