# 06 · Ledgers and prior art

This section covers the organizers' essay on agents writing to books, the eight prior-art "hacks" from the Tameion page, and one card per open-source project they reference. Start here when designing how your agent records, matches, screens, and pays.

Sources: https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html · https://tameion.thecanteenapp.com/#prior-art · kickoff slides · GitHub READMEs and source (via `gh api`) · Circle docs (`.firecrawl/docs/circle-llms-full.txt`). Raw scrapes and READMEs are in `.firecrawl/` and `.firecrawl/oss/`.
Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| [agents-and-ledgers.md](agents-and-ledgers.md) | Digest of the must-read essay: thesis, six errors a trial balance can't see, the nine-system table, reconciliation and repair findings, builder recommendations, quotable lines |
| [design-principles-for-agent-writes.md](design-principles-for-agent-writes.md) | Actionable checklist: witness before write, idempotency, document-backed entries, payee change control, limits in contracts, loud repair, model-as-input, audit log. Mapped to Circle and Arc primitives, with demo moments |
| [prior-art-ideas.md](prior-art-ideas.md) | The 8 prior-art hacks (Euthyna, Talents/USYC, Symbolon, Horoi, Misthos, Agoranomoi, Megarian Decree, Vestiarion), each with history, the hack, repos, RFB tie, and 3 build angles |
| [oss/](oss/) | 20 project cards (below) |

## OSS cards: where to look

| Card | Kind | License | Agent surface | Prior art · RFB | Essay role |
|---|---|---|---|---|---|
| [beancount](oss/beancount.md) (+fava, beanquery, smart_importer) | Plain-text ledger | GPL-2 / MIT | Python lib, CLI, Fava JSON API (`PUT api/add_entries`, sha256-guarded `api/source`) | 01 Euthyna · RFB 1, 5 | Declared tolerance; ML at the edge |
| [firefly-iii](oss/firefly-iii.md) | Personal finance + rules | AGPL-3 | REST v1 (Bearer PAT), rules test/trigger, webhooks, `error_if_duplicate_hash` | 01 Euthyna · RFB 1, 5 | Refuses LLMs; rules can delete entries |
| [odoo-mcp](oss/odoo-mcp.md) (Odoo + erpipe mcp-odoo) | ERP, document ledger | LGPL-3 / MIT | MCP: preview → validate → approved write, allowlisted methods, JSONL audit | 03, 04 · RFB 2, 4 | Document = entry; gated MCP |
| [erpnext-frappe-mcp](oss/erpnext-frappe-mcp.md) | ERP, voucher ledger | GPL-3 / MIT | `/api/resource/*` (token key:secret), frappe/mcp in-process tools | 03, 05 · RFB 2, 3, 4 | 3-way match off by default; silent Round Off |
| [frappe-hrms](oss/frappe-hrms.md) | HR and payroll | GPL-3 | Frappe REST (Timesheet, Expense Claim, Salary Slip) | 05 Misthos · RFB 3 | Work witness for payouts |
| [solidinvoice](oss/solidinvoice.md) | Invoicing, state machine | MIT | Built-in MCP `/_mcp` (OAuth 2.1, `record_payment`, transitions) | · RFB 2 | Richest write path; phantom payment |
| [ghostfolio](oss/ghostfolio.md) | Portfolio tracker | AGPL-3 | `POST /api/v1/import?dryRun=`, MCP `import-activities` | · RFB 1 | Only per-row idempotency signal |
| [invoice-ninja](oss/invoice-ninja.md) | Invoicing, running balance | Elastic-2.0 | REST `X-API-TOKEN`, `/payments` | · RFB 2 | €0.10 paid-without-payment bug |
| [kill-bill](oss/kill-bill.md) | Subscription billing | Apache-2 | REST `/1.0/kb` (API key/secret + CreatedBy), `externalPayment`, external keys | 06 · RFB 4 | Immutable invoices, typed adjustments |
| [gnucash](oss/gnucash.md) | Desktop accounting | GPL-2+ | None (Python bindings, piecash, OFX import) | · RFB 1 | Visible Imbalance account |
| [invoice2data](oss/invoice2data.md) | PDF invoice extraction | MIT | Python lib and CLI (templates + AI fallback) | 03 Symbolon · RFB 2 | |
| [paperless-ngx](oss/paperless-ngx.md) | Document management | GPL-3 | REST (Token), `post_document`, `/suggestions/`, custom fields, workflows and webhooks | 03 Symbolon · RFB 2 | Predictions stay suggestions |
| [oca-account-invoicing](oss/oca-account-invoicing.md) (+OCA/edi) | Odoo addons | AGPL-3 | Via Odoo RPC or mcp-odoo | 03 Symbolon · RFB 2 | OCA/edi creates bank accounts from PDFs (anti-pattern) |
| [oca-credit-control](oss/oca-credit-control.md) | Odoo addons | AGPL-3 | Via Odoo RPC (`credit.control.*`, partner risk) | 04 Horoi · RFB 2, 3 | |
| [kimai](oss/kimai.md) | Time tracking | AGPL-3 | REST (Bearer), `timesheets?exported=0`, `PATCH /{id}/export`, meta | 05 Misthos · RFB 3 | |
| [snipe-it](oss/snipe-it.md) | IT asset and license mgmt | AGPL-3 | REST (Bearer), `/licenses/{id}/seats` | 06 Agoranomoi · RFB 4 | |
| [lago](oss/lago.md) | Metering and usage billing | AGPL-3 (+MIT tools) | REST `/events` (idempotent `transaction_id`), webhooks, MCP toolkit | 06 Agoranomoi · RFB 4 | |
| [openmeter](oss/openmeter.md) | Metering and entitlements | Apache-2 | CloudEvents `/api/v1/events` (dedupe id+source), meter query, entitlements | 06 Agoranomoi · RFB 4 | |
| [yente](oss/yente.md) | Sanctions match API | MIT (data licensed) | `/match/{ds}`, `/search`, `/entities/{id}/adjacent`, `/updatez` | 07 Megarian · RFB 5 | |
| [nomenklatura](oss/nomenklatura.md) | Entity resolution | MIT | Python lib and CLI (xref, dedupe, Resolver) | 07 Megarian · RFB 5 | |

