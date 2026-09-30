# Abu's Coolify server: what is already there

Purpose: a read-only snapshot of Abu's Coolify instance, so the deployment plan starts from facts. It contains no IPs, tokens, UUIDs, env values or repo URLs.

Sources:
- Read-only commands, run 2026-09-29 with `/Users/abu/.local/bin/coolify` (CLI **1.8.0**): `context list`, `context verify`, `context version`, `server list/get/domains`, `server proxy get`, `server sentinel get`, `server docker-cleanup get`, `server log-drains get`, `server cloudflare-tunnel get`, `project list`, `resource list`, `app list`, `database list`, `database backup list`, `service list`, `s3 list`, `github list`, plus one `GET /api/v1/servers/{uuid}` for fields the CLI omits. **Nothing was created, modified, deployed or deleted.**
- Sanitized output: `.firecrawl/product/13/abu-server-inspection-sanitized.json`

Verified: 2026-09-29

## Contexts
- The CLI has 4 contexts: `cloud` (app.coolify.io), `localhost`, `agari`, and **`agari-new` (the default)**.
- `agari-new` reaches the instance on a local port (likely an SSH tunnel [INFERENCE]). It verifies OK: "Coolify version: **4.3.23**", which is the latest release (`coolify-overview.md` §1) [VERIFIED].
- The older `agari` context (direct IP, port 8000) **hung past 120 s**. It is probably retired or firewalled [INFERENCE]. Everything below is from `agari-new`.

## Summary

| Item | Finding | Status |
|---|---|---|
| Servers | **1**. It is the Coolify host itself (`is_coolify_host: true`, reached as `host.docker.internal`) and is reachable and usable. No Swarm, no separate build server, no Cloudflare Tunnel. Not provisioned through Coolify's Hetzner/DO/Vultr integration | [VERIFIED] |
| OS / CPU / RAM | **Not exposed** by the CLI or API (`server_metadata: null`). Sentinel metrics are **on** (15 s refresh, 7-day history), so the dashboard's Metrics page should show CPU/RAM | [UNKNOWN] Abu to read it from the dashboard or `uname`/`nproc`/`free -h` |
| Docker / Compose | Docker 29.8.1, Compose 5.5.1, server timezone UTC | [VERIFIED] |
| Proxy | **Traefik**, running. Detected **v3.6.25**; Coolify flags a minor upgrade to v3.7.13. Published ports: **80/tcp, 443/tcp, 443/udp (HTTP/3), 8080/tcp** | [VERIFIED] |
| TLS | Let's Encrypt **HTTP-01 challenge only** (no DNS challenge configured), so **no wildcard certificates**. Each hostname gets its own certificate | [VERIFIED] |
| Wildcard Domain (server setting) | **Not set.** Resources without a custom domain get `*.sslip.io` hostnames derived from the server IP | [VERIFIED] |
| Build settings | `concurrent_builds = 1`, `deployment_queue_limit = 25`, dynamic timeout 3600 s. Docker cleanup is daily at 00:00 with an 80% disk threshold | [VERIFIED] |
| Log drains | None enabled (Axiom, New Relic and custom are all off) | [VERIFIED] |
| Git sources | Only the default **Public GitHub** source; **no GitHub App**. Abu's apps clone over SSH **deploy keys**, so **Watch Paths and GitHub-App auto-deploys are not available** as configured (see `monorepo-and-compose.md` §2) | [VERIFIED] |
| S3 destinations | **None.** DB backups therefore stay on the same server | [VERIFIED] |

## Projects (9)
masayume, agari, shijima, ruckus, our-journal, baku, logos-kit, mitoshi, akashi [VERIFIED]. None is for this product yet.

## Resources
- **Applications: 14.**
  - Build packs: 9 Dockerfile, 3 Docker Image, 1 Nixpacks, and 1 Docker Compose (`logos-kit-preview-net`).
  - All are running. 10 have their health check enabled (`/health`, `/healthz`, `/api/health`, `/api/status`, `/`).
  - 2 are workers with no public domain (`shijima-worker`, `baku-worker`).
  - Custom apex domains are in use for three products (useagari.xyz, shijima.xyz, mitoshi.xyz, with subdomains such as `docs.`, `ops.`, `room.`, `stream.testnet.`). The rest use sslip.io.
- No resource has CPU or memory limits set (`limits_memory`/`limits_cpus` = 0) [VERIFIED].
- **Databases: 7**, all running and healthy.
  - 6 PostgreSQL: images `postgres:17` ×2, `postgres:17-alpine`, `postgres:17.11-alpine`, `postgres:16-alpine` ×2.
  - 1 Redis: `redis:7.2`.
- **Backup schedules exist on only 2 of 7 databases** (daily 03:00, local only, no S3) [VERIFIED].
- **Services (one-click / compose): 0** [VERIFIED].

## Abu's established deploy convention
One Coolify Application per service, **Dockerfile** build pack, Base Directory `/`, Dockerfile at `/apps/<svc>/Dockerfile` (or `/web/Dockerfile`, `/services/ops/Dockerfile`), docs as a separate app with Base Directory `/docs-site` [VERIFIED]. Details are in `monorepo-and-compose.md` §1.

## Implications for our product [INFERENCE]
1. **Capacity is the first unknown.** One box already runs 14 apps and 7 DBs. Our stack adds roughly 8 containers. The LiveKit agent worker alone is sized by LiveKit at "4 cores and 8GB per agent server". Check CPU/RAM before committing; adding a second server to Coolify is supported (`coolify server add`, /docs/core/infrastructure/servers/add-server).
2. **Builds will queue.** With `concurrent_builds=1`, a push that touches `packages/*` rebuilds every app one after another. Either raise concurrency (if RAM allows), build in CI and deploy images, or use a build server (which needs a registry).
3. **Pick a domain and decide on wildcard DNS.** Per-host HTTP-01 certificates work fine for ~6 fixed subdomains. **PR previews** (`{{pr_id}}.{{domain}}`) need either a wildcard DNS record (with per-host HTTP-01 certs) or the DNS challenge for a wildcard cert.
4. **UDP 443 is already Traefik's** (HTTP/3). That constrains any self-hosted LiveKit TURN (see `monorepo-and-compose.md` §4).
5. **Backups:** configure an S3 destination (e.g. Cloudflare R2, which Coolify documents at /docs/core/s3-storage/r2) and a schedule for our Postgres from day one. Money-moving state must not live only on the same disk.
