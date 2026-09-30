# arc-nanopayments
A buyer "agent" script pays x402-protected Next.js endpoints in sub-cent USDC on Arc testnet through Circle Gateway Nanopayments (batched, gasless settlement). The same app includes a seller dashboard with realtime payments and cross-chain Gateway withdrawals.
Sources: https://github.com/circlefin/arc-nanopayments, refs/circlefin/arc-nanopayments @ a29f920, https://docs.arc.io/build/sample-apps/arc-nanopayments (listed in `.firecrawl/docs/arc-llms-full.txt:18873`; the page body is not in the dump). Related official docs: `circle-llms-full.txt:63428` (x402 buyer how-to), `:63762` (x402 seller), `:87876` (Gateway Nanopayments SDK ref).
Verified: 2026-09-29

## 1. What it does
- `npm run generate-wallets` creates two raw EOA keys, a **seller** and a **buyer/funder**, and writes them to `.env.local` (`generate-wallets.mts:20-54`). You fund the buyer from faucet.circle.com.
- The seller Next.js app exposes 4 paywalled routes: `/api/premium/quote` ($0.001), `/dataset` ($0.01), `/compute` (POST, $0.0003) and `/agent-task` ($0.03). Each is wrapped by `withGateway()`, which returns `402` + `PAYMENT-REQUIRED`, or verifies and settles via Circle's `BatchFacilitatorClient` (`lib/x402.ts:70-192`).
- `npm run agent` starts `agent.mts`. It generates an **ephemeral wallet**, funds it from the buyer key with native USDC for gas plus ERC-20 USDC, deposits 1 USDC into the Gateway Wallet, then fires one `gateway.pay()` per second round-robin across the 4 endpoints. It auto-redeposits when the Gateway balance drops under 0.5 USDC. An optional `--limit` sets a spending cap that pauses the loop and asks the human for more allowance.
- Each settled payment is inserted into Supabase `payment_events` (`lib/x402.ts:150-157`). The dashboard (`/dashboard`, hardcoded login) shows them in realtime with Supabase postgres_changes (`hooks/use-transactions.ts:63-80`).
- The seller dashboard shows the Gateway balance (`/api/gateway/balance`) and can **withdraw** Gateway funds to Arc testnet or cross-chain to Base Sepolia, Eth Sepolia, Arbitrum Sepolia, OP Sepolia, Fuji or Amoy (`/api/gateway/withdraw`, via `GatewayClient.withdraw`).

## 2. RFB fit
- **Primary: RFB4 Autonomous Business Operator.** This is the best **working** x402-on-Arc buyer-and-seller pair in the refs, and the de-facto code base for RFB4 given that `arc-x402-circle-wallets` is empty. It shows an agent wallet paying per call, auto top-up, and a (client-side) budget with human escalation (`agent.mts:234-254`).
- Secondary: **RFB2** (AP/AR). The seller side (x402 revenue plus the `payment_events` ledger) is an AR/reconciliation primitive. **RFB1**: the Gateway balance and cross-chain withdraw are treasury moves.
- Missing for RFB4:
  - **No LLM at all** (see section 9).
  - The wallet is a raw private key, not a Circle dev-controlled or agent wallet.
  - The spending limit is an in-memory float and not on-chain.
  - There is no decision log for the buyer (only seller-side `payment_events`), no service discovery, no counterparty screening, and no per-vendor budget.

## 3. Tech stack + versions
From `package.json` and the lockfile:
- Next.js `^16.1.6` (locked 16.1.6) App Router with `cacheComponents: true` (`next.config.ts`), React `^19.2.4`, TypeScript `^5.9.3`, Tailwind `^4.2.1`, shadcn/radix.
- **`@circle-fin/x402-batching` `^2.0.4`** (locked 2.0.4), `@x402/core` `^2.6.0`, `@x402/evm` `^2.6.0` (declared; not imported directly), `viem` `^2.47.1` (uses the built-in `arcTestnet` chain).
- `@supabase/supabase-js` `^2.99.0`, `@supabase/ssr` `^0.9.0`. Supabase local Postgres 17 (`supabase/config.toml:52`), API on port 54321.
- Declared but **unused**: `@langchain/core` `^1.1.32`, `@langchain/openai` `^1.2.13`, `deepagents` `^1.8.2`, `zod`.
- Node v22+ (README). The scripts use `node --experimental-transform-types` to run `.mts` directly. Package manager: npm (package-lock.json).

