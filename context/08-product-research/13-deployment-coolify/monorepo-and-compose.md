# Deploying a monorepo (apps + workers) to Coolify, and where LiveKit fits

Purpose: how one repo holding an API, an automation executor, a voice worker, bots, a web app and a docs site maps onto Coolify, plus whether real-time voice (LiveKit) works behind Coolify.

Sources:
- Coolify docs dump `.firecrawl/product/13/coolify-docs-text.txt` (`D:<line>`): /docs/applications/builds/docker-compose (D:615–1068), /builds/dockerfile (D:1149–1334), /configuration/general (D:2575–2899), /deployments/automatic-deployments (D:3352–3500), /deployments/rolling-updates (D:4143–4244), /core/networking-in-coolify (D:26148ff), /core/infrastructure/servers/firewall (D:20503ff)
- Abu's live Coolify apps (read-only CLI; `.firecrawl/product/13/abu-server-inspection-sanitized.json`) and his `shijima` repo, cloned locally at `/Users/abu/dev/hackathon/open-serv` (`apps/worker/Dockerfile`, `.dockerignore`, `pnpm-workspace.yaml`)
- LiveKit: `.firecrawl/product/13/livekit-transport-self-hosting*.md`, `livekit-deploy-custom-deployments.md`, `livekit-pricing.txt` (from https://docs.livekit.io/transport/self-hosting/{,deployment,vm,ports-firewall,distributed}.md, https://docs.livekit.io/deploy/custom/deployments.md, https://livekit.io/pricing)
- Traefik: `.firecrawl/product/13/traefik-websocket-excerpt.txt`

Verified: 2026-09-29

## 1. Is there a "Coolify folder structure"?
**Coolify prescribes none** [VERIFIED].
- The skill files have no convention (`coolify-overview.md` Sources).
- The docs only say "Use `/` for the repository root or a path such as `/apps/api` for a monorepo application" (D:1376, D:1820, D:2667).
- Coolify locates a Dockerfile as **Base Directory + Dockerfile Location** (example: `/apps/api` + `/docker/Dockerfile` → `/apps/api/docker/Dockerfile`), and "**Base Directory** also defines the build context available to `COPY` and `ADD`" (D:2685–2693).

The structure Abu remembers is **his own convention**, and it is consistent across his running Coolify apps [VERIFIED via CLI]:

| Project | Base Directory | Dockerfile Location | Build pack |
|---|---|---|---|
| shijima-web | `/` | `/apps/web/Dockerfile` | dockerfile |
| shijima-worker | `/` | `/apps/worker/Dockerfile` | dockerfile |
| shijima-docs | `/docs-site` | `/Dockerfile` | dockerfile |
| agari-web / mitoshi-web-testnet | `/` | `/web/Dockerfile` | dockerfile |
| agari-ops / mitoshi-ops-testnet | `/` | `/services/ops/Dockerfile` | dockerfile |

The shijima repo is a **pnpm workspace** with `apps/{web,worker}`, `packages/{chain,core,db,shared}` and `docs-site/`.
- Each app Dockerfile is built **from the repo root** (`docker build -f apps/worker/Dockerfile .`).
- It installs only that app's dependency graph: `pnpm install --frozen-lockfile --filter "@desk/worker..."`.
- A root `.dockerignore` keeps `node_modules`, `.env*` and build outputs out of the context (`/Users/abu/dev/hackathon/open-serv/apps/worker/Dockerfile:1-16`, `.dockerignore`) [VERIFIED].

This is a sound fit for Coolify. Base Directory `/` gives the build access to `packages/*`, and per-app Dockerfiles give per-app images [INFERENCE].

## 2. Two ways to deploy a monorepo

| | **A. One Coolify Application per service (Dockerfile pack)** | **B. One Docker Compose Application** |
|---|---|---|
| Config | Per app: Base Directory `/`, Dockerfile Location `/apps/<svc>/Dockerfile`, Ports Exposes, domain | One `compose.yaml`; per-service domains in the UI ("Domains for `<service-name>`", D:24368) |
| Rolling updates | **Yes** (start new → health → stop old) (D:4143ff) | **No**: "Rolling updates are not supported for Docker Compose applications" (D:4151) |
| Health checks | UI or Dockerfile `HEALTHCHECK` | Compose `healthcheck` only; the UI page is unused (D:2919) |
| Deploy granularity | Each service deploys and rolls back on its own | The whole stack redeploys (`docker compose up`) (D:4211) |
| Monorepo triggers | **Watch Paths** per app, but only with a GitHub App or GitLab source, **not a deploy key** (D:2749) | One trigger for the whole stack |
| Networking | All apps join the shared `coolify` network and reach DBs by internal host (D:26230) | A private per-stack network; "Connect To Predefined Network" is needed to reach standalone DBs (D:1014) |
| Magic env vars | Not needed (set domains directly) | `SERVICE_URL_*` / `SERVICE_FQDN_*` / `SERVICE_PASSWORD_*` generation (D:862ff) |
| Preview deployments | Per app | Per stack |
| Build concurrency | Builds queue one after another on Abu's server (`concurrent_builds=1`) | One build command for all services |

**Assessment [INFERENCE].**
- **A is the better fit for us, and it is what Abu already runs.** The API and the voice worker need zero-downtime or drain-aware deploys, and the executor needs controlled replacement. Compose gives up Coolify's rolling path.
- B is reasonable for **third-party stacks** that ship as Compose (e.g. a self-hosted Inngest, or a LiveKit server if self-hosted). Coolify's one-click Services are Compose-based anyway.

**Auto-deploy for approach A with Abu's current setup [VERIFIED facts / INFERENCE on choice]:**
- His apps use **deploy keys** (`git@github.com:` SSH URLs) and only the default "Public GitHub" source exists, so no GitHub App. **Watch Paths are therefore unavailable** today.
- Options:
  1. Install a Coolify **GitHub App** (unlocks Watch Paths and automatic PR previews; /docs/applications/sources/github/app).
  2. Or keep deploy keys and trigger from **GitHub Actions** with a path filter calling `POST /api/v1/deploy` (or `coolify deploy batch`) with a `deploy`-scoped token (D:3440ff; /docs/applications/sources/github/actions).

Option 2 also lets CI build once and gate deploys, and it avoids 8 sequential builds on a 1-concurrent-build server.

## 3. WebSockets, SSE and WebRTC behind Coolify's proxy
- **WebSockets / SSE**: Traefik "supports WebSocket (WS) and WebSocket Secure (WSS) connections out of the box" [VERIFIED]. `wss://api.<domain>` for chat streaming works through the normal domain route [INFERENCE].
- Caveat for multiple processes: Coolify's Node multi-core page says "WebSocket connections are split across workers. Use sticky sessions… or move pub/sub to Redis" (D:38587) [VERIFIED].
- During rolling updates, old and new containers overlap (D:4181), so clients must reconnect cleanly [INFERENCE].
- **WebRTC media is not HTTP.** LiveKit uses "ICE/UDP 50000-60000", "ICE/TCP 7881", optional "ICE/UDP Mux 7882" and "TURN/UDP 3478"; only the "API, WebSocket 7880" port sits behind a TLS-terminating proxy (ports-firewall.md) [VERIFIED]. On Coolify, the non-HTTP ports mean **host port mappings**: "Use a published port only when an external client requires direct TCP or UDP access" (D:41693). "Host port mappings also prevent Coolify from using its normal rolling replacement path" (D:5084) [VERIFIED].
- **Firewall**: Coolify warns "Blocking a port with UFW does not guarantee that a Docker-published port is blocked" (D:20604). Use a provider firewall or ufw-docker [VERIFIED].

## 4. Self-hosting LiveKit server on Coolify: realistic?
What LiveKit asks for [VERIFIED, deployment.md / vm.md / ports-firewall.md]:
- A domain with a CA-signed cert (`wss://livekit.yourhost.com`) plus, if TURN is used, "a separate TURN domain and SSL cert".
- TURN/TLS "needs to be set to 443" when no L4 load balancer is used. LiveKit terminates TLS itself, so it must own the cert files.
- `use_external_ip: true`. "redis is recommended for production deploys."
- "If running in a Dockerized environment, **host networking should be used** for optimal performance."
- "We recommend running production setups on 10Gbps ethernet or faster."
- The VM guide's own stack is Docker Compose **plus its own Caddy on 443/80**.

Conflicts with Abu's server [VERIFIED facts; INFERENCE on consequences]:
1. **Port 443 is taken, on both TCP and UDP.** Abu's Traefik publishes `443:443` and `443:443/udp` (HTTP/3) (`abu-server-inspection.md`). LiveKit's TURN/TLS-on-443 and TURN/UDP-on-443 cannot share it without an L4 SNI pass-through setup in Traefik (TCP routers with TLS passthrough). That is possible in Traefik, but the Coolify docs do not cover it [UNKNOWN; not tested]. Without TURN on 443, users behind strict corporate or mobile firewalls may fail to connect.
2. **Host networking vs Coolify.** Host networking bypasses Coolify's network model. A 10,000-port UDP range as Docker port mappings is heavy: Docker creates a mapping per port unless `userland-proxy` is tuned. The alternative is `rtc.udp_port: 7882` (single-port UDP mux, documented) plus 7881/tcp, which keeps the mapping small [INFERENCE].
3. **The shared box.** Abu's server already runs 14 apps and 7 DBs. LiveKit media is CPU- and bandwidth-bound, and LiveKit recommends dedicated compute-optimized instances [VERIFIED docs / INFERENCE on contention].
4. **No Coolify template** for LiveKit exists (`coolify-templates-list.txt`) [VERIFIED].

What LiveKit Cloud offers instead [VERIFIED, livekit-pricing.txt and self-hosting.md]:
- **Build plan $0/mo**: 5,000 WebRTC participant minutes, 100 concurrent connections, 50 GB downstream.
- 1,000 agent-session minutes and 5 concurrent sessions, but *only for agents hosted on LiveKit Cloud*; our worker would be self-hosted, so this doesn't apply to us [INFERENCE].
- "Global mesh SFU", "nearest edge", 99.99% uptime target, and agent observability.
- Self-hosted is "Single-home SFU" with no managed observability.
- Ship plan: $50/mo, 150,000 WebRTC minutes, 1,000 concurrent.

**The agent worker is Coolify-friendly either way** [VERIFIED, deploy/custom/deployments.md]:
- "Agent servers use a WebSocket connection to register with LiveKit server… do not need to expose any inbound hosts or ports". An optional health server listens on `0.0.0.0:8081`.
- "LiveKit recommends 4 cores and 8GB per agent server… 10-25 concurrent jobs".
- "Voice AI apps might require a 10+ minute grace period". Coolify's Stop Grace Period allows up to 3600 s (D:4191).
- "use a separate LiveKit instance for staging, production, and development".

**Conclusion [INFERENCE, medium-high confidence]:**
- Use **LiveKit Cloud (Build tier to start) for the SFU/TURN**, and run **our Node agent worker on Coolify** as a no-domain Application with a 600–900 s stop grace period and `/` health on 8081.
- Self-hosting LiveKit on Abu's current box is *possible* with a single UDP mux port and no TURN/443. It trades away connectivity behind firewalls and shares CPU with 20+ containers, which conflicts with D17 (no mediocre decisions).
- If self-hosting becomes a requirement (data residency, cost), put it on a **separate server** added to Coolify (or a plain VM using LiveKit's generator), with its own 443 and host networking.

## Gaps
- Traefik TCP/UDP pass-through for TURN on a Coolify-managed Traefik: not researched or tested [UNKNOWN].
- The UDP reachability of Abu's server (provider firewall rules) cannot be read via the Coolify API [UNKNOWN].
- LiveKit Cloud data-retention settings are still open (`09-voice-decision/README.md:51`) [UNKNOWN].
