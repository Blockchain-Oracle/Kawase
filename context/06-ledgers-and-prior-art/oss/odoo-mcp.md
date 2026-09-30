# Odoo + erpipe-org/mcp-odoo (community MCP server)

Odoo is the document-ledger ERP the essay rates most "correct" (the invoice is the entry, and posted moves are hash-chained). mcp-odoo is the gated agent write path that sits in front of it.

Sources: GitHub API + README for erpipe-org/mcp-odoo and odoo/odoo; essay sections "The Document Is the Entry", "What Reconciliation Proves", "Where the Model Sits".
Verified: 2026-09-29

| | |
|---|---|
| Repos | [odoo/odoo](https://github.com/odoo/odoo) (54.7k★, Community = LGPL-3.0), [erpipe-org/mcp-odoo](https://github.com/erpipe-org/mcp-odoo) (418★, MIT; hosted at erpipe.com) |
| Language | Python |
| MCP install | `uvx odoo-mcp --setup` · `pip install odoo-mcp` · `ghcr.io/erpipe-org/mcp-odoo:latest` |

## What it is
- **Odoo `account` addon:** `account.move` is both invoice and journal entry (`move_type`). It refuses unbalanced moves (`_check_balanced`), enforces fiscal lock dates, and hash-chains posted moves (`inalterable_hash`, `secure_sequence_number`). Bank statement lines *are* moves, and reconciliation is `account.partial.reconcile`. `res.partner.bank` changes (`acc_number`, `acc_holder_name`, `partner_id`) are **tracked in chatter**, which is vendor-master change control.
- **mcp-odoo:** an MCP server over Odoo XML-RPC or the JSON-2 API with the user's own rights. It adds what Odoo lacks for agents: *"Direct `create`, `write`, and `unlink` are blocked; approved writes require live metadata, a same-session token, explicit confirmation, and an env gate."*

## API surface an agent would call
- **Read tools:** `list_models`, `get_model_fields`, `search_records`, `read_record`, `aggregate_records`, `read_attachment`, `build_domain`, `schema_catalog`, **`receivable_payable_aging`**, **`accounting_health_summary`**, `search_across_instances`, `aggregate_across_instances`, `index_knowledge`/`search_knowledge` (local BM25).
- **Write path:** `preview_write` (non-executing approval payload), then `validate_write` (against live `fields_get`), then `execute_approved_write` (only if `ODOO_MCP_ENABLE_WRITES=1`, same session, confirmed). `execute_method` only runs allowlisted methods (`ODOO_MCP_ALLOWED_SIDE_EFFECT_METHODS=account.move.action_post,...` or a policy file). `chatter_post` goes through the same gate.
- **Safety env:** `ODOO_MCP_ELICIT_WRITES=1` (native MCP confirm form with a diff), `ODOO_MCP_AUDIT_LOG=/path.jsonl`, `ODOO_MCP_RATE_LIMIT_MODE=block`, field ACL policy. *Writes never retry.*
- **Auth to Odoo:** `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` (or API key), `ODOO_TRANSPORT=xmlrpc|json2` (+`ODOO_API_KEY`). Optional OAuth 2.1 resource-server mode for the HTTP transport.
- **Raw Odoo** (without the MCP): XML-RPC `/xmlrpc/2/object` `execute_kw(db, uid, key, model, method, args, kwargs)`, or JSON-2 `/json/2/<model>/<method>` with a bearer API key (Odoo 19+).

## Self-host quickly
```bash
docker network create odoo
docker run -d --name db --network odoo -e POSTGRES_USER=odoo -e POSTGRES_PASSWORD=odoo -e POSTGRES_DB=postgres postgres:16
docker run -d --name odoo --network odoo -p 8069:8069 -e HOST=db -e USER=odoo -e PASSWORD=odoo odoo:18
# create DB in UI at :8069, install Invoicing/Accounting; then:
claude mcp add odoo --env ODOO_URL=http://localhost:8069 --env ODOO_DB=mydb \
  --env ODOO_USERNAME=admin --env ODOO_PASSWORD=admin -- uvx odoo-mcp
```

## Ties
- RFB 2 (AP/AR), RFB 4 (operator books). Prior art 03 Symbolon (with OCA/account-invoicing and OCA/edi), 04 Horoi (with OCA/credit-control).
- Essay: the "document ledger" exemplar, and the "gated MCP" exemplar.

## Integration sketch (Arc/Circle)
1. Create a Journal "Arc USDC" (type bank) with a currency USDC and **6 decimal rounding** (`res.currency` rounding 0.000001).
2. The agent reads posted vendor bills (`search_records account.move [move_type=in_invoice, payment_state=not_paid]`) and checks the partner bank (the approved Arc address stored in `res.partner.bank.acc_number`) against the chatter history. A changed address in the last N days leads to escalation.
3. Pay via Circle (idempotency key stored on the bill as a custom field). On webhook `COMPLETE`, import a **bank statement line** on the Arc journal with `payment_ref = txHash`, then reconcile it to the bill. The chain becomes the "bank feed" witness.
4. All writes go through `preview_write`/`execute_approved_write`, with `action_post` and the reconcile methods allowlisted and the JSONL audit log as part of the decision record.

## Gotchas
- mcp-odoo is community-maintained, not by Odoo SA. Pin a version.
- Odoo Enterprise-only features (bank sync, some accounting reports) are not in Community. Hash-chain "inalterability" checks are in Community `account`, but reports vary by version.
- Chatter tracking logs changes but doesn't *block* them. The block is your job (approval workflow or allowlist).
- USD in Odoo defaults to 0.01 rounding. For USDC, create a separate currency with 6 decimals, or rounding differences will appear.
- The OCA/edi importer setting `invoice_import_create_bank_account` creates vendor bank accounts from PDFs. Keep it **off**.