## 4. Architecture
- `refs/circlefin/arc-nanopayments/agent.mts`: the buyer loop. Creates the ephemeral wallet, funds it, deposits to Gateway, runs a 1 tx/s pay loop, auto-redeposits and enforces the `--limit` cap.
- `refs/circlefin/arc-nanopayments/generate-wallets.mts`: generates seller and buyer keys into `.env.local`.
- `refs/circlefin/arc-nanopayments/lib/x402.ts`: **seller x402 middleware** `withGateway(handler, price, endpoint)`. Builds the requirements (`GatewayWalletBatched`), then verifies, settles, records the payment and sets the `PAYMENT-RESPONSE` header.
- `refs/circlefin/arc-nanopayments/app/api/premium/{quote,dataset,compute,agent-task}/route.ts`: the paywalled demo resources, each one line of `withGateway(...)`.
- `refs/circlefin/arc-nanopayments/app/api/gateway/balance/route.ts`: seller Gateway balance via the REST `gateway-api-testnet.circle.com/v1/balances`, plus the on-chain USDC `balanceOf`.
- `refs/circlefin/arc-nanopayments/app/api/gateway/withdraw/route.ts`: seller withdraw via `GatewayClient.withdraw()`, same-chain or cross-chain, with gas pre-checks and a `withdrawals` audit row.
- `refs/circlefin/arc-nanopayments/app/actions.ts`: hardcoded demo login server action (cookie `session=authenticated`).
- `refs/circlefin/arc-nanopayments/proxy.ts`: Next 16 "proxy" (middleware) that gates only `/` and `/dashboard/*`.
- `refs/circlefin/arc-nanopayments/app/dashboard/page.tsx`: payments table. Explorer base is `https://testnet.arcscan.app` (:61).
- `refs/circlefin/arc-nanopayments/components/dashboard/{withdraw-dialog,gateway-balance-dialog,top-bar-gateway-controls}.tsx`: withdraw UI (chain select) and balance badge.
- `refs/circlefin/arc-nanopayments/hooks/use-transactions.ts`, `hooks/use-withdrawals.ts`: Supabase realtime subscriptions.
- `refs/circlefin/arc-nanopayments/lib/supabase/{client,server,proxy}.ts`: Supabase clients. `proxy.ts#updateSession` is boilerplate and never wired in.
- `refs/circlefin/arc-nanopayments/supabase/migrations/20260310000000_create_transactions.sql`: `payment_events` (append-only) and `withdrawals` tables with RLS (public read, service_role write). `..._enable_realtime.sql` adds both to `supabase_realtime`.

## 5. Circle products/SDKs used

| product | package/API | where | what the call does |
|---|---|---|---|
| Gateway Nanopayments: seller facilitator | `BatchFacilitatorClient` from `@circle-fin/x402-batching/server` | `lib/x402.ts:19,30` | Circle-hosted facilitator client; no config or API key needed. |
| x402 paywall (server): 402 challenge | hand-built `paymentRequired` `{x402Version:2, resource, accepts:[requirements]}`, base64 in the `PAYMENT-REQUIRED` header | `lib/x402.ts:45-62` (requirements), `:81-103` (402) | `scheme:"exact"`, `network:"eip155:5042002"`, `asset: USDC 0x3600…`, `amount` in 6-decimal atomic units, `payTo: SELLER_ADDRESS`, `maxTimeoutSeconds: 345600`, `extra:{name:"GatewayWalletBatched",version:"1",verifyingContract: GatewayWallet}`. |
| x402 paywall (server): verify | `facilitator.verify(paymentPayload, requirements)` | `lib/x402.ts:111-124` | Decodes the base64 `payment-signature` header and checks the signed authorization. |
| x402 paywall (server): settle | `facilitator.settle(paymentPayload, requirements)` | `lib/x402.ts:126-142` | Submits to Gateway's batch. Returns `{success, transaction, payer, errorReason}`. |
| x402 client (buyer) | `new GatewayClient({chain:"arcTestnet", privateKey})` from `@circle-fin/x402-batching/client` | `agent.mts:1,159-162` | Buyer client bound to the ephemeral key. |
| Gateway deposit | `gateway.deposit("1")` | `agent.mts:174-182` | Approve plus deposit of USDC into the Gateway Wallet contract on Arc. Returns `depositTxHash`. |
| Gateway balances | `gateway.getBalances()` then `.gateway.available / formattedAvailable`, `.wallet.balance` | `agent.mts:178,203-214`; `withdraw/route.ts:81-102` | Reads the unified Gateway balance and the on-chain wallet balance. |
| x402 pay (client) | `gateway.pay(url, {method, body})` then `result.formattedAmount` | `agent.mts:267-285` | Does the whole x402 round-trip: GET, 402, sign EIP-3009 `GatewayWalletBatched`, retry. |
| Gateway REST balance | `POST https://gateway-api-testnet.circle.com/v1/balances` `{token:"USDC",sources:[{domain:26,depositor}]}` | `app/api/gateway/balance/route.ts:22-23,58-67` | No-auth balance query for the seller (Arc domain 26). |
| Gateway withdraw (same- or cross-chain) | `gateway.withdraw(amount, {chain, recipient})` then `result.mintTxHash` | `app/api/gateway/withdraw/route.ts:72-75,156-161` | Burns from the Gateway balance and mints on the destination chain. Chains come from `GATEWAY_DOMAINS` (:65) and the labels at :27-35. |
| USDC ERC-20 on Arc | viem `writeContract(erc20Abi.transfer)` and `sendTransaction({value})` | `agent.mts:138-155` | Funds the ephemeral wallet: 0.01 native USDC for gas (18 decimals), then `DEPOSIT_AMOUNT` of ERC-20 USDC (6 decimals). |

