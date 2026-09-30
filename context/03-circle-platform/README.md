# 03 — Circle developer platform

Purpose: an index of the Circle products that make up the "Circle tool usage" 20% judging criterion (Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, Contracts, USDC and EURC), mapped to the five Tameion RFBs. Agent Stack/CLI/x402 and Arc App Kit are covered in other sections.
Sources: the files below. Each one cites `.firecrawl/docs/circle-llms-full.txt` (Circle docs snapshot 2026-09-28), `.firecrawl/docs/arc-llms-full.txt`, `.firecrawl/tameion.md` and prior research in `arc-agent/docs/wiki/`.
Verified: 2026-09-29

## Files

| File | One-liner |
|---|---|
| [wallets.md](wallets.md) | Dev-controlled, user-controlled and modular wallets: entity secret, SDK methods, transfers, contract exec, EIP-712 signing, webhooks, states, rate limits |
| [paymaster.md](paymaster.md) | Circle Paymaster (permissionless USDC gas; **not on Arc** per current docs) vs Gas Station (sponsored gas; **on Arc**) |
| [cctp.md](cctp.md) | CCTP V2: Arc domain 26, addresses, Iris API, fees, forwarding, hooks |
| [gateway.md](gateway.md) | Unified USDC balance: deposit → burn intent → attestation → `gatewayMint`, fees, addresses |
| [usyc.md](usyc.md) | Tokenized MMF yield: Teller deposit/redeem, Arc addresses, allowlisting (24–48 h ticket) |
| [contracts.md](contracts.md) | Contracts platform (deploy, templates, import, event monitors) and on-chain budget/approval patterns |
| [usdc-eurc.md](usdc-eurc.md) | Addresses, decimals (Arc 18/6 trap), faucets, StableFX / FX options |
| [compliance.md](compliance.md) | Compliance Engine address screening API, magic test addresses, fallbacks |
| [other-apis.md](other-apis.md) | Mint, CPN, Digital Asset Accounts, webhooks, idempotency, Refund Protocol escrow sample |

## Which product for which RFB

| RFB | Core Circle products | How the agent uses them |
|---|---|---|
| **1 Treasury** | Dev-controlled wallets (operating/reserve/payroll wallets), **USYC** (yield), **Gateway** (one balance across chains), CCTP (sweep in), Contracts (event monitors), USDC/EURC | Forecast runway, sweep idle USDC to USYC through the Teller and redeem just in time, keep working capital in Gateway, rebalance across chains |
| **2 AP/AR** | Dev-controlled wallets (wallet per customer for attribution), `transactions.inbound` webhooks, Contracts event monitors, CCTP/Gateway (collect on any chain), EURC and App Kit Swap for EUR invoices, Compliance screening before paying | Match inbound transfers to invoices, schedule payables with idempotent `refId` and `idempotencyKey`, screen payee, pay on the payee's chain |
| **3 Contractor & Vendor** | Wallet per contractor (`createWallets` with `metadata.refId`), Contracts (budget vault or escrow; fork `circlefin/arc-escrow` Refund Protocol), Airdrop template (batch payouts), Compliance screening, CCTP/Gateway for payout chain, CPN (local-fiat payout story) | Onboard vendor → screen → escrow → AI-validate deliverable → release; caps and approval thresholds enforced on-chain |
| **4 Autonomous Business Operator** | Everything above plus Gas Station (agent never handles gas), Contracts vault with `AGENT_ROLE` caps and human `APPROVER_ROLE`, webhooks as the agent's event loop | One agent runs issue/hold/pay: Mint (story only), Gateway+USYC to hold, CCTP/App Kit Send to pay |
| **5 Compliance** | Compliance Engine (embedded + standalone screening, rules, watchlists, freeze), Contracts event logs as an audit trail, Travel Rule surfaces (Mint/CPN) | Screen every counterparty, explain `DENIED` or `REVIEW`, freeze or escalate, produce an evidence log; OpenSanctions fallback |

## Top facts to remember

1. **Arc mainnet went live across Circle products on 2026-09-16.** That covers Wallets, Gas Station, Contracts, CCTP, Gateway, USDC, EURC, StableFX, Mint, CPN and Agent Stack. Chain code is `ARC`, chainId 5042, RPC `https://rpc.mainnet.arc.io`. Testnet is `ARC-TESTNET`, chainId 5042002. Prior July research saying "Arc testnet only" is stale.
2. USDC on Arc is `0x3600000000000000000000000000000000000000` on both networks. The ERC-20 interface uses 6 dp and native gas uses 18 dp over the same balance. Gas is paid in USDC, so there's no native-token funding step.
3. The CCTP/Gateway domain for Arc is **26**. CCTP standard transfers are free, and Arc's attestation takes about 0.5 s, so fast transfer is N/A. Gateway charges 0.5 bps plus a $0.0035 Arc burn gas fee, and transfers take under 500 ms.
4. Dev-controlled wallets have **no policy engine**. Enforce budgets in a Contracts-deployed vault, a modular Address Book module, or app logic. Agent Wallet policies are mainnet-only.
5. **Gated items to request now:** USYC testnet allowlisting (Circle Support ticket with your Arc Testnet address, 24–48 h) and Compliance Engine access (request form). StableFX, Mint, CPN and DAA are institutional, so plan to cite them without running them.

## Doc conflicts / drift found

- The Node SDK page shows `createTransaction({ amounts })`, but the published SDK v10.8.1 types require `amount: string[]`.
- The Paymaster addresses page no longer lists Arc Testnet, although it did in July 2026 per prior research. Treat Circle Paymaster as unavailable on Arc and use Gas Station.
- The Compliance quickstart says a `…9999` suffix triggers the sanctions blocklist, while the testing guide uses `…999999999999`.
- The USYC web2 price and entitlement APIs are documented for Ethereum networks only. For Arc, read the Oracle and Entitlements contracts directly.
