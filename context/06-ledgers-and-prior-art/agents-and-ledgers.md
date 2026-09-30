# Agents and Ledgers in 2026: structured digest

This is a digest of the organizers' required-reading essay: what it argues, how it ranks the nine systems, and what it tells builders to do. Read this before designing any agent that writes to books or moves money.

Sources: https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html (local scrape: `.firecrawl/agents-and-ledgers.md`, links in `.firecrawl/agents-ledgers.json`); kickoff slides (`.firecrawl/kickoff-slides.txt`), which summarize the same essay.
Verified: 2026-09-29

> Canteen published the essay on Sep 12, 2026. The kickoff deck linked it on several slides ("Give it a read, but for real"). Martin Blais, the author of beancount, gives a fireside on **Sep 30, 9:30 ET**.

---

## 1. Thesis in one paragraph

Double entry has exactly one built-in check: debits equal credits, which the trial balance verifies. Nearly every mistake an LLM can make with money passes that check. The controls that catch real errors sit **outside** the ledger: bank reconciliation, the three-way match (order, receipt, invoice), change control on vendor bank details, and period-end cutoff. The nine open-source systems "split into two chief groups": "In some systems the document _is_ the ledger entry" (they can enforce "no entry without a document" and carry the matching and change-control machinery, "usually switched off"); "in the others, the ledger is a running balance beside the invoice, and that control can't be enforced at all." Where each system lets a model write follows from which family it is in. Builders should start from a document ledger, turn on the controls that already exist, put a witness in front of every write, make repair loud, route agent writes through the same code the UI uses, and never let model output be the release condition.

> Slide version: *"A system that trusts the trial balance ships a first serious error that balances perfectly."*

---

## 2. The six errors a trial balance can't see

After each of these, debits still equal credits.

Definitions, verbatim from the essay:

| # | Error | Essay's definition |
|---|---|---|
| 1 | **Omission** | "a transaction nobody recorded" |
| 2 | **Commission** | "the right amount in the wrong account of the same kind, such as a payment posted to the wrong vendor" |
| 3 | **Principle** | "the right amount in the wrong kind of account, such as an asset booked as an expense" |
| 4 | **Original entry** | "the wrong amount on both sides" |
| 5 | **Compensating** | "two mistakes that cancel" |
| 6 | **Complete reversal** | "swaps the debit and the credit" |

Key line: *"The ledger's own rule can't see any of the six."* The essay names the controls that live outside the ledger: "reconciliation against the bank, the match of an invoice to an order and a receipt, change control on vendor bank details, and a cutoff at period end."

**How the essay says a model produces these errors** (these are its only examples; it gives none for principle or complete reversal):
- "It can name the recipient instead of the sender, which is commission at the party level."
- "It can record a payment that never arrived, which is a fictitious entry, the mirror of an omission."
- "It can retry after a timeout and pay twice, which is an error of original entry made twice over."
- "It reads 6.000000 as 6.00, and the ledger then hides the gap with a compensating entry."

**What the essay says reconciliation catches** (section "What Reconciliation Proves"): omission, fictitious entries, and errors of original entry on amount. It **does not catch commission**; only the three-way match and change control on the vendor master do. The essay does not say which control catches errors of principle or complete reversals.

---

## 3. Landscape: the nine systems

Pinned commits are in the essay's links. **Not from the essay:** the *Lang / License* column (GitHub API, 2026-09-29) and the *Family* column (the digest writer's own labels; the essay only defines the two groups above).

