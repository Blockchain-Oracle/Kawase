# Invoice Ninja

A source-available invoicing, quotes, payments, and time-tracking app with 25 gateway drivers. Its books are a running client balance. The essay's example is the **€0.10 subscription marked paid with no payment, from one integer cast.**

Sources: GitHub API + README (invoiceninja/invoiceninja), invoiceninja/dockerfiles README; API docs https://api-docs.invoicing.co/; essay landscape table and "What Reconciliation Proves".
Verified: 2026-09-29

| | |
|---|---|
| Repo | [invoiceninja/invoiceninja](https://github.com/invoiceninja/invoiceninja) (10.1k★) |
| License | **Elastic License 2.0** (source-available, not OSI). White-label license $40/yr |
| Language | PHP (Laravel), React and Flutter clients |

## What it is
Clients, invoices, recurring invoices and subscriptions, quotes, credits, payments, expenses, vendors, projects and tasks, a client portal, and 25 payment gateway drivers. The ledger is a **per-client running balance** (`CompanyLedger`). The `Paymentable` pivot applies one payment across many invoices (`amount`, `refunded` per pair). Nothing checks it against a bank.

## API surface an agent would call
- Base: `https://<host>/api/v1/`. Headers: **`X-API-TOKEN: <token>`** (Settings → Account Management → API tokens), `X-Requested-With: XMLHttpRequest`, `Content-Type: application/json`.
- `GET/POST /api/v1/invoices`, `/clients`, `/vendors`, `/expenses`, `/recurring_invoices`, `/credits`, `/quotes`, `/tasks`.
- `POST /api/v1/payments` with `{client_id, amount, date, transaction_reference, type_id, invoices:[{invoice_id, amount}]}`. `transaction_reference` is where a txHash goes.
- Bulk actions: `POST /api/v1/invoices/bulk {action: "mark_paid"|"email"|..., ids:[...]}`. Webhooks: `POST /api/v1/webhooks` (event ids such as invoice created, payment created).
- There is no MCP in the codebase (essay). A Go SDK exists (community).

## Self-host quickly
```bash
git clone https://github.com/invoiceninja/dockerfiles.git -b debian && cd dockerfiles/debian
docker run --rm -it invoiceninja/invoiceninja-debian php artisan key:generate --show   # put into .env APP_KEY
docker compose up -d
```
Losing `APP_KEY` makes encrypted data unrecoverable.

## Ties
- RFB 2 (AR and collections), RFB 3 (vendors and expenses). Essay: the canonical **fictitious-entry** case that bank reconciliation would catch at month end.

## Integration sketch (Arc/Circle)
- Never use `mark_paid` from an agent. Create payments only via `POST /payments` **after** an inbound USDC transfer is witnessed (Circle webhook or Arc log), with `transaction_reference = txHash` and an idempotency check on txHash before posting.
- Build a small "Arc gateway" by handling the portal payment as an x402 or Circle payment link, with a webhook that creates the payment.
- A nightly reconciler compares invoices with status paid against transfers. Payments without a txHash become alerts.

## Gotchas
- **Elastic License 2.0**: you may not offer it as a hosted, managed service to third parties. Check this before building a SaaS on it.
- Running balance plus integer-cast history: validate amounts in minor units yourself. USDC 6-dp vs 2-dp currency precision is a risk.
- `mark_paid` bulk action and auto-bill features can mark paid without funds. Disable them for agent credentials if possible (use a scoped user).
