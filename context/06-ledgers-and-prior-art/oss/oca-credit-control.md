# OCA/credit-control

Odoo addons for customer credit control: dunning policies and levels, financial risk limits, and overdue reminders. Named in Horoi: it "already models the dunning ladder; it has never been able to see past its own instance."

Sources: GitHub API + README (OCA/credit-control addon table, 18.0); Tameion prior art 04.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [OCA/credit-control](https://github.com/OCA/credit-control) (110★) |
| License | AGPL-3.0 |
| Language | Python (Odoo 18.0 addons) |

## What it is

| Addon | Purpose |
|---|---|
| `account_credit_control` | Credit control **policies** with ordered **levels** (the dunning ladder: delay days, channel email or letter, template). Periodic **runs** generate credit control lines per overdue move line |
| `account_credit_control_queue_job` | Runs as background jobs |
| `account_credit_control_attach_invoice` | Attach invoices to reminders |
| `account_financial_risk` | Per-partner **credit limit and risk** buckets (draft, open, unpaid invoices, etc.) |
| `sale_financial_risk`, `stock_financial_risk`, `website_sale_financial_risk`, `sale_payment_sheet_financial_risk` | **Block** sales, deliveries, or web orders over the risk limit |
| `account_invoice_overdue_reminder`, `account_invoice_overdue_warn(_sale)` | Simpler reminders and warnings |
| `account_payment_return_financial_risk`, `partner_risk_insurance` | Returned payments as risk; credit insurance info |

## API surface an agent would call
Via Odoo RPC or mcp-odoo: `credit.control.policy`, `credit.control.policy.level`, `credit.control.run` (create, then `generate_credit_lines`), `credit.control.line` (state, level, amount due), `credit.control.communication`. Partner fields from financial risk: `credit_limit`, `risk_total`, `risk_exception`, and the per-bucket `risk_*` amounts.

## Self-host quickly
Clone the `18.0` branch into an Odoo addons path (see `oca-account-invoicing.md` for the docker line), update the apps list, and install `account_credit_control` and `account_financial_risk`.

## Ties
- **Prior art 04 · Horoi** (the public lien and receivables registry), RFB 2 (collections prioritized by customer behavior), RFB 3 (credit limits by payment history), RFB 5 (payment terms priced to risk).

## Integration sketch (Arc/Circle)
1. **Publish:** when an invoice posts, the agent registers a claim on an Arc registry contract: `{debtorCommitment, creditor, amount, due, invoiceHash}`. When the matching USDC payment is witnessed, it marks the claim settled.
2. **Read across instances:** a nightly job reads the registry for each customer's *total* outstanding across creditors and writes it into `account_financial_risk` (a custom risk bucket "external exposure"), so `sale_financial_risk` blocks orders when global exposure exceeds the limit.
3. **Collections:** the agent picks the dunning level and channel per customer from payment history (onchain settlement latency), and can offer early-pay discounts payable in USDC.

## Gotchas
- Instance-local by design, and the cross-instance view is the hack. Privacy matters: publish commitments or hashes, not customer names.
- Risk buckets rely on correct invoice and payment states. Phantom payments (see SolidInvoice or Invoice Ninja) would understate risk, so witness first.
- AGPL-3.0, Odoo 18 series.
