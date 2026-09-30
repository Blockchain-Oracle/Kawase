// Browser side of the signing relay: poll the server for a pending Circle challenge, run it with the
// Circle Web SDK (PIN UI in Circle's iframe), and post the result back. Stands in for the device's
// WalletSdk.execute in the real app.
//
// Web SDK 1.1.11 callback semantics (read from dist/src/index.js):
// - onError    -> callback(error), sheet STAYS OPEN (155704 bad PIN format, 155112 wrong PIN; the user retries)
// - onComplete -> iframe removed, callback(undefined, result)   <- the only terminal success
// - the × button -> callback(155701 "User canceled") via onError, then onClose closes the modal.
//   The SDK's onClose itself makes no callback, so we also watch for the iframe to disappear.
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

const status = document.getElementById('status')
const log = (m) => { document.getElementById('log').textContent += `${new Date().toISOString().slice(11, 19)} ${m}\n` }
const post = (body) => fetch('/api/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const CLOSE_GRACE_MS = 1500
let sdk
let job = null

async function tick() {
  if (job) return
  const next = await fetch('/api/pending').then((r) => r.json())
  if (!next.challengeId) return
  job = next
  status.textContent = `executing: ${job.label}`
  log(`challenge ${job.challengeId} (${job.label})`)
  sdk ??= new W3SSdk({ configs: { appSettings: { appId: job.appId } } })
  sdk.setAppSettings({ appId: job.appId })
  sdk.setAuthentication({ userToken: job.userToken, encryptionKey: job.encryptionKey })
  const current = job
  let finished = false
  const finish = async (body) => {
    if (finished) return
    finished = true
    await post({ challengeId: current.challengeId, final: true, ...body })
    status.textContent = 'waiting for a challenge…'
    job = null
  }
  sdk.execute(current.challengeId, (error, result) => {
    if (error) {
      log(`error ${error.code} ${error.message} (sheet still open)`)
      void post({ challengeId: current.challengeId, final: false, error: { code: error.code, message: error.message } })
      return
    }
    log(`done ${result?.type} ${result?.status} ${result?.data?.signature ?? ''}`)
    void finish({ result })
  })
  // The × button closes the modal without a callback: watch for the iframe to disappear.
  const watch = setInterval(() => {
    if (finished) return clearInterval(watch)
    if (!document.querySelector('iframe')) {
      clearInterval(watch)
      setTimeout(() => { if (!finished) { log('sheet closed by the user'); void finish({ error: { code: 'closed', message: 'user closed the sheet' } }) } }, CLOSE_GRACE_MS)
    }
  }, 300)
}
setInterval(() => tick().catch((e) => log(`poll error ${e.message}`)), 1000)
