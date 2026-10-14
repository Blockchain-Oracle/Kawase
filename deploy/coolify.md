# Coolify runbook — Kawase

Purpose: where Kawase runs on Abu's Coolify, and how to deploy. **No secrets in this file**; env values live only in Coolify.
Sources:
- `context/08-product-research/13-deployment-coolify/recommendation.md`
- The Coolify skill: `/Users/abu/.claude/skills/coolify/SKILL.md` + `references/api-reference.md` (**read it before any Coolify work**)
- The CLI 1.8.0 (context `agari-new`) and its `--help` output
- Abu's existing apps on this server, read with `coolify app get <uuid> --format json` (2026-09-30)
- Coolify v4.3.23 source, `app/Http/Controllers/Api/ApplicationsController.php` (line numbers below refer to that tag)

Last updated: 2026-09-30

## Resources

| Resource | UUID | Notes |
|---|---|---|
| Server | `7otp4kskhbwzkzybsug3uqgx` (localhost) | Coolify v4.3.23, Traefik; one build at a time |
| Project `kawase` | `m7tksyqasdrevs7ogfxn5ppd` | environment `production` (`pabr1mkekbbinebt4s52yqli`) |
| Postgres 17 `kawase-postgres` | `diktlvlq6c0mdltviajx05hq` | `postgres:17-alpine`, running:healthy. Holds the app DB and the DBOS system DB |

## The pattern every app on this server already uses

Read from the live server. Kawase follows the same pattern; nothing here is special to us.

| Field | agari-web | our-journal | Kawase |
|---|---|---|---|
| Git source | deploy key | deploy key | deploy key (`kawase-deploy-key`); GitHub App optional later |
| Build pack | `dockerfile` | `dockerfile` | `dockerfile` |
| Base directory | `/` | `/` | `/` (pnpm workspace, root build context) |
| Dockerfile location | `/web/Dockerfile` | default | `/apps/<svc>/Dockerfile` |
| Ports Exposes | `3000` | `3000` | the port the service listens on |
| Domain | `https://useagari.xyz` | `https://our-journal.84.46.247.92.sslip.io` | `https://<name>.84.46.247.92.sslip.io` |

- **Ports Exposes is an ordinary, required Coolify field.** It is the container port Traefik forwards to (it becomes the `loadbalancer.server.port` label). `coolify app create github` and `deploy-key` both mark `--ports-exposes` as required. Give it once, at creation.
- **HTTPS comes from Coolify.** Enter the domain with `https://` and Coolify writes the Traefik router with `tls.certresolver=letsencrypt` plus the HTTP→HTTPS redirect. This works for sslip.io hosts and the name can be anything: `our-journal`, `ruckus-play` and the `baku-*` apps all run on `https://….84.46.247.92.sslip.io` today. No DNS or custom domain is needed (D27).

## Planned applications (one Coolify Application per service)

| App | Domain | Health | Notes |
|---|---|---|---|
| api | `https://kawase-api.84.46.247.92.sslip.io` | `/health` | **live since 2026-09-30**, app UUID `sx1jzpkgchqbhltagb0qquig`; Dockerfile `/apps/api/Dockerfile`; migrations run in the container's start command; database `kawase` inside `kawase-postgres` (internal host `diktlvlq6c0mdltviajx05hq:5432`) |
| web (Expo web export) | `https://kawase.84.46.247.92.sslip.io` | `/` | |
| executor | none | `/healthz` | DBOS; stop grace 300 s |
| chain-watcher | none | `/healthz` | |
| voice-agent | none | `:8081` | LiveKit worker; stop grace 900 s |
| docs | `https://kawase-docs.84.46.247.92.sslip.io` | `/` | Fumadocs standalone |
| landing | `https://kawase-landing.84.46.247.92.sslip.io` | `/` | Next 16 |

The host names are Claude's proposal (same shape as `our-journal`); Abu can rename them. The mobile app must use the `https://` api URL, because iOS ATS blocks plain HTTP.

## Create an app

```bash
coolify app create deploy-key \
  --server-uuid 7otp4kskhbwzkzybsug3uqgx --project-uuid m7tksyqasdrevs7ogfxn5ppd --environment-name production \
  --private-key-uuid qfzygvoehtclwstqsjcviqwm --git-repository git@github.com:Blockchain-Oracle/kawase.git --git-branch main \
  --name kawase-api --build-pack dockerfile --base-directory / \
  --ports-exposes <listen port> --domains https://kawase-api.84.46.247.92.sslip.io \
  --health-check-enabled --health-check-path /health
```

