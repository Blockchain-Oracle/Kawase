// Signing relay: the server creates a Circle UCW challenge and parks it; the browser page (main.js)
// picks it up, runs it with the Web SDK, and posts the result back. In the app this is the
// approval endpoint returning {challengeId, userToken, encryptionKey} to the device.
import { createServer } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { ucw, APP_ID } from './circle.mjs'

const queue = [] // { challengeId, label, userId, resolve }
const waiting = new Map()
export const inSheetErrors = []

const readJson = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(JSON.parse(b || '{}'))) })

export async function startRelay(port = 5199) {
  const server = await createServer({
    root: new URL('.', import.meta.url).pathname,
    server: { port, strictPort: true },
    logLevel: 'warn',
    // The Circle Web SDK uses Node built-ins (Buffer, util); the app's DOM component will need the same.
    plugins: [nodePolyfills(), {
      name: 'relay',
      configureServer(s) {
        s.middlewares.use('/api/pending', async (_req, res) => {
          // Serve the oldest unanswered challenge without removing it, so a reloaded page gets it again.
          const job = queue[0]
          if (!job) return res.end('{}')
          // A fresh user token per challenge (tokens live 60 minutes).
          const { data } = await ucw.createUserToken({ userId: job.userId })
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ challengeId: job.challengeId, label: job.label, appId: APP_ID, userToken: data.userToken, encryptionKey: data.encryptionKey }))
        })
        s.middlewares.use('/api/result', async (req, res) => {
          const body = await readJson(req)
          if (!body.final) {
            // In-sheet errors (bad PIN format, wrong PIN) are not terminal: the user retries in place.
            console.log(`  · in-sheet error on ${body.challengeId}: ${JSON.stringify(body.error)}`)
            inSheetErrors.push({ challengeId: body.challengeId, ...body.error })
          } else {
            waiting.get(body.challengeId)?.(body)
            waiting.delete(body.challengeId)
            const i = queue.findIndex((j) => j.challengeId === body.challengeId)
            if (i >= 0) queue.splice(i, 1)
          }
          res.end('{}')
        })
      },
    }],
  })
  await server.listen()
  console.log(`relay: open http://localhost:${port}/ in a browser to answer challenges`)
  return {
    close: () => server.close(),
    // Park a challenge for the browser and wait for {result} or {error}.
    run(challengeId, label, userId) {
      console.log(`  → challenge ${challengeId}: ${label} (enter the PIN in the browser)`)
      return new Promise((resolve) => { waiting.set(challengeId, resolve); queue.push({ challengeId, label, userId }) })
    },
  }
}