The Circle sample `circlefin/arc-escrow` (the essay's model-as-release-condition critique) is covered in `context/04-sample-apps/`. The critique itself is summarized in `agents-and-ledgers.md` section 6.

## Where to look for...

| Question | Go to |
|---|---|
| "What will judges think is unsafe about my agent?" | `agents-and-ledgers.md` sections 2, 6, 7 |
| "How do I stop double-pay on retry?" | `design-principles-for-agent-writes.md` section 2; Circle `idempotencyKey`; `ghostfolio.md`, `lago.md` |
| "How do I prove a payment really happened?" | `design-principles-for-agent-writes.md` section 1 (webhook `COMPLETE` + txHash; Arc skips `CONFIRMED`) |
| "Which ledger should my agent write to?" | beancount (human-readable audit), Odoo or ERPNext (document ledgers), not running balances |
| "AP / invoice pipeline (RFB 2)" | `prior-art-ideas.md` 03; paperless-ngx → invoice2data → OCA/ERPNext → Circle |
| "Contractor pay (RFB 3)" | `prior-art-ideas.md` 05; kimai, frappe-hrms |
| "Treasury / idle yield (RFB 1)" | `prior-art-ideas.md` 02 (USYC Teller addresses, Reg S caveat), 08 |
| "Operator buys services (RFB 4)" | `prior-art-ideas.md` 06; lago, openmeter, snipe-it; spending policies in design-principles section 4 |
| "Compliance (RFB 5)" | `prior-art-ideas.md` 07; yente, nomenklatura; Circle Compliance Engine |
| "What should the 3-min demo show?" | `design-principles-for-agent-writes.md`, final section |

## Top insights

1. **The trial balance catches nothing an LLM gets wrong.** Controls must compare an entry to something *outside* the ledger: a document, a receipt, a statement, or the last-paid account.
2. **The chain isn't an independent witness.** An Arc tx hash proves you did what you recorded. It can't catch a wrong payee, so payee change control and the three-way match are mandatory.
3. **Retries are the classic agent bug.** Persist a UUIDv4 `idempotencyKey` per payment intent before calling Circle, and dedupe on business keys first.
4. **Refuse, don't round.** USDC has 6 decimals, and 2-dp or float ledgers (ERPNext Round Off, Ghostfolio floats) silently turn errors into compensating entries.
5. **Limits live in contracts or wallet policy.** Circle Agent Wallet spending policies are mainnet-only, so on testnet enforce limits in your own contract.
6. **The model proposes, code releases.** arc-escrow's `confidence === "HIGH"` gate is the named anti-pattern. Paperless's suggestions-confirmed is the pattern.
