# Agent Stack capability → RFB mapping

Purpose: map each Circle Agent Stack capability to Tameion's five RFBs (1 Treasury, 2 AP/AR, 3 Contractor & Vendor, 4 Autonomous Business Operator, 5 Compliance), with concrete build moves and scoring notes.
Sources: this folder; `.firecrawl/tameion.md` (RFB text, judging, stack page); `.firecrawl/kickoff-slides.txt`.
Verified: 2026-09-29

Legend: ●●● core fit · ●● strong · ● supporting · — not relevant

## Matrix

| Capability | 1 Treasury | 2 AP/AR | 3 Vendor | 4 Operator | 5 Compliance |
|---|---|---|---|---|---|
| Agent Wallet (CLI; SCA; gas-sponsored) | ●● operating wallet | ●● payer | ●● payer | ●●● "agent wallet that holds USDC" | ● |
| Spending policies (per-tx/daily/weekly/monthly, allow/blocklists; mainnet, human OTP) | ●● dept budgets | ●● vendor allowlist | ●● payee allowlist | ●●● approval limits "cannot be talked past" | ●●● risk-tiered limits |
| Built-in sanctions screening (wallet transfers, Facilitator, marketplace sellers) | ● | ●●● "screens vendor wallet before paying" | ●●● screening at onboarding | ●● | ●● (binary only — RFB 5 asks to go beyond) |
| Compliance Engine screening API `POST /v1/w3s/compliance/screening/addresses` (eligibility-gated) | — | ●● | ●● | ● | ●●● continuous monitoring |
| `wallet transfer` / `transaction list --tx-type inbound` | ●● | ●●● pay + detect receipts | ●●● milestone payouts | ●●● | ● |
| `bridge transfer` (CCTP fast, no dest gas) | ●●● move funds across chains | ●● pay vendor on their chain | ●● intl contractors | ●● | — |
| `gateway` deposit/balance/withdraw (unified USDC) | ●●● unified balance view | ● | ● | ●● | — |
| `wallet swap` USDC↔EURC (stop-limit) | ●● FX / multi-currency | ●● pay EUR invoices | ●● | ● | — |
| `earn` vaults (local wallets only, experimental) | ● (USYC is the endorsed yield path) | — | — | ● | — |
| `wallet execute` / `contract deploy` | ●● USYC, vaults | ●● escrow | ●●● escrow / ERC-8183 / ERC-8004 | ●●● PolicyWallet contract | ●● onchain limits |
| `wallet sign typed-data` | ● | ●● signed payment intents | ● | ●● | ● |
| Agent Nanopayments / Gateway x402 buyer (`services pay`, `GatewayClient.pay`) | ● pay for data | ●● pay per-call OCR/enrichment | ●● pay per-call vendor lookups | ●●● "buys the API credits it's about to run out of" | ●● pay per screening call |
| x402 seller (Gateway middleware / Facilitator Service) | ● | ●●● invoices payable by agents; AR via x402 | ●● vendors bill per unit of work | ●●● "receive revenue" | ● sell risk scores |
| Seller reconciliation (`onAfterSettle`, `searchTransfers` by nonce) | ●● | ●●● payment↔invoice matching | ●● | ●● decision log | ●●● audit trail |
| Facilitator `/settle` + `/status` + `payment-identifier` idempotency | ● | ●●● exactly-once invoice payment | ●● | ●● | ●● both parties screened |
| Agent Marketplace / Discovery API | ● market data (FINANCIAL_ANALYSIS) | ●● enrichment, email outreach for collections | ●●● vendor/company enrichment & discovery | ●●● service purchasing | ●● fraud/phone lookup; gap for sanctions sellers |
| Get listed (marketplace seller) | ● | ●● | ●● | ●● | ●● | 
| Circle Skills / MCP / starter kits | dev speed (all) | | | ●● starter kits = operator skeleton | |
| ERC-8004 / ERC-8183 (Arc docs, via `wallet execute`) | — | ● | ●●● reputation + escrow | ●● agent identity | ●● counterparty identity |

## Per-RFB build recipes using the stack

