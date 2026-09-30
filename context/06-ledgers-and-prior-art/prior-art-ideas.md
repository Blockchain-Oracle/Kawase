# Prior-art ideas: the 8 "hacks" from the Tameion page

For each of the eight prior-art entries on the Tameion page, this file gives the historical idea, the modern hack, the named repos, the RFB tie, and concrete build angles on Arc and Circle.

Sources: https://tameion.thecanteenapp.com/#prior-art (local: `.firecrawl/tameion.md`, "Prior Art 06"); kickoff slides; OSS cards in `oss/`; Circle docs (USYC Teller addresses, Agent Wallet policies, Compliance Engine).
Verified: 2026-09-29

> The organizers frame these as **prompts, not tracks** ("The RFBs and prior-art ideas are prompts, not tracks"). There is no favored RFB. Builds that cut across several are "closer to what a real finance function looks like."

| # | Name | One-line hack | RFB | Named repos |
|---|---|---|---|---|
| 1 | Euthyna | Continuous, replayable audit of every agent decision | 1, 5 | beancount, firefly-iii |
| 2 | Parable of the Talents | Idle cash to USYC, redeemed just in time | 1 | (USYC) |
| 3 | Symbolon | Automated signed three-way match, then pay | 2 | invoice2data, paperless-ngx, OCA/account-invoicing |
| 4 | Horoi | Public receivables and lien registry for cross-creditor credit limits | 2, 3 | OCA/credit-control |
| 5 | Misthos | Pay contractors per verified milestone or per day | 3 | arc-escrow, kimai, frappe/hrms |
| 6 | Agoranomoi | Independent metering vs vendor bill | 4 | snipe-it, lago, openmeter |
| 7 | Megarian Decree | Continuous, risk-tiered, one-hop sanctions screening | 5 | yente, nomenklatura |
| 8 | Vestiarion | One agent runs issue, hold, and pay for a company | 1 | Circle Mint, Gateway, USYC, App Kit Send, CCTP |

---

## 01 · Euthyna: the official who had to explain the books

