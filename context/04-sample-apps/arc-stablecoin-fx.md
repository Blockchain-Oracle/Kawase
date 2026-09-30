# arc-stablecoin-fx
USDC <-> EURC FX swap app on Arc testnet using the App Kit Swap SDK driven by Circle Developer-Controlled Wallets, with a configurable platform fee (bps) routed to an operator wallet.
Sources: https://github.com/circlefin/arc-stablecoin-fx, refs/circlefin/arc-stablecoin-fx @ 779eb1a, https://docs.arc.io/build/sample-apps/arc-stablecoin-fx (listed at .firecrawl/docs/arc-llms-full.txt:18889; page body not in dump)
Verified: 2026-09-29

## 1. What it does
- Email/password sign-up (Supabase Auth). On sign-up the server creates a Circle wallet set + one EOA dev-controlled wallet on ARC-TESTNET per user and stores `circle_wallet_id` / `wallet_address` in `profiles` (`src/app/(auth)/actions.ts:51-90`). If wallet provisioning fails, the Supabase user is deleted (`:84`).
- Dashboard swap panel: pick USDC->EURC or EURC->USDC, type amount; a debounced (350 ms) server action fetches a live quote via `kit.estimateSwap` (`src/components/swap/swap-panel.tsx:115-135`, `src/app/(app)/dashboard/actions.ts:59-89`).
- User sets slippage (10/50/100 bps presets, `src/lib/fx.ts:22`) and an optional min-out ("stop limit", auto-filled from quote minus slippage, `src/lib/fx.ts:41-46`).
- Execute: server action inserts a `pending` row in `swaps`, calls `kit.swap` with `customFee` (platform fee) and `stopLimit`, then marks `confirmed` + tx hash or `failed` + error (`src/app/(app)/dashboard/actions.ts:103-207`).
- Balances cached in `wallet_balances` table, refreshed after each swap, on a manual refresh action, and on Circle `transactions.inbound` webhooks; UI subscribes via Supabase Realtime (`src/components/swap/swap-panel.tsx:95`, `src/components/wallet/header-wallet.tsx:82`).
- History page with sortable/searchable trades table, realtime on page 1, links to `https://testnet.arcscan.app/tx/<hash>` (`src/components/trades/trades-table.tsx:141-174,351`, `src/lib/fx.ts:68`). Empty-balance state links to Circle faucet `https://faucet.circle.com/?address=..&token=..` (`src/lib/fx.ts:61-66`).

## 2. RFB fit
- Primary: RFB1 Intelligent Business Treasury - the only sample that does on-chain stablecoin FX (USDC/EURC) on Arc server-side from a dev-controlled wallet. A treasury agent can call `executeSwap()` to rebalance currency exposure (e.g., hold EURC for EU payables).
- Secondary: RFB2 AP/AR (pay a EUR invoice by swapping USDC->EURC first; webhook-driven balance updates as "payment received" signal); RFB4 Autonomous Operator (agent-owned wallet doing swaps with slippage/stop-limit guardrails; fee-collection pattern for monetizing an agent service).
- Missing for RFB1: no forecasting, no multichain (Arc only), no USYC, no policy/limits beyond per-swap slippage, no AI. Missing for RFB4: no spend limits, no approval flow, no decision log (the `swaps` table is a reasonable starting audit log).

## 3. Tech stack + versions (package.json)
- Next.js 16.2.4 (App Router, server actions, `src/proxy.ts` = Next 16 middleware rename), React 19.2.4, TypeScript 5, Tailwind 4, shadcn 4.5 + @base-ui/react 1.4.1, sonner, lucide-react.
- Circle: `@circle-fin/app-kit` ^1.4.2, `@circle-fin/adapter-circle-wallets` ^1.2.8, `@circle-fin/developer-controlled-wallets` ^10.3.1.
- `viem` ^2.48.4 (dependency, barely used), `zod` ^4.3.6 (env + input validation).
- Supabase: `@supabase/ssr` ^0.10.2, `@supabase/supabase-js` ^2.105.1, CLI `supabase` ^2.95.5 (dev). Docker required for local stack.
- Node 20+ and npm (README:11). No `engines` field. Package manager: npm (package-lock.json).

