// Spike 10 passkey test: real Chrome + a CDP virtual authenticator (no human, no hardware key).
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})
page.on('console', (m) => m.type() === 'error' && console.log('page error:', m.text()))
await page.goto(BASE)
await page.waitForFunction(() => (window as any).spike)
const out = await page.evaluate(() => (window as any).spike.run())
await browser.close()
const checks = {
  'guest upgrade keeps data (web client)': out.upgrade?.ok && out.account?.isAnonymous === false && out.contactsAfterUpgrade?.join() === 'Web-guest-contact',
  'the same authenticator cannot be registered twice': out.addPasskey?.error === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' && out.passkeys?.length === 1,
  'passkey sign-in returns the same user and data': out.passkeySignIn?.ok && out.sameUser && out.contactsAfterPasskey?.join() === 'Web-guest-contact',
  'a passkey added while a guest survives the upgrade': out.guestAddPasskey?.ok && out.passkeys?.some((p: any) => p.name === 'guest-key'),
}
for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`)
console.log(JSON.stringify(out, null, 2))
writeFileSync(new URL('results.passkey-web.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), checks, out }, null, 2))
process.exit(Object.values(checks).every(Boolean) ? 0 : 1)
