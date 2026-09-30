# docs-examples
Circle's canonical, minimal code samples behind the Circle + Arc docs: 8 App Kit browser demos (bridge, earn, onramp, send, swap, transfer widget, unified balance), a dev-controlled-wallet entity-secret bootstrap script, and 3 user-controlled-wallet login flows (PIN / email OTP / Google).
Sources: https://github.com/circlefin/docs-examples, refs/circlefin/docs-examples @ b04f580, docs pages: https://docs.arc.io/app-kit/quickstarts/earn-deposit, https://docs.arc.io/app-kit/send, https://docs.arc.io/app-kit/swap, https://docs.arc.io/app-kit/bridge, https://docs.arc.io/app-kit/quickstarts/unified-balance-deposit-and-spend, https://developers.circle.com/wallets/dev-controlled/register-entity-secret
Verified: 2026-09-29

> This is the **primary snippet source** for App Kit calls. Every App Kit sample is a single ~150-350 line `src/main.ts` with one core call. No backend, no DB, no AI. All App Kit samples use a **browser wallet (EIP-6963 / window.solana)**; for an autonomous agent swap the adapter for `@circle-fin/adapter-circle-wallets` (`createCircleWalletsAdapter({ apiKey, entitySecret })`, see docs `arc-llms-full.txt:2636`). The `kit.*` call shape is otherwise identical.

## 1. What it does
- Each subdirectory is a self-contained Vite/TS (or Node) project with its own `package.json`; `npm install && npm run dev` (README.md).
- App Kit demos: connect wallet -> `createViemAdapterFromProvider()` / `createSolanaAdapterFromProvider()` -> one `kit.<op>()` call with hardcoded amounts ("1", "1.00", "2.50") -> JSON dump of the result into a `<pre>`.
- `entity-secret-setup`: Node script that generates a 32-byte entity secret, registers it with Circle, writes recovery file + `CIRCLE_ENTITY_SECRET` to `.env` (first step for any dev-controlled wallet agent).
- `user-controlled-wallets-*`: Hono server (port 8787) mints userToken/challenge with `@circle-fin/user-controlled-wallets`; browser completes the challenge with `@circle-fin/w3s-pw-web-sdk` `sdk.execute()`. All create **SCA wallets on `ARC-TESTNET`**.

