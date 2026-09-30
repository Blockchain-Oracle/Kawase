# Recommendation: our server side on Coolify [INFERENCE]

Purpose: map every server-side piece of the product onto Coolify resources. It covers the repo and Dockerfile layout, env/secret strategy (Circle TEST vs LIVE), domain scheme, the durable scheduler that replaces the Vercel Workflows assumption in `06-mobile-desktop-platform/backend-jobs-and-automations.md`, and risks. Everything here is **[INFERENCE]** built on the [VERIFIED] facts cited inline.

Sources:
- `coolify-overview.md`, `monorepo-and-compose.md`, `abu-server-inspection.md` (this folder), with their evidence in `.firecrawl/product/13/`
- Job engines:
  - npm `npm view <pkg> version` → `.firecrawl/product/13/npm-versions-2026-09-29.tsv`
  - GitHub latest releases → `gh-releases-2026-09-29.tsv`
  - licences → `gh-licenses.tsv`
  - DBOS README → `dbos-readme.md`; DBOS docs https://docs.dbos.dev/typescript/tutorials/workflow-tutorial and …/upgrading-workflows (WebFetch 2026-09-29)
  - pg-boss README → `pg-boss-readme.md`; graphile-worker README → `graphile-worker-readme.md`
  - Workflow SDK Postgres World (`workflow-sdk-llms.txt:28863ff`, from https://workflow-sdk.dev/llms.txt)
  - Inngest self-hosting → `inngest-self-hosting.md` (https://www.inngest.com/docs/self-hosting)
  - Trigger.dev self-hosting → `trigger-self-hosting-overview.md` (https://trigger.dev/docs/self-hosting/overview)
  - Temporal deploy guide → `temporal-self-hosted-deployment.txt` (https://docs.temporal.io/self-hosted-guide/deployment)
  - Coolify templates → `coolify-template-{inngest,trigger,hatchet}.yaml`
- Circle: TEST/LIVE keys `12-network-toggle/libraries-and-implementation.md:17-27`; idempotency key "must be in UUID version 4 format" (`.firecrawl/docs/circle-llms-full.txt:8245-8248`); webhook HEAD+POST requirements `06-mobile-desktop-platform/backend-jobs-and-automations.md` §4
- LiveKit: `livekit-deploy-custom-deployments.md`, `livekit-pricing.txt`
- Channels: `06-mobile-desktop-platform/notification-channels.md:36,55-66`

Verified: 2026-09-29

## 1. What changes versus `06` (Vercel is no longer the target)

| `06` assumed | On Coolify |
|---|---|
| Hono API on Vercel Functions | A long-running Node HTTP service in a container (the framework choice is still open; the container doesn't care) |
| Vercel Workflows, one long-sleeping run per automation, hooks for approvals | **DBOS Transact on our Postgres**, running in a dedicated executor container, with **one short workflow per occurrence** (§5) |
| Vercel Cron as a coarse tick | Not needed. A DBOS cron schedule is the tick, and a Coolify Scheduled Task is only a backup reconcile (Coolify tasks skip missed runs and have a 300 s default timeout: `coolify-overview.md` §8) |
| Managed Postgres (Neon/Supabase) | Coolify standalone PostgreSQL 17 with S3 backups (Abu has **no S3 destination and 5 of 7 DBs unbacked** today) |
| LiveKit Cloud + "a worker deploy" | Unchanged: LiveKit Cloud SFU; **our agent worker runs on Coolify** (`monorepo-and-compose.md` §4) |
| Web on EAS Hosting / Vercel | A Coolify Application serving the Expo web export |

## 2. Resource map

One Coolify **project** for the product, with environments `production` and (optionally) `staging`. Every piece below is its **own Application (Dockerfile build pack, Base Directory `/`)**, which is Abu's proven pattern and keeps Coolify's rolling updates (Compose apps can't roll, D:4151).

| Piece | Coolify resource | Domain | Health check | Stop grace | Notes |
|---|---|---|---|---|---|
| **Postgres** | Standalone Database, PostgreSQL 17 | none (internal only) | built-in | n/a | One DB, separate schemas for the app and DBOS system tables. Daily S3 backup plus a manual backup before migrations. **Restore-test once** ("A successful backup only proves that Coolify created a file") |
| **api**: agent loop, tools, policy engine, capability registry, auth, SSE/WebSocket chat, webhooks (Circle, Telegram, Discord interactions, LiveKit) | Application `apps/api/Dockerfile` | `api.<domain>` | HTTP `/health` (DB reachable) | 30–60 s | Rolling updates on. Enqueues work via `DBOSClient` (README: `DBOSClient.create({ systemDatabaseUrl })`) but executes none. Circle webhooks need HEAD + POST and a 2XX response |
| **executor**: automations, approvals, transfers, notification fan-out (outbox drain) | Application `apps/executor/Dockerfile` | **none** | HTTP `/healthz` on an internal port | 300 s | Runs DBOS workflows and queues. Holds the signing path (C5). Never exposed publicly |
| **chain-watcher**: indexer for incoming transfers and event triggers (C8) | Application `apps/chain-watcher/Dockerfile` | none | `/healthz` | 30 s | viem log polling per network with a Postgres cursor, dedupe-keyed. It starts DBOS workflows by event ID (exactly-once start). It could be folded into the executor at first; keeping it separate isolates RPC failures |
| **voice-agent**: `@livekit/agents` 1.9.1 Node worker | Application `apps/voice-agent/Dockerfile` | none (outbound WebSocket to LiveKit) | HTTP `:8081/` (LiveKit's default health server) | **600–900 s** (LiveKit: "10+ minute grace period"; Coolify max 3600) | Calls the api for every tool and decision ("one brain", C1). Size per LiveKit: "4 cores and 8GB per agent server… 10-25 concurrent jobs" |
| **web**: Expo web export / PWA | Application `apps/web/Dockerfile` (multi-stage: `expo export -p web`, then a static server image) | `app.<domain>` | HTTP `/` | 10 s | Only public config at build time. The static pack can't run the build, so use a Dockerfile |
| **docs**: docs + showcase site (D20; tool chosen in `14-ui-and-docs/`) | Application `docs-site/Dockerfile` | `docs.<domain>` (and apex/`www` if it doubles as the landing page) | HTTP `/` | 10 s | Same pattern as `shijima-docs` |
| **Telegram bot** | **Route inside api** (`/webhooks/telegram`, `secret_token` header check, per `notification-channels.md:36`) | via api | — | — | Webhook mode means no extra container. Outbound sends come from the executor's notifier |
| **Discord** | Notifications via **incoming-webhook URLs** (REST, no gateway) sent from the executor. Two-way chat via the interactions HTTP endpoint on api | via api | — | — | A gateway bot (`discord.js`) would need its own always-on worker. Only add it if two-way DM chat is kept |
| **Redis** | **Not at start** | — | — | — | Nothing requires it: DBOS is Postgres-only, LiveKit Cloud is external, and the api runs as one container (Coolify v4 has no per-server replicas; Swarm is deprecated, D:19850). Add a Coolify Redis only if the api goes multi-instance, for WebSocket pub/sub (D:38587) |
| **LiveKit SFU/TURN** | **LiveKit Cloud** (Build $0 → Ship $50) | `wss://<project>.livekit.cloud` | — | — | Separate LiveKit projects for dev, staging and prod, as LiveKit recommends |
| Backup reconcile | Coolify **Scheduled Task** on executor: `node dist/reconcile.js`, `*/10 * * * *` | — | — | — | Belt and braces only. It re-kicks stuck occurrences through DBOS |

## 3. Repo and Dockerfile layout

This follows Abu's convention (pnpm workspace, root build context, per-app Dockerfile, `--filter "<pkg>..."`; `monorepo-and-compose.md` §1):

```
<repo>/
├─ apps/
│  ├─ api/            Dockerfile   src/…   (HTTP + webhooks + SSE/WS)
│  ├─ executor/       Dockerfile   src/…   (DBOS workflows, queues, notifier)
│  ├─ chain-watcher/  Dockerfile
│  ├─ voice-agent/    Dockerfile           (@livekit/agents worker)
│  ├─ mobile/                              (Expo app: iOS/Android/web source)
│  └─ web/            Dockerfile           (builds apps/mobile with expo export -p web, serves dist)
├─ docs-site/         Dockerfile
├─ packages/
│  ├─ networks/       (the NetworkId registry from 12-network-toggle: chainId, RPCs, circleBlockchain, circleKeyRef)
│  ├─ capabilities/   (per-network capability registry, C3)
│  ├─ policy/         (limits, allowlists: deterministic, C2)
│  ├─ db/             (schema + migrations, incl. occurrences, ledger, outbox, deliveries)
│  ├─ workflows/      (DBOS workflow + step definitions shared by executor and the api client)
│  ├─ env/            (zod-validated env loader: one schema per app)
│  └─ shared/         (money types in integer base units, C6)
├─ deploy/
│  ├─ compose.dev.yaml   (local Postgres only; NOT used by Coolify)
│  └─ coolify.md         (resource UUID map, domains, grace periods: the runbook)
├─ .dockerignore        (**/node_modules, .env*, dist, .expo, var)
└─ pnpm-workspace.yaml
```

Shape of each server Dockerfile (Node 24 like shijima; pinned pnpm via corepack):
- **Stage `deps`:** copy the lockfile and every `package.json`, then `pnpm fetch` or `pnpm install --frozen-lockfile --filter "@app/<svc>..."` with a BuildKit cache mount.
- **Stage `build`:** `pnpm --filter "@app/<svc>..." build`.
- **Stage `run`:** `node:24-slim` with `curl` installed (the Coolify HTTP check needs `curl` or `wget` in the image, D:2899ff), `USER node`, `EXPOSE <port>`, `HEALTHCHECK` optional (an image `HEALTHCHECK` overrides the UI check), `CMD ["node","dist/main.js"]`.
- Handle `SIGTERM` in every service. The executor and voice-agent must finish or abandon in-flight work inside their grace period.

**Migrations:** run as the api's **pre-deployment command**. Coolify runs it "in the current application container before replacement", skips it on the first deploy, and "a failing pre-deployment command stops the deployment" (D:1307). Migrations must be backward-compatible, because old and new containers overlap during rolling updates (D:4181). DBOS system tables migrate themselves at launch [UNKNOWN: confirm in DBOS docs].

**Auto-deploy:** Abu's apps use deploy keys, so there are no Watch Paths. Use **GitHub Actions**: per-app `paths:` filters → `coolify deploy batch <uuids>` or `POST /api/v1/deploy` with a **deploy-only token** stored in GitHub secrets. Alternatively, install a Coolify GitHub App to get Watch Paths and PR previews natively.

## 4. Environment variables and secrets

Principles: **runtime-only** (Build Variable **off**) for every secret; **locked**; validated at boot by `packages/env`; **no secret ever in the web build** (anything baked into the Expo web bundle is public).

| Variable | Scope in Coolify | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | environment shared var `{{environment.DATABASE_URL}}` | api, executor, chain-watcher | Internal Coolify DB host on the `coolify` network (D:26230); never the public port |
| `DBOS_SYSTEM_DATABASE_URL` | environment shared var | api (client), executor | Same DB, separate schema or DB name |
| `CIRCLE_TEST_API_KEY` (`TEST_API_KEY:…`) | environment shared var | api, executor | Testnet |
| `CIRCLE_LIVE_API_KEY` (`LIVE_API_KEY:…`) | environment shared var, **production env only** | api, executor | Mainnet. Names match `circleKeyRef: 'CIRCLE_LIVE' \| 'CIRCLE_TEST'` in `12-network-toggle/libraries-and-implementation.md:99` |
| App Kit key(s) `<ENV>_API_KEY:<keyId>:<keySecret>` | same split, TEST + LIVE | api, executor | "server-only secret" (`12/…:27`) |
| Any other per-environment Circle secret (e.g. an entity secret for developer-controlled wallets, if that custody option wins) | same split | executor | Whether one entity secret spans both keys: [UNKNOWN] |
| `MAINNET_ENABLED` | per environment | api, executor, web (public) | `true` only in production. If the LIVE key is missing, boot fails closed to **testnet-only** with an explicit capability flag, never a silent fallback ("fail toward testnet", `12/…:83`) |
| `ARC_RPC_MAINNET`, `ARC_RPC_TESTNET` | project shared var | api, executor, chain-watcher | Pinned (`12/…:56`) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | per environment (separate LiveKit projects) | api (token minting), voice-agent | |
| STT/TTS/LLM provider keys | per environment | voice-agent, api | |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | per environment (a separate bot for staging) | api, executor | |
| `DISCORD_CLIENT_ID/SECRET` (OAuth for `webhook.incoming`) | per environment | api | |
| `CIRCLE_WEBHOOK_*` | per environment | api | Signature verification uses Circle's public key by `X-Circle-Key-Id` |
| `EXPO_PUBLIC_API_URL` etc. | **build** variable on `web` only | web | Public values only |

- **Mainnet ↔ testnet is a runtime toggle (D15), not two deployments.** The production api and executor hold **both** credentials and choose per request from the request's `NetworkId`. This follows the `12` rule that every record carries `chainId` [builds on VERIFIED `12/…:17-26`].
- **Staging and PR previews get only TEST credentials** and a separate database. Coolify warns: "Do not expose production credentials to preview deployments" and previews have their own variable set [VERIFIED D:2460, D:3867ff].
- **Least-privilege Coolify tokens:** CI gets a `deploy` token; humans and agents browsing use `read`. `read:sensitive` exposes env values [VERIFIED D:388ff].

## 5. Durable scheduler and executor on Coolify

### 5.1 Options, checked today

| Engine | Version (2026-09-29) | Self-host on Coolify | Fit for "send $10 every Tuesday, exactly once, with approvals" |
|---|---|---|---|
| **DBOS Transact (TS)** | `@dbos-inc/dbos-sdk` **5.1.10**; repo v5.1 (MIT) | **A library in our executor; needs only Postgres.** No extra container | Durable workflows and steps. `DBOS.sleep` ("days or weeks"). Cron schedules stored in Postgres. `DBOS.recv` with durable timeouts ("exactly-once semantics" for notifications). Queues with concurrency, rate-limit, dedupe and priority. "An assigned workflow ID acts as an idempotency key… executes only once". Programmatic list/pause/resume/fork. **Caveat:** "it only recovers workflows whose version matches the current application version". Deploys need draining (DBOS recommends blue-green) [VERIFIED README + docs] |
| **pg-boss** | **12.35.0** (MIT) | Library; Postgres only | Queue on `SKIP LOCKED`, cron + RRULE, retries with backoff, DLQ with redrive, debounce/concurrency policies, `@pg-boss/dashboard`. **No workflow/durable-sleep/wait-for-approval abstraction**, so we'd hand-write the occurrence state machine [VERIFIED README] |
| **graphile-worker** | **0.18.0** (MIT) | Library; Postgres only | Postgres job queue with crontab. The Workflow SDK Postgres World is built on it [VERIFIED README; `@workflow/world-postgres` deps] |
| **Workflow SDK + Postgres World** (06's pick, off-Vercel) | `workflow` **4.8.9**, `@workflow/world-postgres` **4.3.7** | Library; Postgres (graphile-worker 0.16.6) | The docs themselves call it "a **reference implementation**… not optimized for scale, speed, or security, and it ships with **no authentication** on the workflow HTTP routes. For production… we recommend cloning it and adapting it". **Not acceptable for money movement as shipped** [VERIFIED] |
| **Inngest (self-hosted)** | server **v1.45.1**, SDK `inngest` **4.21.0** | Single binary `inngest start` (help text: "[Beta] Run Inngest as a single-node service"); Postgres + Redis for production. A Coolify one-click template exists but is pinned to **v1.27.0**. "Inngest's support team does not guarantee direct support for self-hosted instances". GitHub licence field: NOASSERTION (terms not reviewed) | Strong model (steps, sleeps, `waitForEvent`, flow control). But it adds an engine plus Redis to operate, and has a beta single-node mode [VERIFIED docs; licence UNKNOWN] |
| **Trigger.dev (self-hosted)** | **v4.6.4** (Apache-2.0) | Heavy: the Coolify template (v4.3.0) runs webapp, supervisor, docker-socket-proxy, Postgres, Redis, Electric and ClickHouse. Self-host lacks "Checkpoints (non-blocking waits)", "Warm starts" and "Auto-scaling" | Waits hold resources without checkpoints, and supervisor access to the Docker socket is a security surface on a shared box [VERIFIED docs + template] |
| **Temporal** | server **v1.32.0**, TS SDK **1.24.0** (MIT) | Its docker-compose "includes a PostgreSQL database, an Elasticsearch instance"; Helm for production. **No Coolify template** | Most mature durable execution, but the heaviest to operate (cluster + ES) on a single shared box [VERIFIED docs] |
| **Hatchet** | **v0.107.0**, SDK **1.33.2** (MIT) | The Coolify template uses `:latest` images plus RabbitMQ | Viable, but it's one more broker; `latest` tags are unpinned [VERIFIED template] |

**Pick: DBOS Transact in the `executor` app on the Coolify Postgres. Fallback: pg-boss with a hand-written state machine** [INFERENCE].
- Why DBOS:
  - No new infrastructure: one Postgres we already back up.
  - It is a library, like Workflow SDK, but not a "reference implementation".
  - The primitives match the flows: idempotent start by ID, durable timed `recv` for approvals, queues for fan-out, and scheduling.
  - It is inspectable with SQL and its client.
- Why not the others: engine-based options (Inngest, Trigger, Temporal, Hatchet) each add containers, brokers or Docker-socket access to an already crowded single server. D17 favours fewer moving parts done well.

### 5.2 Shape that is safe under Coolify rolling updates

The DBOS version rule and the Coolify overlap rule (D:4181) together argue **against** 06's "one run per automation that sleeps for weeks". A sleeping workflow pinned to an old code version would not be recovered by the new version. Instead:

```
automations(id, owner, rule, tz, cap, recipient_contact_id, network_id, status, next_run_at)
occurrences(id, automation_id, scheduled_for, network_id, status, circle_idem_key uuid, tx_hash, …,
            UNIQUE(automation_id, scheduled_for))                      ← the dedupe anchor
outbox(id, occurrence_id, event, payload, created_at, dispatched_at)   ← same txn as status changes
deliveries(outbox_id, channel, status, attempts, last_error, UNIQUE(outbox_id, channel))

DBOS scheduled workflow "tick" (every minute):
  step: SELECT automations WHERE status='active' AND next_run_at <= now() FOR UPDATE SKIP LOCKED LIMIT n
        INSERT occurrence ON CONFLICT DO NOTHING; advance next_run_at   (one transaction)
        start workflow runOccurrence with workflowID = occurrence.id     (idempotent start)

runOccurrence(occurrenceId):          ← short-lived: minutes, or hours only while awaiting approval
  step: load + re-check automation still active, network enabled, capability available (C3)
  step: policy check (caps, allowlisted recipient, balance), deterministic (C2)
  if approval needed: step: write outbox "approval_requested"; recv('approval', timeout)
  step: submit transfer with the persisted circle_idem_key (UUIDv4 generated once, stored BEFORE the call)
        or, for on-chain delegation redemption: persist the signed tx/nonce before broadcast
  step: await confirmation (Circle webhook → api → DBOS send, or poll receipt)
  step: mark occurrence done + outbox "executed" in ONE transaction
notifier queue: drain outbox → per-channel deliveries (retry per channel, never re-send delivered ones)
```

- **"Exactly once" really means:** at most one occurrence row (UNIQUE), at most one workflow per occurrence (workflow ID), and an idempotent side effect. Circle rejects a reused key on a different request (`circle-llms-full.txt:4719,4857`), and "the idempotency key must be in UUID version 4 format" (`:8245`), so we **generate and persist** the UUIDv4 rather than derive it. Plus an outbox so notifications never go out without the state change.
- **Leases:** DBOS recovers interrupted workflows. `FOR UPDATE SKIP LOCKED` plus the UNIQUE constraint make two overlapping executors (old and new during a rolling update) harmless. Set an **explicit DBOS application version** and keep the old executor draining for up to the stop grace period. For long approval waits that cross a deploy, prefer "expire and re-request" over relying on cross-version recovery.
- **Chain events** (incoming USDC, "when I receive… forward 10%"): the chain-watcher writes `chain_events(UNIQUE(chain_id, tx_hash, log_index))` and starts a workflow with `workflowID = chain_id:tx:log` (DBOS "Exactly-Once Event Processing"). Circle webhooks do the same with Circle's notification ID.

## 6. Domain scheme

Product name and domain are pending (D24, `16-naming/`). With `<domain>` as the apex:

| Host | Resource |
|---|---|
| `<domain>` + `www.<domain>` | docs/showcase landing (or redirect to `app.`) |
| `app.<domain>` | web app / PWA |
| `api.<domain>` | api (REST, SSE/WS, `/webhooks/{circle,telegram,discord,livekit}`) |
| `docs.<domain>` | docs site |
| `staging.<domain>`, `api.staging.<domain>` | staging environment (TEST keys only) |
| `pr-{{pr_id}}.<domain>` | Coolify preview template (needs a wildcard DNS record `*.<domain>` → server; certs stay per-host HTTP-01) |

- LiveKit uses its Cloud URL, so it needs no subdomain.
- **Do not** put the network in the hostname (no `testnet.` app): the network is a runtime toggle (D15). This differs from Abu's `testnet.mitoshi.xyz` pattern on purpose.
- Setting the server's **Wildcard Domain** is optional. It only affects auto-suggested names; we set domains explicitly.
- A wildcard *certificate* would need the Traefik DNS challenge (D:26041), which isn't configured and isn't needed.

## 7. Risks

| Risk | Why [evidence] | Mitigation |
|---|---|---|
| **Single server = single point of failure for unattended payments** | 1 server, which is also the Coolify host [VERIFIED inspection] | Automations must tolerate downtime: the tick catches up, and every occurrence carries a "late by" check that asks the user instead of silently sending stale payments. Consider a second server for the executor later (Coolify multi-server, D:19989ff) |
| **Capacity / noisy neighbours** | 14 apps + 7 DBs already, no CPU/memory limits set, OS/CPU/RAM unknown; voice-agent wants 4c/8GB [VERIFIED] | Read Sentinel metrics first; set Coolify resource limits on our containers; put voice-agent on a separate server if needed |
| **Build queue** | `concurrent_builds=1`; a `packages/*` change rebuilds ~6 apps one after another [VERIFIED] | Build images in GitHub Actions and deploy images, or raise concurrency |
| **Backups** | No S3 destination; 5 of 7 DBs unbacked [VERIFIED] | Add R2/S3 now, back up daily plus before migrations, and test a restore |
| **DBOS version pinning across deploys** | Old-version workflows aren't recovered by new code [VERIFIED docs] | Short per-occurrence workflows, an explicit app version, drain on SIGTERM, and a reconcile task |
| **Overlapping containers during rolling updates** | "Schedulers, queue consumers… must tolerate two versions running briefly" (D:4181) | UNIQUE constraints, idempotent starts, backward-compatible migrations |
| **Secret leakage to previews/staging** | Previews run PR code on the server (D:3867ff) | TEST-only keys and a separate DB for previews; `MAINNET_ENABLED=false` |
| **Coolify release churn** | 8 releases in 15 days (Sep 3–18) [VERIFIED] | Turn off auto-update during the event (Settings → Updates, D:22238) and upgrade deliberately |
| **Traefik owns 443/udp** | HTTP/3 [VERIFIED] | Use LiveKit Cloud, and don't self-host TURN on this box |
| **Deploy keys → no Watch Paths** | [VERIFIED D:2749] | CI path filters or a GitHub App |
| **Coolify tokens on Abu's laptop** | CLI contexts store tokens locally (`coolify config`) | Use `read` tokens for browsing agents and a `deploy` token for CI |
| **Workflow SDK Postgres World** | "no authentication", "reference implementation" [VERIFIED] | Not used |

## Open questions for Abu
1. Server specs (CPU/RAM/disk, provider firewall): can this box take ~6 more containers plus a 4c/8GB voice worker, or should we add a second server to Coolify?
2. Domain for the product (after `16-naming/`), and can we add `*.<domain>` DNS for PR previews?
3. OK to add an S3/R2 destination for DB backups?
4. GitHub App in Coolify (Watch Paths and previews) or GitHub Actions + deploy token?
