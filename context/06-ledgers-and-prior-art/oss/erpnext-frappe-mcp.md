# ERPNext + frappe/mcp

ERPNext is the voucher-based document ledger (GL entries only as side effects of submitted documents). frappe/mcp turns Frappe app functions into MCP tools that run *inside* the framework's own validation.

Sources: GitHub API + READMEs for frappe/erpnext, frappe/frappe, frappe/mcp; essay sections "The Document Is the Entry", "Repair", "Where the Model Sits".
Verified: 2026-09-29

| | |
|---|---|
| Repos | [frappe/erpnext](https://github.com/frappe/erpnext) (39.6k★, GPL-3.0), [frappe/frappe](https://github.com/frappe/frappe) (10.9k★, MIT), [frappe/mcp](https://github.com/frappe/mcp) (168★, MIT, *"highly experimental"*) |
| Language | Python + JS (Frappe framework, MariaDB or Postgres) |

## What it is
- **ERPNext:** a full ERP (accounting, buying, selling, stock, manufacturing, projects). `GL Entry` is `in_create: 1`: nobody creates one directly. Entries come from submitting a Sales Invoice, Purchase Invoice, Payment Entry, or Journal Entry. Cancel writes mirror entries (`is_cancelled`), and amend creates a new doc with `amended_from` (the original must have docstatus 2).
- **Three-way match exists but is off:** Buying Settings `po_required` and `pr_required` both **default No**. Purchase Invoice Item carries `purchase_order`, `po_detail`, `purchase_receipt`, `pr_detail`, `received_qty`, `rejected_qty`.
- **Silent repair (the essay's main warning):** `process_debit_credit_difference` books imbalances up to **0.5 currency units** (5 units at the last decimal place for JE/PE) to the **Round Off** account, a normal expense account. The Postgres adapter casts DECIMAL to float (`DEC2FLOAT`). *"The first system that posts machine-generated settlement into ERPNext at six decimals files that bug."*
- **frappe/mcp:** `pip install frappe-mcp`. Declare `mcp = frappe_mcp.MCP("name")`, decorate functions with `@mcp.tool()`, and register an endpoint with `@mcp.register()`. It serves **Streamable HTTP MCP** at `/api/method/<app>.mcp.handle_mcp`. It supports tools only (no resources or prompts yet). Tools run in-process with the same permissions, validation, and docstatus lifecycle as a human. *"The agent path adds nothing of its own."* The essay counts that as the point.

## API surface an agent would call
- **REST (Frappe):** `GET/POST /api/resource/<DocType>`, `GET/PUT/DELETE /api/resource/<DocType>/<name>`, `POST /api/method/<dotted.path>` (whitelisted methods, e.g. `frappe.client.submit`, `frappe.client.cancel`). Submit by setting `"docstatus": 1`.
- **Auth:** `Authorization: token <api_key>:<api_secret>` (per-user API keys), or OAuth2 (frappe/mcp uses Frappe OAuth2 with dynamic client registration on newer versions).
- **Key DocTypes:** `Purchase Invoice`, `Purchase Order`, `Purchase Receipt`, `Payment Entry` (`reference_no`, `reference_date`, `references[]` to allocate against invoices), `Journal Entry`, `Supplier`, `Bank Account`, `Bank Transaction` (for reconciliation), `Buying Settings`.
- **frappe/mcp tools you'd write:** `list_unpaid_purchase_invoices()`, `propose_payment(invoice)`, `record_arc_payment(invoice, tx_hash, amount_units)`, each running `frappe.get_doc(...).insert()/submit()` under the caller's permissions.

## Self-host quickly
```bash
git clone https://github.com/frappe/frappe_docker && cd frappe_docker
docker compose -f pwd.yml up -d          # ERPNext on :8080, Administrator / admin (disposable demo)
# frappe/mcp requires a custom app -> use bench (dev) or a custom image; `bench get-app` + `pip install frappe-mcp`
```
Hosted trial is at Frappe Cloud. The live demo link is in the README.

## Ties
- RFB 2 (AP/AR with a real three-way match), RFB 3 (supplier master), RFB 4 (books for the operator). Prior art 03 Symbolon, 05 Misthos (with Frappe HR).
- Essay: "Turn on the controls that already exist" (`po_required`/`pr_required`), "Make repair loud, or make it refuse", "Route agent writes through the code the UI uses".

## Integration sketch (Arc/Circle)
1. Set Buying Settings `po_required=Yes` and `pr_required=Yes`. Create Currency USDC with **fraction units 1,000,000** and *number format* at 6 decimals. Set the company Round Off account to a dedicated **"Suspense – Rounding (ALERT)"** account and monitor it (non-zero balance means an alert).
2. Store each supplier's approved Arc address in `Bank Account` (or a custom field), with Frappe's version history (track changes) enabled. The agent compares it with the last Payment Entry's paid-to address.
3. A frappe/mcp tool `pay_invoice(pi_name)` checks docstatus=1, the PO/PR links, and the address allowlist, then creates a `Payment Entry` in **Draft** with `reference_no = intentId`. An external worker calls Circle (idempotency key = the stored intent key). On webhook `COMPLETE`, it sets `reference_no = txHash` and submits the Payment Entry, then creates a `Bank Transaction` for the reconciliation tool.
4. Frappe HR `Timesheet` or `Salary Slip` can feed contractor pay the same way.

## Gotchas
- frappe/mcp is **experimental** ("bugs, breaking changes ... mostly without notice"), and tools must be imported in the `@mcp.register` function body or they won't load.
- The WSGI (non-async) framework is why frappe/mcp exists instead of the official SDK.
- Float casting on Postgres (`DEC2FLOAT`) plus 2-dp currencies means rounding residue. Prefer MariaDB and 6-dp currency, or refuse posts with a non-zero residual.
- `pwd.yml` is disposable, and you can't install custom apps in it. For frappe/mcp you need bench or a custom image.
- GPL-3.0 (ERPNext). Hosting modified code is fine, but distribution triggers copyleft.
