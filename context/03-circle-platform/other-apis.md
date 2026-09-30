# Other Circle APIs useful for a business-finance agent

Purpose: brief map of Circle products beyond the core stack. They're mostly institutional or permissioned, but they matter for fiat edges, payouts, notifications and escrow.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/circle-mint*`, `/cpn*`, `/digital-asset-accounts*`, `/xreserve*`, `/api-reference/{webhooks,webhook-endpoints,verify-webhook-signatures,idempotent-requests,keys}`, release notes 2026), `.firecrawl/docs/arc-llms-full.txt` (sample apps), `.firecrawl/oss/circlefin_arc-escrow.*`; prior `arc-agent/docs/wiki/circle-contracts-and-marketplace.md`.
Verified: 2026-09-29

| Product | What it does | Access | Arc | Agent relevance |
|---|---|---|---|---|
| **Circle Mint** | Institutional mint and redeem USD↔USDC and EUR↔EURC (wire, SEPA, PIX…), on-chain transfers, payouts to address book, credit line, settlement advance, cross-currency FX, borrowing against cirBTC, CAMT.053 bank-style statements | Business account + onboarding; sandbox `api-sandbox.circle.com`; mTLS optional | Arc mainnet supported since 2026-09-16 | Fiat on/off-ramp for treasury ("Mint to issue" in the Tameion stack mapping). Mention it in the architecture, but you likely can't run it live. |
| **CPN (Circle Payments Network)** | Cross-border payments for FIs and enterprises: Fiat Payouts (quote → USDC on-chain → local fiat), Stablecoin Payins and Payouts, Managed Payments (Circle custodies) | OFI or BFI onboarding; `cpn.circle.com` console | Arc is a settlement chain (Arc Testnet contracts; Arc mainnet added 2026) | "Pay a contractor in local currency" story (RFB 3). Uses EIP-712 signing and Permit2; Arc wallets need no native gas. |
| **Digital Asset Accounts / End-User Onboarding** | Stablecoin-backed business accounts for your customers, with Circle as custodian. Includes wire in and out, deposit addresses, internal transfers with no chain fee, and KYB onboarding APIs | Permissioned (contact sales) | Arc mainnet 2026-09-16 | Embedded "business account" for an agent-run SMB platform |
| **xReserve** | Issue USDC-backed stablecoins on remote chains with reserve attestation | Access unknown | Arc Testnet (domain 26) and Arc mainnet as a source | Not needed |
| **StableFX** | RFQ FX on Arc | Permissioned | Yes | See `usdc-eurc.md` |
| **Gateway Nanopayments / x402 facilitator** | Sub-cent gasless payments | Permissionless | Yes | See the Agent Stack section and `gateway.md` |

## Webhooks / notifications (cross-product)

- **v2** (direct HTTPS POST) is used by Circle Wallets, Contracts, CPN payments, Digital Asset Accounts, Gateway and StableFX. The envelope is `{subscriptionId, notificationId, notificationType, notification, timestamp, version: 2}`. It's signed with ECDSA_SHA_256 using headers `X-Circle-Signature` and `X-Circle-Key-Id`. Fetch the public key from `/v2/notifications/publicKey/{keyId}` (Wallets, Contracts, Gateway and DAA), `/v2/cpn/notifications/publicKey/{keyId}` or `/v2/stablefx/notifications/publicKey/{id}`. Verify against the **raw** body.
- **v1** (Amazon SNS) is used by Circle Mint and End-User Onboarding. You must visit the `SubscribeURL` handshake first, and you dedupe on `MessageId`.
- Delivery is at-least-once and unordered for both versions, so handlers must be idempotent. Webhook logs and resend are in the Console.
- Useful notification types: `transactions.inbound` (AR: payment received), `transactions.outbound`, `contracts.eventLog`, `gateway.deposit.finalized`, `gateway.mint.finalized`, `gateway.mint.forwarded`, and Mint's `payments`, `payouts`, `transfers`, `deposits`.

## Platform conventions

- Auth is `Authorization: Bearer TEST_API_KEY:…` or `LIVE_API_KEY:…`. Testnet and mainnet keys are separate.
- Every POST takes `idempotencyKey` (a UUID), so it's safe to retry. Use a stable key per business action (for example derived from the invoice id) so agent retries never double-pay.
- Circle MCP server (`https://api.circle.com/v1/codegen/mcp`) gives live SDK signatures and addresses, and Circle Skills are at `github.com/circlefin/skills` (use-developer-controlled-wallets, use-gateway, bridge-stablecoin, use-arc, use-smart-contract-platform, use-usdc…). Both are worth installing in your coding agent.
- OpenAPI specs are at `https://developers.circle.com/openapi/{developer-controlled-wallets,user-controlled-wallets,smart-contract-platform,gateway,cctp,compliance,stablefx,cpn-ofi,xreserve}.yaml`.

## Refund Protocol / escrow

- Circle's **Refund Protocol** is an EIP-712 escrow and refund contract pattern used in the `circlefin/arc-escrow` sample (Apache-2.0, updated 2026-06). The flow is: create agreement → depositor funds → the counterparty submits a deliverable → AI (OpenAI) validates it → funds are released or refunded, on Arc Testnet. The stack is Next.js, Supabase, dev-controlled wallets and `@circle-fin/smart-contract-platform`. The upstream code is also at `akelani-circle/workflow-escrow-refund-protocol`.
- Related samples: `circlefin/arc-commerce` (accept USDC with dev-controlled wallets) and `circlefin/arc-nanopayments` (agent pays x402 APIs). See `context/04-sample-apps`.
