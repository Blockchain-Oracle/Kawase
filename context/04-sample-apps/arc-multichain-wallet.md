# arc-multichain-wallet
Sample wallet with a unified USDC balance: a Circle Developer-Controlled SCA wallet deposits into Circle Gateway, and a DCW EOA delegate signs EIP-712 burn intents to move USDC between Arc Testnet, Base Sepolia and Avalanche Fuji. It uses the raw Gateway API with no App Kit.
Sources: https://github.com/circlefin/arc-multichain-wallet, refs/circlefin/arc-multichain-wallet @ 3bca13f, https://docs.arc.io/build/sample-apps/arc-multichain-wallet (the docs dump has only the card, arc-llms-full.txt:18881, 35566)
Verified: 2026-09-29

## 1. What it does
- Sign up (Supabase email). `components/sign-up-form.tsx:74-79` then calls two routes:
  - `POST /api/wallet-set` creates a wallet set and **one SCA wallet on ARC-TESTNET, BASE-SEPOLIA and AVAX-FUJI**, stored as a single row with `blockchain:"MULTICHAIN"` and `type:"sca"`.
  - `POST /api/gateway/init-eoa-wallets` creates a DCW EOA "gateway_signer".
- **Deposit tab:** `POST /api/gateway/deposit` has the SCA wallet call `addDelegate(USDC, eoa)`, `approve` and `deposit` on GatewayWallet. The funds become the unified balance.
- **Transfer tab:** `POST /api/gateway/transfer` does the following:
  1. Checks gas on the minter wallet.
  2. Builds a BurnIntent and has the EOA sign it via DCW `signTypedData`.
  3. POSTs it to the Gateway `/v1/transfer` endpoint and polls for the attestation.
  4. Calls `gatewayMint` on the destination chain, from the SCA wallet (to your own address) or the EOA (to an external recipient).
- The dashboard shows Gateway balance per domain plus wallet USDC per chain (`/api/gateway/balance`). There is a history page backed by the `transaction_history` table.
- An optional wagmi "connect wallet" UI exists, but browser-wallet deposits are not wired. `lib/circle/permit.ts` (EIP-2612 permit) is unused.

## 2. RFB fit
- **Primary: RFB1 Intelligent Business Treasury.** Covers the multichain and unified-balance part: deposit once and spend on any chain through Gateway.
- Secondary: RFB2 and RFB4, as the "pay from unified balance to any chain" primitive for payouts and agent spending.
- **Missing:** no business logic, no forecasting, no yield, no AI, no policy or limits, no compliance screening, no webhooks. There are only 3 chains and it is superseded by arc-fintech's App Kit `unifiedBalance.*` approach. Use this repo mainly to understand the raw Gateway protocol.

## 3. Tech stack + versions
- Next.js `latest` (unpinned; `next dev --turbopack`, `proxy.ts`), React `^19.2.0`, TypeScript `^5.9.3`, Tailwind 4, shadcn/Radix.
- `@circle-fin/developer-controlled-wallets` `^10.0.1`, viem `^2.44.4`, wagmi `^2.19.5` / `@wagmi/core` `^2.22.1`, TanStack Query `^5.90.5`, `@supabase/ssr` and `@supabase/supabase-js` `latest`.
- Node 20+ (README), npm. Scripts are only `dev`, `build`, `start` and `lint`. CI (`.github/workflows/ci.yml`) only runs `npm install`.

## 4. Architecture
- `refs/circlefin/arc-multichain-wallet/app/api/wallet-set/route.ts`:
  - `POST`: authenticated signup provisioning. Creates the wallet set and the multichain SCA wallet (`:81-119`).
  - `PUT`: an unauthenticated create-wallet-set call.