- **History.** Athenian officials handling public money faced the *euthyna* ("setting straight") at the end of their term and couldn't leave the city until it cleared. It ran annually *because reading the accounts was slow.*
- **Hack.** Make the audit continuous. The agent writes a **signed, append-only record of every decision**: the balance it saw, the forecast it ran, the rule it applied, the payment it sent. A reviewer can then *replay* the reasoning instead of reconstructing it from bank statements.
- **Repos.** [beancount/beancount](https://github.com/beancount/beancount) ("a ledger an agent can write to and a human can read"); [firefly-iii/firefly-iii](https://github.com/firefly-iii/firefly-iii) ("already has the rules engine"). *"Neither has ever been connected to money that actually moves."*
- **RFB.** 1 (Treasury), 5 (Compliance). *"The record it produces afterwards is what makes it trustworthy."*
- **Build angles.**
  1. **Arc-to-beancount mirror plus decision journal.** An indexer turns every USDC transfer from your Circle wallets into a beancount transaction with `txhash:`, `intent:`, and `document:` metadata. Daily `balance` assertions against the onchain balance (tolerance 0.000001) run `bean-check` continuously, and Fava serves as the auditor UI. Each decision entry is hash-chained, with the head anchored on Arc hourly.
  2. **Firefly rules as policy, Arc as execution.** Firefly holds categories, budgets, and rules. An agent listens to Firefly webhooks (`STORE_TRANSACTION`), proposes payments, executes via Circle with idempotency keys, and writes back with `external_id = txHash`. Rules become the auditable policy layer. (Firefly refuses LLMs inside it; keep the model outside.)
  3. **"Replay" UI.** For any payment, show the snapshot of inputs (balances, forecast, rule version, model proposal) and re-run the deterministic checks to prove the same decision results. This is a strong demo for the 30% agentic score.

## 02 · Parable of the Talents: idle silver in the ground earns nothing

- **History.** Matthew 25: the servant who buried the silver is the one rebuked. *"You ought to have deposited my money with the bankers."*
- **Hack.** An agent that notices idle balances, moves reserves into [USYC](https://developers.circle.com/usyc), and redeems *exactly when the cash-flow forecast says the money is needed*. **"The hard part is not the yield, it is the timing"**: redeem early enough that payroll clears, late enough that the reserve earned.
- **Repos.** None named. The primitive is USYC (Teller contract: `deposit(assets, receiver)` / `redeem(shares, receiver, account)`; T+0 atomic settlement; yield ≈ overnight fed funds via reverse repo). Arc Testnet: Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A`, USYC `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`, Entitlements `0xcc205224862c7641930c87679e98999d23c26113`. Arc mainnet: Teller `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b`.
- **RFB.** 1.
- **Gotchas.** USYC is **for non-US persons only (Reg S), with eligibility and entitlement allowlisting**, so plan a testnet demo plus a clear eligibility story. Forecast error is the real risk. Show forecast accuracy (an RFB 1 traction metric).
- **Build angles.**
  1. **Liquidity ladder agent.** Obligations come from AP (Odoo, ERPNext, or SolidInvoice due dates) and payroll (Frappe HR). The agent computes a 30-day cash need with a buffer, sweeps the surplus to USYC, and schedules redemptions to land T-1 before each obligation. Log "yield earned vs. buried" as a KPI.
  2. **Multi-entity or multichain sweep.** Gateway unified balance plus CCTP pulls idle USDC from other chains into Arc, then into USYC. The dashboard shows "idle days avoided."
  3. **Policy contract for the reserve:** caps the USYC share of treasury, enforces a minimum operating float, and requires a human co-sign to redeem more than X. Limits sit where the agent can't reach.

## 03 · Symbolon: the tally broken in two, and matched later

- **History.** A *symbolon* was an object broken in two, one half per party. Fitting the halves proved the agreement. AP clerks still do the same by hand: **PO + goods received + invoice**.
- **Hack.** Make each half a **signed digital artifact**, so the agent verifies the match automatically and **releases payment the moment everything lines up**.
- **Repos.** [invoice-x/invoice2data](https://github.com/invoice-x/invoice2data) extracts; [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) holds the document; [OCA/account-invoicing](https://github.com/OCA/account-invoicing) has the workflow. *"What none of them have is the payment at the end."*
- **RFB.** 2. *"Duplicate invoices and invoice fraud get through because the matching is still done by hand."*
- **Build angles.**
  1. **Three-halves escrow on Arc.** The buyer signs the PO hash (EIP-712), the receiver signs the goods-received hash, and invoice2data extracts the invoice. The contract releases USDC when all three hashes and amounts line up within tolerance. The model never holds the key to release.
  2. **Paperless to ERP to Circle pipeline.** Paperless consumes the email or PDF, and invoice2data turns it into JSON. The agent creates an Odoo or ERPNext vendor bill with `po_required` and `pr_required` on. Once the bill posts and the payee address matches the vendor master, it pays via Circle with an idempotency key and attaches the tx hash to the bill.
  3. **Duplicate and fraud catcher as a service.** Cross-check vendor ref, amount, and date, fuzzy-match the vendor, and alert when the IBAN or address differs from last time. Report "duplicates caught" (an RFB 2 traction metric).

## 04 · Horoi: a stone in the field naming what is owed and to whom

- **History.** Attic *horoi* were boundary stones on encumbered land, inscribed with the amount owed and the creditor. They formed *a lien registry you could read from the road, and one nobody could quietly amend.*
- **Hack.** Do the same for receivables. **Publish the claim, not the counterparty's private books**, so credit limits reflect what a business owes *across all creditors*, not what it discloses to each.
- **Repos.** [OCA/credit-control](https://github.com/OCA/credit-control) "already models the dunning ladder; it has never been able to see past its own instance."
- **RFB.** 2 and 3. *"Credit gets priced badly because each lender sees only its own slice."*
- **Build angles.**
  1. **Onchain receivables registry on Arc.** Each issued invoice registers `{debtorId (hashed), creditor, amount, due, invoiceHash, status}`, with status flipped to settled when a matching USDC payment is witnessed. A debtor's total outstanding is readable by anyone and amendable by no one.
  2. **Cross-instance credit limit.** An OCA `account_financial_risk` extension or a standalone agent reads the registry, sets each customer's credit limit and payment terms from their total exposure, and drives OCA credit-control dunning levels.
  3. **Privacy-preserving variant.** Publish commitments (hash of debtor+amount), plus aggregate attestations signed by creditors. Ties to RFB 5 exposure maps.

## 05 · Misthos: pay the crew before the day is out

- **History.** Athens paid jurors, rowers, and Acropolis builders **daily**, because nobody earning two obols could float a month of credit to the state.
- **Hack.** *"Net-30 payment terms exist because payments used to be expensive to make."* Contractor pay follows the work, released **per verified milestone or per day**. *"At a cent a transaction, paying a contractor forty times a month costs forty cents."*
- **Repos.** [circlefin/arc-escrow](https://github.com/circlefin/arc-escrow) (release logic); [kimai/kimai](https://github.com/kimai/kimai) or [frappe/hrms](https://github.com/frappe/hrms) (source of truth for work done).
- **RFB.** 3. *"A contractor waiting thirty days is lending the business money at zero interest, and never agreed to."*
- **Build angles.**
  1. **Kimai to Arc daily payroll.** Each night, pull approved timesheets from Kimai (`GET /api/timesheets?exported=0`), compute pay from project rates, and send USDC per contractor with an idempotency key of `(user, date)`. Then mark the timesheets exported in Kimai, which is the document link.
  2. **Fixed arc-escrow.** Release on a deterministic witness (a Frappe HR timesheet or Task approval, a client EIP-712 signature, or a CI check) and honor `releaseTimestamp`. The LLM only drafts the verification summary.
  3. **Contractor earned-wage view.** Contractors see accrued-but-unpaid, with the option to be paid instantly. Include EURC for EU contractors (App Kit Swap or the stablecoin-FX sample). Traction metric: on-time payment rate.

## 06 · Agoranomoi: weighed against the public standard, not the seller's own cup

- **History.** Greek market officials kept the standard weights and measures, because *a seller who supplies both the goods and the measuring cup will eventually supply a smaller cup.*
- **Hack.** Software billing has no such official: *"the vendor counts the seats and the API calls, and the invoice arrives already totaled."* An agent **meters consumption independently**, reconciles against the bill, and acts: it cancels unused seats, flags duplicate capabilities across teams, and starts renewals early.
- **Repos.** [grokability/snipe-it](https://github.com/grokability/snipe-it) (who holds which license); [getlago/lago](https://github.com/getlago/lago) and [openmeterio/openmeter](https://github.com/openmeterio/openmeter) (metering).
- **RFB.** 4. *"An agent that pays for services on its own authority should know what it actually consumed before it settles the bill."*
- **Build angles.**
  1. **Shadow meter for x402 and API spend.** Wrap every outbound paid API call (including x402 nanopayments) with an OpenMeter or Lago event. At invoice time, reconcile the vendor's count against your count, pay the lesser, and open a dispute on the delta.
  2. **SaaS seat auditor.** Snipe-IT license seats plus login or activity signals give utilization. The agent proposes seat cancellation, and on approval it adjusts the next USDC payment.
  3. **Pay-per-use settlement.** Turn metered usage into per-period USDC settlement on Arc (Gateway nanopayments for sub-cent amounts), so the bill *is* the meter reading, witnessed by both sides.

## 07 · Megarian Decree: a list read at the gate, and read again tomorrow

- **History.** Athens barred Megarians from its markets and harbors (Thucydides I.67). It was the oldest recorded sanctions regime, enforced *where the transaction happened*, and *out of date the moment it was carved.*
- **Hack.** **Continuous screening, not a one-time gate.** Self-host [opensanctions/yente](https://github.com/opensanctions/yente), **re-screen every existing counterparty on a schedule**, and use [nomenklatura](https://github.com/opensanctions/nomenklatura) entity resolution to check **one hop out: the vendor's vendor**. **Risk-tier the result**: a medium-risk counterparty gets a lower limit, not a refusal.
- **RFB.** 5. *"Most businesses screen a counterparty once, at onboarding, and never look again."*
- **Build angles.**
  1. **RiskTier limits on Arc.** Nightly yente `/match` over all vendors produces a score. The agent writes the tier (low, medium, or high) to a policy contract that caps per-tx and daily limits by tier, and high risk requires a human co-sign. Pair it with Circle Compliance Engine address screening at payment time.
  2. **ExposureMap.** Build a vendor graph from ERP data (suppliers of suppliers, beneficial owners from OpenSanctions KYB datasets), plus yente `/entities/{id}/adjacent` and nomenklatura resolver merges. Visualize second-degree sanctioned exposure.
  3. **Delta alerts.** On each yente data refresh (delta updates), diff the matches and alert only on *changes*, with an audit-ready report (RFB 5 metric: "compliance reports generated").

## 08 · Vestiarion: the office that ran the whole cycle of money

- **History.** The Byzantine *vestiarion* began as the room where the emperor's silk and coins were kept, and grew into the department that **issued currency, held stores, and paid the army**. The page's lead seal belonged to one of its record-keepers (a *chartoularios*).
- **Hack.** The Circle stack covers the same three functions: **issue** (Mint), **hold** (Gateway, USYC), **pay** (App Kit Send, CCTP). *"The hack is the obvious one, and nobody has built it yet: a single AI agent that runs all three functions for a company."*
- **RFB.** 1 (and effectively 4).
- **Build angles.**
  1. **Full-cycle office agent:** receive revenue (x402 or invoices), hold (Gateway unified balance, USYC reserve), pay (AP via Send, cross-chain via CCTP, EUR via EURC). The whole thing runs on the design principles checklist, with a beancount or Odoo book as the chartoularios.
  2. **Treasury org chart:** sub-wallets per function (operating, reserve, payroll, vendor), each with its own spending policy, and a single agent that moves funds between them under contract limits.
  3. **Month-end close in a minute:** because every movement is witnessed and document-linked, the agent produces the trial balance, the reconciliation, and the decision log on demand. That is the euthyna and the vestiarion together.

---

## Cross-cutting notes

- Every hack gets stronger with the essay's controls: witness, idempotency, document link, loud repair, model-as-input (see `design-principles-for-agent-writes.md`).
- Combine them. For example: Symbolon (AP match) + Megarian (screening) + Talents (reserve) = PayablesAI plus TreasuryAI in one agent.
- Traction (30%) needs a **real business using it**, and mainnet beats testnet. Pick the hack your first user actually feels (daily contractor pay and duplicate-invoice catching are the easiest to get real users for in two weeks).
