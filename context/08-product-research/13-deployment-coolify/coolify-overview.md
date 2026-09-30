# Coolify: what it is and what it gives us

Purpose: the facts about Coolify (Abu's deployment target, D18) that shape how our server side is built and run.

Sources:
- Coolify docs full-text dump `https://coolify.io/docs/llms-full.txt`, saved (docs text only, screenshots stripped) as `.firecrawl/product/13/coolify-docs-text.txt`. Line numbers below (`D:<line>`) refer to that file. Each section also names its coolify.io/docs page.
- Latest release: `gh api repos/coollabsio/coolify/releases/latest` → `.firecrawl/product/13/coolify-release-latest.json`
- Coolify CLI: `gh api repos/coollabsio/coolify-cli/releases/latest` (v1.8.0, 2026-08-19); local `coolify --help` (CLI 1.8.0)
- One-click templates: `gh api repos/coollabsio/coolify/contents/templates/compose` → `.firecrawl/product/13/coolify-templates-list.txt` (386 files)
- Traefik WebSocket statement: `.firecrawl/product/13/traefik-websocket-excerpt.txt`
- The skill `/Users/abu/.claude/skills/coolify/SKILL.md` + `references/api-reference.md`. These are generic (a third-party "terminal-skills" v1.0.0 skill). **They contain no folder-structure convention.**

Verified: 2026-09-29

## 1. Version and licence
- **Latest stable: v4.3.23, published 2026-09-18** (`coolify-release-latest.json`). The eight most recent releases are all 4.3.x and none is a prerelease, published Sep 3–18. The project releases often [VERIFIED].
- **Abu's instance runs 4.3.23**, which is current (`coolify context version`; see `abu-server-inspection.md`) [VERIFIED].
- Licence: Apache-2.0 (`.firecrawl/product/13/gh-licenses.tsv`) [VERIFIED].
- **Model.** "Coolify is the control plane for your infrastructure. Coolify connects to each server over SSH… and coordinates builds, deployments, domains, HTTPS, health checks" (/docs/core/what-is-coolify, D:32440ff). Workloads are plain Docker containers. Running resources stay reachable while the control plane is down (/docs/core/networking-in-coolify, D:26219) [VERIFIED].

## 2. Resource types (/docs/core/what-is-coolify, /docs/databases, /docs/services)
Every resource belongs to a **project → environment** and runs on a **server** [VERIFIED D:32460ff].

| Type | What it is | Notes |
|---|---|---|
| **Application** | Git repo (public, deploy key, GitHub/GitLab App), Dockerfile without Git, Docker Compose, or a prebuilt image | Unit of build, domains, health check, rolling update |
| **Database** (standalone) | PostgreSQL, MySQL, MariaDB, MongoDB, Redis, ClickHouse, Dragonfly, KeyDB | Private by default; "A domain does not expose a standalone database. Use the database's public port" (D:24350) |
| **Service** | One-click template (a maintained Compose file) or "Docker Compose Empty" (pasted Compose, no Git) | 386 template files in the repo today, including `inngest.yaml`, `trigger.yaml`, `hatchet.yaml`, `windmill.yaml`, `n8n*.yaml`. **No LiveKit and no Temporal template** (`coolify-templates-list.txt`) [VERIFIED] |

## 3. Build packs (/docs/applications/builds/overview, D:1704–1790)
"Use Nixpacks or Railpack for automatic detection, Static for files that are already built, Dockerfile for one custom image, and Docker Compose for a multi-service definition" [VERIFIED].

| Pack | Status / key facts |
|---|---|
| **Nixpacks** | "Maintenance mode; not under active development", "Supported" (D:1636, D:1926–1929) |
| **Railpack** | Railway's successor to Nixpacks, **Beta** in Coolify, needs Docker Buildx; `railpack.json`; `RAILPACK_*` build vars; base dir such as `/apps/api` for a monorepo (D:1796–1934) |
| **Static** | Serves committed files with `nginx:alpine`. "It does not run a framework build command" (D:1940ff). For an Expo web export we'd build in a Dockerfile or use Railpack static mode instead |
| **Dockerfile** | Base Directory = build context, Dockerfile Location relative to it; the first `EXPOSE` sets Ports Exposes (D:1165, 1206, 1258). Build stage target is selectable. Pre-/post-deployment commands exist (D:1307) |
| **Docker Compose** | One app, many services; the Compose file drives images, volumes, health checks and networks (D:615ff) |
| Docker Image | Pull a registry image; skips the build |

Builds run **on the deployment server by default** (D:1738). A separate **build server** is possible, but then a registry is required (D:1740–1742) [VERIFIED].

## 4. Domains and HTTPS (/docs/core/networking/domains, /proxy/overview, /traefik/wildcard-certs)
- One `coolify-proxy` container per server. **Traefik is the default. Caddy is an alternative** ("currently less documented"). "Custom (None)" means you run your own proxy (D:24896ff) [VERIFIED].
- Put a full URL in **Domains**. `https://` enables automatic TLS. The URL's port selects the **container** port, not a host port (`https://app.example.com:3000`); without a port, traffic goes to container port 80. Path routes (`/api`) are allowed, and the prefix is stripped by default (D:24297–24579) [VERIFIED].
- **Wildcard domain (server setting).** With a *Wildcard Domain* such as `https://example.com`, Coolify suggests `https://<application-id>.example.com`. "When **Wildcard Domain** is empty, Coolify can generate an `sslip.io` domain from the server IP" (D:20800, D:24525) [VERIFIED].
- **Wildcard *certificates*:** "Traefik can request wildcard certificates only through the DNS challenge" (D:26041). The default is per-host HTTP-01 certificates [VERIFIED].
- **Magic env vars in Compose.** `SERVICE_URL_<ID>` (URL with scheme) and `SERVICE_FQDN_<ID>` (host only) are generated from the wildcard domain; a numeric suffix picks the container port (`SERVICE_URL_API_3000`). The family also includes `SERVICE_USER_*`, `SERVICE_PASSWORD_*` (32), `SERVICE_PASSWORD_64_*`, `SERVICE_BASE64_*`, `SERVICE_REALBASE64_*` and `SERVICE_HEX_*`. Values persist across deploys (D:862–917) [VERIFIED].
- **WebSockets**: "Traefik Proxy supports WebSocket (WS) and WebSocket Secure (WSS) connections out of the box" (Traefik docs, `traefik-websocket-excerpt.txt`) [VERIFIED].
- **UDP / non-HTTP**: "Use a published port only when an external client requires direct TCP or UDP access" (D:41693). The default Traefik listens on 80/443 "including HTTP/3 on UDP port 443" (D:24862) [VERIFIED].

## 5. Environment variables and secrets (/docs/applications/configuration/environment-variables, /docs/core/team/shared-variables)
- **Build Variable and Runtime Variable are independent flags; both are on by default** (D:2484). "Disable **Build Variable** for a secret that the application only reads after the container starts." Build args "can appear in image metadata"; use **Use Docker Build Secrets** (BuildKit) for sensitive build values (D:2490–2494, D:1290) [VERIFIED].
- **Preview deployments have their own variable set** (D:2460) [VERIFIED].
- **Multiline** (keys, certs) and **Literal** (no `$` expansion) flags exist. **Locked** secrets can't be edited in Developer view; to change a locked value, delete it and recreate it (D:2480, D:32407) [VERIFIED].
- **Shared variables** at team, project, environment or server scope, referenced as `{{environment.DATABASE_URL}}`. They are not auto-added to resources (D:32290ff) [VERIFIED].
- Predefined: `COOLIFY_FQDN`, `COOLIFY_URL`, `COOLIFY_BRANCH`, `COOLIFY_RESOURCE_UUID`, `COOLIFY_CONTAINER_NAME`, `SOURCE_COMMIT`, `PORT`, `HOST=0.0.0.0` [VERIFIED D:2534ff].
- In Compose, `${VAR:?}` marks a variable as required, and Coolify blocks the deploy until it has a value (D:780–800) [VERIFIED].
- A runtime-only change needs a **Restart**; a build-time change needs a **new deployment** [VERIFIED D:2572].

## 6. Persistent storage (/docs/core/persistent-storage/storage-mounts/overview)
Volume mounts, bind mounts, file mounts and directory mounts. "Only data written under a mounted destination path is persistent." Scheduled storage backups exist for application volumes (D:29086ff). In Compose, the volumes are owned by the Compose file and are read-only in the UI (D:940–960) [VERIFIED].

## 7. Health checks (/docs/applications/configuration/health-checks)
- The check is defined in one of three places: the UI (HTTP or CMD), a Dockerfile `HEALTHCHECK`, or a Compose `healthcheck`. For a Dockerfile app, **an image `HEALTHCHECK` overrides the UI check** (D:2899ff) [VERIFIED].
- **The image must contain `curl` or `wget`.** The generated check uses only the exit code; "Return Code" and "Response Text" are not compared [VERIFIED].
- With Traefik, "Traefik removes unhealthy containers from routing" [VERIFIED].
- "Docker Compose applications do not use the standard application **Healthcheck** page" (D:2919) [VERIFIED].

## 8. Scheduled tasks (cron) (/docs/applications/operations/scheduled-tasks, /docs/core/automation/*)
- A task runs a shell command **inside the app's running container** on a five-field cron or a named schedule (`daily`; `@every_minute` is **not** supported). The timezone is the server's (D:6114ff, D:17499, D:17801) [VERIFIED].
- **Timeout 60–36,000 s, default 300** (D:6164) [VERIFIED].
- "A scheduled execution is **skipped** when the task is disabled, the application or service is not running, or the connected server is not functional" (D:17980). There is no catch-up or retry semantic in the docs [VERIFIED; absence = UNKNOWN beyond the docs].
- **Can it replace a job scheduler? No** [INFERENCE]. The limits:
  - minute granularity at best;
  - skipped runs are not replayed;
  - there is no per-user or per-automation schedule (tasks are configured per resource by an operator, not created by our app at runtime);
  - no idempotency, leases or retries;
  - the history is an ops log, not a ledger.
  
  At most it can act as a **backup "tick"** (e.g. `node scripts/reconcile.js` every 5 min) that calls into our real engine.

## 9. Long-running workers (non-HTTP containers)
- An Application needs no domain. Abu already runs workers with no domain and the health check off (`shijima-worker`), or with an internal `/healthz` (`baku-worker`) (`abu-server-inspection.md`) [VERIFIED].
- Graceful stop: "**Stop Grace Period** … default is 30 seconds. Coolify accepts values from 1 to 3600 seconds" (D:4191) [VERIFIED].
- Node uses one core per process. Coolify's knowledge-base page "Node.js Multi-Core Scaling" says WebSocket maps and in-memory state must move to Redis if you cluster (D:38584–38587) [VERIFIED].

## 10. Deployments: Git, previews, rolling updates (/docs/applications/deployments/*, /sources/github/*)
- **Auto-deploy.**
  - GitHub App or GitLab integration: push events arrive automatically.
  - Public repo or **deploy key**: you add a **manual Git webhook** with a secret.
  - External CI: call the authenticated **Deploy Webhook** / `POST /api/v1/deploy` (D:3352–3475) [VERIFIED].
- **Watch Paths** (monorepo filter, gitignore-style, last match wins) are "available when you select a repository through a GitHub App or GitLab source integration. It is **not available** for applications created from a public repository URL or a deploy key" (D:2749, D:3477) [VERIFIED].
- **Preview deployments.**
  - Per PR, with template `{{pr_id}}.{{domain}}`.
  - Deleted when the PR closes.
  - Separate env vars.
  - "Do not expose production credentials to preview deployments."
  - Public-fork PRs are blocked by default.
  - No rolling update for previews (D:3867–4103, D:4198ff) [VERIFIED].
- **Rolling updates** apply to Nixpacks, Railpack, Static, Dockerfile and Image apps: start new → wait for health → stop old.
  - "**Rolling updates are not supported for Docker Compose applications**" (D:4151).
  - Blocked by a host port mapping, a fixed or custom container name, or a custom IP.
  - Crucially: "Schedulers, queue consumers, and other background work must tolerate two versions running briefly" (D:4181) [VERIFIED].
- Rollbacks to previous images exist (`/docs/applications/deployments/rollbacks`; CLI `app rollback-images`, `rollback-run`) [VERIFIED CLI reference headings].
- **Scaling:**
  - "Coolify can deploy the same application image to multiple connected servers". An external load balancer, which "Coolify does not create or manage", then spreads the traffic.
  - Docker Swarm is deprecated: "Coolify v5 will replace Docker Swarm support with native Docker Compose replicas". So in v4 an Application is effectively one container per server (/docs/core/infrastructure/scaling/overview, D:19989ff, D:19850) [VERIFIED].
- Deployments queue per server. Abu's server: `concurrent_builds=1`, `deployment_queue_limit=25` (`abu-server-inspection.md`) [VERIFIED].

## 11. Logs, metrics and backups
- Logs per container are in the UI and CLI (`coolify app logs`). **Log drains**: Axiom, New Relic, or custom Fluent Bit (/docs/core/observability/log-drains/*). **Sentinel** provides metrics (/docs/core/observability/monitoring/sentinel) [VERIFIED headings; Abu has Sentinel on and drains off].
- **Database backups** (/docs/databases/backups): "scheduled, engine-aware database backups for PostgreSQL, MySQL, MariaDB, MongoDB, and ClickHouse… can upload a copy to an S3-compatible storage provider" (D:32634). "Redis, Dragonfly, and KeyDB do not support this scheduled database backup workflow" (D:32636). "A successful backup only proves that Coolify created a file", so test restores [VERIFIED].
- The instance itself can be backed up and restored (/docs/core/backup-and-recovery/instance-backup) [VERIFIED heading].

## 12. API, CLI, MCP (/docs/api/overview, /docs/cli/*, /docs/mcp/*)
- **REST API** at `https://<instance>/api/v1`, Bearer token; `/api/health` needs no auth (D:362). Token abilities: `read`, `read:sensitive`, `write`, `deploy` (deploy-only tokens exist). The API must be enabled, with an optional IP allowlist, on self-hosted instances (D:341–442) [VERIFIED].
- **CLI** `coolify` v1.8.0 has multi-instance **contexts**, `--format json`, and commands for `app` (env sync, deployments, logs, tasks, storage, rollback), `database` (incl. `backup`), `service`, `server` (proxy, domains, sentinel, log-drains, hetzner/DO/Vultr provisioning), `github`, `s3`, `shared-env`, `tag`, `deploy` (uuid/name/batch/tag), and `mcp` (local `coolify --help`) [VERIFIED].
- **MCP server**: Coolify documents an MCP integration with Claude Code (/docs/mcp/clients/claude-code) [VERIFIED heading].

## Gaps
- No docs statement on catch-up of missed scheduled tasks, beyond "skipped" [UNKNOWN].
- Caddy-proxy specifics were not read in depth (Abu uses Traefik).