- `refs/circlefin/arc-multichain-wallet/app/api/wallet/route.ts`: unauthenticated EOA wallet creation for a caller-supplied `walletSetId`.
- `refs/circlefin/arc-multichain-wallet/app/api/gateway/deposit/route.ts`: deposit and delegate.
- `refs/circlefin/arc-multichain-wallet/app/api/gateway/transfer/route.ts`: burn intent, attestation, mint.
- `refs/circlefin/arc-multichain-wallet/app/api/gateway/balance/route.ts`: Gateway `/v1/balances` plus on-chain USDC.
- `refs/circlefin/arc-multichain-wallet/app/api/gateway/info/route.ts`: Gateway `/v1/info`.
- `refs/circlefin/arc-multichain-wallet/app/api/gateway/{init-eoa-wallets,eoa-wallets}/route.ts`: create and list the EOA signer.
- `refs/circlefin/arc-multichain-wallet/app/api/transactions/route.ts`: history.
- `refs/circlefin/arc-multichain-wallet/app/api/deposit/route.ts` + `lib/deposit.ts`: **mock** deposit (TODO Paymaster; returns `mock-tx-hash`). Has a test at `route.test.ts` but no test runner configured.
- `refs/circlefin/arc-multichain-wallet/lib/circle/gateway-sdk.ts` (995 lines): the whole Gateway protocol over DCW, including chain constants, EIP-712 types, deposit, withdraw, burn intent, mint and balance.
- `refs/circlefin/arc-multichain-wallet/lib/circle/create-gateway-eoa-wallets.ts`: EOA signer creation (`:42-45`) and lookup (`getGatewayEOAWalletId`, `:103+`).
- `refs/circlefin/arc-multichain-wallet/lib/circle/sdk.ts`: DCW client. `lib/circle/permit.ts`: EIP-2612 permit signer (unused).
- `refs/circlefin/arc-multichain-wallet/components/wallet-dashboard.tsx` (706 lines): main UI (deposit and transfer calls at `:262`, `:328`).
- `refs/circlefin/arc-multichain-wallet/components/wagmi-provider.tsx`: wagmi config with mainnets and testnets, **no Arc chain**.
- `refs/circlefin/arc-multichain-wallet/supabase/migrations/`: `transaction_history` (no RLS enabled) and `wallets` (RLS on select/insert). Wallet columns: circle_wallet_id, wallet_set_id, address, type, blockchain.

## 5. Circle products used
| Product | Package/API | Where | What the call does |
|---|---|---|---|
| DCW client | `initiateDeveloperControlledWalletsClient` | `refs/circlefin/arc-multichain-wallet/lib/circle/sdk.ts` | API key plus entity secret |
| DCW wallet set + SCA wallet | `createWalletSet`, `createWallets({accountType:"SCA", blockchains:[ARC-TESTNET,BASE-SEPOLIA,AVAX-FUJI]})` | `refs/circlefin/arc-multichain-wallet/app/api/wallet-set/route.ts:81-98` | One address shared by 3 chains; stored as one "MULTICHAIN" row |
| DCW EOA signer | `createWallets({accountType:"EOA"})` | `lib/circle/create-gateway-eoa-wallets.ts:42-45`; also `app/api/wallet/route.ts:33-38` | EOA used only to sign burn intents and to mint for external recipients |
| DCW contract exec | `createContractExecutionTransaction` (walletId or walletAddress+blockchain) | `lib/circle/gateway-sdk.ts:318-330` | Generic `abiFunctionSignature` calls |
| Gateway deposit | GatewayWallet `addDelegate(address,address)`, USDC `approve`, `deposit(address,uint256)` | `refs/circlefin/arc-multichain-wallet/lib/circle/gateway-sdk.ts:355-419` | Deposit into the unified balance and authorize the EOA delegate |
| Gateway withdraw | `initiateWithdrawal(address,uint256)` then `withdraw(address)` | `lib/circle/gateway-sdk.ts:421-455` | Trustless withdrawal path (exported, not wired to UI) |
| Gateway burn intent | DCW `signTypedData` on the EIP-712 BurnIntent | `lib/circle/gateway-sdk.ts:665-709` (types `:235-296`) | EOA signs the transfer spec |
| Gateway API | `POST https://gateway-api-testnet.circle.com/v1/transfer`; `GET /v1/transfers/{id}`; `POST /v1/balances`; `GET /v1/info` | `lib/circle/gateway-sdk.ts:480`, `:794`, `:934`, `:982` | Get the attestation; poll (3s x 60); read balances; list domains |
| Gateway mint | GatewayMinter `gatewayMint(bytes,bytes)` via DCW | `refs/circlefin/arc-multichain-wallet/lib/circle/gateway-sdk.ts:538-600` | Mint on the destination; code 155258 maps to INSUFFICIENT_GAS |
| Orchestration | `transferGatewayBalanceWithEOA` | `refs/circlefin/arc-multichain-wallet/lib/circle/gateway-sdk.ts:711-822` | Full crosschain transfer; maxFee = 2.01 USDC if >10 USDC, else 10% (`:743-745`) |

