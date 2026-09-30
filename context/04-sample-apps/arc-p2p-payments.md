# arc-p2p-payments
Mobile-style P2P USDC payments app on Arc testnet: Circle Modular Wallets (ERC-4337 smart accounts) owned by a WebAuthn passkey, gasless via Circle paymaster, with Supabase phone-OTP auth and Circle webhooks for tx history.
Sources: https://github.com/circlefin/arc-p2p-payments, refs/circlefin/arc-p2p-payments @ 1698907, https://docs.arc.io/build/sample-apps/arc-p2p-payments (listed at .firecrawl/docs/arc-llms-full.txt:18869; page body not in dump)
Verified: 2026-09-29

## 1. What it does
- Sign in with phone number + SMS OTP (Supabase Auth; `app/(auth-pages)/sign-in/page.tsx:67`, verify at `app/(auth-pages)/code-confirmation/page.tsx:84`). Local test numbers/OTPs in `supabase/config.toml:181-183`.
- First login -> onboarding inserts a `profiles` row (`app/(auth-pages)/onboarding/page.tsx:52-58`) -> dashboard redirects to `/dashboard/setup-wallet?username=<uuid>` if no wallet (`app/dashboard/page.tsx:63`).
- Passkey setup: browser registers a WebAuthn credential through Circle's passkey RP (`toWebAuthnCredential`, Register mode), derives the Circle smart account address, POSTs credential JSON + address to `/api/setup-wallets` which stores it in `wallets` (`components/passkey-setup.tsx:57-129`, `app/api/setup-wallets/route.ts:22-185`).
- On every load, `Web3Provider` fetches the stored credential (`/api/get-credential`), rebuilds the smart account + bundler client, and reads native + ERC-20 USDC balances (`components/web3-provider.tsx:139-446`).
- Send: pick recipient (address/search), enter amount on virtual keyboard, confirm address dialog, then `sendUSDC` submits a sponsored UserOperation (`paymaster: true`) - user pays no gas (`components/wallet-tab.tsx:74-106`, `components/web3-provider.tsx:515-553`).
- History: Circle `buidl/transfers` API proxied at `/api/wallet/transactions` (`app/api/wallet/transactions/route.ts:58-80`), detail page at `/dashboard/transaction/[id]`; Circle modular-wallet webhooks write `transactions` rows and refresh balances (`app/api/webhooks/circle/route.ts:271-426`). Supabase Realtime enabled on `transactions` and `wallets` (migrations `20241113101530_*`, `20241122161303_*`).

## 2. RFB fit
- Primary: RFB4 Autonomous Business Operator (partial) - demonstrates a gasless smart-account wallet on Arc that holds USDC and sends via UserOperations; the batching/paymaster pattern is what an agent wallet would use. But signing requires a human passkey (browser WebAuthn), so it's the "human approval" leg, not the autonomous leg.
- Secondary: RFB2 AP/AR (payment sending + webhook-based inbound/outbound reconciliation into a `transactions` table); RFB3 (pay contractors P2P); RFB4 escalation (use passkey signature as the "human approves above limit" step).
- Missing: no on-chain spending policy/limits (Circle modular wallets support modules but none are installed here), no server-side/agent signer, no screening, no AI (openai dep is unused), no escrow.

## 3. Tech stack + versions (package.json)
- Next.js `latest` (unpinned! uses `proxy.ts`, so Next 16+), React 19.2.4, TypeScript 5.9.3, Tailwind 4.2.1, Radix UI + shadcn, next-themes, sonner, input-otp, react-confetti.
- Circle: `@circle-fin/modular-wallets-core` ^1.0.13 (used), `@circle-fin/user-controlled-wallets` ^10.1.0 (unused), `@circle-fin/smart-contract-platform` ^10.1.0 (unused).
- Chain: `viem` ^2.46.3 (account-abstraction: `toWebAuthnAccount`, `createBundlerClient`), `web3` ^4.16.0 (unused), `@ethersproject/abi` ^5.8.0.
- Supabase: `@supabase/ssr` latest, `@supabase/supabase-js` latest, CLI `supabase` ^2.76.15.
- Unused leftovers: `openai` ^6.25.0, `pdf-parse`, `pdfjs-dist`, `mammoth` (next.config.js:31 externalizes pdf-parse; `lib/utils/assistant-config.ts:19-23` reads `OPENAI_ASSISTANT_ID` but nothing imports it).
- `axios` is imported (`app/api/wallet/balance/route.ts:20`) but NOT declared in package.json (transitive only).
- Node v22+ (README). npm. Replit config present (`.replit`, `replit.nix`).

