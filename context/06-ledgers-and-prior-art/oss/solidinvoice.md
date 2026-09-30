# SolidInvoice

A Symfony invoicing app with a workflow state machine and a **built-in OAuth MCP server**. The essay calls it the most complete agent write path, and also one that "can record a payment that never happened and has no way to find out."

Sources: GitHub API + README; `docs/docs/ai/mcp-server.mdx` in SolidInvoice/SolidInvoice; repo tree (`src/*/Mcp/*`); essay "Where the Model Sits".
Verified: 2026-09-29

| | |
|---|---|
| Repo | [SolidInvoice/SolidInvoice](https://github.com/SolidInvoice/SolidInvoice) (973★) |
| License | MIT |
| Language | PHP 8.4, Symfony 7, API Platform 4, Doctrine |
| Hosted | solidinvoice.co / solidinvoice.app ($8/mo) |

## What it is
Quotes, invoices, recurring invoices, clients and contacts, multi-currency with `Money` objects (no float rounding), taxes, payment reminders, and Payum gateways (Stripe, PayPal). Multi-tenant (companies). The invoice state machine runs draft → pending → paid (plus overdue, cancelled, archived). There is **no accounting behind it and no bank feed**: the invoice table is the books.

## API surface an agent would call
- **MCP (built-in, SolidInvoice 3.0+):** Streamable HTTP at `https://<host>/_mcp`. **OAuth 2.1 + PKCE + Dynamic Client Registration** (discovery at `/.well-known/oauth-authorization-server`). Scopes are `mcp:read` and `mcp:write` (write is opt-in). Tokens are bound to one company. The access token lasts 24 h and the refresh token 90 d (rotated). *No static API-key fallback.* Revoke under `/profile/connected-apps`.
  - Read: `list_resource`, `get_resource`, `list_invoices_by_status`, `list_overdue_invoices`, `list_quotes_by_status`, `list_recurring_invoices`, `list_payment_methods`, `list_tax_rates`, `list_workflow_transitions`, `get_company_info`, `get_client_summary`, `get_dashboard_stats`, `get_invoice_status_distribution`, `get_revenue_by_period`, `get_total_outstanding`, `get_total_overdue`.
  - Write: `create_resource`/`update_resource`/`delete_resource` (client, contact, tax), `create_invoice`, `create_quote`, `create_recurring_invoice`, `clone_invoice`, `clone_quote`, `convert_quote_to_invoice`, `apply_invoice_transition` (`accept|cancel|overdue|pay|reopen|archive`, which checks `can()` before `apply()`), `apply_quote_transition`, `apply_recurring_transition`, **`record_payment`** (positive amount, invoice currency, no overpayment, workflow allows `pay`, offline method configured), `add_contact`, `send_invoice_reminder`.
- **REST:** API Platform (JSON-LD/HAL/JSON), header `X-API-TOKEN`.
- Claude Code: `claude mcp add --transport http solidinvoice https://<host>/_mcp`.

## Self-host quickly
```bash
docker run -p 8080:80 solidinvoice/solidinvoice
# first run: complete installer; MCP needs OAuth keys: bin/console mcp:keys:generate ; migrations: bin/console doctrine:migrations:migrate
# OAuth redirect flow needs HTTPS reachability for hosted agents -> use cloudflared/ngrok tunnel
```

## Ties
- RFB 2 (AR: invoices, reminders, collections), RFB 4 (revenue in). Essay: the **phantom payment** case. The fix the essay suggests is to **add a feed** ("SolidInvoice and its peers can add a feed far more easily than a chart of accounts").

## Integration sketch (Arc/Circle): add the missing witness
1. Put the customer's pay-to address (a Circle wallet per client, or one address plus a reference) in the invoice notes or a custom field. Optionally accept via x402 or a payment link.
2. A **watcher** (Circle webhook for inbound transfers to your wallets, or an Arc log subscription) matches the inbound USDC transfer to an invoice by address, amount, and reference.
3. Only then does the agent call `record_payment` with a reference = txHash (and via a Payum custom "Arc USDC" method, if you build one). The model never calls `record_payment` from an email claim.
4. The daily reconciliation compares sum(paid invoices) with sum(inbound transfers). Any paid invoice without a txHash gets flagged as a phantom.

## Gotchas
- `record_payment` needs a configured **offline payment method**, and it can't verify funds arrived. That verification is your job.
- OAuth-only MCP: headless agents need a one-time browser consent, and tokens bind to a single company (register twice for two companies).
- A self-hosted MCP needs HTTPS reachable from the agent (private LAN addresses fail).
- For a multi-node deploy, set `SOLIDINVOICE_MCP_SESSION_STORE=cache`.
- No chart of accounts. Pair it with beancount or ERPNext if you need books.