Not used: App Kit/Bridge Kit, CCTP, x402, webhooks, compliance, Paymaster (TODO only in `lib/deposit.ts:49`).

## 6. Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` (all in `.env.example`). `ARC_TESTNET_RPC_KEY` is read in code but missing from `.env.example`; it falls back to a hardcoded key at `lib/circle/gateway-sdk.ts:42`.

## 7. How to run
```
npm install
cp .env.example .env.local
npx supabase start && npx supabase db push   # Docker; or: npx supabase link && npx supabase db push
npm run dev                                   # http://localhost:3000
```
Then sign up and copy the wallet address from the dashboard. Get USDC from faucet.circle.com (Arc Testnet, Base Sepolia, Fuji) and use the Deposit tab, then the Transfer tab. Base and Fuji mints need ETH or AVAX in the minter wallet. On Arc, USDC is the gas token.

## 8. Smart contracts
None in the repo. It uses these Circle contracts:

| Contract | Address | Where |
|---|---|---|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `lib/circle/gateway-sdk.ts:39` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | `lib/circle/gateway-sdk.ts:40` |

Arc facts found in the code:

| Fact | Value | Where |
|---|---|---|
| Chain id | 5042002 | `:45` |
| RPC | `https://rpc.testnet.arc.network/<key>` | `:49` |
| USDC | `0x3600000000000000000000000000000000000000` | `:58` |
| Gateway domain | 26 (Fuji 1, Base Sepolia 6) | `:68-72` |
| Explorer | `explorer.arc.testnet.circle.com` | `:52` |
| DCW tokenId | `15dc2b5d-0994-58b0-bf8c-3a0501148ee8` | `:64` |

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- **Raw Gateway transfer with DCW signing:** lift `burnIntentTypedData` plus `transferGatewayBalanceWithEOA` plus `executeMintCircle` (`lib/circle/gateway-sdk.ts:267-296`, `:711-822`, `:538-600`). Use it when you need explicit control of the fee, salt or destinationCaller that App Kit hides, or want to show the protocol steps in an agent decision log.
- **Multichain SCA in one call:** `app/api/wallet-set/route.ts:93-98` creates one DCW address on 3 chains. Good for an agent wallet that must exist on Arc and on L2s.
- **Delegate pattern:** `addDelegate` (`gateway-sdk.ts:366-379`) lets a separate signer EOA spend the SCA's Gateway balance. That is an agent/operator split, and it maps to RFB4's "agent key without custody of the main wallet" idea.
- **Gas pre-flight:** `checkWalletGasBalance` (`gateway-sdk.ts:635`) before burning (`app/api/gateway/transfer/route.ts:110-152`).
- **Withdraw path:** `withdrawFromCustodialWallet` (`gateway-sdk.ts:421`) for moving funds out of Gateway.
- For new code, prefer arc-fintech's App Kit `unifiedBalance.*`, which replaces this hand-rolled flow.

## 11. Limitations / gotchas
- **Hardcoded Arc RPC API key fallback** in source (`lib/circle/gateway-sdk.ts:42`). Set your own `ARC_TESTNET_RPC_KEY`.
- **Unauthenticated routes:**
  - `POST /api/wallet` creates DCW wallets for any `walletSetId`, which bills your entity (`app/api/wallet/route.ts:22-38`).
  - `PUT /api/wallet-set` also has no auth.
  - `POST /api/deposit` is a mock that takes a client-supplied `userId`.
- `transaction_history` has no RLS in its migration. User rows in `wallets` are client-insertable.
- `/api/gateway/transfer` accepts any `recipientAddress` with no validation or screening. `amount` goes through `parseFloat*1e6` (float rounding). maxFee heuristic: up to 10% of the amount under 10 USDC.
- Requests block for long periods: DCW polling plus up to 3 min of attestation polling in a single HTTP request, with no `maxDuration` set. This will time out on Vercel.
- The wagmi config has no Arc chain and the connect-wallet flow is decorative. `permit.ts` is dead code.
- Next.js and Supabase are pinned to `latest`, so builds are not reproducible. There is no lockfile guarantee for the Circle SDK beyond `^10.0.1`.
- Testnet only. Three chains only (no Eth Sepolia, although `TOKEN_IDS.sepolia` exists).
- The viem Arc chain def says native decimals 6 (`:47`). Arc native USDC gas uses 18 decimals, and the ERC-20 at 0x3600… uses 6.
