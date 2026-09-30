# arc-commerce
USDC "buy credits" checkout on Arc testnet: users pay USDC from their own browser wallet (wagmi/MetaMask) to a platform-owned Circle dev-controlled wallet; Circle webhooks confirm and credit the user; an admin dashboard manages treasury wallets and moves USDC same-chain (App Kit `send`) or cross-chain (App Kit `bridge`, CCTP v2 Fast).
Sources: https://github.com/circlefin/arc-commerce, refs/circlefin/arc-commerce @ 1a3a5e0, https://docs.arc.io/build/sample-apps/arc-commerce (listed at .firecrawl/docs/arc-llms-full.txt:18867 "USDC credit purchases with developer-controlled wallets and webhook-driven settlement"; card text at :35251 and :35561-35564; page body not in dump)
Verified: 2026-09-29

## 1. What it does
- On first server import of `lib/supabase/server.ts` (:23,:26) two side-effect modules run: create Supabase admin user `admin@admin.com` / `123456` (`lib/supabase/initialize-admin-user.ts:48-101`) and create the platform "Primary wallet" (wallet set `platform-operator` + SCA wallet) stored in `admin_wallets` (`lib/circle/initialize-admin-wallet.ts:60-136`).
- User signs up (Supabase email auth), connects an injected EVM wallet (wagmi), picks credits (1 credit = 1 USDC in UI, `components/wallet/purchase-credits-card.tsx:41`). App fetches the oldest admin wallet address (`app/api/destination-wallet/route.ts:26-31`) and the browser sends ERC-20 `transfer(destination, amount)` (`purchase-credits-card.tsx:149-154`).
- Client then POSTs `{credits, usdcAmount, txHash, chainId, walletAddress, destinationAddress}` to `/api/transactions`, which inserts a `pending` USER/credit row with idempotency key `chainId:txHash` (`app/api/transactions/route.ts:53-113`).
- Settlement: Circle webhook (inbound transfer to the admin Circle wallet) is signature-verified on the RAW body, logged with a sha256 dedupe hash, mapped QUEUED/SENT/PENDING->pending, CONFIRMED->confirmed, COMPLETE->complete, FAILED->failed, matched by `tx_hash`, and on first success calls RPC `increment_credits` (`app/api/circle/webhook/route.ts:40-178,229-289`). In parallel the browser waits for the receipt and PATCHes `/api/transactions/[id]` to `complete`, which also credits (`components/wallet/transaction-confirmation-modal.tsx:81-96`, `app/api/transactions/[id]/route.ts:137-262`).
- Admin (email == `ADMIN_EMAIL`, `app/dashboard/page.tsx:39-43`) sees all transactions (realtime), creates more admin wallets on ARC-TESTNET / AVAX-FUJI / BASE-SEPOLIA (`components/admin-wallets-table/table.tsx:85-89`), reads on-chain USDC balance via viem, and transfers USDC same-chain or cross-chain (`components/admin-wallets-table/transfer-dialog.tsx:120-135`).

## 2. RFB fit
- Primary: RFB2 AP/AR Automation (AR side): accept USDC payments, reconcile on-chain tx hashes against internal orders via webhooks + idempotency keys + event log tables; the admin treasury/bridging piece also touches RFB1.
- Secondary: RFB1 Treasury (multi-wallet, multichain treasury with CCTP bridge via App Kit: `lib/actions/admin-wallets.ts:262-363`); RFB4 (credits = prepaid balance for an agent buying services; server-side App Kit send from a dev-controlled wallet is the agent-pay primitive).
- Missing: no invoices, no AI, no forecasting, no address screening, no spending limits/approvals, no x402. For AR, payment attribution trusts the client (see gotchas) rather than reading the transfer from chain.

## 3. Tech stack + versions
- Next.js `latest` (lock 16.1.6; `proxy.ts` = Next 16 middleware), React ^19 (lock 19.2.4), TypeScript 5, Tailwind 4.1, shadcn/Radix, TanStack Query 5 + Table 8, sonner 2.
- Circle: `@circle-fin/developer-controlled-wallets` ^10.0.1 (lock 10.6.0), `@circle-fin/app-kit` ^1.7.0 (lock 1.7.0), `@circle-fin/adapter-circle-wallets` ^1.3.2 (lock 1.3.2).
- Web3: `wagmi` ^2.19.5 (injected connector only), `viem` ^2.44.4 (lock 2.52.0).
- Supabase `@supabase/ssr` / `@supabase/supabase-js` latest (lock 2.93.3); Supabase CLI + Docker for local.
- Node >=22 (`package.json` engines; `.nvmrc` = 22). npm. `npm run dev` uses `--turbopack`.

