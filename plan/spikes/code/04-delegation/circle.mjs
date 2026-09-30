// Circle dev-controlled wallets client (TEST env) for the spike.
import { config } from 'dotenv'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
config({ path: new URL('../../../../.env', import.meta.url).pathname, quiet: true })

export const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_TEST_API_KEY,
  entitySecret: process.env.CIRCLE_TEST_ENTITY_SECRET,
})

// Poll a Circle transaction until it reaches a terminal state.
export async function waitTx(id) {
  for (let i = 0; i < 90; i++) {
    const { data } = await circle.getTransaction({ id })
    const t = data.transaction
    if (['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED', 'DENIED'].includes(t.state)) return t
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`timeout waiting for ${id}`)
}
