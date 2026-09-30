# yente (OpenSanctions API)

A self-hostable sanctions, PEP, and KYB **entity search and match API** over OpenSanctions (FollowTheMoney) data. It is the core of the Megarian Decree hack: "Self-host yente, re-screen every existing counterparty on a schedule."

Sources: GitHub API + README (opensanctions/yente); `docker-compose.yml`, `docs/settings.md`, `yente/routers/{match,search,admin}.py` (main); https://www.opensanctions.org/docs/yente/.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [opensanctions/yente](https://github.com/opensanctions/yente) (178★), image `ghcr.io/opensanctions/yente:5.5.0` |
| License | Code MIT. **Data: OpenSanctions data license. Commercial use requires a data license.** |
| Language | Python (FastAPI, async), Elasticsearch or OpenSearch index |

## What it is
It indexes OpenSanctions datasets (sanctions lists, PEPs, crime, KYB registries, or your own custom watchlists) and exposes search, fetch, and **scored matching** of FtM entities (Person, Company, Organization, Vessel, **CryptoWallet**, ...). It supports the OpenRefine **Reconciliation API**. It refreshes data automatically (delta updates by default).

## API surface an agent would call
- **`POST /match/{dataset}`** (e.g. `default`, `sanctions`) with body `{"queries":{"v1":{"schema":"Company","properties":{"name":["Acme Ltd"],"jurisdiction":["cy"],"registrationNumber":["..."]}}}}`. It returns scored candidates per query. Batch size is `YENTE_MAX_BATCH` (default 100). Tune with `threshold`, `limit`, and `algorithm` query params.
- `GET /search/{dataset}?q=...&schema=...`: free text (e.g. search a wallet address string).
- `GET /entities/{entity_id}` (with nested related entities) and **`GET /entities/{entity_id}/adjacent`** (neighbouring entities, a one-hop exposure primitive).
- `GET /catalog` (datasets and versions), `/healthz`, `/readyz`, `POST /updatez?token=<YENTE_UPDATE_TOKEN>` (force reindex), reconciliation endpoints `/reconcile/{dataset}`. OpenAPI at `/openapi.json`.
- Hosted alternative: api.opensanctions.org (API key, paid for commercial use).

## Self-host quickly
```bash
curl -O https://raw.githubusercontent.com/opensanctions/yente/main/docker-compose.yml
docker compose up -d        # elasticsearch (ES_JAVA_OPTS -Xms4g -Xmx4g) + yente on 127.0.0.1:8000
# first boot downloads + indexes data (takes a while); set YENTE_UPDATE_TOKEN
```

## Ties
- **Prior art 07 · Megarian Decree** (continuous, risk-tiered, one-hop), **RFB 5** (RiskTier, ExposureMap, ComplianceAI example builds), RFB 2 ("screens a vendor's wallet address before paying"), RFB 3 (screening at onboarding).

## Integration sketch (Arc/Circle)
1. **At onboarding:** `/match` on the vendor's legal name, jurisdiction, and registration number, plus `/search` for the wallet address. Add **Circle Compliance Engine** `POST /v1/w3s/compliance/screening/addresses` for onchain risk (eligible customers). Persist the score and matched entity ids.
2. **Nightly re-screen:** batch `/match` over all counterparties. Diff against yesterday, so alerts fire on *changes* only.
3. **Risk tier to limits:** low risk gets the full limit, medium gets a reduced per-tx and daily cap, high requires a human co-sign. Write the tier into the payment policy contract or the Agent Wallet allowlist and blocklist. That puts the limit where the agent can't reach it.
4. **One hop:** for each counterparty's matched entity, `GET /entities/{id}/adjacent` gives directors, owners, and related companies. Screen those too (with nomenklatura for resolution across your own vendor data).
5. Record every screening result (dataset version from `/catalog`) in the audit log. "Compliance reports generated" is a traction metric.

## Gotchas
- **The default manifest needs a token.** `YENTE_MANIFEST` defaults to `manifests/commercial.yml`, which pulls from `delivery.opensanctions.com` with `auth_token: $OPENSANCTIONS_DELIVERY_TOKEN`. For a no-key hackathon setup, set `YENTE_MANIFEST=/app/manifests/civic.yml` (public `data.opensanctions.org`, non-commercial) or mount your own manifest with a dataset subset. Refresh is scheduled by `YENTE_CRONTAB` with `YENTE_AUTO_REINDEX=true`.
- **Data licensing:** OpenSanctions data is free for non-commercial use, and business use needs a license. Mention this in the submission if you pitch to real businesses.
- Elasticsearch needs about 4 GB heap as configured, and initial indexing takes time. Use a smaller dataset scope (a custom manifest listing only `sanctions` datasets) for demos.
- Match scores are probabilistic. Treat them as a risk input with thresholds and human review, not an auto-block (the Megarian hack itself says "not a simple yes or no").
- Wallet-address coverage is limited to addresses published by sanctioning authorities. Pair it with chain analytics (Circle Compliance Engine) for onchain exposure.