## 4. Architecture
- `refs/circlefin/arc-commerce/lib/circle/app-kit-client.ts` - `AppKit` singleton + `createCircleWalletsAdapter({apiKey, entitySecret})`.
- `refs/circlefin/arc-commerce/lib/circle/developer-controlled-wallets-client.ts` - DCW SDK singleton.
- `refs/circlefin/arc-commerce/lib/circle/initialize-admin-wallet.ts` - idempotent boot-time platform wallet creation.
- `refs/circlefin/arc-commerce/lib/actions/admin-wallets.ts` - server actions: create wallet, set status, viem balance read, App Kit `send`, App Kit `bridge` (CCTP), list admin addresses.
- `refs/circlefin/arc-commerce/lib/chains.ts` - chain ids, USDC addresses, Circle USDC token ids, App Kit chain names, public RPCs.
- `refs/circlefin/arc-commerce/lib/wagmi/config.ts` - wagmi config incl. custom Arc Testnet chain object.
- `refs/circlefin/arc-commerce/app/api/circle/webhook/route.ts` - verified webhook -> credit settlement.
- `refs/circlefin/arc-commerce/app/api/transactions/route.ts`, `[id]/route.ts` - record purchase, list with status events, client-side completion PATCH.
- `refs/circlefin/arc-commerce/app/api/wallet-set/route.ts`, `app/api/wallet/route.ts`, `app/api/destination-wallet/route.ts` - internal wallet creation + checkout destination.
- `refs/circlefin/arc-commerce/components/wallet/*` - connect wallet, network switcher, USDC balance, purchase card, confirmation modal. `components/admin-*` - admin tables/dialogs.
- `refs/circlefin/arc-commerce/supabase/migrations/` - unified `transactions` table (USER/ADMIN), `transaction_events`, `transaction_webhook_events` (dedupe_hash unique), `credits` + `increment_credits`, `admin_wallets`, tx-hash validation, RLS (service-role writes).

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Dev-Controlled Wallets | `initiateDeveloperControlledWalletsClient` | `lib/circle/developer-controlled-wallets-client.ts:22` | SDK init |
| Dev-Controlled Wallets | `createWalletSet` | `app/api/wallet-set/route.ts:33` | wallet set for platform / each admin wallet |
| Dev-Controlled Wallets | `createWallets({accountType:"SCA", blockchains:[x]})` | `app/api/wallet/route.ts:45-50` | SCA wallet on requested chain or `CIRCLE_BLOCKCHAIN` |
| App Kit (Send) | `@circle-fin/app-kit` `kit.send` + `adapter-circle-wallets` | `lib/actions/admin-wallets.ts:208-220` | same-chain USDC transfer from a dev-controlled wallet by address (`chain: "Arc_Testnet"` etc.) |
| App Kit (Bridge / CCTP v2) | `kit.bridge({..., config:{transferSpeed:"FAST"}})` | `lib/actions/admin-wallets.ts:306-323` | cross-chain USDC between admin wallets (Arc Testnet <-> Base Sepolia <-> Avalanche Fuji), blocks until done; last step txHash logged |
| Webhooks | REST `GET /v2/notifications/publicKey/{keyId}` + `crypto.createVerify("SHA256")` on raw body | `app/api/circle/webhook/route.ts:180-227,241-253` | verify, dedupe-log, map state, credit user; handles `webhooks.test` (:282) |
| (data) Circle USDC token ids | constants | `lib/chains.ts:50-55` | ARC-TESTNET USDC token id `15dc2b5d-0994-58b0-bf8c-3a0501148ee8` (and Sepolia/Fuji/Base Sepolia); `CIRCLE_USDC_TOKEN_ID` env declared but unused |
Not used: CCTP directly (only via App Kit), Gateway, x402, Smart Contract Platform, Compliance, USYC, StableFX, User-Controlled/Modular Wallets. User payments come from any injected wallet, not a Circle wallet.

## 6. Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `SUPABASE_SECRET_KEY`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_BLOCKCHAIN` (ARC-TESTNET), `CIRCLE_USDC_TOKEN_ID` (unused in code), `ADMIN_EMAIL`. Also read: `NEXT_PUBLIC_VERCEL_URL` (base URL for internal fetches, `lib/circle/initialize-admin-wallet.ts:22-24`).

