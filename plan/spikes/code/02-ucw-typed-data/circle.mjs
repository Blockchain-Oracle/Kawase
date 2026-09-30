// Circle clients (TEST env) for spike #2: UCW (the user's vault) and DCW (the ops redeemer from spike #4).
import { config } from 'dotenv'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
config({ path: new URL('../../../../.env', import.meta.url).pathname, quiet: true })

export const APP_ID = process.env.CIRCLE_TEST_APP_ID
export const ucw = initiateUserControlledWalletsClient({ apiKey: process.env.CIRCLE_TEST_API_KEY })
export const dcw = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_TEST_API_KEY,
  entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET,
})

// SDK 10.x throws { message, code, url, method, status } (not an axios error).
export const errText = (e) => `${e.status ?? ''} ${e.code ?? ''} ${e.message}`

// Poll a DCW transaction until it reaches a terminal state (Arc: SENT -> COMPLETE, no CONFIRMED step).
export async function waitDcwTx(id) {
  for (let i = 0; i < 90; i++) {
    const t = (await dcw.getTransaction({ id })).data.transaction
    if (['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED', 'DENIED'].includes(t.state)) return t
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`timeout waiting for ${id}`)
}
