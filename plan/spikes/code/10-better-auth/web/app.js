// Spike 10 web page: the same Better Auth client the Expo web build will use, plus passkeys (WebAuthn).
import { createAuthClient } from 'better-auth/client'
import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const auth = createAuthClient({ baseURL: location.origin, plugins: [anonymousClient(), emailOTPClient(), passkeyClient()] })
const j = (path, body) => fetch(path, { method: body ? 'POST' : 'GET', credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) }).then((r) => r.json())
const brief = (r) => (r?.error ? { error: r.error.code ?? r.error.message ?? r.error.status } : { ok: true })

window.spike = {
  async run() {
    const out = {}
    const email = `web+${Date.now()}@example.com`
    out.guest = brief(await auth.signIn.anonymous())
    await j('/contacts', { name: 'Web-guest-contact' })
    // A guest tries to add a passkey before having a real account
    out.guestAddPasskey = brief(await auth.passkey.addPasskey({ name: 'guest-key' }))
    out.afterGuestPasskey = (await auth.getSession()).data?.user?.isAnonymous
    // Upgrade with email OTP
    await auth.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    const { otp } = await j(`/__test/otp?email=${encodeURIComponent(email)}`)
    out.upgrade = brief(await auth.signIn.emailOtp({ email, otp }))
    const s1 = (await auth.getSession()).data
    out.account = { id: s1?.user?.id, isAnonymous: s1?.user?.isAnonymous }
    out.contactsAfterUpgrade = (await j('/contacts')).contacts
    // Add a passkey to the real account, sign out, sign back in with it
    out.addPasskey = brief(await auth.passkey.addPasskey({ name: 'kawase-web' }))
    out.passkeys = ((await auth.passkey.listUserPasskeys()).data ?? []).map((p) => ({ name: p.name, deviceType: p.deviceType }))
    await auth.signOut()
    out.signedOut = !(await auth.getSession()).data
    out.passkeySignIn = brief(await auth.signIn.passkey())
    const s2 = (await auth.getSession()).data
    out.sameUser = s2?.user?.id === s1?.user?.id
    out.contactsAfterPasskey = (await j('/contacts')).contacts
    document.getElementById('out').textContent = JSON.stringify(out, null, 2)
    return out
  },
}
document.getElementById('out').textContent = 'ready'
