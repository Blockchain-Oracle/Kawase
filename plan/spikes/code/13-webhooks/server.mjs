// Spike 13: webhook receiver behind Coolify. Circle v2 notifications (signature verified, deduped by
// notificationId) and Telegram updates (secret-token header, deduped by update_id).
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

const PORT = Number(process.env.PORT ?? 3000)
const CIRCLE_KEYS = [process.env.CIRCLE_TEST_API_KEY, process.env.CIRCLE_LIVE_API_KEY].filter(Boolean)
const SPIKE_TOKEN = process.env.SPIKE_TOKEN ?? ''
const TELEGRAM_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const state = { failFirst: false }

await pool.query(`
  create schema if not exists spike13;
  create table if not exists spike13.events (
    source text not null, event_id text not null, type text, summary jsonb,
    deliveries int not null default 1, side_effects int not null default 0,
    first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
    primary key (source, event_id)
  );
  create table if not exists spike13.rejected (at timestamptz not null default now(), source text, reason text);
`)

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

// Circle: the public key for a key id is static, so cache it. Try each configured environment's API key.
const publicKeys = new Map()
async function circlePublicKey(keyId) {
  if (publicKeys.has(keyId)) return publicKeys.get(keyId)
  for (const apiKey of CIRCLE_KEYS) {
    const res = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, { headers: { authorization: `Bearer ${apiKey}` } })
    if (!res.ok) continue
    const { data } = await res.json()
    const key = createPublicKey({ key: Buffer.from(data.publicKey, 'base64'), format: 'der', type: 'spki' })
    publicKeys.set(keyId, key)
    return key
  }
  return null
}

// One row per event. `inserted` is true only for the first delivery, so the side effect runs once.
async function record(source, eventId, type, summary) {
  const { rows } = await pool.query(
    `insert into spike13.events (source, event_id, type, summary) values ($1, $2, $3, $4)
     on conflict (source, event_id) do update set deliveries = spike13.events.deliveries + 1, last_seen = now()
     returning (xmax = 0) as inserted`,
    [source, eventId, type, summary],
  )
  if (rows[0].inserted) await pool.query(`update spike13.events set side_effects = side_effects + 1 where source = $1 and event_id = $2`, [source, eventId])
  return rows[0].inserted
}
const reject = (source, reason) => pool.query(`insert into spike13.rejected (source, reason) values ($1, $2)`, [source, reason])

const app = new Hono()
app.get('/health', async (c) => {
  await pool.query('select 1')
  return c.text('ok')
})

// Circle validates the URL with HEAD when a subscription is created. Hono answers HEAD from the GET route.
app.get('/webhooks/circle', (c) => c.text('ok'))
app.post('/webhooks/circle', async (c) => {
  const raw = await c.req.text() // verify the RAW body; re-serialised JSON no longer matches the signature
  const signature = c.req.header('x-circle-signature')
  const keyId = c.req.header('x-circle-key-id')
  if (!signature || !keyId) {
    await reject('circle', 'missing signature headers')
    return c.json({ error: 'unsigned' }, 401)
  }
  const key = await circlePublicKey(keyId)
  if (!key || !createVerify('SHA256').update(raw).verify(key, signature, 'base64')) {
    await reject('circle', key ? 'bad signature' : 'unknown key id')
    return c.json({ error: 'bad signature' }, 401)
  }
  const body = JSON.parse(raw)
  const n = body.notification ?? {}
  const first = await record('circle', body.notificationId, body.notificationType, {
    state: n.state, blockchain: n.blockchain, walletId: n.walletId, txHash: n.txHash, id: n.id, transactionType: n.transactionType,
  })
  // Spike switch: fail the first delivery on purpose to watch Circle retry.
  if (first && state.failFirst) return c.json({ error: 'spike: simulated failure' }, 500)
  return c.json({ ok: true })
})

app.post('/webhooks/telegram', async (c) => {
  const header = c.req.header('x-telegram-bot-api-secret-token') ?? ''
  if (!TELEGRAM_SECRET || !same(header, TELEGRAM_SECRET)) {
    await reject('telegram', 'bad secret token')
    return c.json({ error: 'forbidden' }, 401)
  }
  const update = await c.req.json()
  await record('telegram', String(update.update_id), Object.keys(update).find((k) => k !== 'update_id') ?? 'unknown', {
    chatId: update.message?.chat?.id, text: update.message?.text?.slice(0, 80),
  })
  return c.json({ ok: true })
})

// Spike-only inspection, behind a token.
const guarded = (c) => SPIKE_TOKEN && same(c.req.header('x-spike-token') ?? '', SPIKE_TOKEN)
app.get('/__spike/events', async (c) => {
  if (!guarded(c)) return c.json({ error: 'forbidden' }, 401)
  const events = await pool.query(`select source, event_id, type, summary, deliveries, side_effects, first_seen, last_seen from spike13.events order by first_seen`)
  const rejected = await pool.query(`select source, reason, count(*)::int as count from spike13.rejected group by 1, 2`)
  return c.json({ failFirst: state.failFirst, events: events.rows, rejected: rejected.rows })
})
app.post('/__spike/fail-first', async (c) => {
  if (!guarded(c)) return c.json({ error: 'forbidden' }, 401)
  state.failFirst = Boolean((await c.req.json()).on)
  return c.json(state)
})

// Remove the spike's tables when the spike is over (run once, before deleting the app).
app.post('/__spike/drop', async (c) => {
  if (!guarded(c)) return c.json({ error: 'forbidden' }, 401)
  await pool.query('drop schema if exists spike13 cascade')
  return c.json({ dropped: true })
})

// '::' = IPv4 + IPv6. Coolify's health check runs busybox wget against localhost, which resolves to ::1 on alpine.
serve({ fetch: app.fetch, port: PORT, hostname: '::' }, () => console.log(`spike-13 listening on :${PORT}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => pool.end().finally(() => process.exit(0)))