## 7. How to run
1. `npm install` (Node 22, `nvm use`).
2. DB: `npx supabase start && npx supabase migration up` (Docker) or `npx supabase link --project-ref <ref> && npx supabase db push`.
3. `cp .env.example .env.local`, fill Supabase + Circle keys, `CIRCLE_BLOCKCHAIN=ARC-TESTNET`, `ADMIN_EMAIL=admin@admin.com`.
4. `npm run dev` -> admin user + Primary wallet created automatically on first server request that imports `lib/supabase/server.ts`.
5. `ngrok http 3000`; Circle Console -> Webhooks -> `https://<ngrok>/api/circle/webhook`.
6. Log in as admin (`admin@admin.com` / `123456`) for the admin dashboard; sign up a normal user, add Arc Testnet to MetaMask, get testnet USDC from faucet.circle.com, buy credits.

## 8. Smart contracts
None. Uses canonical USDC ERC-20 transfers only.
Arc testnet facts in code: chain id `5042002` (`lib/chains.ts:25`, `lib/wagmi/config.ts:36`), RPC `https://rpc.testnet.arc.network` (`lib/wagmi/config.ts:40`, `lib/chains.ts:67`), native currency USDC 18 decimals (`lib/wagmi/config.ts:38`), USDC ERC-20 `0x3600000000000000000000000000000000000000` (`lib/chains.ts:47`, `lib/wagmi/usdcAddresses.ts:51`), explorer `https://testnet.arcscan.app/` (`lib/wagmi/config.ts:43`), multicall3 `0xca11bde05977b3631167028862be2a173976ca11` (:47). App Kit chain name `Arc_Testnet` (`lib/chains.ts:59`).

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- Lift App Kit same-chain send from `lib/actions/admin-wallets.ts:208-220` for "agent pays vendor in USDC on Arc" (dev-controlled wallet, no manual ABI encoding).
- Lift App Kit CCTP bridge from `lib/actions/admin-wallets.ts:306-327` for RFB1 treasury rebalancing between Arc and Base/Avalanche testnets.
- Lift raw-body Circle webhook verification + dedupe logging from `app/api/circle/webhook/route.ts:55-90,180-253` (better than arc-escrow's JSON.stringify variant).
- Lift the monotonic status-priority settlement logic (`webhook/route.ts:114-160`) for AR reconciliation.
- Lift `lib/chains.ts` + `lib/wagmi/config.ts:35-50` as the Arc testnet chain definition for wagmi/viem.
- Lift the boot-time idempotent treasury wallet creation pattern (`lib/circle/initialize-admin-wallet.ts:37-180`).

## 11. Limitations / gotchas
- Credit fraud path: `/api/transactions` POST trusts client-supplied `credits`, `usdcAmount`, `txHash` (`app/api/transactions/route.ts:56-72`) and `PATCH /api/transactions/[id]` sets `complete` and calls `increment_credits` after checking only ownership and that the txHash string matches the row (`[id]/route.ts:194-249`). Nothing verifies on chain that the tx exists, went to the admin wallet, or moved that amount - a user can post any 0x string and self-credit. For a real AR flow, read the Transfer log from chain or rely only on the webhook and match amount + destination.
- Server actions in `lib/actions/admin-wallets.ts` (create wallet, change status, send, bridge) have no admin/auth check; admin gating is UI-only (`app/dashboard/page.tsx:39`). `/api/wallet` and `/api/wallet-set` are unauthenticated and create Circle wallets on your key.
- Hardcoded admin credentials `admin@admin.com` / `123456` (`lib/supabase/initialize-admin-user.ts:48-49`); `components/auth-button.tsx:34` also hardcodes the email instead of `ADMIN_EMAIL`.
- UI says 1 credit = 1 USDC (`purchase-credits-card.tsx:41`) but the server stores `exchange_rate` 0.01 (`app/api/transactions/route.ts:89`); confirmation modal labels USDC amount as "credits".
- `lib/wagmi/usdcAddresses.ts:46` lists a different Sepolia USDC (`0xd6c3...`) than `lib/chains.ts:44` (`0x1c7d...`, the canonical one); wagmi config includes mainnets (real USDC addresses) alongside testnets.
- `transferFromAdminWalletCCTP` requires the destination to be another row in `admin_wallets` (`admin-wallets.ts:278-289`); `kit.bridge` blocks the server action until attestation+mint completes.
- Balance read hardcodes 6 decimals via viem `balanceOf` (`admin-wallets.ts:146-155`) - fine for the ERC-20 interface, not for Arc native balance (18 decimals).
- Boot-time init uses internal HTTP fetches to `NEXT_PUBLIC_VERCEL_URL` (prefixed `https://`) or localhost; if the server cannot reach itself the platform wallet is not created (flag prevents retry until restart).
- Testnet only; webhooks required for authoritative status; Supabase email signup limit 2/hour.
