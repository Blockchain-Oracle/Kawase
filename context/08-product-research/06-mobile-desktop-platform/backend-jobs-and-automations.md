# Backend for automations, triggers and notifications

Purpose: choose how scheduled and triggered money actions ("every Tuesday send $10 to Alex") run reliably without the phone, and how Circle webhooks feed notifications.

Sources:
- Vercel Cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing (last_updated 2026-07-15)
- Vercel Workflows: https://vercel.com/docs/workflows (2026-09-04) · pricing/limits: https://vercel.com/docs/workflows/pricing (2026-09-16)
- Workflow SDK docs index: https://workflow-sdk.dev/llms.txt (saved `.firecrawl/product/06-platform/workflow-sdk-llms.txt`)
- Inngest pricing: https://www.inngest.com/pricing · Trigger.dev pricing: https://trigger.dev/pricing
- Circle webhooks: `.firecrawl/docs/circle-llms-full.txt` lines 5550-5646, 8142-8220, 9409-9426, 10625-10700 (source https://developers.circle.com/api-reference/webhook-endpoints)
- Expo background task limits: `.firecrawl/product/06-platform/expo-background-task.md`
- npm versions: `.firecrawl/product/06-platform/npm-versions-2026-09-29.tsv`
- arc-agent worker (reference only): `/Users/abu/dev/hackathon/arc-agent/packages/integrations/src/postgres/occurrence-repository.ts:77,121`

Verified: 2026-09-29

## 1. Why server-side
Mobile OS background execution is deferred and unreliable: minimum 15 minutes, and "On iOS, short intervals are often ignored". See `mobile-capabilities.md` [VERIFIED]. Automations therefore need (a) a durable scheduler, (b) a server-held signing authority with enforced limits, (c) idempotent execution, and (d) a notification fan-out [INFERENCE].

## 2. Options

| Option | Version | Scheduling model | Free tier | Fit [INFERENCE] |
|---|---|---|---|---|
| **Vercel Workflows (Workflow SDK)** | `workflow` 4.8.9 (multi-region needs 5.0.0-beta.33+) [VERIFIED] | Durable functions with `'use workflow'`/`'use step'`. `sleep("30d")` "will suspend without consuming any resources". "Maximum `sleep` duration: No limit", "Maximum run duration: No limit" [VERIFIED]. `defineHook` to wait for external events (e.g., approval) [VERIFIED] | Hobby: 50,000 events/month, 1 GB written; run data retained 1 day after completion on Hobby [VERIFIED] | **Good.** One run per automation: loop { compute next occurrence → `sleep` until then → step: check policy → step: execute → step: notify }. Approval above a threshold = hook that the app/Telegram resumes. Runs on Vercel with zero config, or elsewhere via "Worlds", e.g. `WORKFLOW_TARGET_WORLD=@workflow/world-postgres` [VERIFIED]. Framework guides include Hono, Express, Fastify, NestJS, Next.js, Nitro, Nuxt, SvelteKit, Astro [VERIFIED]. Replays re-run workflow code, so all side effects must be in steps [VERIFIED concept; see 240 s replay limit]. |
| **Vercel Cron** | n/a | vercel.json cron → function | Hobby: "Once per day", precision "Per-hour (±59 min)". Pro: once per minute [VERIFIED] | Only as a coarse "tick" on Pro. Not enough alone on Hobby. |
| **Vercel Queues** | `@vercel/queue` 0.7.0 [VERIFIED npm] | Queue primitive under Workflows [VERIFIED] | see Queues pricing (not fetched) | Use indirectly through Workflows. |
| **Inngest** | `inngest` 4.21.0 [VERIFIED npm] | Event- and cron-triggered functions with steps and sleeps [REPORTED from general docs, not fetched today] | "50k /mo included" executions, "5 included" concurrent steps [VERIFIED pricing] | Good managed alternative; host-agnostic (any HTTP endpoint). |
| **Trigger.dev** | `@trigger.dev/sdk` 4.6.4 [VERIFIED npm] | Tasks + schedules | "$5 / month free credits", "20 concurrent runs", **"10 schedules"**, "1 day log retention" [VERIFIED] | The 10-schedule cap on free means per-user schedules don't scale on free. Use one cron schedule that fans out [INFERENCE]. |
| **Temporal** | `@temporalio/client` 1.24.0 [VERIFIED npm] | Most mature durable execution | Temporal Cloud pricing not checked [UNKNOWN] | Too much ops for 2 weeks [INFERENCE]. |
| **Postgres queue (pg-boss / graphile-worker / hand-rolled `SKIP LOCKED`)** | pg-boss 12.35.0, graphile-worker 0.18.0 [VERIFIED npm] | Always-on worker process polls/claims rows | infra cost of a long-running host | arc-agent used a hand-rolled `FOR UPDATE … SKIP LOCKED` lease design (`occurrence-repository.ts:77,121`) [VERIFIED]. Abu says that architecture failed, so it's not a baseline. Needs an always-on process (Railway/Fly/etc.) [INFERENCE]. |
| **Cloudflare Workflows / Durable Objects** | not researched here | alarms + durable steps | not checked | Viable if the backend moves to Cloudflare (EAS Hosting API routes run on the Workers runtime) [INFERENCE]. |

## 3. Recommended automation shape [INFERENCE]

```
Automation (DB row: owner, rule, amount cap, recipient contact, status)
  └─ start(automationWorkflow, [automationId])            // on create/resume
       loop:
         next = nextOccurrence(rule, tz)                   // croner-style calc
         await sleep(until next)
         step: load automation; if paused/deleted → exit
         step: policy check (per-tx cap, daily cap, allowlisted recipient, balance)
         if needs approval → push + Telegram button → await approvalHook (with timeout)
         step: submit transfer (idempotency key = automationId + occurrence date)
         step: wait for confirmation / Circle webhook
         step: write ledger + notify (push, Telegram, email)
```
- Edits/pauses: cancel the run and start a new one, or check state at each wake (above).
- Idempotency: the occurrence key prevents double-sends on retries or replays.
- Limits live in the policy step *and* ideally on-chain or in wallet policy (Circle agent-wallet policies are mainnet-only per `context/02-circle-agent-stack/agent-wallets.md`) [VERIFIED in that file].
- Triggers ("when I receive USDC, forward 10% to savings") are driven by Circle webhooks or an on-chain poller, which start a short workflow.

## 4. Circle webhooks [VERIFIED, circle-llms-full.txt]
- Products on **v2 notifications**: Wallets, Contracts, CPN, Digital Asset Accounts, Gateway, StableFX.
- Subscribe: `POST /v2/notifications/subscriptions` (Wallets and Contracts share the endpoint). List, get, update (`PATCH …/{id}`) and delete exist. "To update filters, provide `notificationTypes`, `addresses`, and `domains` together".
- Endpoint must be public HTTPS, handle **HEAD** (URL validation) and **POST** (delivery), and return 2XX, or Circle retries.
- Verify signature: headers `X-Circle-Signature` and `X-Circle-Key-Id`. Fetch the public key by that ID and verify.
- Source IPs to allowlist for Wallets/Contracts/Gateway/Digital Asset Accounts: `54.243.112.156`, `100.24.191.35`, `54.165.52.248`, `54.87.106.46`.
- Event examples: `transactions.inbound`, `transactions.outbound` (Wallets), and a test type `webhooks.test`.
- Coverage of Arc (`ARC-TESTNET` / `ARC`) events in Wallets webhooks isn't re-checked here. Confirm with a `webhooks.test` plus a real testnet transfer [UNKNOWN].

## 5. Notification fan-out [INFERENCE]
One `notify(userId, event)` step reads the user's channel settings (push tokens, Telegram chat_id, Discord user/webhook, email) and sends each channel independently, recording delivery per channel so a failed channel retries without re-sending the others. Channel APIs are in `notification-channels.md`.