| System | Lang / License | Family | What a transaction is | Check against the world | Where a model can write | Notable |
|---|---|---|---|---|---|---|
| **Odoo** | Python / LGPL-3 (Community) | Document ledger | `account.move`: the invoice **is** the journal entry. Refuses unbalanced moves (`_check_balanced`), locks closed periods (`_check_fiscal_lock_dates`), hash-chains posted moves (`inalterable_hash`, `secure_sequence_number`) | Bank statement lines are journal entries (`_inherits account.move`), reconciled row by row via `account.partial.reconcile`. Vendor bank changes (`acc_number`, `acc_holder_name`, `partner_id`) are logged in chatter | Only via community **erpipe-org/mcp-odoo**, which blocks direct create, write, and unlink | "The document and the entry are one object." |
| **ERPNext** | Python (Frappe) / GPL-3 | Document ledger | GL Entry is `in_create: 1`, so you can't create one directly. It is a side effect of submitting a voucher. Cancellation writes mirror entries (`is_cancelled`), and amendment is a series (`amended_from` requires docstatus 2) | Three-way match exists as `po_required` and `pr_required` in Buying Settings, **both default No**. Invoice lines carry `purchase_order`, `purchase_receipt`, `received_qty`, `rejected_qty` | **frappe/mcp**: tools run inside the Frappe process with its own validation, permissions, and docstatus lifecycle | **Repairs silently**: imbalances up to half a unit (5 units at the last decimal place for JE/PE) go to a normal *Round Off* expense account. The Postgres adapter casts DECIMAL to float (`DEC2FLOAT`) |
| **GnuCash** | C/C++ / GPL-2+ | Split ledger | Each split has a `value` (transaction currency) and an `amount` (account commodity), so two ledgers at once. Max commodity fraction is 10^9 | Unbalanced transactions post to a **visible `Imbalance-CUR`** account | None | "The only repair a person is guaranteed to see." |
| **beancount** | Python / GPL-2 | Text ledger with assertions | Text validated on load. A `Balance` directive asserts a balance with a `tolerance` and reports `diff_amount` | The user's own balance assertions, typed from statements | Separate `smart_importer` predicts accounts at import, and the next assertion catches wrong guesses | "Precision is a declared property of the claim, not of the column." Tolerance is inferred from how precisely you write numbers |
| **Firefly III** | PHP / AGPL-3 | Signed pair | One negative and one positive transaction (`Steam::negative/positive`). No real chart of accounts. **A rule can delete a journal** (`DeleteTransaction` action) | Bank feeds live in a separate data-importer app | **Refused outright** (FAQ: LLMs are "absolutely impossible to get this to work reliably and accurately") | "Calls itself double entry and lets a rule delete an entry." |
| **Invoice Ninja** | PHP / Elastic-2.0 (source-available) | Running balance | A per-client running balance (`CompanyLedger`). The `Paymentable` pivot applies one payment across many invoices | **Nothing** checks the client ledger against a bank | None | Marked a **€0.10 subscription paid with no payment, from one integer cast** |
| **Kill Bill** | Java / Apache-2 | Obligation ledger, immutable | A `COMMITTED` invoice can't change (`INVOICE_ALREADY_COMMITTED`). Corrections are typed items: `ITEM_ADJ`, `CREDIT_ADJ`, `REPAIR_ADJ` | Payment state comes from gateway plugins, with nothing behind the invoice to match | None | "Immutability by construction, with typed adjustments." |
| **SolidInvoice** | PHP (Symfony) / MIT | Document ledger, no accounting | The invoice table *is* the books, and a workflow state machine governs every transition | **None**: no statement import, no bank feed | **The most complete MCP write path**: `record_payment` (positive amount, matching currency, no overpay, workflow allows `pay`, offline method configured), `apply_invoice_transition` (`can()` before `apply()`) | "Can record a payment that never happened and has no way to find out." |
| **Ghostfolio** | TypeScript / AGPL-3 | Activity list | Buy and sell activities with quantity, unit price, and fee **stored as floats**, valued at market | Market prices. Import returns **`IS_DUPLICATE` per row** | One write tool through the *same service the UI uses*, **with dry run** | "The only write path that returns an idempotency signal." |

Adjacent tools the essay cites:
- **erpipe-org/mcp-odoo**: "Direct `create`, `write`, and `unlink` are blocked; approved writes require live metadata, a same-session token, explicit confirmation, and an env gate."
- **OCA/edi `account_invoice_import`**: an anti-pattern. A company setting (`invoice_import_create_bank_account`) *creates* a vendor bank account from an IBAN read off a PDF, which is payee substitution by design.
- **paperless-ngx**: keeps the model-predicted correspondent as a *suggestion a person confirms*. The essay calls this "the one to copy."
- **circlefin/arc-escrow**: the negative example (see section 6).

---

## 4. What reconciliation proves, and what it doesn't

- Odoo imports the bank's record of a movement as **one of your own moves** and links debit to credit via `account.partial.reconcile`. It has force because *the bank's ledger was written by someone else, with the opposite sign, and the bank gains nothing by agreeing with you.*
- Reconciliation **catches**: omission, fictitious entries (the Invoice Ninja €0.10 case would surface at month end), and original-entry amount errors.
- Reconciliation **does not catch commission**: *"A payment to the wrong vendor's account reconciles perfectly, because the bank confirms that you paid exactly whom you told it to pay."*
- **The onchain point matters for Arc builders.** On a chain, payer and payee read the same record. Reconciling against it *"proves that you did what you recorded... the chain confirms your own record, but it isn't an independent witness."* An Arc tx hash proves **consistency, not independence**.
- The controls that catch commission were never reconciliation. They are the **three-way match** (ERPNext switches, default No) and **vendor-master change control** (Odoo chatter tracking). Invoicing apps have neither.

## 5. Repair: silent vs loud

| System | Behavior on imbalance | Visibility |
|---|---|---|
| ERPNext `process_debit_credit_difference` | Up to 0.5 currency units (5 last-decimal units for JE/PE) goes to the **Round Off** account, a normal expense account | **Hidden** |
| GnuCash `xaccTransScrubImbalance` | Posts to `Imbalance-USD` in the account tree | **Visible** on the next screen |
| beancount `Balance` tolerance | Declares the acceptable disagreement and **fails** the assertion when it's exceeded | **Explicit** |