## 4. Architecture
- `refs/circlefin/arc-p2p-payments/components/web3-provider.tsx` - core: Arc chain def, passkey transport, Circle smart account, bundler client w/ Arc fee floor, `sendUSDC`, `sendTransaction`, `signMessage`, `signTypedData`, balances.
- `refs/circlefin/arc-p2p-payments/components/passkey-setup.tsx` - passkey registration + address derivation + persist.
- `refs/circlefin/arc-p2p-payments/components/wallet-tab.tsx` - send form; `components/recipient-search.input.tsx` - recipient lookup/address validation; `components/ui/address-validation-dialog.tsx` - confirm dialog.
- `refs/circlefin/arc-p2p-payments/components/transactions.tsx`, `transactions-tab.tsx`, `balance-tab.tsx`, `hooks/use-wallet-balances.ts`, `contexts/balanceContext.tsx` - history/balance UI.
- `refs/circlefin/arc-p2p-payments/app/api/setup-wallets/route.ts` - stores passkey credential + SCA address in `wallets`.
- `refs/circlefin/arc-p2p-payments/app/api/get-credential/route.ts` / `update-login-credential/route.ts` - read/update stored credential.
- `refs/circlefin/arc-p2p-payments/app/api/wallet/balance/route.ts` - Circle `buidl` balances API -> caches `wallets.balance`.
- `refs/circlefin/arc-p2p-payments/app/api/wallet/transactions/route.ts` and `[id]/route.ts` - Circle `buidl/transfers` list/detail + receipt fallback.
- `refs/circlefin/arc-p2p-payments/app/api/webhooks/circle/route.ts` - signature-verified Circle webhook handler for `transfers`, `modularWallet.inboundTransfer|outboundTransfer|userOperation`.
- `refs/circlefin/arc-p2p-payments/app/api/wallet-set/route.ts`, `app/auth/callback/route.ts`, `app/api/manual-wallet-setup/route.ts`, `app/api/debug-wallets/route.ts` - legacy/debug (see gotchas).
- `refs/circlefin/arc-p2p-payments/proxy.ts` - Next 16 middleware: CORS for localhost + a Replit host, redirect unauthenticated `/dashboard` to `/sign-in`.
- `refs/circlefin/arc-p2p-payments/supabase/migrations/*` - `profiles`, `wallets` (+ `passkey_credential`, `wallet_address`, `blockchain`, `account_type`), `transactions` (+ `network_id`, `network_name`, `circle_contract_address`); RLS disabled (`20241112173214_remove_rsl_policies_for_development.sql:18-20`).

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Modular Wallets - passkey transport | `toPasskeyTransport(clientUrl, clientKey)` | `refs/circlefin/arc-p2p-payments/components/web3-provider.tsx:155`; `components/passkey-setup.tsx:53-55` | Circle-hosted WebAuthn RP transport |
| Modular Wallets - passkey register/login | `toWebAuthnCredential({transport, mode: WebAuthnMode.Register, username})` / `Login` | `components/web3-provider.tsx:339-343, 378-381`; `components/passkey-setup.tsx:68-72` | Creates/loads P256 passkey credential |
| Modular Wallets - RPC transport | `toModularTransport(`${clientUrl}/arcTestnet`, clientKey)` | `components/web3-provider.tsx:195-198`; `components/passkey-setup.tsx:82-85` | Circle bundler/RPC endpoint for Arc Testnet |
| Modular Wallets - smart account | `toCircleSmartAccount({client: publicClient, owner: toWebAuthnAccount({credential})})` | `components/web3-provider.tsx:207-215`; `components/passkey-setup.tsx:77-97` | Counterfactual Circle SCA owned by passkey; `.address` is the user wallet |
| Modular Wallets - bundler + gas | viem `createBundlerClient({account, chain: arcTestnet, transport, userOperation.estimateFeesPerGas})` | `components/web3-provider.tsx:218-249` | Calls `pimlico_getUserOperationGasPrice`, enforces 1 gwei min priority fee; fallback baseFee*2+1gwei (default base 48 gwei) |
| Modular Wallets - gasless USDC transfer | `bundlerClient.sendUserOperation({calls:[encodeTransfer(to, USDC, amount)], paymaster: true})` + `waitForUserOperationReceipt` | `components/web3-provider.tsx:526-540` | Sponsored ERC-20 USDC transfer (6 decimals) |
| Modular Wallets - gasless native send | `sendUserOperation({calls:[{to, value, data:'0x'}], paymaster:true})` | `components/web3-provider.tsx:487-499` | Native USDC (18 decimals) transfer |
| Modular Wallets - signing | `smartAccount.signMessage` / `signTypedData` | `components/web3-provider.tsx:561-595` | ERC-1271 signatures from passkey account |
| Circle Wallets "buidl" API | `GET https://api.circle.com/v1/w3s/buidl/wallets/ARC-TESTNET/{address}/balances` | `app/api/wallet/balance/route.ts:86-95` | Token balances by address (Bearer CIRCLE_API_KEY) |
| Circle Wallets "buidl" API | `GET /v1/w3s/buidl/transfers?walletAddresses=&blockchain=ARC-TESTNET&pageSize=` | `app/api/wallet/transactions/route.ts:59-80` | Transfer history for modular wallet |
| Circle Wallets "buidl" API | `GET /v1/w3s/buidl/transfers/{id}`, `/v1/w3s/buidl/transactions/ARC-TESTNET/{id}/receipt` | `app/api/wallet/transactions/[id]/route.ts:143-150, 310-317` | Transfer detail / receipt fallback |
| Circle webhooks + signature verify | `x-circle-signature`, `x-circle-key-id`; `GET https://api.circle.com/v2/notifications/publicKey/{keyId}`; ECDSA SHA256 verify | `app/api/webhooks/circle/route.ts:429-512` | Verifies notification authenticity before processing |
| Circle webhooks - handlers | `transfers`, `modularWallet.userOperation`, `modularWallet.inboundTransfer/outboundTransfer` | `app/api/webhooks/circle/route.ts:271-426` | Upserts `transactions` rows (idempotent on txHash+wallet), refreshes balance on COMPLETE |
| Dev-Controlled Wallets (dead code) | `circleDeveloperSdk.createWalletSet` from missing `@/lib/utils/developer-controlled-wallets-client` | `app/api/wallet-set/route.ts:20,33` | Broken import - file does not exist |

