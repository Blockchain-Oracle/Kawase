# OCA/account-invoicing (+ OCA/edi invoice import)

Community Odoo addons that extend the invoicing workflow (duplicate-ref checks, tier validation, check totals, merge, and more). Named in Symbolon as "has the workflow". The related OCA/edi repo imports vendor bills from PDF, UBL, or Factur-X.

Sources: GitHub API + READMEs for OCA/account-invoicing and OCA/edi (addon tables, 18.0 branch); essay "What Reconciliation Proves" (OCA/edi bank-account creation).
Verified: 2026-09-29

| | |
|---|---|
| Repos | [OCA/account-invoicing](https://github.com/OCA/account-invoicing) (309★), [OCA/edi](https://github.com/OCA/edi) (142★) |
| License | AGPL-3.0 (most modules; some LGPL-3) |
| Language | Python (Odoo addons), current series **18.0** |

## What it is
These are Odoo modules you install into an Odoo instance, not standalone apps. Addons most relevant to agent AP:

| Addon | Why it matters for agents |
|---|---|
| `account_invoice_supplier_ref_unique` | **"Checks that supplier invoices are not entered twice"**, a business-key duplicate guard |
| `account_invoice_check_total` | The verification total must equal the bill total (a human-typed control figure vs the extracted lines) |
| `account_move_tier_validation` (+ `_approver`) | Tiered approval before posting, a human threshold |
| `account_invoice_check_picking_date` | Consistency with the receipt (picking) date, a piece of the three-way match |
| `purchase_stock_picking_return_invoicing` | Returns handled in invoicing |
| `account_invoice_refund_link`, `account_invoice_refund_reason` | Typed, linked corrections (loud repair) |
| `account_move_cancel_confirm`, `account_invoice_warn_message` | Friction on destructive actions |
| `account_invoice_merge`, `account_billing` | Grouping bills into a payment batch |

OCA/edi: `account_invoice_import` (+ `_ubl`, `_facturx`, `_simple_pdf`, `_invoice2data*`), `account_invoice_download` (auto-download supplier invoices, e.g. OVH or Scaleway), `base_business_document_import`, `purchase_order_import`.

## API surface an agent would call
Through Odoo itself (see `odoo-mcp.md`): XML-RPC or JSON-2 on `account.move` (vendor bills), `account.move.line`, `tier.review` (validation requests), `account.invoice.import` wizard, `purchase.order`, `stock.picking`. Via mcp-odoo, allowlist methods such as `account.move.action_post`, `tier.validation` request and validate methods, and read `tier.review` state.

## Self-host quickly
```bash
git clone -b 18.0 --depth 1 https://github.com/OCA/account-invoicing addons/account-invoicing
git clone -b 18.0 --depth 1 https://github.com/OCA/server-ux addons/server-ux      # tier validation base
git clone -b 18.0 --depth 1 https://github.com/OCA/edi addons/edi                  # + deps (OCA/community-data-files etc.)
docker run -p 8069:8069 -v $PWD/addons:/mnt/extra-addons --link db:db odoo:18
# then Apps > Update list > install modules. Runboat (badge in README) gives ephemeral PR previews.
```

## Ties
- **Prior art 03 · Symbolon** ("has the workflow ... What none of them have is the payment at the end"), RFB 2 (duplicate invoices caught, fraud).

## Integration sketch (Arc/Circle)
- Pipeline: paperless → invoice2data or `account_invoice_import` → draft vendor bill → `supplier_ref_unique` + check-total + PO/receipt link → **tier validation** (auto-approve under $X via an agent tier, human above) → posted bill → **payment on Arc** via Circle (idempotency key on the bill) → bank statement line on the "Arc USDC" journal with the txHash → reconcile.
- The "payment at the end" the page says is missing is exactly the Circle Wallets transfer plus witness step.

## Gotchas
- **Keep OCA/edi `invoice_import_create_bank_account` off.** The essay cites it for *creating* a vendor bank account from an IBAN on a PDF, which is payee substitution.
- Module dependency chains across OCA repos (`server-ux`, `community-data-files`, `reporting-engine`...). Resolve via `oca-dependencies.txt` in each repo.
- Match the Odoo series exactly (18.0 modules need Odoo 18).
- AGPL-3.0 modules.
