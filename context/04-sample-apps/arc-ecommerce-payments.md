# arc-ecommerce-payments
Storefront on Arc testnet that settles USDC/EURC through the Commerce Payments Protocol (Coinbase/Shopify `AuthCaptureEscrow`): the shopper signs one gasless ERC-3009 authorization, an operator Circle dev-controlled wallet relays `authorize`, and the merchant admin later `capture`s (partial ok), `void`s or `refund`s; shoppers can cancel, request refunds, or `reclaim` after expiry.
Sources: https://github.com/circlefin/arc-ecommerce-payments, refs/circlefin/arc-ecommerce-payments @ be2017d, https://docs.arc.io/build/sample-apps/arc-ecommerce-payments (listed at .firecrawl/docs/arc-llms-full.txt:18875 "Onchain storefront with escrow-based USDC and EURC checkout using the Commerce Payments Protocol"; page body not in dump). Protocol: https://github.com/base/commerce-payments @ 3f77761 (`contracts/README.md:9`).
Verified: 2026-09-29

## 1. What it does
- `npm run setup` (`scripts/setup.ts`) creates a wallet set + 3 EOA dev-controlled wallets on ARC-TESTNET (deployer, operator, merchant), auto-funds the deployer from the Circle faucet API, deploys `AuthCaptureEscrow`, `ERC3009PaymentCollector(escrow, multicall3)` and `OperatorRefundCollector(escrow)` via Smart Contract Platform, seeds the operator with 2 native USDC for gas, and has the operator `approve(maxUint256)` USDC+EURC to the refund collector; writes all ids/addresses into `.env.local` (`scripts/setup.ts:102-383`).
- Shopper browses catalog (`lib/products.ts`), toggles USDC/EURC, connects via RainbowKit (Arc Testnet only, `lib/wagmi.ts:40`). Checkout: `POST /api/checkout/intent` builds `PaymentInfo` (operator, payer, merchant receiver, token, maxAmount, expiries, zero fee, random salt), reads the payer-agnostic nonce `escrow.getHash({...info, payer:0})` from chain, and holds the intent in memory keyed by nonce (`app/api/checkout/intent/route.ts:81-106`, `lib/payments/authorization.ts:45-56`, `lib/payments/intent-store.ts:51-71`).
- Browser signs EIP-712 `ReceiveWithAuthorization{from, to=collector, value, validAfter=0, validBefore=preApprovalExpiry, nonce}` on the token's own domain (USDC name "USDC" v"2", EURC "EURC" v"2") (`lib/payments/authorization.ts:77-96`, `lib/checkout/submit.ts:73-110`).
- `POST /api/checkout/authorize` takes the held intent and the operator wallet submits `escrow.authorize(paymentInfo, maxAmount, collector, signature)` via `createContractExecutionTransaction` with raw `callData`, waits for CONFIRMED, records order `Reserved` + lifecycle event (`app/api/checkout/authorize/route.ts:49-73`, `lib/operator/operations.ts:44-79`, `lib/orders/record.ts:37-89`). Shopper pays no gas.
- Admin (`app_metadata.role === "admin"`) captures (partial -> stays Reserved, full -> Paid), voids, or refunds (refund pulls from the operator's balance through `OperatorRefundCollector`) (`app/api/admin/orders/[id]/{capture,void,refund}/route.ts`). Shopper can cancel (void) a Reserved order before expiry, request a full refund of a Paid order within refundExpiry, or call `escrow.reclaim(paymentInfo)` from their own wallet after authorizationExpiry (`app/api/account/orders/[id]/{cancel,refund}/route.ts`, `components/reclaim-button.tsx:74-79`, `app/api/account/reclaim/route.ts`).
- Supabase Realtime pushes order changes to account/admin pages; an "Under the hood" lifecycle timeline reads `lifecycle_events`.

## 2. RFB fit
- Primary: RFB3 Contractor & Vendor Network Manager - authorize/capture escrow is a better on-chain milestone-escrow primitive than arc-escrow's Refund Protocol: funds held by contract, operator-bounded (cannot redirect funds), partial captures (= milestone releases), void, payer self-reclaim after deadline (no dead funds), refunds with expiry windows. One `PaymentInfo` per engagement; `capture(amount)` per approved milestone.
- Secondary: RFB2 AR (merchant side: order/payment reconciliation keyed by salt, lifecycle event log, SCP event webhooks); RFB4 (operator = agent wallet that sponsors gas and relays signed intents; gasless ERC-3009 pattern); RFB1 (dual-currency USDC/EURC receivables, no FX).
- Missing: no AI decision on capture/refund (admin clicks), no counterparty screening, no reputation, no fees configured (min/max fee bps = 0), no multi-receiver; `charge` (authorize+capture) is declared but not implemented; production expiries are commented as TEST values.

## 3. Tech stack + versions
- Next.js 16.2.7 (App Router, `proxy.ts`, `instrumentation.ts`), React 19.2.4, TypeScript 5, Tailwind 4, shadcn 4.11 / `radix-ui` 1.5, sonner.
- Circle: `@circle-fin/developer-controlled-wallets` ^10.6.0 (lock 10.6.0), `@circle-fin/smart-contract-platform` ^10.6.0 (lock 10.6.0).
- Web3: `viem` ^2.52.2 (uses built-in `arcTestnet` chain), `wagmi` ^2.19.5, `@rainbow-me/rainbowkit` ^2.2.11, TanStack Query 5.
- Supabase `@supabase/ssr` ^0.10.3, `@supabase/supabase-js` ^2.108.0, CLI `supabase` ^2.105.0; `tsx` ^4.22.4 for the setup script.
- Node >=20.9.0 (engines). npm.
- Contracts: solc 0.8.29, evm `cancun`, via_ir, 100000 runs; artifacts prebuilt JSON (no Foundry project in repo).

## 4. Architecture
- `refs/circlefin/arc-ecommerce-payments/scripts/setup.ts` - idempotent wallet provisioning, faucet, SCP deploy, gas seeding, refund allowances.
- `refs/circlefin/arc-ecommerce-payments/contracts/artifacts/*.json` - `{abi, bytecode}` for AuthCaptureEscrow, ERC3009PaymentCollector, OperatorRefundCollector; `contracts/README.md` provenance + Arc (Osaka) compatibility notes.
- `refs/circlefin/arc-ecommerce-payments/lib/contracts/index.ts` - ABIs + env-pinned addresses (single source of truth).
- `refs/circlefin/arc-ecommerce-payments/lib/payments/` - `types.ts` (PaymentInfo), `payment-info.ts` (builder, expiries, (de)serialize), `authorization.ts` (payer-agnostic nonce + EIP-712 typed data), `intent-store.ts` (in-memory intent hold).
- `refs/circlefin/arc-ecommerce-payments/lib/operator/operations.ts` - operator DCW submits authorize/capture/void/refund as raw callData; `lib/operator/config.ts` operator/merchant addresses.
- `refs/circlefin/arc-ecommerce-payments/lib/arc/` - chain constants, token config (USDC/EURC + ERC-3009 ABI/types), shared viem public client, balances hook.
- `refs/circlefin/arc-ecommerce-payments/app/api/checkout/{intent,authorize}` - checkout; `app/api/admin/orders/[id]/*` merchant ops; `app/api/account/*` shopper ops; `app/api/webhooks/payments` SCP event webhook.
- `refs/circlefin/arc-ecommerce-payments/lib/orders/{record,lifecycle}.ts` - order + lifecycle_events persistence (service-role client).
- `refs/circlefin/arc-ecommerce-payments/lib/supabase/{proxy,seed-admin,service,server,client}.ts` + `proxy.ts` - route guard by role claim, admin seeding on boot.
- `refs/circlefin/arc-ecommerce-payments/supabase/migrations/` - `orders`, `lifecycle_events`, realtime.

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Dev-Controlled Wallets | `initiateDeveloperControlledWalletsClient` | `lib/circle/client.ts:37-49`, `scripts/setup.ts:93` | cached SDK client |
| Dev-Controlled Wallets | `createWalletSet`, `createWallets({accountType:"EOA"})`, `getWallet` | `scripts/setup.ts:105,121,126-131` | deployer/operator/merchant EOA wallets on ARC-TESTNET |
| Dev-Controlled Wallets | `createTransaction({tokenId, amount})` + `getTransaction({waitForState:"COMPLETE"})` | `scripts/setup.ts:185-198` | native USDC (gas) transfer deployer -> operator; native tokenId found via `getWalletTokenBalance` `isNative` (:177-182) |
| Dev-Controlled Wallets | `createContractExecutionTransaction({callData})` + `getTransaction({waitForState:"CONFIRMED"})` | `lib/operator/operations.ts:44-62`, `scripts/setup.ts:334-343` | operator submits viem-encoded escrow calls; ERC-20 approve to refund collector |
| Smart Contract Platform | `initiateSmartContractPlatformClient`, `deployContract`, `getContract` | `scripts/setup.ts:92,201-241` | deploy prebuilt artifacts with constructor params, poll status until COMPLETE |
| SCP Event Monitoring | REST `POST /v1/w3s/contracts/event-monitors` (manual curl, README:318-326) | handler `app/api/webhooks/payments/route.ts:116-239` | escrow events (Authorized/Captured/Voided/Reclaimed/Refunded) -> order status by `payment_info->>salt` |
| Faucet | REST `POST /v1/faucet/drips` `{native:true}` | `scripts/setup.ts:149-174` | auto-fund deployer with Arc native USDC |
Not used: App Kit/Bridge/CCTP, Gateway, x402, Compliance, USYC, StableFX, Circle Notifications webhooks, user-controlled/modular wallets (shopper uses any injected wallet).

## 6. Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_ARC_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS`, `NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS`, `DEPLOYER_WALLET_SET_ID`, `DEPLOYER_WALLET_ID`, `OPERATOR_WALLET_ID`, `OPERATOR_ADDRESS`, `MERCHANT_WALLET_ID`, `MERCHANT_ADDRESS`, `WEBHOOK_SECRET` (.env.example). Setup writes all wallet/contract vars.

## 7. How to run
1. Register entity secret in Circle Console; `npm install`; `cp .env.example .env.local`; fill Supabase + Circle keys (+ optional WalletConnect id).
2. Supabase: `npm run db:start` then `npm run db:status` for keys (local), `npm run db:migrate`; or a hosted project. Disable "Confirm email".
3. `npm run setup` (runs `node --env-file=.env.local --import tsx scripts/setup.ts`). If faucet auto-fund fails, fund the printed deployer address at faucet.circle.com and re-run. `npm run setup -- --force` redeploys.
4. `npm run dev` -> http://localhost:3000. Admin auto-seeded by `instrumentation.ts` -> `lib/supabase/seed-admin.ts` (`admin@admin.com` / `123456`, role claim `admin`).
5. Shopper: sign up, add Arc Testnet in wallet, get USDC/EURC at faucet.circle.com, add to cart, checkout (one signature).
6. Optional: `ngrok http 3000` + register SCP event monitor (README:318-326) and uncomment HMAC verification in `app/api/webhooks/payments/route.ts:117-126`. Not required: API routes write order state directly.

## 8. Smart contracts
- `AuthCaptureEscrow` (base/commerce-payments @ 3f77761; no constructor args, deploys its own TokenStore). Functions used: `authorize(paymentInfo, amount, tokenCollector, collectorData)` (`lib/operator/operations.ts:69-79`), `capture(paymentInfo, amount, feeBps=0, feeReceiver=0x0)` (:82-92), `void(paymentInfo)` (:95-104), `refund(paymentInfo, amount, operatorRefundCollector, "0x")` (:119-129), `reclaim(paymentInfo)` (payer-only, from browser, `components/reclaim-button.tsx:74-79`), `getHash(paymentInfo)` (nonce, `lib/payments/authorization.ts:45-56`). `charge` not called.
- `ERC3009PaymentCollector(escrow, multicall3)` - redeems the shopper's `receiveWithAuthorization` into escrow (only the collector can redeem since `to == collector`).
- `OperatorRefundCollector(escrow)` - pulls refund funds from the operator wallet (standing max allowance set in `scripts/setup.ts:308-346`) back to the payer; captured funds already left escrow, so the operator fronts refunds.
- Deployment: `scripts/setup.ts:201-297` via SCP. README's example deployment on Arc testnet: AuthCaptureEscrow `0xa5b4fa1890619cf03b8d6b11e0c680345b1881d8`, ERC3009PaymentCollector `0x01e39d4a0b8ffeac8ae1618dbf316d15a8ee867c` (README:99-100); your own run yields new addresses.
- Arc facts: chain id 5042002 (hex 0x4CEF52), RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`, USDC `0x3600000000000000000000000000000000000000` (6-dec ERC-20; native gas 18-dec), EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (`lib/arc/tokens.ts:37-55`, `lib/arc/chain.ts:32-40`), Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`. ERC-3009 domains: USDC name "USDC" version "2" (not "USD Coin"), EURC "EURC" "2" (`lib/arc/tokens.ts:42-53`). Arc targets Osaka; compile with `cancun`, not `paris` (`contracts/README.md:468-478`).

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- RFB3 milestone escrow: lift `buildPaymentInfo` (`lib/payments/payment-info.ts:110-128`) + `authorize`/`capture`/`void`/`refund` encoders (`lib/operator/operations.ts:44-129`). Map one engagement to one PaymentInfo (receiver = contractor), `capture(milestoneAmount)` when an AI/human check passes (plug arc-escrow's GPT-4o validator in front of `capture`), `void` on cancellation, `reclaim` as the client's automatic safety valve after the deadline.
- Gasless payer signature for any agent-relayed payment: `payerAgnosticNonce` + `buildReceiveAuthTypedData` (`lib/payments/authorization.ts:45-96`) + server-held intent (`lib/payments/intent-store.ts`) so the client cannot change receiver/amount after signing.
- Submitting arbitrary viem-encoded calls from a Circle DCW: `submit()` at `lib/operator/operations.ts:44-62` (callData + waitForState CONFIRMED -> txHash). Reusable for any contract call by an agent wallet.
- One-command bootstrap: `scripts/setup.ts` (wallets, faucet API funding, SCP deploy with polling, native-USDC gas seeding via tokenId `isNative`, env upsert).
- Arc token config incl. correct EIP-712 domains for USDC/EURC: `lib/arc/tokens.ts:37-55`.
- SCP event webhook -> DB state machine keyed by PaymentInfo salt: `app/api/webhooks/payments/route.ts:135-230`.

## 11. Limitations / gotchas
- TEST expiries: preApproval 30 s, authorization 60 s (`lib/payments/payment-info.ts:31-38`, comments say prod 1h / 7d). The shopper must sign within 30 s and can reclaim after 1 min, so the admin must capture within a minute. Change these first.
- Price trust: `/api/checkout/intent` takes `amount` and `items` from the client (`components/checkout/checkout.tsx:147`, `intent/route.ts:65-82`) and does not recompute from the catalog - a shopper can pay any amount. Checkout routes do not require auth; an unauthenticated authorize still moves funds but the order is not persisted (`lib/orders/record.ts:46-50`, fallback random orderId at `authorize/route.ts:71`).
- Shopper self-refund with no merchant approval: `/api/account/orders/[id]/refund` refunds the full captured amount out of the operator's balance whenever status is Paid/Shipped and within 30 days (`route.ts:63-99`).
- SCP webhook signature verification is commented out (`app/api/webhooks/payments/route.ts:117-126`) - anyone can POST fake events to change order status/amounts in the DB (not funds).
- Intent store is an in-memory Map (`lib/payments/intent-store.ts:52`): breaks on serverless/multi-instance and on dev hot reload between intent and authorize.
- README claims all six operations are wired, but `charge` is not implemented in `lib/operator/operations.ts`; `reclaim` is sent from the shopper's wallet (shopper pays gas).
- Operator needs native USDC for gas on every op and must keep USDC/EURC balance for refunds (max allowance to refund collector, `scripts/setup.ts:305-345`). Operator wallets are EOA (not SCA/Gas Station).
- Amount math uses JS floats (`Math.round(amount * 1_000_000)`, capture/refund routes) and DB numerics; `Captured` webhook adds to `captured_amount` even though the API route already did (double counting if SCP monitoring is enabled).
- Hardcoded demo admin `admin@admin.com` / `123456` (`lib/supabase/seed-admin.ts:38-39`). Testnet only. README clone URL points to `akelani-circle/arc-ecommerce-payments`.