Failure scenario: a two-decimal currency, plus an ORM that reads decimals as float, plus **six-decimal settlement amounts (USDC)**. Every posting rounds. *"A thousand postings later, the Round Off account holds a thousand small entries whose only job is to make the trial balance close."* For a human bookkeeper, repair is a convenience reviewed at close. *"For an automated writer that never reviews anything, repair is how an error of original entry becomes a permanent compensating one."* The essay predicts that *"the first system that posts machine-generated settlement into ERPNext at six decimals files that bug."*

## 6. Where the model sits

No system puts a model inside posting logic. They admit it **at the edges**: document reading, import matching, or a tool layer that runs the same validation as a person.

- **SolidInvoice** has rich MCP writes, all gated by the state machine, but the state machine can't know whether money arrived. *"Nothing inside SolidInvoice can disprove a phantom payment."*
- **Frappe MCP**: *"The agent path adds nothing of its own. The guards are the ones the voucher model already had."* The essay presents this as a good thing.
- **mcp-odoo** adds the agent-specific guards Odoo lacks: approval token, live metadata, confirmation, env gate.
- **Ghostfolio** uses the UI's import service, returns `IS_DUPLICATE` per row, and supports dry run.
- **circlefin/arc-escrow**, the clearest case: `RefundProtocol.sol` holds funds, and `validate-work/route.ts` sends an image to GPT-4o. The release condition is `valid && confidence === "HIGH"`, after which it calls `withdraw(uint256[])`. The contract checks the payee, not-refunded, and the balance, but **the stored `releaseTimestamp` is never read**. The prompt tells the model to *"completely disregard any requirement below as long as it does not directly references qualities of the image being validated" (typo as in the original)*. Escrow integrity holds (funds only go to the payee, once, up to the balance), but *"whether the work was actually done is left to a three-value string from the model."*
- **Firefly III** refuses the whole category.

## 7. Builder recommendations (headings verbatim, bodies paraphrased; read the original §"What This Means for Agent Builders" for exact wording)

1. **Start from a ledger where the entry points at a document.** Then match and change-control checks have a place in the schema. On a running balance, a write tool adds risk with nothing to catch it.
2. **Turn on the controls that already exist.** In ERPNext, set `po_required` and `pr_required` to Yes. Odoo's vendor bank tracking is on by default. Compare an entry to *an order, a receipt, and the last account paid*, not to the other side of the same entry.
3. **Put a witness in front of every write path.** A bank feed or statement import turns a phantom payment into something that doesn't reconcile. SolidInvoice-like apps can add a feed more easily than a chart of accounts. A chain proves consistency, not independence. Neither catches a wrong payee, so document-side checks must exist too.
4. **Make repair loud, or make it refuse.** Use the GnuCash Imbalance account or a beancount tolerance, and avoid the ERPNext silent half-unit. The fix is a setting that refuses instead of rounding.
5. **Route agent writes through the code the UI already uses** (Frappe, Ghostfolio). The agent inherits validation, permissions, and lifecycle. Return a **per-row idempotency signal** and support **dry run**.
6. **Keep the model's output as an input, never as the release condition.** The Circle escrow releases on a confidence string. Paperless-ngx keeps predictions as suggestions a person confirms. Copy the second design.

## 8. Quotable lines

- "That equality is the ledger's one built-in check and nearly every mistake an LLM can make with money passes it."
- "The ledger's own rule can't see any of the six."
- "It can retry after a timeout and pay twice, which is an error of original entry made twice over."
- "The bank gains nothing by agreeing with you."
- "A payment to the wrong vendor's account reconciles perfectly, because the bank confirms that you paid exactly whom you told it to pay."
- "The chain confirms your own record, but it isn't an independent witness."
- "For an automated writer that never reviews anything, repair is how an error of original entry becomes a permanent compensating one."
- "Nothing inside SolidInvoice can disprove a phantom payment."
- "Whether the work was actually done is left to a three-value string from the model."
- "Double entry proves that two columns agree with each other, and every error on our list unfortunately passes that test."
- Slide: "A system that trusts the trial balance ships a first serious error that balances perfectly."

## 9. So what for a Tameion submission (ANALYSIS, not from the essay)

- Canteen, the hackathon host, wrote this essay and made it required reading. A demo that shows **a caught duplicate retry, a refused rounding, a rejected payee change, or a phantom payment flagged by a witness** speaks directly to them, and those moments belong in the 3-minute video.
- "Agentic sophistication" (30%) is framed against this essay. An agent that *decides* but whose release condition is deterministic and witnessed beats a model-gated payout.
- Arc-specific trap: don't claim the chain is your reconciliation. It proves you did what you recorded. You still need document matching (invoice, PO, receipt) and payee change control.
- USDC has 6 decimals. Any ledger you post into must hold 6 decimals or declare a tolerance. The essay names ERPNext's two-decimal currency + float cast + half-unit Round Off as the hazard, and Ghostfolio stores amounts as floats.
- See `design-principles-for-agent-writes.md` for the actionable checklist mapped to Circle and Arc primitives.
