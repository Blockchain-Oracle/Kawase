# 13 — Deployment on Coolify (D18)

Purpose: index and key findings for deploying the product's server side to Abu's self-hosted Coolify, which replaces the Vercel assumption in `06-mobile-desktop-platform/`.

Sources: the files below; raw evidence in `.firecrawl/product/13/` (Coolify docs text dump, release/licence/npm snapshots, LiveKit docs, job-engine docs and templates, sanitized server inspection). No secrets, IPs or env values are stored.
Verified: 2026-09-29

| File | What it covers |
|---|---|
| `coolify-overview.md` | Coolify v4.3.23: resource types, build packs, domains/HTTPS/magic env vars, env and secrets, storage, health checks, scheduled tasks, workers, previews, rolling updates, backups, API/CLI |
| `monorepo-and-compose.md` | Monorepo on Coolify (per-app Dockerfile vs Compose), Abu's folder convention, WebSockets/WebRTC behind Traefik, LiveKit self-host vs Cloud |
| `abu-server-inspection.md` | Read-only snapshot of Abu's instance |
| `recommendation.md` | [INFERENCE] Resource map, repo/Dockerfile layout, env strategy (Circle TEST/LIVE), durable executor (DBOS), domains, risks, open questions |

## Key findings
1. **Coolify 4.3.23 is the latest release (2026-09-18), and Abu runs it.** He has 1 server (also the Coolify host), a Traefik proxy, 9 projects, 14 apps, and 7 DBs (6 Postgres, 1 Redis). There are **no S3 backups**, **no wildcard domain**, **no GitHub App** (deploy keys only), and `concurrent_builds=1`. CPU and RAM are not exposed by the API [VERIFIED].
2. **Coolify has no required folder structure.** The "structure" is Abu's own proven pattern: a pnpm workspace with `apps/<svc>/Dockerfile` built from the repo root, one Coolify Application per service, and `docs-site/` as its own app [VERIFIED on his live apps and the shijima repo].
3. **Use one Application per service, not one Compose app.** Compose apps get no rolling updates and no UI health checks [VERIFIED D:4151, D:2919]. Watch Paths need a GitHub App or GitLab source, not deploy keys [VERIFIED D:2749].
4. **Coolify Scheduled Tasks cannot be our scheduler.** They run a command in a container on cron, skip runs when the container is down, and time out at 300 s by default. At most they can serve as a backup reconcile tick [VERIFIED / INFERENCE].
5. **Automation engine: DBOS Transact 5.1.10 (MIT)** inside an `executor` container on the Coolify Postgres, with one short workflow per occurrence, UNIQUE occurrence rows, a persisted Circle UUIDv4 idempotency key, and an outbox. The Workflow SDK Postgres World (the off-Vercel path of 06's pick) calls itself a "reference implementation" with "no authentication". Trigger.dev, Inngest, Temporal and Hatchet each add heavy self-host infrastructure [VERIFIED facts; pick is INFERENCE].
6. **Voice: LiveKit Cloud for the SFU, our Node agent worker on Coolify.** The worker needs no inbound ports. Self-hosting LiveKit on this box clashes with Traefik owning 443/tcp+udp (TURN) and with LiveKit's host-networking and bandwidth guidance [VERIFIED docs; conclusion INFERENCE].
7. **Mainnet/testnet is one deployment holding both Circle keys** (`CIRCLE_TEST_API_KEY` / `CIRCLE_LIVE_API_KEY`, runtime-only). Staging and PR previews get TEST only and `MAINNET_ENABLED=false` [INFERENCE on `12-network-toggle` facts].

## Open questions for Abu
Server specs and provider firewall; product domain + `*.domain` DNS for previews; adding an S3/R2 backup destination; GitHub App vs GitHub Actions deploy token. See `recommendation.md`.