## 4. Architecture
- `refs/circlefin/arc-stablecoin-fx/src/lib/appkit/swap.ts` - AppKit singleton + Circle Wallets adapter; `estimateSwap()` and `executeSwap()` (with fee, slippage, stop-limit, undeployed-wallet fallback). Core file to lift.
- `refs/circlefin/arc-stablecoin-fx/src/lib/circle/client.ts` - cached `initiateDeveloperControlledWalletsClient`.
- `refs/circlefin/arc-stablecoin-fx/src/lib/circle/wallets.ts` - `createEOAWallet()` (wallet set + EOA wallet) and `getFxBalances()` (token balances filtered to USDC/EURC).
- `refs/circlefin/arc-stablecoin-fx/src/lib/config.ts` - zod-validated server/client env (defaults: `CIRCLE_BLOCKCHAIN=ARC-TESTNET`, `APP_FEE_BPS=25`, `NEXT_PUBLIC_ARC_CHAIN=Arc_Testnet`).
- `refs/circlefin/arc-stablecoin-fx/src/lib/fx.ts` - token list, slippage math, faucet + explorer URLs.
- `refs/circlefin/arc-stablecoin-fx/src/app/(auth)/actions.ts` - signIn / signUp (provisions wallet) / signOut server actions.
- `refs/circlefin/arc-stablecoin-fx/src/app/(app)/dashboard/actions.ts` - `quoteSwap`, `executeSwapAction` server actions (DB lifecycle of swaps).
- `refs/circlefin/arc-stablecoin-fx/src/app/(app)/actions.ts` - `refreshBalances` server action.
- `refs/circlefin/arc-stablecoin-fx/src/app/api/webhooks/circle/route.ts` - Circle notification receiver (HEAD + POST).
- `refs/circlefin/arc-stablecoin-fx/src/components/swap/swap-panel.tsx` - quote/execute UI with realtime balances.
- `refs/circlefin/arc-stablecoin-fx/src/components/trades/trades-table.tsx` - history table.
- `refs/circlefin/arc-stablecoin-fx/src/lib/supabase/{client,server,admin,middleware}.ts` - Supabase helpers; `admin.ts` uses secret key (bypasses RLS).
- `refs/circlefin/arc-stablecoin-fx/supabase/migrations/20260428120000_init.sql` - `profiles`, `swaps` (enum status pending/submitted/confirmed/failed), `wallet_balances`, RLS select-own, realtime publication. `..130000_security_hardening.sql` revokes anon; `..140000_drop_pg_graphql.sql` drops pg_graphql.
- `refs/circlefin/arc-stablecoin-fx/scripts/generate-wallet.ts` - operator script: registers entity secret if needed, creates fee-recipient EOA wallet, writes `APP_FEE_RECIPIENT` to `.env.local`.

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| App Kit (Swap) | `@circle-fin/app-kit` `new AppKit()` | `refs/circlefin/arc-stablecoin-fx/src/lib/appkit/swap.ts:30-33` | Singleton kit instance |
| App Kit adapter | `@circle-fin/adapter-circle-wallets` `createCircleWalletsAdapter({apiKey, entitySecret})` | `src/lib/appkit/swap.ts:35-43` | Lets App Kit sign/submit via Circle dev-controlled wallets (no private keys in app) |
| App Kit Swap chain enum | `SwapChain[NEXT_PUBLIC_ARC_CHAIN]` | `src/lib/appkit/swap.ts:45-54` | Resolves `Arc_Testnet` to SwapChain |
| App Kit Swap quote | `kit.estimateSwap({from:{adapter,chain,address}, tokenIn, tokenOut, amountIn, config:{kitKey}})` | `src/lib/appkit/swap.ts:76-82` | Returns `estimatedOutput.amount`; app derives effective rate |
| App Kit Swap execute + fee | `kit.swap({..., config:{kitKey, slippageBps, stopLimit?, customFee:{percentageBps, recipientAddress}}})` | `src/lib/appkit/swap.ts:111-129` | Executes USDC<->EURC swap on Arc; platform fee skimmed to `APP_FEE_RECIPIENT`; returns `amountOut`, `txHash` |
| App Kit allowance fallback | `config.allowanceStrategy: "approve"` | `src/lib/appkit/swap.ts:134-138` | Retries with on-chain approve if error matches /undeployed wallet/ (SCA can't do EIP-1271 permit until deployed) |
| Dev-Controlled Wallets client | `initiateDeveloperControlledWalletsClient` | `src/lib/circle/client.ts:28-31`; `scripts/generate-wallet.ts:131` | API key + entity secret client |
| Dev-Controlled Wallets | `createWalletSet` + `createWallets({blockchains:[ARC-TESTNET], count:1, accountType:"EOA"})` | `src/lib/circle/wallets.ts:39-50`; `scripts/generate-wallet.ts:135-145` | Per-user wallet on signup; operator fee wallet |
| Dev-Controlled Wallets | `getWalletTokenBalance({id})` | `src/lib/circle/wallets.ts:59-72` | USDC/EURC balances by symbol |
| Entity secret registration | `registerEntitySecretCiphertext({apiKey, entitySecret})` | `scripts/generate-wallet.ts:90-98` | Registers entity secret on first run, writes `circle-recovery.dat` |
| Circle webhooks (notifications) | POST `/api/webhooks/circle`, `transactions.inbound` with state CONFIRMED/COMPLETE | `src/app/api/webhooks/circle/route.ts:26-84` | HEAD returns 200 for Circle's reachability check; inbound tx triggers balance refresh + upsert |
| Circle faucet | `https://faucet.circle.com/` | `src/lib/fx.ts:61-66` | Testnet USDC/EURC link |

Not used: CCTP/Bridge Kit, Gateway, x402, Modular/User-controlled wallets, USYC, StableFX RFQ API, Compliance Engine, Smart Contract Platform.

## 6. Env vars (names only)
From `.env.example` + `src/lib/config.ts:21-36`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` (must be 64 lowercase hex), `CIRCLE_BLOCKCHAIN` (default ARC-TESTNET)
- `CIRCLE_WEBHOOK_SECRET` (optional; code-only, not in .env.example)
- `KIT_KEY`, `NEXT_PUBLIC_ARC_CHAIN` (default Arc_Testnet)
- `APP_FEE_BPS` (0-10000, default 25), `APP_FEE_RECIPIENT` (0x address; filled by `npm run wallet:generate`)

## 7. How to run
Prereqs: Node 20+, npm, Docker, Circle console API key + entity secret, App Kit key (see gotchas re: kit keys being legacy).
```sh
npm install
npm run db:start          # supabase start; applies supabase/migrations
npm run db:status         # copy URL + publishable/secret keys
cp .env.example .env.local  # fill in
npm run wallet:generate   # node --env-file=.env.local scripts/generate-wallet.ts -> APP_FEE_RECIPIENT
npm run dev               # http://localhost:3000
```
Other scripts: `db:stop`, `db:reset`, `build`, `start`, `lint`. Fund the new user's wallet from https://faucet.circle.com (USDC and EURC on Arc Testnet). For webhooks, expose `/api/webhooks/circle` publicly (e.g., ngrok) and register it in the Circle console; the app still works without webhooks (balances refresh after swaps/manual refresh).

## 8. Smart contracts
None. All on-chain actions go through App Kit Swap + Circle wallets. Arc facts in code: explorer `https://testnet.arcscan.app` (`src/lib/fx.ts:68`), Circle blockchain id `ARC-TESTNET`, App Kit chain `Arc_Testnet`. No chain id, RPC or token addresses hardcoded (App Kit resolves USDC/EURC by symbol).

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- Lift `src/lib/appkit/swap.ts:1-168` wholesale as an agent tool `fx_swap(tokenIn, tokenOut, amountIn, slippageBps, minOut)` for a treasury agent (RFB1) - it already runs server-side on a dev-controlled wallet with no user signature.
- Lift `estimateSwap()` (`src/lib/appkit/swap.ts:69-90`) as a read-only `fx_quote` tool so the agent can compare rates before acting / log the rate it saw in a decision log.
- Reuse the `customFee` pattern (`src/lib/appkit/swap.ts:115-118`) to monetize an agent service (take N bps on every agent-executed swap).
- Reuse `stopLimit` + slippage (`src/lib/appkit/swap.ts:113-114`, `src/lib/fx.ts:41-46`) as an agent guardrail: agent may only execute if output >= policy floor.
- Reuse `createEOAWallet()` (`src/lib/circle/wallets.ts:33-57`) for per-business/per-agent wallet provisioning, and `scripts/generate-wallet.ts` as a one-shot "provision operator wallet + register entity secret + write .env" script.
- Reuse the swap lifecycle table (`supabase/migrations/20260428120000_init.sql:41-60`) + pending->confirmed/failed pattern (`dashboard/actions.ts:131-205`) as a decision/execution log.
- Reuse the webhook receiver skeleton (`src/app/api/webhooks/circle/route.ts:26-84`) for AR (RFB2): `transactions.inbound` + CONFIRMED/COMPLETE = invoice paid trigger.

## 11. Limitations / gotchas
- Testnet only (README:82). Only two tokens (USDC, EURC) and only Arc (`src/lib/fx.ts:19`).
- `KIT_KEY`: per Arc docs, kit keys are legacy and new ones cannot be created; new integrations pass a Circle API key as `apiKey` instead of `kitKey` (arc-llms-full.txt:11862-11864; `kitKey` marked deprecated at :10426). The zod schema requires `KIT_KEY` (`src/lib/config.ts:26`) - if you have no kit key, set it to your API key or patch `swap.ts:81,112` to `apiKey`. Verify against the installed `@circle-fin/app-kit` version.
- Webhook auth is a plain `Authorization: Bearer <CIRCLE_WEBHOOK_SECRET>` string compare (`route.ts:45-50`), not Circle's signature verification; Circle notifications do not send that header by default, so setting the secret likely makes every webhook 401. Leaving it unset means the endpoint is unauthenticated (it only triggers a balance re-read, so low impact).
- Webhook only handles `transactions.inbound`; outbound/swap state is never reconciled from Circle (swap status is set synchronously from `kit.swap` result).
- The `submitted` status and `circle_tx_id` column exist in schema but are never written.
- `quoteSwap` computes app fee as `amountIn * bps` in JS floats (`dashboard/actions.ts:77`); `effectiveRate` is quoted output / input with Number math (`swap.ts:85-87`) - display only.
- User wallets are EOA (`wallets.ts:49`), so the undeployed-SCA fallback in `swap.ts:131-139` only matters if you switch to `accountType: "SCA"`; per docs SCA wallets should always use `allowanceStrategy: "approve"` (arc-llms-full.txt:3512-3516).
- Verbose `console.error` of raw App Kit error internals (`swap.ts:143-149`) and request params (`dashboard/actions.ts:110,153`) - fine for demo, noisy in prod.
- `generate-wallet.ts` writes `circle-recovery.dat` into cwd; don't commit it. Refuses to overwrite an existing `APP_FEE_RECIPIENT`.
- No rate limiting on quote server action (fires every keystroke after 350 ms debounce).