## 2. RFB fit
- **RFB1 Intelligent Business Treasury (primary)**: `app-kit-earn` (yield), `app-kit-unified-balance` (multichain Gateway balance -> spend on Arc), `app-kit-bridge-*` (rebalance into Arc), `app-kit-swap` (USDC<->EURC FX). Together these are the treasury "actions" an agent would invoke.
  - **Earn vs USYC (important):** App Kit Earn is **NOT USYC**. `kit.earn.exploreVaults` "returns all Morpho vaults on the blockchain. No allowlist is applied" (arc-llms-full.txt:2596); returns come from "the underlying lending protocol" (arc-llms-full.txt:2413). Earn supports USDC and EURC on Arc (arc-llms-full.txt:1302). USYC is a separate tokenized money-market fund minted/redeemed through a **Teller contract** after KYC allowlisting (testnet USYC `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`, Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A`, arc-llms-full.txt:18066-18068; 24-48h Circle Support approval, non-US institutions only, arc-llms-full.txt:17164). For an RFB1 demo, Earn is the zero-friction "yield sweep" path; mention USYC as the institutional target and, if allowlisted, call the Teller directly.
- **RFB4 Autonomous Business Operator (secondary)**: `app-kit-send` is the minimal "agent pays" call; `entity-secret-setup` bootstraps the dev-controlled wallet an agent needs. No budgets/limits/x402 here.
- **RFB2 AP/AR (secondary)**: `kit.send` + `kit.estimateSend` for payouts; `app-kit-onramp` for fiat->USDC top-up of the operating wallet.
- Missing for any RFB: no server-side adapter example (all browser wallets), no policy/limits, no persistence, no webhooks, no AI, no x402, no escrow contracts.

## 3. Tech stack + versions
- App Kit samples: `@circle-fin/app-kit ^1.15.1`, `@circle-fin/adapter-viem-v2 ^1.18.0`, `@circle-fin/adapter-solana ^1.7.3` (solana/unified-balance), `viem ^2.56.5`, `vite ^8.3.0`, `typescript ~7.0.2` (e.g. app-kit-earn/package.json).
- `app-kit-transfer-widget`: React `^19.2.8`, `@circle-fin/app-kit ^1.12.0`, `adapter-viem-v2 ^1.15.1`, `adapter-solana ^1.6.5`, `@solana/web3.js ^1.98.4`, `@vitejs/plugin-react ^6.0.5`, oxlint (older pins than the others).
- `app-kit-onramp`: `@circle-fin/app-kit ^1.15.1` (incl. `@circle-fin/app-kit/server`), `tsx ^4.23.13`.
- `entity-secret-setup`: `@circle-fin/developer-controlled-wallets ^10.3.1`, `tsx ^4.22.3`, TS `^6.0.3`.
- `user-controlled-wallets-*`: `@circle-fin/user-controlled-wallets ^10.8.0`, `@circle-fin/w3s-pw-web-sdk ^1.1.11`, `hono ^4.13.2`, `@hono/node-server ^2.1.1`, `vite-plugin-node-polyfills ^0.28.0` (server runs with `node --experimental-strip-types`).
- Node 22+ (per each README). npm (no pnpm/workspaces).

## 4. Architecture
- `refs/circlefin/docs-examples/app-kit-bridge-evm/src/main.ts` — Sepolia -> Arc bridge + retry + event stream.
- `refs/circlefin/docs-examples/app-kit-bridge-solana/src/main.ts` — Solana Devnet -> Arc bridge (two adapters).
- `refs/circlefin/docs-examples/app-kit-earn/src/main.ts` — vault discovery, deposit/withdraw quotes, deposit, position, withdraw.
- `refs/circlefin/docs-examples/app-kit-earn/README.md` — crosschain deposit variant (Sepolia -> Arc vault) + status tracking.
- `refs/circlefin/docs-examples/app-kit-onramp/server.ts` — Node http server that mints onramp sessions (keeps API key off client).
- `refs/circlefin/docs-examples/app-kit-onramp/src/main.ts` — fetchSession / mountIframe / openWindow widget.
- `refs/circlefin/docs-examples/app-kit-send/src/main.ts` — same-chain USDC send on Arc.
- `refs/circlefin/docs-examples/app-kit-swap/src/main.ts` — USDC -> EURC swap on Arc.
- `refs/circlefin/docs-examples/app-kit-transfer-widget/src/components/TransferWidget/transfer.ts` — estimate/execute routing layer (send vs bridge, forwarder vs direct mint, micro-USDC bigint math).
- `refs/circlefin/docs-examples/app-kit-transfer-widget/src/components/TransferWidget/wallet.ts` — EVM (EIP-6963) + Solana wallet discovery -> adapter.
- `refs/circlefin/docs-examples/app-kit-transfer-widget/src/components/TransferWidget/TransferWidget.tsx` — 791-line React UI (estimate at :234, execute at :266).
- `refs/circlefin/docs-examples/app-kit-unified-balance/src/main.ts` — Gateway unified balance deposit (Fuji + Solana), getBalances, spend on Arc.
- `refs/circlefin/docs-examples/entity-secret-setup/index.ts` — entity secret generation + registration.
- `refs/circlefin/docs-examples/user-controlled-wallets-{pin,email,social}/server.ts` — Hono API; `src/main.ts` — W3SSdk client; `vite.config.ts` proxies `/api` -> `localhost:8787`.

## 5. Circle products/SDKs used — per example (core call file:line)

### app-kit-bridge-evm (CCTP via App Kit / Bridge Kit)
| product | package/API | where | what |
|---|---|---|---|
| App Kit bridge (CCTP) | `kit.bridge()` | `refs/circlefin/docs-examples/app-kit-bridge-evm/src/main.ts:110-114` | Bridges 1.00 USDC `Ethereum_Sepolia` -> `Arc_Testnet`, same viem adapter both sides |
| retry | `kit.retryBridge(result, {from,to})` | `app-kit-bridge-evm/src/main.ts:116-121` | Resume on `result.state === "error"` |
| events | `kit.on("*", cb)` | `app-kit-bridge-evm/src/main.ts:150-158` | Stream every step (approve/burn/attestation/mint) — ideal for an agent decision/audit log |
| adapter | `createViemAdapterFromProvider({provider})` | `app-kit-bridge-evm/src/main.ts:106-108` | Wrap EIP-1193 provider |

### app-kit-bridge-solana
| product | package/API | where | what |
|---|---|---|---|
| App Kit bridge (CCTP) | `kit.bridge()` | `refs/circlefin/docs-examples/app-kit-bridge-solana/src/main.ts:150-154` | 1.00 USDC `Solana_Devnet` -> `Arc_Testnet` |
| Solana adapter | `createSolanaAdapterFromProvider` | `app-kit-bridge-solana/src/main.ts:146-148` | from `window.solana ?? window.solflare` (:111) |
| retry / events | `kit.retryBridge`, `kit.on` | `:156-161`, `:193-201` | same as EVM |

### app-kit-earn (RFB1 yield)
| product | package/API | where | what |
|---|---|---|---|
| App Kit Earn | `kit.earn.exploreVaults({chain:"Arc_Testnet", sortBy:"apy"})` | `refs/circlefin/docs-examples/app-kit-earn/src/main.ts:104-107` | List Morpho vaults; filter `liquidityProfile.status === "active"` (:116), APY = `apyProfile.current*100` (:120) |
| | `kit.earn.getDepositQuote({from,vaultAddress,amount})` | `app-kit-earn/src/main.ts:162-166` | Preview deposit (shares out, fees) |
| | `kit.earn.deposit(...)` | `app-kit-earn/src/main.ts:196-200` | **Core call**: deposit 1 USDC into vault |
| | `kit.earn.getPosition({from,vaultAddress})` | `app-kit-earn/src/main.ts:230-233` | Read current position (for treasury dashboard/forecast) |
| | `kit.earn.getWithdrawalQuote(...)` | `app-kit-earn/src/main.ts:263-267` | Preview withdrawal |
| | `kit.earn.withdraw(...)` | `app-kit-earn/src/main.ts:297-301` | Redeem shares -> USDC |
| crosschain deposit (docs only) | `kit.earn.deposit({from:{chain:"Ethereum_Sepolia"}, to:{chain:"Arc_Testnet", recipientAddress}, transferSpeed})`, `kit.earn.getCrossChainDepositStatus` / `waitForCrossChainDeposit(execId)` | `refs/circlefin/docs-examples/app-kit-earn/README.md` ("Deposit from another chain") | Bridge + deposit in one call; sources: Eth/Arb/Base Sepolia |
Also available (docs): `kit.earn.exploreVaultsIterator`, `kit.earn.retry` for RESUMABLE errors (arc-llms-full.txt:2554, :5754).

### app-kit-onramp (fiat -> USDC)
| product | package/API | where | what |
|---|---|---|---|
| App Kit server | `createAppServerKit({onramp:{apiKey, referrerDomain, baseUrl, widgetBaseUrl}})` | `refs/circlefin/docs-examples/app-kit-onramp/server.ts:31-39` | Server-side kit holding API key |
| | `createSessionRouteHandler(serverKit.onramp)` | `app-kit-onramp/server.ts:41` | Fetch-API handler mounted at `/api/onramp/sessions` (:49) |
| App Kit onramp client | `kit.onramp.fetchSession({url, body:{appUserId,destinationAddress}})` | `refs/circlefin/docs-examples/app-kit-onramp/src/main.ts:39-42` | Mint session via server |
| | `kit.onramp.mountIframe({session, container, onDepositSettled, onDepositNotCompleted, onSessionExpired})` | `app-kit-onramp/src/main.ts:69-89` | Embed widget; settlement callbacks |
| | `kit.onramp.openWindow(...)` | `app-kit-onramp/src/main.ts:113-121` | Popup (must be synchronous in click handler; falls back to iframe at :130-135) |

### app-kit-send (send USDC on Arc)
| product | package/API | where | what |
|---|---|---|---|
| App Kit send | `kit.send({from:{adapter, chain:"Arc_Testnet"}, to, amount:"1.00", token:"USDC"})` | `refs/circlefin/docs-examples/app-kit-send/src/main.ts:117-122` | **Core call**: same-chain USDC transfer on Arc |
Estimate variant: `kit.estimateSend(...)` at `app-kit-transfer-widget/src/components/TransferWidget/transfer.ts:187-192`.

### app-kit-swap (USDC -> EURC)
| product | package/API | where | what |
|---|---|---|---|
| App Kit swap | `kit.swap({from:{adapter, chain:"Arc_Testnet"}, tokenIn:"USDC", tokenOut:"EURC", amountIn:"1.00"})` | `refs/circlefin/docs-examples/app-kit-swap/src/main.ts:110-115` | **Core call**: on-chain FX swap on Arc (docs: swap-tokens-same-chain, arc-llms-full.txt:3781; crosschain variant :3493) |

### app-kit-transfer-widget (send-or-bridge router)
| product | package/API | where | what |
|---|---|---|---|
| chain discovery | `kit.getSupportedChains("bridge").filter(c => c.isTestnet)` | `refs/circlefin/docs-examples/app-kit-transfer-widget/src/components/TransferWidget/transfer.ts:75-83` | Chain list from SDK (not hardcoded) |
| route decision | `detectTransferMethod` / `usesForwarder` (`chain.cctp?.forwarderSupported.destination`) | `transfer.ts:85-94` | same chain -> send, else bridge; forwarder if supported |
| estimate | `kit.estimateSend` / `kit.estimateBridge` | `transfer.ts:187-192`, `:210-218` | Fees summed with bigint micro-USDC (`:220-226`) |
| execute | `kit.send` / `kit.bridge` (+`useForwarder:true`) / `kit.retryBridge` | `transfer.ts:249-254`, `:265-278`, `:280-286` | Forwarder bridge needs no destination adapter (`:102-108`) |
| fee display | Arc gas fee in 18 decimals | `transfer.ts:162-172` | Arc native USDC gas is 18-dec |
| USDC parse | `parseUsdcAmount` regex, 6 decimals | `transfer.ts:117-135` | Safe string -> bigint |

### app-kit-unified-balance (Gateway)
| product | package/API | where | what |
|---|---|---|---|
| adapter w/ chains | `createViemAdapterFromProvider({provider, capabilities:{supportedChains:[AvalancheFuji, ArcTestnet]}})` | `refs/circlefin/docs-examples/app-kit-unified-balance/src/main.ts:101-106` | chain defs from `@circle-fin/app-kit/chains` (:20) |
| chain switch | `evmAdapter.ensureChain(AvalancheFuji)` | `app-kit-unified-balance/src/main.ts:165` | |
| Gateway deposit | `kit.unifiedBalance.deposit({from:{adapter, chain:"Avalanche_Fuji"}, amount:"2.00", token:"USDC"})` | `app-kit-unified-balance/src/main.ts:167-171` | Deposit into unified balance (Solana variant :192-196) |
| Gateway balance | `kit.unifiedBalance.getBalances({sources, networkType:"testnet", includePending:true})` | `app-kit-unified-balance/src/main.ts:219-223` | Aggregate multichain USDC (treasury view) |
| Gateway spend | `kit.unifiedBalance.spend({amount:"2.50", token:"USDC", from:[{adapter:evm},{adapter:sol}], to:{adapter, chain:"Arc_Testnet", recipientAddress}})` | `app-kit-unified-balance/src/main.ts:249-258` | **Core call**: pull liquidity from multiple chains, deliver on Arc |

### entity-secret-setup (Developer-Controlled Wallets bootstrap)
| product | package/API | where | what |
|---|---|---|---|
| Dev-controlled wallets | `registerEntitySecretCiphertext({apiKey, entitySecret, recoveryFileDownloadPath})` | `refs/circlefin/docs-examples/entity-secret-setup/index.ts:55-59` | Registers secret `crypto.randomBytes(32).toString("hex")` (:53), writes `output/recovery-file.dat`, appends to `.env` (:61-65); refuses if already present (:44-48) |
Note: this sample does NOT create a wallet set or wallet; it only does the prerequisite. Wallet creation lives in other repos/docs.

### user-controlled-wallets-pin
| product | package/API | where | what |
|---|---|---|---|
| UCW server SDK | `initiateUserControlledWalletsClient({apiKey})` | `refs/circlefin/docs-examples/user-controlled-wallets-pin/server.ts:24-26` | |
| | `client.createUser` + `client.createUserToken` | `server.ts:54`, `:30` | userToken + encryptionKey |
| | `client.createUserPinWithWallets({userToken, accountType:"SCA", blockchains:["ARC-TESTNET"]})` | `server.ts:60-64` | challenge to set PIN + create Arc SCA wallet |
| | `updateUserPin` / `restoreUserPin` | `server.ts:80`, `:88` | reset / recover PIN |
| | `listWallets`, `getWalletTokenBalance` | `server.ts:94`, `:100-103` | |
| Web SDK | `new W3SSdk({appSettings:{appId}})`, `sdk.setAuthentication`, `sdk.execute(challengeId, cb)` | `user-controlled-wallets-pin/src/main.ts:24-26`, `:79-94` | Circle-hosted PIN UI completes challenge |
Error code 155101 = user already exists (`server.ts:37-44`).

### user-controlled-wallets-email
| `client.createDeviceTokenForEmailLogin({deviceId, email})` | `refs/circlefin/docs-examples/user-controlled-wallets-email/server.ts:34-37` | device token for OTP |
|---|---|---|
| raw REST `POST https://api.circle.com/v1/w3s/user/initialize` (headers `Authorization: Bearer`, `X-User-Token`; body `accountType:"SCA"`, `blockchains:["ARC-TESTNET"]`) | `user-controlled-wallets-email/server.ts:46-58` | No SDK helper for initialize; 155106 = already initialized |
| `sdk.getDeviceId()`, `sdk.updateConfigs(...)`, `sdk.verifyOtp()` | `user-controlled-wallets-email/src/main.ts:37`, `:43`, `:59` | OTP login in browser; then `sdk.execute` at :125 |

### user-controlled-wallets-social
| `client.createDeviceTokenForSocialLogin({deviceId})` | `refs/circlefin/docs-examples/user-controlled-wallets-social/server.ts:34` | |
|---|---|---|
| raw REST `/v1/w3s/user/initialize` | `user-controlled-wallets-social/server.ts:43-55` | same as email |
| `sdk.performLogin(SocialLoginProvider.GOOGLE)` | `user-controlled-wallets-social/src/main.ts:63` | Google OAuth; execute at :128 |

Not present anywhere: Modular Wallets, Smart Contract Platform, x402/Nanopayments, webhooks, Compliance Engine, StableFX RFQ, CCTP raw contracts, USYC Teller.

## 6. Env vars (names only)
- App Kit bridge/earn/send/swap/transfer-widget/unified-balance: **none** (READMEs: "does not require environment variables or API keys").
- `app-kit-onramp/.env.example`: `CIRCLE_API_KEY`, `ONRAMP_REFERRER_DOMAIN`, `ONRAMP_API_BASE_URL`, `ONRAMP_WIDGET_BASE_URL`, `VITE_ONRAMP_WIDGET_BASE_URL`, optional `PORT` (server.ts:43, default 3001).
- `entity-secret-setup/.env.example`: `CIRCLE_API_KEY` (script writes `CIRCLE_ENTITY_SECRET`).
- `user-controlled-wallets-{pin,email}`: `CIRCLE_API_KEY`, `VITE_CIRCLE_APP_ID`; social adds `VITE_GOOGLE_CLIENT_ID`; optional `PORT` (default 8787).
- For a server-side agent using App Kit with Circle Wallets adapter (docs): `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`.

## 7. How to run
- App Kit browser demos: `cd <example> && npm install && npm run dev`, open Vite URL with MetaMask (and Phantom/Solflare for Solana ones). Needs testnet USDC (faucet.circle.com) on the **source** chain + gas.
- Onramp: `cp .env.example .env` (sandbox URLs), `npm install`, then `npm run server` (tsx, port 3001) and `npm run dev` in separate terminals.
- Entity secret: `.env` with `CIRCLE_API_KEY`, `npm install`, `npx tsx index.ts`. Output: `.env` gets `CIRCLE_ENTITY_SECRET`, `output/recovery-file.dat`.
- UCW: Circle Console -> create User-Controlled Wallets app (App ID) + API key; `.env`; `npm run server` (port 8787) and `npm run dev` (Vite proxies `/api`). Social needs Google OAuth client configured in Console.

## 8. Smart contracts
None in repo. Relevant Arc testnet addresses from docs (not in code): USDC `0x3600000000000000000000000000000000000000` (native gas, 18-dec native / 6-dec ERC-20), USYC `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`, USYC Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A`. Code only uses chain name strings `"Arc_Testnet"` (App Kit) and `"ARC-TESTNET"` (Wallets API).

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- **Treasury agent tool set (RFB1):** wrap each core call as an agent tool: `kit.unifiedBalance.getBalances` (unified-balance/main.ts:219) = "check cash"; `kit.earn.exploreVaults` + `getDepositQuote` + `deposit` (earn/main.ts:104,162,196) = "sweep idle cash to yield"; `kit.earn.getPosition`/`withdraw` (:230,:297) = "pull liquidity for payables"; `kit.swap` (swap/main.ts:110) = "EUR exposure"; `kit.bridge` (bridge-evm/main.ts:110) = "rebalance to Arc". Replace the browser adapter with `createCircleWalletsAdapter({apiKey, entitySecret})` and pass `address` in `from` (docs arc-llms-full.txt:2636-2648).
- **Quote-before-act pattern for decision logs:** every write op has an estimate/quote sibling (`getDepositQuote`, `getWithdrawalQuote`, `estimateSend`, `estimateBridge`). Log quote -> decision -> result.
- **Audit trail:** `kit.on("*", payload => log(payload))` (bridge-evm/main.ts:150) emits every step; pipe into a decision/event log table.
- **Router logic:** lift `transfer.ts:85-115` + `:174-295` wholesale for a "pay anyone on any chain" function (AP payouts in RFB2/RFB3).
- **Bigint USDC math:** `parseUsdcAmount` / `formatUsdcAmount` (transfer.ts:117-145) to avoid float errors in budgets.
- **Wallet bootstrap:** run `entity-secret-setup/index.ts` once to get `CIRCLE_ENTITY_SECRET` for any dev-controlled agent wallet.
- **Fiat top-up:** onramp server (onramp/server.ts:31-41) + `mountIframe` (src/main.ts:69) to let a business fund the agent treasury; `onDepositSettled` callback is the trigger for "funds arrived".
- **Human-in-the-loop approval (RFB4 escalation):** UCW PIN flow (pin/server.ts:60 + src/main.ts:79-94) creates a user-owned Arc SCA wallet where the human signs challenges — pattern for "agent proposes, human approves" above a limit.

## 11. Limitations / gotchas
- All App Kit samples are **browser-wallet only**; an agent needs the Circle Wallets adapter or a private-key viem adapter (not shown here).
- Amounts are hardcoded ("1", "1.00", "2.00", "2.50"); recipient only in send/unified-balance.
- Earn = Morpho vaults, **not USYC**; "No allowlist is applied" — pick only `status: 'active'` vaults (`low_liquidity` may block withdrawals, arc-llms-full.txt:2590). Vault list on testnet may be empty/changing.
- Crosschain Earn deposit returns when the bridge submit succeeds, not when the position is funded — poll `getCrossChainDepositStatus` (earn/README.md).
- App Kit API key must stay server-side; SDK rejects API keys from browser context (arc-llms-full.txt:1353). Earn/send/swap work keyless but share a rate limit.
- Unified balance spend requires both EVM and Solana wallets connected in this sample (unified-balance/main.ts:240); Fuji deposit requires `ensureChain` switch first.
- Arc gas fee is shown as 18-decimals (transfer.ts:167-168) while USDC ERC-20 amounts are 6-decimals — don't mix.
- Onramp `openWindow` must be called synchronously in the click handler (onramp/src/main.ts:103-106); `ONRAMP_REFERRER_DOMAIN` must match the host serving the page.
- UCW servers have **no auth**: any caller can mint a userToken for any `userId` (pin/server.ts:70-74) — demo only. CORS open (`cors()` at :47).
- UCW email/social call raw REST `/v1/w3s/user/initialize` because the SDK lacks a helper.
- `entity-secret-setup` writes the secret into `.env` in plaintext and is first-time only (no rotation).
- transfer-widget pins older App Kit (`^1.12.0`) than the other samples (`^1.15.1`).
- Dependencies target TypeScript `~7.0.2` and Vite 8 — very new; pin if builds break.