Not used: dev-controlled, user-controlled or modular wallets; CCTP/Bridge Kit/App Kit; Circle webhooks; the Circle CLI.

## 6. Env vars
From `.env.example` and code:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SELLER_ADDRESS`, `SELLER_PRIVATE_KEY`
- `BUYER_ADDRESS`, `BUYER_PRIVATE_KEY`
- `OPENAI_API_KEY` (documented but never read by any code)
- Agent-only optional overrides, found in code only: `BASE_URL` (default `http://localhost:3000`, `agent.mts:75`) and `DEPOSIT_AMOUNT` (default `"1"`, `agent.mts:76`).

## 7. How to run
```bash
npm install
cp .env.example .env.local
npm run generate-wallets          # writes SELLER_/BUYER_ keys; fund BUYER_ADDRESS at https://faucet.circle.com (Arc Testnet)
npx supabase start && npx supabase migration up     # local (Docker)  OR  npx supabase link --project-ref <ref> && npx supabase db push
npm run dev                       # http://localhost:3000 ; login admin@example.com / 123456
npm run agent                     # or: npm run agent -- --limit 0.5
```
Prerequisites: Node 22+, the Supabase CLI, and Docker for the local path. Paste the Supabase URL and keys from `supabase start` into `.env.local`. The README says to clone `akelani-circle/arc-nanopayments-demo`; that is a stale URL, and the repo is `circlefin/arc-nanopayments`. Seller withdrawals need the seller EOA to hold native gas on the source chain and, for cross-chain, on the destination chain (`withdraw/route.ts:79-134`).

## 8. Smart contracts
There are no contracts in the repo. It uses Circle's deployed contracts on Arc testnet (hardcoded in `lib/x402.ts:24-26`, `agent.mts:72-73`, `balance/route.ts:22-25`):
- Chain: Arc Testnet, chain id 5042002, CAIP-2 `eip155:5042002`, Gateway/CCTP domain `26`.
- RPC: `https://rpc.testnet.arc.network`. Note that the `use-arc` skill lists `https://rpc.testnet.arc.io`.
- USDC: `0x3600000000000000000000000000000000000000`. The ERC-20 view has 6 decimals; native gas is the same USDC with 18 decimals (`agent.mts:77-78` uses `parseEther("0.01")` for gas).
- Gateway Wallet (the EIP-712 `verifyingContract` for `GatewayWalletBatched`): `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.
- Explorer: `https://testnet.arcscan.app` (`app/dashboard/page.tsx:61`) and `https://testnet.arcscan.io/tx/` (`components/dashboard/withdraw-dialog.tsx:44`), which is inconsistent.

## 9. AI/LLM usage
**None, despite the README.** The README says it uses "a LangChain agent… with Deep Agents" and an LLM mode when `OPENAI_API_KEY` is set, with "mock mode" otherwise. In this commit `agent.mts` is a deterministic `setInterval` loop. `grep` finds no import of `langchain`, `deepagents` or `openai` anywhere in the source. The README's custom-query example (`npm run agent -- "Buy me a quote at …"`) is silently ignored, because only `--limit` is parsed (`agent.mts:15-32`). If you need an LLM agent that decides what to buy, wrap `gateway.pay` as a tool yourself, or use `agent-stack-starter-kits`.

