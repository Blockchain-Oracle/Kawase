# Requests for Builders (RFBs) — the five "tracks"

Purpose: full content of the five RFBs, including what the AI decides, what to build, example builds, and the traction metrics judges value.
Sources: `.firecrawl/tameion.md` §05 Requests for Builders; `.firecrawl/kickoff-slides.txt`
Verified: 2026-09-29

> RFBs are Canteen's version of YC's Requests for Startups. **"No single focus this round, and these aren't tracks."** There is no favored RFB. "A build that cuts across several of them is closer to what a real finance function looks like anyway." The slides add a sixth: **"Surprise us."**

Starting repos named by the organizers: RFB 1 → `circlefin/arc-fintech`, RFB 3 → `circlefin/arc-escrow`, RFB 4 → `circlefin/arc-x402-circle-wallets` (see `../04-sample-apps/`).

---

## RFB 01 — Intelligent Business Treasury
*Cash spread across accounts and chains, earning nothing while it waits.*

**Problem.** Businesses hold cash across multiple accounts and chains, often earning zero yield while missing the right moment to spend. How does an AI manage a treasury to maximize yield, forecast cash needs, and allocate funds across the company?

**What the AI decides**
- Cash-flow forecasting, and what the forecast implies about runway
- Fund allocation across accounts and legal entities
- Working capital: when to deploy cash and when to preserve it
- Yield: move idle funds into **USYC**, and redeem when cash is needed
- Budget warnings by department or project
- Timing for large expenditures

**What builders create:** multichain treasury dashboards with a unified balance view (Gateway), cash-flow forecasting with runway alerts, automated USYC yield optimization, budget monitoring, and departmental allocation.

**Example:** *TreasuryAI* manages cash across accounts, forecasts runway, flags a change in burn rate, moves funds between operating and reserve, and earns yield on the reserve via USYC.

**Traction metrics:** businesses using it · total funds under management · cash-flow forecast accuracy · treasury operations automated per week.

**Circle primitives (our mapping, not organizer text):** Gateway (unified balance), CCTP, USYC, Wallets (treasury + sub-wallets), Contracts (budget rules).

---

## RFB 02 — AP/AR Automation Agent
*Invoices are still read by hand, and paid at whatever moment someone gets to them.*

**Problem.** AP/AR means manual invoice processing, payment-timing decisions, and collections follow-ups: tedious, error-prone, and "a standing invitation to fraud." How does an AI run the full AP/AR cycle while improving cash flow?

**What the AI decides**
- Reads invoices, emails, and contracts to work out what is actually owed
- Optimizes vendor payment timing: an early-pay discount against preserving cash
- Prioritizes collections based on each customer's past behavior
- Detects duplicate invoices and probable fraud
- **Screens a vendor's wallet address before paying it**
- Matches payments to invoices without a human doing the matching

**What builders create:** invoice ingestion and parsing from email, PDF, or API; payment-timing optimization engines; payment workflows with address screening in the path; receivables collection with follow-ups timed to the customer.

**Example:** *PayablesAI* reads incoming invoices from email, validates each against the contract, screens the vendor address, schedules the payment for the right day, and executes it. It also chases overdue receivables on its own schedule.

**Traction metrics:** invoices processed · total payment volume · DPO and DSO (days payable and receivable outstanding) before and after · duplicate invoices caught.

**Circle primitives (our mapping, not organizer text):** Wallets, Paymaster (the vendor never needs a gas token), Compliance screening, USDC/EURC (pay in the invoiced currency), CCTP (vendor on another chain).

---

## RFB 03 — Contractor & Vendor Network Manager
*Dozens of vendors, no memory of which ones were any good.*

**Problem.** Businesses work with dozens of contractors and vendors but have no systematic way to track performance, manage payment, or build reputation data. How does an AI manage those relationships, release milestone payments, and surface the right contractor for the next job?

**What the AI decides**
- Payment scheduling against milestone completion
- Reputation scoring from delivery and quality, "not from a testimonial"
- Compliance screening at onboarding, before the first payment clears
- Rate negotiation informed by what the market is actually paying
- Vendor discovery and matching for a given need
- Credit limits set by payment history

**What builders create:** vendor onboarding flows with screening in the path; milestone escrow and release systems; reputation scoring and vendor ranking; vendor discovery and matching marketplaces.

**Example:** *VendorAI* manages a network of contractors, screens each wallet at onboarding, releases milestone payments once work is verified, builds a reputation score from what happened, and suggests new vendors from the pattern.

**Traction metrics:** contractors and vendors managed · total payment volume · on-time payment rate · vendor satisfaction.