- CLI 1.8.0 has no flags for `dockerfile_location`, `watch_paths` or `pre_deployment_command`. Set them with `PATCH /api/v1/applications/<uuid>` (all three are in the API's allowed fields), or create the app with `POST /api/v1/applications/private-deploy-key`, which takes every field in one call.
- GitHub App variant (if one is added later): `coolify app create github --github-app-uuid <uuid> --git-repository Blockchain-Oracle/kawase …` with the same remaining flags.
- Env vars: `coolify app env sync <uuid> --file <file>` (non-destructive). Secrets are runtime-only, never build variables.

## Deploy

`coolify deploy uuid <app-uuid>` after pushing to `main`; logs: `coolify app deployments logs <deployment-uuid>`. Builds run one at a time on this server.

## Switching on the device proof (M12, `DEVICE_PROOF_REQUIRED`)

With it on, approving a send (inside the allowance it goes at once), approving a waiting run, deleting the account, and a chat message's auto-send all need a Turnkey stamp from the phone's own session key; a stolen bearer token alone does nothing there. It is off on the api until the phones send the proof.

- **Which app carries it:** every build from `main` after the B2-7 merge (the app proves approvals, waiting runs, account deletion and chat messages on iOS, Android and web). Builds made before that merge send none on chat messages, and builds from before the M12 merge (`8f3534f`) send none at all. The JS can also reach older 1.0.0 builds as an EAS Update, but the gate below cannot see an update, only the native version.
- **How an old build is told to update:** `/health` returns `minAppVersion` (`KAWASE_MIN_APP_VERSION`); a native version below it shows "Update required" with the store link (`apps/mobile/src/account/update-gate.tsx`). Every build so far is version 1.0.0, so give the build that carries the proof a new version (`"version": "1.1.0"` in `apps/mobile/app.json`; `runtimeVersion` follows it, so OTA updates then target 1.1.0) and submit it.
- **Order:** (1) the 1.1.0 build is live on TestFlight and the Play internal track; (2) set `KAWASE_MIN_APP_VERSION=1.1.0` on the api and redeploy (older phones see "Update required"); (3) set `DEVICE_PROOF_REQUIRED=true` and redeploy. The web app always runs the latest bundle, so it needs nothing.
- **What people see when a proof is missing or stale** (their Turnkey session ended): "Sign in again on this phone to approve this. Nothing was sent." (`errors.deviceProofNeeded`, 10 languages). A renewed Turnkey session key is accepted when Turnkey lists it for the person. Log line `security.device_proof_invalid` counts proofs that did not hold, even while the flag is off: check it is near zero before step 3.

## Git source

- **Deploy key (in place, 2026-09-30):** Coolify private key `kawase-deploy-key`, UUID `qfzygvoehtclwstqsjcviqwm`; its public half is a read-only deploy key on `Blockchain-Oracle/kawase`. Create apps with `coolify app create deploy-key --private-key-uuid qfzygvoehtclwstqsjcviqwm --git-repository git@github.com:Blockchain-Oracle/kawase.git --git-branch main …`. This is the same setup as Abu's six other projects.
- With a deploy key there are no Watch Paths and no push auto-deploy unless a webhook is added by hand (`abu-server-inspection.md` line 28). Deploy with `coolify deploy uuid <app-uuid>` after a push.
- **GitHub App (optional, D27's original choice):** none exists (`coolify github list` shows only "Public GitHub"). It is a browser flow in the Coolify dashboard (Sources → + Add → GitHub App → register → install on the repo). Switch to it if per-app auto-deploy is wanted.

## Reaching the instance
The CLI context `agari-new` talks to `http://localhost:8001`, an SSH tunnel to the server's Coolify (port 8000 is not open to the internet): `ssh -f -N -L 8001:localhost:8000 agari-box`. The api token comes from `~/.config/coolify/config.json`; for endpoints the CLI does not cover (`dockerfile_location`, the database's `internal_db_url`), `curl -H "Authorization: Bearer <token>" http://localhost:8001/api/v1/...`.

## Notes

- **SSE works through Coolify's Traefik with the default gzip middleware on** (spike 07: events arrive one by one, including to `expo/fetch` on iOS over HTTPS). The chat stream needs no proxy changes.
- **Pass the port and the domain at creation.** `PATCH`ing `ports_exposes` alone later does not rewrite the Traefik labels; the API regenerates them only when the domains, noindex domains or basic-auth fields change (source line 3465). If a port ever has to change, re-send `domains` in the same call and check `loadbalancer.server.port` in the labels.
- **"running:unhealthy" in the CLI can lag behind Docker.** The api's container reports `healthy` (Coolify's check falls back to `wget` because `node:alpine` has no `curl`); `coolify app get` showed `running:unhealthy` for a while after the first deploy.
- **A domain left empty is auto-generated as `http://<uuid>.<ip>.sslip.io`** (plain HTTP, because the server has no Wildcard Domain set). So always pass `--domains https://…`.
- **Listen on `::`, not `0.0.0.0`, in `node:*-alpine` images.** The health check calls `http://localhost:<port><path>` inside the container and busybox `wget` resolves `localhost` to `::1`; an IPv4-only server fails every check and the deploy rolls back (spike 13). Setting the health-check host to `127.0.0.1` also works.
- The Let's Encrypt certificate for a new domain takes a few seconds after the first deploy; until then HTTPS requests fail verification. Wait for `https://…/health` before registering webhooks.
- The app `status` field can lag (`running:unhealthy` after a healthy rollout). Check the deployment log (`coolify app deployments logs <app-uuid>`) and the health URL.
- Internal database URL: `postgres://<user>:<url-encoded password>@<database uuid>:5432/<db>` (values from `coolify database get <uuid> -s`; the CLI does not print a ready-made URL). Never the public port.
- The recipe above was used end to end for the spike 13 receiver (app created, deployed, then deleted): labels were correct on the first deploy.
- The health check runs `curl` or `wget` **inside the container**, so the image must contain one (`node:*-alpine` has busybox `wget`; `node:*-slim` needs `curl` installed).
- Project descriptions with non-ASCII characters are rejected (API 422). Keep them ASCII.
- Only for throwaway "Dockerfile content" apps (`coolify app create dockerfile`, used once for the spike 07 probe; **not** how Kawase deploys): the content must be base64, and the server picks the port itself and overrides `ports_exposes`. It looks for `EXPOSE` in the still-encoded text, never finds it, and falls back to 80 (source line 2100). An earlier version of this file said "the CLI ignored the port"; that named the wrong cause.