## 10. Reusable for a hackathon entry
- **x402 paywall for any Next.js route:** lift `lib/x402.ts:45-192` (`withGateway`) and wrap a handler with `export const GET = withGateway(handler, "$0.01", "/api/x")`. Use it to sell your agent's own services (reports, risk scores, compliance checks) over x402 on Arc.
- **x402 client pay:** `agent.mts:159-162` + `:267-268`, i.e. `new GatewayClient({chain:"arcTestnet", privateKey}).pay(url, {method, body})`. It fits as a single LLM tool, `pay_for_resource(url)`.
- **Gateway deposit / auto top-up:** `agent.mts:174-221`, a balance watcher that redeposits below a threshold. Good for RFB1/RFB4 "keep the operating float funded".
- **Client-side budget with human escalation (RFB4 approval limit):** `agent.mts:34-61,234-254,282-284`. It pauses on the limit, drains in-flight payments, prompts for more allowance and resumes. Swap the readline prompt for a Slack or UI approval and persist the spend.
- **Per-agent ephemeral wallets from a funder:** `agent.mts:91-155`, including the nonce-collision retry (`:116-134`) for many concurrent agents funding from one key. On Arc, fund gas and USDC from the same asset.
- **Cross-chain treasury withdraw:** `app/api/gateway/withdraw/route.ts:72-177`. Moves Gateway USDC to any supported testnet with gas pre-checks and a pending, confirmed or failed audit row.
- **Payment ledger with realtime UI:** the `payment_events` schema (migration) plus `hooks/use-transactions.ts:34-80` gives you a decision/payment log for free.
- **Gateway balance without keys:** `app/api/gateway/balance/route.ts:58-107` (REST, domain 26).
- To upgrade the buyer to a **Circle dev-controlled wallet**, replace the `GatewayClient({privateKey})` signer with `BatchEvmScheme` + `circleClient.signTypedData` (see the `arc-x402-circle-wallets.md` card and `circle-llms-full.txt:64183-64260`).

## 11. Limitations / gotchas
- **Security: `/api/gateway/withdraw` has no auth.** `proxy.ts:38-40` only matches `/` and `/dashboard/*`, so anyone who can reach the server can POST `{amount, destinationChain, destinationAddress}` and drain the seller's Gateway balance to any address (`withdraw/route.ts:42-161`). The dashboard login is also hardcoded as `admin@example.com` / `123456` with a static cookie value (`app/actions.ts:24-42`). Add real auth before any public deploy.
- The README overstates it: there is no LangChain/OpenAI agent (section 9), and the clone URL is stale.
- **Raw private keys** in `.env.local` for the seller, the buyer and each ephemeral agent. The ephemeral key only lives in memory, so any USDC left in the ephemeral wallet or its Gateway balance is **stranded** when the process exits (there's no sweep back to the funder).
- The spending limit is an in-memory JS float, checked **after** payment (`agent.mts:272-284`). With a 1/s interval and concurrent in-flight calls it can overshoot, and it resets on restart. It is not an on-chain policy.
- Hardcoded Arc testnet addresses and network (`lib/x402.ts:24-26`). The code comment admits the requirements are "manually construct[ed]" (`:67-68`) instead of using the SDK's `createGatewayMiddleware`. Prices are float-parsed and rounded (`:47`).
- `settle()` runs **before** the handler, so a handler error after a successful settle has still charged the buyer (`lib/x402.ts:126-168`). There is no idempotency or replay store.
- Gateway on-chain settlement is batched and delayed. `gateway_tx` in `payment_events` is the Gateway transfer id/tx, not necessarily a mined Arc tx at insert time.
- Withdraw pre-check error messages mention "testnet ETH", but on Arc the gas is USDC (`withdraw/route.ts:88`).
- `lib/supabase/proxy.ts` (`updateSession`) is dead code that redirects to a nonexistent `/auth/login`.
- The explorer URL (`arcscan.app` vs `arcscan.io`) and RPC domain (`arc.network` vs `arc.io` in the skills) are inconsistent across Circle sources. Verify them before hardcoding.
- Testnet only. It is a single initial commit (2026-04-04) and may lag newer `@circle-fin/x402-batching` releases (the lockfile pins 2.0.4).