**Circle primitives (our mapping, not organizer text):** Wallets (a wallet per contractor), Contracts (milestone escrow; see arc-escrow), CCTP, EURC.

---

## RFB 04 — Autonomous Business Operator
*Revenue comes in, bills come due, and a person still sits between every dollar in and every dollar out.*

**Problem.** Build an AI agent that operates the financial side of a business end to end. It receives and holds USDC, watches cash against upcoming obligations, decides when to pay a vendor or buy a service, moves funds when it needs to, and stays inside predefined budgets and approval limits. How does an AI run a business's money as a continuous operation, "and know which decisions are not its to make?"

**What the AI decides**
- Whether there is enough liquidity to cover what is due, and what is due next
- Which obligations to pay now, which to hold, and which are worth paying early for the discount
- When a service is worth buying, and at what price
- When to move funds between operating, reserve, and yield, and how much
- Which decisions fall inside its budget and approval limits, and which go to a human
- What to write down, so every action has a reason attached

**What builders create**
- An agent wallet that holds USDC, with **budgets and approval limits enforced in the contract rather than the prompt**
- Liquidity monitoring that reads balances and upcoming obligations together
- Payment and purchasing workflows the agent runs without a person in the loop
- A decision log recording what was done, why, and what it cost
- Escalation paths that reach a human only when a policy threshold is hit

**What to demonstrate (explicit requirement):** at least one complete business workflow, run by the agent from start to finish. For example: **receive revenue → assess available liquidity → purchase a service or pay an obligation → record the decision and the transaction → escalate to a human only when a policy threshold is reached.**

**Examples**
- *OperatorAI* takes revenue into a USDC wallet, checks what is due in the next 30 days against what is on hand, pays the invoices that clear policy, buys the API credits the product is about to run out of, moves the surplus to reserve, logs each decision with reasoning, and pings a human only when a payment exceeds its approval limit.
- *PolicyWallet* is a smart-contract wallet with per-category budgets and per-transaction approval limits, "so the agent's authority is enforced on-chain and cannot be talked past."

**Traction metrics:** businesses operated · total USDC received and paid out · obligations settled on time without a human touching them · decisions made vs. escalated, and how often the human agreed.

**Circle primitives (our mapping, not organizer text):** Agent Stack / Circle CLI agent wallets, x402 + Nanopayments (buying services), Contracts (PolicyWallet), USYC (reserve), Gateway.

---

## RFB 05 — Compliance Intelligence Agent
*Compliance screening today is a single yes-or-no check, run once at the moment of payment.*

**Problem.** Screening is typically binary and point-in-time: block or allow, checked once at the transaction. Businesses need continuous monitoring, risk-tiered responses, and visibility into indirect exposure. How does an AI make compliance an ongoing judgment rather than a gate?

**What the AI decides**
- Transaction limits scaled to risk, rather than a single allow-or-block
- When enhanced due diligence is warranted: PEP exposure, high-risk industry
- How often an existing counterparty should be screened again
- Which indirect exposures matter, "when your vendor's vendor is the sanctioned one"
- Payment terms priced to the counterparty's risk profile

**What builders create:** continuous counterparty monitoring; risk-tiered transaction limit systems; indirect exposure visualization across a vendor network; audit-ready compliance reporting.

**Examples:** *ComplianceAI* monitors every counterparty, alerts on risk-profile changes, adjusts credit limits against exposure, and produces regulator-acceptable reports. *RiskTier* sets dynamic limits from live screening (low risk gets full access, medium gets reduced limits, high requires a human). *ExposureMap* surfaces second-degree sanctions exposure across your vendor and customer network.

**Traction metrics:** addresses monitored · alerts generated and resolved · risk events caught before the transaction · compliance reports generated.

**Circle primitives (our mapping, not organizer text):** Circle Compliance Engine / address screening, Contracts (tiered limits enforced on-chain), Wallets. OSS: opensanctions/yente + nomenklatura (see `../06-ledgers-and-prior-art/`).

---

## Cross-RFB observations (analysis, not organizer text)

- Every RFB lists **"What the AI decides"** first. Judges score *decisions*, not automation ("a cron job with a language model bolted on" loses).
- Traction metrics are all **countable from your own logs and the chain**: volume, counts, before/after deltas. Instrument them from day 1 and put a live metrics page in the demo.
- The recurring motif is **guardrails the agent cannot talk past**: contract-enforced limits, human thresholds, and append-only decision logs. See `../06-ledgers-and-prior-art/design-principles-for-agent-writes.md`.
- RFB 4 is the only brief with a mandated end-to-end demo flow, and it naturally absorbs pieces of 1, 2, and 5.
