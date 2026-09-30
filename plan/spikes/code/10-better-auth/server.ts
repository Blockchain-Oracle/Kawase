// Spike 10 server: Better Auth mounted on Hono, a guest-owned table, and test-only hooks under /__test.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { eq, sql } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'node:fs'
import { v7 as uuidv7 } from 'uuid'
import { auth, db, otps, linkEvents, hooks } from './auth.ts'
import { spikeContacts } from './app-schema.ts'

const PORT = Number(process.env.PORT ?? 3010)
const app = new Hono()

app.use('*', cors({ origin: (o) => o ?? '*', credentials: true, allowHeaders: ['content-type', 'cookie', 'expo-origin'] }))
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

const sessionOf = (c: { req: { raw: Request } }) => auth.api.getSession({ headers: c.req.raw.headers })

app.get('/contacts', async (c) => {
  const s = await sessionOf(c)
  if (!s) return c.json({ error: 'unauthenticated' }, 401)
  const rows = await db.select().from(spikeContacts).where(eq(spikeContacts.userId, s.user.id))
  return c.json({ userId: s.user.id, isAnonymous: s.user.isAnonymous ?? false, contacts: rows.map((r) => r.name) })
})
app.post('/contacts', async (c) => {
  const s = await sessionOf(c)
  if (!s) return c.json({ error: 'unauthenticated' }, 401)
  const { name } = await c.req.json<{ name: string }>()
  await db.insert(spikeContacts).values({ id: uuidv7(), userId: s.user.id, name })
  return c.json({ ok: true })
})

// Test-only hooks. The real api never exposes anything like these.
app.get('/__test/otp', (c) => c.json({ otp: otps.get(`${c.req.query('type') ?? 'sign-in'}:${c.req.query('email')}`) ?? null }))
app.get('/__test/links', (c) => c.json(linkEvents))
app.post('/__test/fail-link', async (c) => {
  hooks.failLink = (await c.req.json<{ on: boolean }>()).on
  return c.json(hooks)
})
app.get('/__test/db', async (c) => {
  const users = await db.execute(sql`select id, email, is_anonymous from "user" order by created_at`)
  const contacts = await db.execute(sql`select user_id, name from spike_contacts order by created_at`)
  const passkeys = await db.execute(sql`select user_id, device_type, backed_up from passkey`)
  return c.json({ users: users.rows, contacts: contacts.rows, passkeys: passkeys.rows })
})
app.post('/__test/report', async (c) => {
  const body = await c.req.json<{ file?: string }>()
  const file = body.file === 'web' ? 'results.web.json' : 'results.device.json'
  writeFileSync(new URL(file, import.meta.url), JSON.stringify(body, null, 2))
  console.log('report saved:', file)
  return c.json({ ok: true })
})
app.get('/', (c) => c.html(readFileSync(new URL('./web/index.html', import.meta.url), 'utf8')))
app.get('/web.js', (c) => c.body(readFileSync(new URL('./web/web.bundle.js', import.meta.url), 'utf8'), 200, { 'content-type': 'text/javascript' }))
app.get('/health', (c) => c.text('ok'))

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => console.log(`spike-10 listening on :${PORT}`))
