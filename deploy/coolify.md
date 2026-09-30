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
| Git source | deploy key | deploy key | GitHub App (D27). A deploy key is the proven fallback |
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
| api | `https://kawase-api.84.46.247.92.sslip.io` | `/health` | runs migrations as a pre-deploy command |
| web (Expo web export) | `https://kawase.84.46.247.92.sslip.io` | `/` | |
| executor | none | `/healthz` | DBOS; stop grace 300 s |
| chain-watcher | none | `/healthz` | |
| voice-agent | none | `:8081` | LiveKit worker; stop grace 900 s |
| docs | `https://kawase-docs.84.46.247.92.sslip.io` | `/` | Fumadocs standalone |
| landing | `https://kawase-landing.84.46.247.92.sslip.io` | `/` | Next 16 |

The host names are Claude's proposal (same shape as `our-journal`); Abu can rename them. The mobile app must use the `https://` api URL, because iOS ATS blocks plain HTTP.

## Create an app

```bash
coolify app create github \
  --server-uuid 7otp4kskhbwzkzybsug3uqgx --project-uuid m7tksyqasdrevs7ogfxn5ppd --environment-name production \
  --github-app-uuid <from `coolify github list`> --git-repository Blockchain-Oracle/kawase --git-branch main \
  --name kawase-api --build-pack dockerfile --base-directory / \
  --ports-exposes <listen port> --domains https://kawase-api.84.46.247.92.sslip.io \
  --health-check-enabled --health-check-path /health
```

- CLI 1.8.0 has no flags for `dockerfile_location`, `watch_paths` or `pre_deployment_command`. Set them with `PATCH /api/v1/applications/<uuid>` (all three are in the API's allowed fields), or create the app with `POST /api/v1/applications/private-github-app`, which takes every field in one call.
- Deploy-key variant: `coolify app create deploy-key --private-key-uuid <uuid> --git-repository git@github.com:Blockchain-Oracle/kawase.git …` with the same remaining flags.
- Env vars: `coolify app env sync <uuid> --file <file>` (non-destructive). Secrets are runtime-only, never build variables.

## Deploy

GitHub App auto-deploy (D27) with per-app watch paths. Manual: `coolify deploy uuid <app-uuid>`; logs: `coolify app deployments logs <deployment-uuid>`. Builds run one at a time on this server.

## Open items

- **No GitHub App source exists yet** (`coolify github list` shows only "Public GitHub"). Creating one is a browser flow in the Coolify dashboard (Sources → + Add → GitHub App → register → install on `Blockchain-Oracle/kawase`). All six of Abu's other projects use a deploy key instead (`coolify private-key add` + `gh repo deploy-key add`), which needs no browser. The cost of a deploy key: no Watch Paths and no push auto-deploy without a manual webhook (`abu-server-inspection.md` line 28).
- **The GitHub repo is empty** (no commits locally or on `Blockchain-Oracle/kawase` as of 2026-09-30). Coolify builds from GitHub, so nothing can deploy before the first push.

## Notes

- **SSE works through Coolify's Traefik with the default gzip middleware on** (spike 07: events arrive one by one, including to `expo/fetch` on iOS over HTTPS). The chat stream needs no proxy changes.
- **Pass the port and the domain at creation.** `PATCH`ing `ports_exposes` alone later does not rewrite the Traefik labels; the API regenerates them only when the domains, noindex domains or basic-auth fields change (source line 3465). If a port ever has to change, re-send `domains` in the same call and check `loadbalancer.server.port` in the labels.
- **A domain left empty is auto-generated as `http://<uuid>.<ip>.sslip.io`** (plain HTTP, because the server has no Wildcard Domain set). So always pass `--domains https://…`.
- The health check runs `curl` or `wget` **inside the container**, so the image must contain one (`node:*-alpine` has busybox `wget`; `node:*-slim` needs `curl` installed).
- Project descriptions with non-ASCII characters are rejected (API 422). Keep them ASCII.
- Only for throwaway "Dockerfile content" apps (`coolify app create dockerfile`, used once for the spike 07 probe; **not** how Kawase deploys): the content must be base64, and the server picks the port itself and overrides `ports_exposes`. It looks for `EXPOSE` in the still-encoded text, never finds it, and falls back to 80 (source line 2100). An earlier version of this file said "the CLI ignored the port"; that named the wrong cause.
