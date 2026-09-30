# Lago

Open-source metering and usage-based billing: events, then billable metrics, plans and credits, invoices, and payments. It has an agent toolkit (MCP) and **idempotent event ingestion by `transaction_id`**. Named in Agoranomoi for metering.

Sources: GitHub API + README (getlago/lago), repo metadata for getlago/lago-api and getlago/lago-agent-toolkit; https://getlago.com/llms.txt, https://swagger.getlago.com/openapi.yaml (referenced by README).
Verified: 2026-09-29

| | |
|---|---|
| Repo | [getlago/lago](https://github.com/getlago/lago) (10.6k★; deploy, docs, compose) · API: getlago/lago-api (Ruby on Rails) · MCP: [getlago/lago-agent-toolkit](https://github.com/getlago/lago-agent-toolkit) (Rust, MIT) · CLI: getlago/lago-cli |
| License | AGPL-3.0 (core); agent toolkit, SDKs, and CLI are MIT |
| Language | Ruby (API), Go (event pipeline), React (UI); Postgres, Redis, optional ClickHouse |

## What it is
Usage events → metering (aggregations: count, sum, max, unique count, latest, weighted sum, custom) → pricing (per-unit, graduated, package, percentage, dynamic), wallets and prepaid credits, coupons → entitlements → invoices → payments (Stripe, Adyen, GoCardless integrations) → revenue analytics. Integrations include Salesforce, HubSpot, NetSuite, Xero, and Avalara. Headless and API-first.

## API surface an agent would call
- Auth: `Authorization: Bearer <LAGO_API_KEY>`. Base `http(s)://<host>/api/v1`.
- **`POST /api/v1/events`** with `{event:{transaction_id, external_subscription_id, code, timestamp, properties:{...}}}`. **Idempotent on `transaction_id`**, and `POST /api/v1/events/batch` for bulk.
- `GET /api/v1/customers/{external_id}/current_usage?external_subscription_id=...`, `/customers`, `/subscriptions`, `/plans`, `/billable_metrics`, `/invoices` (`PUT /invoices/{id}` payment_status, `POST /invoices/{id}/finalize`, `/refresh`), `/credit_notes`, `/wallets`, `/wallet_transactions`.
- **Webhooks** (signed; `X-Lago-Signature`, JWT or HMAC): `invoice.created`, `invoice.payment_status_updated`, `event.error`, `customer.payment_provider_created`, and more.
- **MCP:** lago-agent-toolkit exposes read and write tools for invoices, usage, customers, payments, credit notes, and coupons. It inherits the API key's permissions, and the README advises keeping human confirmation around sensitive billing changes.

## Self-host quickly
```bash
git clone --depth 1 https://github.com/getlago/lago.git && cd lago
docker compose up -d        # UI :80/:8080, API :3000 (see README; demo script sets LAGO_DEMO_UI_PORT/API_PORT)
```
The README includes an "agentic AI demo" that seeds token-usage events, reconciles independently, and **retries one transaction to prove usage does not increase** (a ready-made idempotency demo).

## Ties
- **Prior art 06 · Agoranomoi** (independent meter), RFB 4 (operator knows what it consumed), RFB 2 (AR for usage-billed sellers).

## Integration sketch (Arc/Circle)
- **Buyer-side shadow meter:** your agent emits a Lago event per outbound paid call (including x402 purchases) with `transaction_id = request id`. At the vendor's invoice time, `current_usage` is your independent count. Pay the reconciled amount via Circle, and dispute the delta.
- **Seller side:** bill your own customers from Lago. On an `invoice.created` webhook, send a USDC payment request (Circle wallet or x402). On witnessed inbound transfer, `PUT /invoices/{id}` sets `payment_status: succeeded`, with the txHash stored in invoice metadata.
- Prepaid **wallets** map naturally to a USDC top-up on Arc.

## Gotchas
- Self-hosted instances send basic product analytics by default (opt-out documented).
- Several services (API, worker, clock, events processor, front, DB, Redis). Allocate resources.
- Marking an invoice paid via API is a phantom-payment risk. Only do it after a witness.
- AGPL-3.0 core.
