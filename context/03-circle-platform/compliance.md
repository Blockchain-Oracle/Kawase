# Compliance: Circle Compliance Engine, address screening, sanctions

Purpose: how an agent screens counterparties before paying and what Circle's compliance tools can and can't do. Relevant to RFB 5 Compliance and to the "screen vendor address before paying" step in RFB 2 and RFB 3.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/wallets/compliance-engine`, `/tx-screening`, `/tx-screening-quickstart`, `/tx-screening-rule-management`, `/tx-screening-testing`, `/tx-screening-alert-management`, `/api-reference/wallets/compliance/screen-address`, `/wallets/compliance-requirements`, `/circle-mint/references/travel-rule-compliance`, `/cpn/references/compliance/*`, Agent Stack pages); `.firecrawl/oss/opensanctions_yente.meta`; prior `arc-agent/docs/wiki/circle-contracts-and-marketplace.md`.
Verified: 2026-09-29

## Access caveat (read first)

Circle's docs say: "Compliance Engine on both testnet and mainnet is only available for **eligible customers**." You request access through the form at https://www.circle.com/wallets/compliance-engine/#get-in-touch. Make the request early. Without access, use the fallbacks listed further down.

## Compliance Engine: transaction screening

- It does real-time risk checks on transactions and addresses for sanctions, terrorist financing, CSAM, illicit behavior, gambling and high-risk industries, using third-party vendor data.
- Two modes:
  - **Embedded:** every Circle Wallets transaction is screened automatically. The result appears as `transactionScreeningEvaluation` on `GET /v1/w3s/transactions/{id}` and in webhooks. A restrictive rule stops broadcast, and the transaction ends in state `DENIED`.
  - **Standalone:** you screen any address yourself, with no transaction needed.
- Rules can be **Restrictive**, which block or freeze, or **Alert-only**. Each rule is built from Risk Category × Risk Score (Blocklist, Severe, High, …) × Risk Type (Ownership, Counterparty, Indirect).
- Mandatory rules are Circle's Sanctions Blocklist, Your blocklist, Your allowlist and Frozen. You maintain watchlists (allowlist and blocklist) in the Console.
- Actions are `DENY`, `REVIEW` and `FREEZE_WALLET`. The Console's Compliance Engine → Alerts page lets you freeze a wallet, add an address to the blocklist and close alerts. Detailed logs can be exported.

### Standalone address screening API

```
POST https://api.circle.com/v1/w3s/compliance/screening/addresses
Authorization: Bearer <API_KEY>
{ "idempotencyKey": "<uuid>", "address": "0x…", "chain": "ARC-TESTNET" }   // chain = Circle Wallets chain code
```
Response:
```json
{ "result": "DENIED",                       // or "APPROVED"
  "decision": { "ruleName": "Circle's Sanctions Blocklist",
    "actions": ["FREEZE_WALLET","DENY","REVIEW"],
    "reasons": [{ "source":"ADDRESS","sourceValue":"0x…","riskScore":"BLOCKLIST",
                  "riskCategories":["SANCTIONS"],"type":"OWNERSHIP" }],
    "screeningDate": "2025-03-29T01:59:02Z" },
  "address": "0x…", "chain": "ETH-SEPOLIA" }
```
The documented example uses `ETH-SEPOLIA`. Screening is supported on Circle Wallets' supported blockchains, and Arc is one of them, but Arc screening coverage hasn't been verified live. The "detailed vendor response" is populated on testnet only for the magic test cases below. The Node SDK exports screening types (`TransactionScreeningDecision`, `RiskCategory`, `RiskScore`, `RiskType`, `RiskAction`) but no standalone screening method was found in `@circle-fin/developer-controlled-wallets@10.8.1`, so call REST.

### Testnet magic address suffixes (default testnet rules, 9 total)

| Address ends with | Rule | Result |
|---|---|---|
| `999999999999` | Circle's Sanctions Blocklist | DENIED |
| `999999998888` | Frozen User Wallet | DENIED |
| `999999997777` | Your blocklist | DENIED |
| `999999998999` | Severe Sanctions Risk (Owner) | DENIED |
| `999999998899` | Severe Terrorist Financing Risk (Owner) | DENIED |
| `999999998889` | Severe CSAM Risk (Owner) | DENIED |
| `999999997779` | Severe Illicit Behavior Risk (Owner) | DENIED |
| `999999997666` | High Illicit Behavior Risk (Owner) | APPROVED (alert) |
| `999999997766` | High Gambling Risk (Owner) | APPROVED (alert) |

The quickstart says a `…9999` suffix triggers the sanctions blocklist, while the testing guide uses the 12-digit suffixes above. Use the 12-digit ones. You can generate vanity addresses at vanity-eth.tk. This makes a clean demo: the agent is asked to pay a "sanctioned" vendor and refuses, with the reason logged.

## Other Circle compliance surfaces

- **Agent Wallets** (Agent Stack/CLI) are documented as screening all transfers against sanctions controls before submission. That covers Agent Wallets only; see the Agent Stack section.
- **Travel Rule:** Circle Mint and CPN carry originator and beneficiary data (CPN encrypts beneficiary data and uses RFIs, RFI levels and supported-country lists). These are institutional only.
- **Wallets compliance requirements** (`/wallets/compliance-requirements`): if your platform holds assets on behalf of end users, licensing may apply.
- **USDC issuer controls:** USDC and EURC contracts can blacklist addresses. Blacklisted addresses can't send or receive, and that's one more thing to check (`isBlacklisted(address)` on FiatToken; confirm the ABI on Arc).
- **CCTP expanded assets** have denylist layers (`/cctp/expanded-assets/concepts/denylist-layers`) for non-USDC tokens.

## Fallbacks if Compliance Engine access isn't granted

- **OpenSanctions yente** (MIT, self-hostable API for entity search and bulk matching; https://yente.followthemoney.tech/) can screen vendor legal names and countries. Its crypto-address coverage comes from OpenSanctions datasets (for example OFAC SDN digital-currency addresses).
- OFAC SDN list digital-currency address fields can be parsed into an on-chain or off-chain blocklist. You can feed that into the budget vault's `isApprovedVendor` (see `contracts.md`).
- An agent pattern for RFB 5 would do KYB on the vendor's name, screen the address (Circle API or fallback), check the jurisdiction, and record the decision with its evidence in an immutable log (for example an Arc event), with a human review queue for `REVIEW`.
