# OpenMeter

Open-source metering and usage billing for AI, API, and DevOps products. It ingests CloudEvents at high volume and aggregates in real time (meters, entitlements, billing). Named in Agoranomoi for independent metering.

Sources: GitHub API + README (openmeterio/openmeter); API reference https://openmeter.io/docs/api/open-source (linked from README).
Verified: 2026-09-29

| | |
|---|---|
| Repo | [openmeterio/openmeter](https://github.com/openmeterio/openmeter) (2.4k★) |
| License | Apache-2.0 |
| Language | Go; Kafka + ClickHouse + Postgres in the stack |
| Maturity | README: **"Releases are beta and can include breaking changes"**. The metering engine has run in production for years. |

## What it is
Ingest **CloudEvents**, attribute them to customers (`subject`), aggregate (SUM, COUNT, UNIQUE_COUNT, MAX, AVG, LATEST) by window or dimension, **entitlements** (feature access and usage-limit balances with grants), a product catalog (plans, add-ons, flat, tiered, package, dynamic prices), subscriptions, and billing (credits, invoices). It is explicitly *not* an operator UI, payment processor, tax engine, or accounting system.

## API surface an agent would call
- `POST /api/v1/events` (`Content-Type: application/cloudevents+json`, or `application/cloudevents-batch+json`) with `{specversion:"1.0", type, id, source, subject, time, data:{...}}`. **Deduplication uses CloudEvents `id` + `source`.**
- `GET /api/v1/meters`, `GET /api/v1/meters/{meterIdOrSlug}/query?from=&to=&windowSize=&subject=&groupBy=`.
- Entitlements: `/api/v1/subjects/{subject}/entitlements`, `.../value` (has access, balance, usage), grants.
- Billing and catalog endpoints (plans, subscriptions, invoices) in the OSS API, plus webhooks. SDKs for JS, Python, and Go.
- Auth: the self-hosted OSS quickstart has no auth by default. Put it behind your gateway.

## Self-host quickly
```bash
git clone https://github.com/openmeterio/openmeter.git && cd openmeter/quickstart
docker compose up -d --wait            # API on :48888, includes an api_requests_total meter
curl -X POST localhost:48888/api/v1/events -H 'Content-Type: application/cloudevents+json' \
  -d '{"specversion":"1.0","type":"request","id":"r-1","source":"agent","subject":"vendor-x","data":{"route":"/hello"}}'
```

## Ties
- **Prior art 06 · Agoranomoi**, RFB 4 (agent-operated purchasing: "know what it actually consumed before it settles the bill").

## Integration sketch (Arc/Circle)
- **Metering the agent's own spend:** every paid API call, x402 payment, or Gateway nanopayment emits an event (`subject = vendor`, `data = {units, usdc_micro}`, `id = request id`). The meter query per vendor per period is your standard measure.
- **Entitlements as a budget guard:** give the agent a monthly grant per vendor (the budget). Before buying, it checks `entitlements/.../value`. Over the limit, it escalates. The hard cap still lives in the wallet spending policy or contract.
- **Reconciliation:** the vendor bill vs the OpenMeter query result drives pay, partial pay, or dispute, all logged with txHash.

## Gotchas
- Beta releases, so pin versions. The quickstart pulls Kafka and ClickHouse (memory-hungry, about 4 GB+).
- Dedupe relies on stable `id` + `source`. Generate ids from your request id, not random per retry.
- No UI bundled for operators.