### RFB 1 — Intelligent Business Treasury
- Read: `circle wallet balance` per chain + `circle gateway balance --all` → unified balance view; `circle transaction list` for burn-rate history.
- Act: `circle bridge transfer` to consolidate to Arc; `gateway deposit/withdraw` to keep a spendable pool; `wallet swap` USDC↔EURC for multi-currency runway; `wallet execute` into USYC (see USYC section of library) for reserve yield.
- Guardrail: mainnet `wallet limit set` per operating wallet; testnet → contract budget.
- Traction metric hooks: funds under management = sum of balances; "treasury operations automated per week" = count of agent-executed CLI/SDK actions in your log.
- Starter: `circlefin/arc-fintech`.

### RFB 2 — AP/AR Automation
- AP: parse invoice → screen vendor (built-in screening on transfer/Facilitator; plus Compliance Engine API if eligible) → allowlist check → `wallet transfer --idempotency-key <invoiceId>` → record txHash. Duplicate-invoice defense = idempotency key + nonce ledger.
- AR: expose each invoice as an x402 URL (`/invoices/:id/pay`, `gateway.require(amount)` or Facilitator `/settle` with `payment-identifier = invoiceId`) → customer's agent pays → `onAfterSettle` marks paid → reconcile by nonce/date range. Detect plain transfers with `transaction list --tx-type inbound`.
- Buy per-call enrichment/outreach from the marketplace for collections (Apollo sequences, company enrich) on Arc mainnet.
- Traction: invoices processed, DPO/DSO before/after, duplicates caught.

### RFB 3 — Contractor & Vendor Network Manager
- Onboarding: screen the contractor wallet; register it (and the agent) in ERC-8004 IdentityRegistry; add to `recipient-allowlist` (mainnet) or your contract allowlist.
- Milestones: fund `circlefin/arc-escrow` or ERC-8183 job via `wallet execute`; release on verified work; CCTP bridge to contractor's chain if needed.
- Reputation: ReputationRegistry feedback + your payment ledger. Discovery: marketplace company/people enrichment (Orthogonal/Aviato/Apollo on Arc).
- Micro-payouts per day/unit via nanopayments ("paying a contractor forty times a month costs forty cents").

### RFB 4 — Autonomous Business Operator
- Loop: receive revenue (x402 seller or inbound transfers) → `gateway balance` + wallet balance vs obligations → pay invoices within policy → `services pay --max-amount` to buy API credits → move surplus to reserve (bridge/gateway/USYC) → log {action, reason, cost, txHash} → escalate above threshold.
- Authority: Circle policy (mainnet, human-OTP-locked) **and** an onchain PolicyWallet on Arc Testnet (per-category budgets, per-tx approval limit, human co-sign) — RFB explicitly wants limits "in the contract rather than the prompt".
- Skeleton: `circlefin/agent-stack-starter-kits` (approval gate per money-moving command) or `circlefin/arc-x402-circle-wallets` (dev-controlled wallet paying x402 with no human in loop).
- Metrics: decisions made vs escalated, % human-agreed, obligations settled on time.

### RFB 5 — Compliance Intelligence Agent
- Circle gives binary, point-in-time blocks (wallet transfers, Facilitator, marketplace). Build the continuous layer: periodic re-screening (Compliance Engine API if you get access; else third-party screening sold over x402 — none on the marketplace today, so you could *be* that seller), risk tiers that write `wallet limit set` values / allowlists (mainnet) or contract limits (testnet), second-degree exposure from `transaction list` / onchain transfers of counterparties.
- Audit reports: join your decision log with Gateway `searchTransfers` + Facilitator `/status` evidence + tx hashes.
- Sell "RiskTier score" as an x402 endpoint and get listed → other teams' agents pay you (traction + Circle usage).

## Scoring notes

- **Circle tool usage 20%**: one build can legitimately touch Agent Wallets, Nanopayments/Gateway, CCTP, Facilitator Service, Marketplace, Compliance screening, Swap (USDC/EURC), Contracts — name each explicitly in the README.
- **Traction 30%**: the cheapest real-usage lever is being an x402 **seller** others pay (list in the marketplace; offer to other hackathon teams). Test USDC counts; mainnet USDC counts more — Arc mainnet is live for agent wallets, Gateway, Facilitator.
- **Agentic sophistication 30%**: decisioning (when/whether/how much to pay, which rail/chain, escalation) is yours; the stack's wallet-pay decision table (Gateway vs vanilla vs bridge) is a ready-made sub-policy to embed.
- **Innovation 20%**: gaps in the marketplace (sanctions/KYC, invoice OCR, FX quotes on Arc) and the missing testnet policy layer are open niches.
