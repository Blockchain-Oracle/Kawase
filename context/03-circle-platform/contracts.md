# Circle Contracts (Smart Contract Platform) + on-chain budget enforcement

Purpose: deploy, import, call and monitor contracts on Arc through Circle APIs, and use this to put an agent's budgets and approval thresholds on-chain.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/contracts*`, `/sdks/contracts-nodejs-sdk`, `/api-reference/contracts*`, `/wallets/dev-controlled`, `/wallets/modular/how-passkeys-and-modules-work`, `/release-notes/wallets-2026`); `.firecrawl/oss/circlefin_arc-escrow.readme.md`; prior `arc-agent/docs/wiki/circle-contracts-and-marketplace.md`, `account-abstraction-and-policy-surface.md`.
Verified: 2026-09-29

## Platform facts

- Chains: Arbitrum, **Arc** (mainnet since 2026-09-16, plus Arc Testnet), Avalanche, Base, Ethereum, Monad, OP, Polygon PoS, Unichain.
- Deploys and writes are signed by a **Circle dev-controlled wallet** (`walletId`), so they need the same API key + entity secret as `wallets.md`.
- SDK: `npm i @circle-fin/smart-contract-platform` → `initiateSmartContractPlatformClient({ apiKey, entitySecret })`. Python: `smart_contract_platform` in the `circle.web3` package.

| Action | SDK | REST (base `https://api.circle.com`) |
|---|---|---|
| Deploy bytecode | `deployContract({ name, walletId, blockchain, abiJson, bytecode, constructorParameters, fee })` | `POST /v1/w3s/contracts/deploy` (+ `/deploy/estimateFee`) |
| Deploy template | `deployContractTemplate({ id, blockchain, name, walletId, templateParameters, fee })` | `POST /v1/w3s/templates/{id}/deploy` (+ `/estimateFee`) |
| Import existing | `importContract({ address, blockchain, name, idempotencyKey })` | `POST /v1/w3s/contracts/import` |
| Read (view) | `queryContract({ address, blockchain, abiFunctionSignature, abiParameters, abiJson? })` | `POST /v1/w3s/contracts/query` |
| Write | wallets SDK `createContractExecutionTransaction` | `POST /v1/w3s/developer/transactions/contractExecution` |
| List/get/update | `listContracts`, `getContract`, `updateContract` | `GET /v1/w3s/contracts[/{id}]`, `PATCH /v1/w3s/contracts/{id}` |
| Event monitor | `createEventMonitor({ blockchain, contractAddress, eventSignature:"Transfer(address,address,uint256)", idempotencyKey })` | `POST/GET /v1/w3s/contracts/monitors`, `PUT/DELETE .../{id}` |
| Event history | `listEventLogs` | `GET /v1/w3s/contracts/events` |

Templates (audited, built-in access control):

| Template | ID |
|---|---|
| ERC-20 Token | `a1b74add-23e0-4712-88d1-6b3009e85a86` |
| ERC-721 NFT | `76b83278-50e2-4006-8b63-5b1a2a814533` |
| ERC-1155 Multi-Token | `aea21da6-0aa2-4971-9a1a-5098842b1248` |
| Airdrop (bulk distribution) | `13e322f2-18dc-4f57-8eed-4bddfc50f85e` |

Airdrop can cover a "batch payroll/contractor payout" demo. There is **no** treasury, escrow or spending-limit template, so budget logic needs custom bytecode.

## Event monitoring

1. Set up a webhook subscription (Console → Webhooks, optionally limited to `contracts.eventLog`).
2. `importContract` first. Otherwise you get error `175001 contract not found`.
3. `createEventMonitor` takes the human-readable signature with no spaces.
4. The notification has `notificationType: "contracts.eventLog"` and the body includes `contractAddress, blockchain, txHash, userOpHash, eventName, topics[], data`. Delivery is at-least-once and unordered, so dedupe on `notificationId`.

Use it to watch your own vault and escrow contracts, incoming USDC `Transfer` events to invoice wallets, and USYC Teller events, all without running an indexer.

## Enforcing budgets and approval thresholds on-chain

Circle's docs say dev-controlled wallets "do not include a built-in policy engine". Pick one of these options. They are ordered by how much you can claim is enforced on-chain.

1. **Budget vault contract. This is the recommended hackathon pattern.** Deploy it with `deployContract` on Arc Testnet. The vault holds the operating USDC. The agent's dev-controlled wallet has an `AGENT_ROLE` that can only call `pay(vendor, amount, category, memo)`. The contract enforces:
   - per-category and per-period caps (`spent[category][epoch] + amount <= budget[category]`),
   - a per-tx `autoApproveLimit`, with larger amounts creating `PendingPayment(id)` that needs `approve(id)` from an `APPROVER_ROLE` (a human's user-controlled or passkey wallet, or a second key),
   - a vendor allowlist (`isApprovedVendor[vendor]`), optionally fed by compliance screening results,
   - `pause()` and revoke for the owner.
   Emit `PaymentExecuted` and `PaymentQueued`, and watch them with Circle event monitors. Use the ERC-20 USDC interface (`0x3600…0000`, 6 dp) consistently. Arc native value has 18 dp and is a separate path, so reject `msg.value` or handle it explicitly. The agent key only has `AGENT_ROLE`, so even a compromised agent can't exceed caps. This is a strong "agentic sophistication with guardrails" story.
2. **Escrow for milestones and contractors.** Circle's sample `circlefin/arc-escrow` (Apache-2.0, Next.js + Supabase + dev-controlled wallets + OpenAI) validates deliverables with AI and settles through an EIP-712 **Refund Protocol** contract deployed through `@circle-fin/smart-contract-platform` on Arc Testnet. Fork it for RFB 3.
3. **Modular wallet (MSCA) plus modules.** Circle's Address Book module `0x0000000d81083B16EA76dfab46B0315B0eDBF3d0` provides an on-chain recipient allowlist for ERC-20/721/1155. You can also write custom ERC-6900 modules. The downside is that the signer is a passkey, so this path isn't unattended.
4. **Third-party session keys on Arc** (from prior research, not Circle): Biconomy Nexus + Rhinestone Smart Sessions was live-proven on Arc Testnet in July 2026, with spending-limit, usage-limit, timeframe and recipient-scoped session keys and revocation. ZeroDev Kernel permissions contracts are also deployed on Arc Testnet but weren't exercised.
5. **Off-chain gates** include app logic, Compliance Engine rules (block, freeze or review), and Agent Wallet policies. Agent Wallet policies are mainnet only and use per-tx, daily, weekly or monthly limits plus allowlists. These are weaker to demo as "on-chain", but they're simple.

Deploy tips: set Solidity `evmVersion` to what Arc supports (check the Arc section). Gas is paid in USDC by the deploying dev wallet, or sponsored if you use an SCA with Gas Station. You can also compile and deploy with Foundry and then `importContract` to get Circle monitoring and Console visibility.