## 6. Env vars (names only)
`.env.example` + `environment.d.ts` + code:
- `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL` (used as `baseUrl` for internal fetches; defaults to http://localhost:3000)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CIRCLE_API_KEY` (server: buidl APIs, webhook public key), `CIRCLE_ENTITY_SECRET` (only required because `next.config.js:19-27` throws if missing; not otherwise used)
- `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` (Modular Wallets client key), `NEXT_PUBLIC_CIRCLE_CLIENT_URL` (README value: modular-sdk.circle.com `/v1/rpc/w3s/buidl`)
- `OPENAI_ASSISTANT_ID` (dead code, `lib/utils/assistant-config.ts:22`)

## 7. How to run
Prereqs: Node 22+, Supabase CLI, Docker (local path), Circle console: API key, entity secret (just to satisfy next.config), and a Modular Wallets Client Key with the app's domain (localhost) allowed for passkeys.
```sh
npm install
cp .env.example .env.local           # fill values
npx supabase start && npx supabase migration up     # local
# or: npx supabase link --project-ref <ref> && npx supabase db push   # cloud
npm run dev                          # http://localhost:3000
```
Scripts: `dev`, `build`, `start` only. Local test logins: phone `+14152127777` / OTP `123456`, `+14152128888` / `654321`. Fund the SCA address from https://faucet.circle.com (Arc Testnet USDC). Webhooks: register `<public-url>/api/webhooks/circle` in Circle console (needs ngrok or deploy); history via `/api/wallet/transactions` works without webhooks.

## 8. Smart contracts
None deployed by the app. Uses Circle's modular smart account (ERC-4337) and Arc USDC.
Arc testnet facts in code (`components/web3-provider.tsx:40-64`): chain id `5042002`, RPC `https://rpc.testnet.arc.network`, native currency USDC 18 decimals, explorer `https://testnet.arcscan.app`, USDC ERC-20 `0x3600000000000000000000000000000000000000` with 6 decimals. Circle blockchain id `ARC-TESTNET` (`app/api/wallet/transactions/route.ts:24`). Modular transport path suffix `/arcTestnet`.

## 9. AI/LLM usage
None. `openai`, `pdf-parse`, `pdfjs-dist`, `mammoth` are declared but not imported; `lib/utils/assistant-config.ts` is an orphan stub for an OpenAI Assistant id.

## 10. Reusable for a hackathon entry
- Lift the Arc `defineChain` block (`components/web3-provider.tsx:40-64`) for any viem client on Arc testnet.
- Lift the smart account + bundler setup (`components/web3-provider.tsx:195-249`) including the Arc-specific `estimateFeesPerGas` override (1 gwei min priority fee) - this is the non-obvious part that makes UserOps land on Arc.
- Lift `sendUSDC` (`components/web3-provider.tsx:515-553`) for gasless USDC payouts: `calls` is an array, so batch multiple `encodeTransfer`s into one UserOp for payroll/vendor batch pay (RFB2/RFB3).
- Use the passkey flow as the human-approval/escalation step of an agent (RFB4): agent drafts payment, human taps passkey to sign the UserOp above a threshold.
- Lift webhook signature verification (`app/api/webhooks/circle/route.ts:429-474`) for any Circle notification endpoint - it's the only verified-webhook implementation in this batch of samples.
- Lift the idempotent webhook -> ledger upsert (`app/api/webhooks/circle/route.ts:191-268`) for AR reconciliation.
- Lift `/api/wallet/transactions` (`app/api/wallet/transactions/route.ts:58-159`) to pull transfer history by address from Circle for reconciliation without running an indexer.

## 11. Limitations / gotchas
- Testnet only; README title still says "Arc Fintech Starter App"; clone URL in README points to a personal fork (`akelani-circle/arc-p2p-payments`).
- Security: RLS disabled on all tables (`supabase/migrations/20241112173214_*.sql:18-20`) and webhook/balance routes use the anon key, so any client can read/write every profile/wallet/transaction row. `/api/debug-wallets` dumps all profiles and wallets to any logged-in user; `/api/manual-wallet-setup` lets anyone overwrite a user's wallet address by email (no auth) and defaults to `0x1234...7890`.
- `/api/wallet/balance` is unauthenticated and uses server `CIRCLE_API_KEY`.
- `registerPasskey` in the provider POSTs to `/api/update-passkey`, which does not exist (`components/web3-provider.tsx:352`); the working registration path is `components/passkey-setup.tsx` -> `/api/setup-wallets`.
- `app/api/wallet-set/route.ts:20` imports a nonexistent module and `app/auth/callback/route.ts:76` calls a nonexistent `/api/wallet` - likely breaks `next build` (dev compiles lazily so `npm run dev` works). Delete these or stub the import before deploying.
- `setup-wallets` trusts the client-supplied `circleAddress` and stores `circle_wallet_id = walletAddress` (`app/api/setup-wallets/route.ts:61-62,99`); fallback derives an "address" by slicing the public key (`:64-75`), which is not a real address.
- Passkey credential (public data) stored as JSON text in `wallets.passkey_credential`; the passkey itself lives on the device - lost device = lost wallet (no recovery flow implemented).
- Webhook verifies `JSON.stringify(await req.json())` rather than raw body bytes (`route.ts:489-490`) - usually matches Circle's compact JSON, but fragile. `findWalletByAddress` scans only the first 50 wallets (`route.ts:90-93`).
- `next: "latest"` and `@supabase/*: "latest"` are unpinned - fresh installs may break. `axios` missing from package.json.
- Amount math uses JS floats (`parseFloat(amount) * 10**6`, `components/web3-provider.tsx:523`).
- `next.config.js:34-36` and `proxy.ts:25-28` hardcode a Replit dev host; proxy matcher includes `/_next/:path*` (runs Supabase getUser on every asset request).
- Passkeys require a secure context and the Circle client key's allowed domain to match (localhost OK for dev).
