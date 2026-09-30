// Spike 10 headless test: guest → email OTP upgrade keeps data; merge into an existing account; failure behaviour.
import { writeFileSync } from 'node:fs'
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const results: { name: string; pass: boolean; detail?: unknown }[] = []
const check = (name: string, pass: boolean, detail?: unknown) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`)
}

class Client {
  jar = new Map<string, string>()
  headers: Record<string, string>
  // Better Auth 1.7 refuses cookie-bearing POSTs without an Origin (MISSING_OR_NULL_ORIGIN); browsers always send one.
  constructor(headers: Record<string, string> = { origin: BASE }) {
    this.headers = headers
  }
  async call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...this.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';')
      const i = kv.indexOf('=')
      const [k, v] = [kv.slice(0, i), kv.slice(i + 1)]
      if (v === '' || /max-age=0/i.test(c)) this.jar.delete(k)
      else this.jar.set(k, v)
    }
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, json, text }
  }
  session = () => this.call('/api/auth/get-session')
  async otpSignIn(email: string) {
    const sent = await this.call('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' })
    const { json } = await this.call(`/__test/otp?email=${encodeURIComponent(email)}`)
    const r = await this.call('/api/auth/sign-in/email-otp', { email, otp: json.otp })
    return { sent: sent.status, ...r }
  }
}
const db = async () => (await new Client().call('/__test/db')).json as { users: any[]; contacts: any[]; passkeys: any[] }
const stamp = Date.now()
const emailA = `abu+${stamp}@example.com`

// 1. Guest sign-in
const guest = new Client()
const anon = await guest.call('/api/auth/sign-in/anonymous', {})
const s1 = await guest.session()
const guestId = s1.json?.user?.id
check('1 guest sign-in creates an anonymous user + session', anon.status === 200 && s1.json?.user?.isAnonymous === true, { id: guestId, email: s1.json?.user?.email })
check('1b ids are UUIDv7 from our generateId', /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/.test(guestId ?? ''), guestId)

// 2. Guest owns data
await guest.call('/contacts', { name: 'Amina' })
await guest.call('/contacts', { name: 'Kenji' })
const c2 = await guest.call('/contacts')
check('2 guest data is stored under the guest id', c2.json?.contacts?.length === 2 && c2.json.isAnonymous === true, c2.json)

// 3. A second anonymous sign-in on the same session is refused
const again = await guest.call('/api/auth/sign-in/anonymous', {})
check('3 a guest cannot create a second guest', again.status >= 400, { status: again.status, code: again.json?.code })

// 4. Upgrade: email OTP while holding the guest session
const up = await guest.otpSignIn(emailA)
const s4 = await guest.session()
const c4 = await guest.call('/contacts')
const links4 = (await guest.call('/__test/links')).json
const db4 = await db()
const userA = s4.json?.user?.id
check('4 OTP sign-in succeeds and the session is a real account', up.status === 200 && s4.json?.user?.isAnonymous === false && s4.json?.user?.email === emailA, { status: up.status, userA, emailVerified: s4.json?.user?.emailVerified })
check('4b onLinkAccount fired once and moved both rows', links4.length === 1 && links4[0].anonymousUserId === guestId && links4[0].newUserId === userA && links4[0].moved === 2, links4)
check('4c the upgraded account sees the guest data', c4.json?.contacts?.join() === 'Amina,Kenji' && c4.json.userId === userA, c4.json)
check('4d the guest user row was deleted', !db4.users.some((u) => u.id === guestId))

// 5. Wrong OTPs: refused, and the code dies after the allowed attempts
const other = new Client()
const emailB = `wrong+${stamp}@example.com`
await other.call('/api/auth/email-otp/send-verification-otp', { email: emailB, type: 'sign-in' })
const realOtp = (await other.call(`/__test/otp?email=${encodeURIComponent(emailB)}`)).json.otp
const tries = []
for (let i = 0; i < 4; i++) tries.push((await other.call('/api/auth/sign-in/email-otp', { email: emailB, otp: '000000' })).json?.code)
const afterLockout = await other.call('/api/auth/sign-in/email-otp', { email: emailB, otp: realOtp })
check('5 wrong OTPs are refused and the real code is dead after 3 attempts', afterLockout.status >= 400, { tries, afterLockout: afterLockout.json?.code })

// 6. Merge: another guest (second device) signs in to the SAME existing account
const guest2 = new Client()
await guest2.call('/api/auth/sign-in/anonymous', {})
const guest2Id = (await guest2.session()).json.user.id
await guest2.call('/contacts', { name: 'Fatima' })
const up6 = await guest2.otpSignIn(emailA)
const c6 = await guest2.call('/contacts')
const db6 = await db()
check('6 a guest signing in to an existing account merges into it', up6.status === 200 && c6.json?.userId === userA && c6.json.contacts.length === 3 && !db6.users.some((u) => u.id === guest2Id), c6.json)

// 7. Fresh device, no guest session: plain OTP sign-in reaches the same account and data
const fresh = new Client()
const up7 = await fresh.otpSignIn(emailA)
const c7 = await fresh.call('/contacts')
const links7 = (await fresh.call('/__test/links')).json
check('7 a fresh device signs in to the same account (no link callback)', up7.status === 200 && c7.json?.userId === userA && c7.json.contacts.length === 3 && links7.length === 2, { contacts: c7.json?.contacts, linkEvents: links7.length })

// 8. Failure: the migration throws during the upgrade. What is lost?
const guest3 = new Client()
await guest3.call('/api/auth/sign-in/anonymous', {})
const guest3Id = (await guest3.session()).json.user.id
await guest3.call('/contacts', { name: 'Must-not-be-lost' })
await guest3.call('/__test/fail-link', { on: true })
const emailC = `fail+${stamp}@example.com`
const up8 = await guest3.otpSignIn(emailC)
await guest3.call('/__test/fail-link', { on: false })
const s8 = await guest3.session()
const db8 = await db()
const guestStillThere = db8.users.some((u) => u.id === guest3Id)
const dataStillThere = db8.contacts.some((r) => r.name === 'Must-not-be-lost')
check('8 when the migration throws, the guest data is NOT lost', dataStillThere, {
  signInStatus: up8.status, code: up8.json?.code ?? up8.json?.message, guestStillThere, dataStillThere,
  sessionNow: s8.json ? { id: s8.json.user.id, isAnonymous: s8.json.user.isAnonymous } : null,
  newUserCreated: db8.users.some((u) => u.email === emailC),
})

// 8b. Retrying the same upgrade after the failure completes it: the email now exists, so the guest merges into it
const retry = await guest3.otpSignIn(emailC)
const c8 = await guest3.call('/contacts')
const db8b = await db()
check('8b retrying the upgrade after a failed migration completes it', retry.status === 200 && c8.json?.isAnonymous === false && c8.json.contacts.join() === 'Must-not-be-lost' && !db8b.users.some((u) => u.id === guest3Id), { status: retry.status, contacts: c8.json?.contacts })

// 9. Origin handling for the Expo app
const expoOk = await new Client({ 'expo-origin': 'kawase://' }).call('/api/auth/sign-in/anonymous', {})
const evil = await new Client({ origin: 'https://evil.example' }).call('/api/auth/sign-in/anonymous', {})
const evilWithCookie = new Client({ origin: 'https://evil.example' })
evilWithCookie.jar = new Map(fresh.jar)
const evil2 = await evilWithCookie.call('/api/auth/sign-out', {})
check('9 kawase:// (expo-origin) is accepted; an untrusted origin with cookies is refused', expoOk.status === 200 && evil2.status === 403, { expoOk: expoOk.status, evilNoCookie: evil.status, evilWithCookie: evil2.status, code: evil2.json?.code })

// 10. Sign-out kills the session
const out = await fresh.call('/api/auth/sign-out', {})
const s10 = await fresh.session()
check('10 sign-out ends the session', out.status === 200 && !s10.json?.user, { status: out.status })

// 11. A guest can discard itself (and its data cascades)
const guest4 = new Client()
await guest4.call('/api/auth/sign-in/anonymous', {})
const guest4Id = (await guest4.session()).json.user.id
await guest4.call('/contacts', { name: 'Throwaway' })
const del = await guest4.call('/api/auth/delete-anonymous-user', {})
const db11 = await db()
check('11 delete-anonymous-user removes the guest and its rows', del.status === 200 && !db11.users.some((u) => u.id === guest4Id) && !db11.contacts.some((r) => r.user_id === guest4Id), { status: del.status })

// 12. Passkey endpoints need a session; a guest can ask for registration options
// (a Node fetch with no Origin at all is refused once it carries cookies: see check 13)
const noSess = await new Client().call('/api/auth/passkey/generate-register-options')
const guest5 = new Client()
await guest5.call('/api/auth/sign-in/anonymous', {})
const guestOpts = await guest5.call('/api/auth/passkey/generate-register-options')
const authOpts = await new Client().call('/api/auth/passkey/generate-authenticate-options')
check('12 passkey: register options need a session; authenticate options are public', noSess.status === 401 && authOpts.status === 200, { noSession: noSess.status, guest: guestOpts.status, rpId: guestOpts.json?.rp?.id ?? authOpts.json?.rpId, authOptions: authOpts.status })

// 13. The 1.7 origin rule itself: cookies + no Origin header is refused
const bare = new Client({})
await bare.call('/api/auth/sign-in/anonymous', {})
const bare2 = await bare.call('/api/auth/sign-out', {})
check('13 a cookie-bearing POST with no Origin header is refused', bare2.status === 403 && bare2.json?.code === 'MISSING_OR_NULL_ORIGIN', { status: bare2.status, code: bare2.json?.code })

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
writeFileSync(new URL('results.node.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2))
process.exit(passed === results.length ? 0 : 1)
