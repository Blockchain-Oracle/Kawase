# arc-fintech
Multichain treasury console for a business: Circle Developer-Controlled Wallets on 4 testnets, a Gateway unified USDC balance, App Kit bridge/send/swap (USDC<>EURC), EarnKit vaults, the Onramp Kit, and Compliance Engine screening, all on Next.js + Supabase.
Sources: https://github.com/circlefin/arc-fintech, refs/circlefin/arc-fintech @ 0b10d38, https://docs.arc.io/build/sample-apps/arc-fintech (the docs dump has only the card: "Multichain treasury console with crosschain capital movement through Bridge Kit", arc-llms-full.txt:18883, 35571)
Verified: 2026-09-29

## 1. What it does
- A user signs up with Supabase email/password. Sign-up calls `/api/wallet/create-gateway-signers`, which creates one EOA "gateway_signer" wallet per chain (`components/sign-up-form.tsx`, `lib/circle/create-gateway-eoa-wallets.ts:41-54`).
- **Wallets** (`/dashboard/wallets`): creates one SCA wallet per chain (ETH-SEPOLIA, AVAX-FUJI, BASE-SEPOLIA, ARC-TESTNET). The server derives the wallet set, then the browser inserts the Supabase `wallets` row (`components/new-wallet-dialog.tsx:133`). The dashboard shows USDC and EURC balances per network.
- **Treasury overview** (`/dashboard`): combines on-chain USDC/EURC with the Gateway unified balance from `kit.unifiedBalance.getBalances`. It also has charts, an activity feed, and live updates through Supabase Realtime.
- **Move money**:
  - Same-chain send (USDC/EURC) goes through App Kit `send`.
  - "Rebalance" bridges between the user's own wallets with App Kit `bridge` (CCTP plus forwarder, FAST/SLOW).
  - Gateway deposit uses `unifiedBalance.deposit`.
  - Payout picks a route: same-chain send, or Gateway spend to any chain.
- **Swap** USDC<>EURC on Arc Testnet (App Kit `swap`, requires `KIT_KEY`). **Earn**: EarnKit vault explore, deposit, withdraw and positions on Arc Testnet. Rewards are mocked.
- **Compliance**: each address is screened with Circle Compliance Engine before a transfer, and the result is logged to `compliance_logs`. **Add Funds**: the sandbox Onramp Kit popup. **Webhooks**: DCW `transactions.*`, `gateway.deposit.finalized` and `onramp.deposit.settled` update Supabase rows.

## 2. RFB fit
- **Primary: RFB1 Intelligent Business Treasury.** This is the organizer's designated starting point. It already covers multichain wallets, a unified Gateway balance, crosschain rebalance, FX (USDC<>EURC), a yield venue (EarnKit vaults), and screening.
- Secondary:
  - RFB2 AP/AR: `/api/payout` with auto-routing and compliance screening of payees.
  - RFB5 Compliance: the screen route plus the `compliance_logs` table.
  - RFB4: the DCW server-side signing pattern is the basis for an agent wallet.
- **Missing for RFB1:**
  - No AI/agent at all.
  - No cash-flow forecasting. The charts are historical only (`components/dashboard/use-dashboard-charts.ts`).
  - No automated or policy-driven rebalancing. Rebalance is a manual dialog.
  - No USYC. Yield is EarnKit vaults, and there is no `usyc` string anywhere in the repo.
  - No treasury policy engine: no thresholds, target allocations or approval limits.
  - No scheduled jobs or cron.
  - No multi-user or org roles. One Supabase user owns the wallets.

## 3. Tech stack + versions (package.json)
- Next.js `16.2.3` (App Router; `proxy.ts` is the Next 16 middleware), React `^19.2.1`, TypeScript 5, Tailwind 4, shadcn/ui (Radix), recharts `^2.15.4`, TanStack Query `^5.100.6`, zod `^4.1.13`, viem `^2.41.2`.
- Circle packages:

  | Package | Declared | Lockfile |
  |---|---|---|
  | `@circle-fin/developer-controlled-wallets` | `^10.3.1` | 10.8.0 |
  | `@circle-fin/app-kit` | `^1.15.0` | 1.15.1 |
  | `@circle-fin/adapter-circle-wallets` | `~1.8.0` | |
  | `@circle-fin/earn-kit` | `^1.7.0` | |
  | `@circle-fin/onramp-kit` | `^1.0.0` | |

  The code imports `@crcl-main/onramp-kit`, not `@circle-fin/onramp-kit` (see Gotchas). The lockfile also pulls in bridge-kit, swap-kit, unified-balance-kit, provider-cctpx, and provider-stablecoin-service-swap transitively.
- Supabase: `@supabase/ssr` and `@supabase/supabase-js` pinned to `latest`; `supabase` CLI `^2.93.0`. Tests use vitest `^4.1.5` (14 test files in `tests/`).
- Node v22+ per the README. npm (package-lock). There is no `engines` field.

## 4. Architecture
- `refs/circlefin/arc-fintech/app/api/wallet/route.ts`: creates an SCA DCW wallet, registers the Gateway delegate, and syncs the Gateway webhook.
- `refs/circlefin/arc-fintech/app/api/wallet-set/route.ts`: creates a wallet set.
- `refs/circlefin/arc-fintech/app/api/wallet/create-gateway-signers/route.ts`: creates EOA signer wallets for the user.
- `refs/circlefin/arc-fintech/app/api/wallet/transfer/route.ts`: same-chain USDC/EURC send via App Kit.
- `refs/circlefin/arc-fintech/app/api/wallet/balance/route.ts`: per-wallet token balances via DCW `getWalletTokenBalance` (line 88).
- `refs/circlefin/arc-fintech/app/api/wallet/validate-address/route.ts`: DCW `validateAddress` (line 35).
- `refs/circlefin/arc-fintech/app/api/bridge/{estimate,rebalance,monitor}/route.ts`: App Kit `estimateBridge` for FAST and SLOW, `bridge` with the forwarder, and a status poll from the DB.
- `refs/circlefin/arc-fintech/app/api/gateway/{balance,deposit,webhook/register}/route.ts`: unified balance, deposit, and webhook subscription sync.
- `refs/circlefin/arc-fintech/app/api/payout/route.ts` (878 lines): payout router that chooses same-chain App Kit send, App Kit `unifiedBalance.spend`, or legacy hand-rolled Gateway burn intent plus mint.
- `refs/circlefin/arc-fintech/app/api/swap/{quote,execute}/route.ts`: App Kit swap.
- `refs/circlefin/arc-fintech/app/api/earn/*`: EarnKit vaults, positions, quote, deposit, withdraw.
- `refs/circlefin/arc-fintech/app/api/compliance/{screen,logs}/route.ts`: Compliance Engine screening and history.
- `refs/circlefin/arc-fintech/app/api/onramp/session/route.ts`: mints an Onramp Kit session. Sandbox only.
- `refs/circlefin/arc-fintech/app/api/circle/webhook/route.ts`: signed webhook handler. `gateway-webhook/route.ts` re-exports it.
- `refs/circlefin/arc-fintech/lib/circle/`: SDK wrappers.
  - `developer-controlled-wallets-client.ts`: DCW client.
  - `app-kit.ts`: AppKit plus CircleWalletsAdapter singletons.
  - `app-kit-send.ts`, `app-kit-swap.ts`, `earn-kit.ts`, `earn-ops.ts`: send, swap and earn wrappers.
  - `gateway-sdk.ts` (948 lines): legacy raw Gateway flow, EIP-712 BurnIntent, and chain constants.
  - `unified-balance-payout.ts`: allocation planner across depositors.
  - `gateway-webhooks.ts`: permissionless subscription management.
  - `onramp-*.ts`: Onramp Kit helpers.
  - `create-gateway-eoa-wallets.ts`: EOA signer wallets.
- `refs/circlefin/arc-fintech/lib/api/{with-auth,ownership,validate}.ts`: Supabase auth wrapper, IDOR guard, zod helpers.
- `refs/circlefin/arc-fintech/lib/compliance/utils.ts`: screening call and result mapping.
- `refs/circlefin/arc-fintech/lib/constants/*.ts`: chain maps, USDC/EURC addresses, explorers, swap slippage.
- `refs/circlefin/arc-fintech/lib/contexts/balance-context.tsx` and `lib/balances/*`: client balance state plus Realtime.
- `refs/circlefin/arc-fintech/lib/earn/mock-rewards.ts`: client-side fake Merkl rewards.
- `refs/circlefin/arc-fintech/supabase/migrations/*.sql` (20 files):
  - Tables: `wallets`, `transactions`, `compliance_logs`, `webhook_events` (dedupe).
  - Enums: `wallet_type` (treasury/payout/customer/gateway_signer) and `transaction_type`. `transaction_type` includes INBOUND, OUTBOUND, BRIDGE, REBALANCE, SWAP, EARN_*, and ONRAMP.
- `refs/circlefin/arc-fintech/scripts/register-gateway-webhooks.mjs`: backfills wallet addresses into the Gateway webhook subscription.

## 5. Circle products used
| Product | Package/API | Where | What the call does |
|---|---|---|---|
| DCW client | `@circle-fin/developer-controlled-wallets` `initiateDeveloperControlledWalletsClient` | `refs/circlefin/arc-fintech/lib/circle/developer-controlled-wallets-client.ts:22` | Client configured from API key and entity secret |
| DCW wallet set | `createWalletSet` | `app/api/wallet-set/route.ts:34`, `app/api/wallet/route.ts:65` | New wallet set (server-derived per user) |
| DCW create wallet | `createWallets({accountType:"SCA"})` | `refs/circlefin/arc-fintech/app/api/wallet/route.ts:105-112` | One SCA wallet on the chosen chain |
| DCW EOA signers | `createWallets({accountType:"EOA"})` | `lib/circle/create-gateway-eoa-wallets.ts:50-54` | EOA per chain that signs Gateway burn intents |
| DCW contract exec | `createContractExecutionTransaction` | `lib/circle/gateway-sdk.ts:248`, `:520` | approve/deposit/addDelegate on GatewayWallet; `gatewayMint(bytes,bytes)` on GatewayMinter |
| DCW sign typed data | `signTypedData` | `lib/circle/gateway-sdk.ts:490` | Signs the EIP-712 Gateway BurnIntent with the EOA signer |
| DCW tx polling | `getTransaction` | `lib/circle/gateway-sdk.ts:220` | Polls until COMPLETE (2s x 45) |
| App Kit adapter | `@circle-fin/adapter-circle-wallets` `createCircleWalletsAdapter` | `lib/circle/app-kit.ts:67-79` | DCW-backed adapter; each call passes `{adapter, chain, address}` |
| App Kit send | `kit.estimateSend` / `kit.send` | `refs/circlefin/arc-fintech/lib/circle/app-kit-send.ts:182-200` | Same-chain USDC (alias) or EURC (raw token address) transfer |
| App Kit bridge (CCTP) | `kit.estimateBridge` / `kit.bridge` + `kit.on("bridge.burn")` | `refs/circlefin/arc-fintech/app/api/bridge/rebalance/route.ts:148`, `:285`, `:308-320`; estimates at `app/api/bridge/estimate/route.ts:154,166` | CCTP burn, attestation, forwarder mint to the destination wallet; FAST/SLOW |
| Gateway via App Kit | `kit.unifiedBalance.deposit` | `refs/circlefin/arc-fintech/app/api/gateway/deposit/route.ts:97-105` | approve plus deposit into GatewayWallet from the DCW wallet |
| Gateway via App Kit | `kit.unifiedBalance.getBalances` | `app/api/gateway/balance/route.ts:119`, `app/api/payout/route.ts:344` | Per-depositor, per-chain unified balance (testnet, includePending) |
| Gateway via App Kit | `unifiedBalance.addDelegate` / `estimateSpend` / `spend` | `refs/circlefin/arc-fintech/app/api/payout/route.ts:404`, `:415`, `:429-438` | Delegate the EOA signer, then spend the unified balance to a recipient on any chain (forwarder) |
| Gateway raw API | `POST https://gateway-api-testnet.circle.com/v1/transfer`, `/v1/balances`, `/v1/info`, `/v1/transfers/{id}` | `lib/circle/gateway-sdk.ts:409`, `:790`, `:934`, `:622` | Legacy path: submit a signed burn intent and receive an attestation, used for the gatewayMint fallback (`payout/route.ts:595`, `:708`) |
| Swap (StableFX-like) | `kit.estimateSwap` / `kit.swap` with `{kitKey}` + `slippageBps:300` | `refs/circlefin/arc-fintech/lib/circle/app-kit-swap.ts:135`, `:172-178` | USDC<>EURC on Arc_Testnet via the Stablecoin Service |
| EarnKit | `@circle-fin/earn-kit` `exploreVaults/getVaults/getPosition/getDepositQuote/deposit/withdraw` | `lib/circle/earn-ops.ts:315,339,354,387,437,462` | Arc Testnet vault yield. **Not USYC** |
| Onramp | `@crcl-main/onramp-kit/server` `createOnrampServerKit().createSession` | `refs/circlefin/arc-fintech/app/api/onramp/session/route.ts:40`, `:112` | Fiat to USDC/EURC into the DCW wallet (sandbox asserted) |
| Compliance Engine | `POST https://api.circle.com/v1/w3s/compliance/screening/addresses` | `refs/circlefin/arc-fintech/lib/compliance/utils.ts:36-75` | Screens `{address, chain}` and returns APPROVED/DENIED plus riskScore/categories |
| Webhooks | `GET /v2/notifications/publicKey/{keyId}`; ECDSA SHA256 verify | `refs/circlefin/arc-fintech/app/api/circle/webhook/route.ts:116-153`, POST at `:465` | Verifies `x-circle-signature`, dedupes on `webhook_events`, applies `transactions.inbound/outbound`, `gateway.deposit.finalized`, `onramp.deposit.settled` |
| Webhook subs | `/v2/notifications/subscriptions/permissionless` CRUD | `lib/circle/gateway-webhooks.ts:145-215`, sync at `:248` | Registers wallet addresses for Gateway deposit events |

Not used: x402/Nanopayments, Modular/User-Controlled Wallets, Smart Contract Platform deploys, USYC, and Circle Mint APIs.

## 6. Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `WEBHOOK_ENDPOINT_URL`, `GATEWAY_WEBHOOK_ENDPOINT_URL` (optional), `NEXT_PUBLIC_APP_URL` (optional), `ARC_TESTNET_RPC_KEY` (optional), `KIT_KEY` (format `KIT_KEY:<keyId>:<keySecret>`; required for Swap and Onramp, optional for Earn), `ONRAMP_API_BASE_URL`, `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` (both must be sandbox), `SUPABASE_SERVICE_ROLE_KEY` (only for `webhooks:register`).

## 7. How to run
1. `npm install`. If it 404s on `@crcl-main/onramp-kit`, see Gotchas.
2. `cp .env.example .env.local`.
3. Local DB: `npx supabase start && npx supabase migration up` (needs Docker). Or cloud: `npx supabase link --project-ref <ref> && npx supabase db push`.
4. `npm run dev` serves http://localhost:3000. Sign up with any email.
5. Optional webhooks: `ngrok http 3000`, set `WEBHOOK_ENDPOINT_URL=https://<ngrok>/api/circle/webhook`, then `npm run webhooks:register`. Enable `onramp.deposit.settled` on the DCW subscription in the Circle Console.
6. Other scripts: `npm test` (vitest), `npm run lint`, `db:start|stop|reset|status`.
- Circle Console prerequisites: an API key, a registered Entity Secret, and a Kit Key (sandbox). Fund the wallets from faucet.circle.com. FAST bridges have a minimum of 5 USDC and SLOW bridges 2 USDC (`rebalance/route.ts:122`).

## 8. Smart contracts
None in the repo. It calls Circle-deployed contracts:
- GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` (`lib/circle/gateway-sdk.ts:43`). Functions: `deposit(address,uint256)`, `addDelegate(address,address)`.
- GatewayMinter `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` (`:44`). Function: `gatewayMint(bytes,bytes)`.
- EIP-712 BurnIntent types are at `gateway-sdk.ts:118-197`, with domain `{name:"GatewayWallet", version:"1"}`.
- Arc testnet facts found in the code:

  | Fact | Value | Where |
  |---|---|---|
  | Chain id | 5042002 | `gateway-sdk.ts:55` |
  | RPC | `https://rpc.testnet.arc.network[/<ARC_TESTNET_RPC_KEY>]` | `:50-52` |
  | USDC | `0x3600000000000000000000000000000000000000` | `lib/constants/usdc-addresses.ts:24` |
  | EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `lib/constants/eurc-addresses.ts:25` |
  | Explorer | `https://testnet.arcscan.app` | `lib/constants/block-explorers.ts:23` |
  | Gateway/CCTP domain | 26 | `gateway-sdk.ts:83` |

  The viem chain def gives the explorer as `explorer.arc.testnet.circle.com` (`gateway-sdk.ts:62`). Other domains: ethSepolia 0, avalancheFuji 1, baseSepolia 6. DCW token ID for Arc USDC: `15dc2b5d-0994-58b0-bf8c-3a0501148ee8` (`:75`).

## 9. AI/LLM usage
None. No AI SDK, no prompts, no forecasting model. Every decision is either a user click or a deterministic rule, for example payout auto-routing in `app/api/payout/route.ts:168-240` and the Gateway allocation planner in `lib/circle/unified-balance-payout.ts:180`.

## 10. Reusable for a hackathon entry
- **Agent treasury tools:** wrap these server functions as tool calls for an LLM agent:
  - `sendUsdcOnSameChainWithAppKit` (`lib/circle/app-kit-send.ts:182`)
  - the bridge block (`app/api/bridge/rebalance/route.ts:135-366`)
  - `unifiedBalance.deposit` (`app/api/gateway/deposit/route.ts:97`)
  - `unifiedBalance.spend` (`app/api/payout/route.ts:340-438`)
  - `executeSwap` (`lib/circle/app-kit-swap.ts:166`)
  - `earnDeposit/earnWithdraw` (`lib/circle/earn-ops.ts:431-475`)
  - `screenAddress` (`lib/compliance/utils.ts:36`)
- **Balance snapshot for forecasting:** use `app/api/gateway/balance/route.ts:119` (unified) plus `app/api/wallet/balance/route.ts:88` (per wallet). Together they give the state vector for an RFB1 forecaster or rebalancer.
- **Dev-controlled wallet creation:** `app/api/wallet/route.ts:105-112` (SCA) and `lib/circle/create-gateway-eoa-wallets.ts:50` (EOA signer).
- **Gateway multi-source allocation:** `planUnifiedBalanceGatewayAllocations` (`lib/circle/unified-balance-payout.ts:180`) greedily splits a spend across depositors and chains. Reuse it for an "optimal source" rebalancer.
- **The App Kit getAddress workaround:** the Proxy that makes the DCW adapter work with `send`, `swap` and `earn` (`lib/circle/app-kit-send.ts:125-152`, `earn-kit.ts:85-102`) is required whenever you call App Kit with a DCW adapter.
- **Webhook verification and dedupe:** `app/api/circle/webhook/route.ts:116-153`, `:465-530` is a drop-in for any Circle notification consumer. Pair it with the `webhook_events` dedupe migration `supabase/migrations/20260428000000_add_webhook_events_dedupe.sql`.
- **Compliance gate:** `lib/compliance/utils.ts:36-111` (`shouldBlockTransfer`). Test addresses ending in 9999, 8888 or 7777 return DENIED (`:211-234`), which is handy for demoing an RFB5 block.
- **Treasury UI:** the dashboard shell and components (`components/section-cards.tsx`, `chart-line-interactive.tsx`, `dashboard/activity-feed.tsx`) are a quick base for an agent decision-log page.

## 11. Limitations / gotchas
- **Onramp package mismatch:** package.json declares `@circle-fin/onramp-kit`, but the code imports `@crcl-main/onramp-kit` (`app/api/onramp/session/route.ts:18`, `components/add-funds-dialog.tsx:26`). The lockfile contains both, and README and .env note that `@crcl-main` is a private Cloudsmith canary scope. Without that npm credential, fix the imports or drop Add Funds, or the build fails.
- Testnet only. Four chains are hardcoded (`lib/constants/chains.ts:33-38`). The Gateway API is hardcoded to the `gateway-api-testnet` URLs.
- **Client-writable ledger and wallet tables:**
  - RLS lets users insert and update their own `wallets` and `transactions` rows from the browser (`supabase/migrations/20251210161755_create_wallets_table.sql`, `20251216175134_create_transactions_table.sql`).
  - Wallet rows are inserted client-side (`components/new-wallet-dialog.tsx:133`).
  - Server ownership checks (`lib/api/ownership.ts:27`) trust that table. The App Kit adapter picks the signing wallet by `address`, and every user shares one Circle entity. So a forged row could point at another tenant's address.
  - Before any multi-tenant demo, make these tables server-only.
- **Compliance is enforced only in the UI.** `/api/payout` and `/api/wallet/transfer` never call screening server-side (`components/dialogs/use-compliance-check.ts:106`). `mapComplianceResult` defaults to PASS on an unknown result (`lib/compliance/utils.ts:101-102`).
- `/api/payout` validates its body by hand. `recipientAddress` is not zod-validated (`payout/route.ts:81-95`). It also has hardcoded fee and time estimates (`:172-173`, `:229-235`).
- `kit.on("bridge.burn"/"bridge.mint")` handlers are added to a module-level singleton on every request (`bridge/rebalance/route.ts:285-300`), so listeners leak and events can cross between concurrent requests.
- The rebalance bridges `amount + estimated fee` (`:212`). The response returns 202 PENDING after the burn, and the webhook or monitor finalizes the row. `maxDuration=60`.
- Earn rewards are fake (`lib/earn/mock-rewards.ts`). EarnKit supports only Arc_Testnet same-chain (`earn-ops.ts:445`).
- Swap needs `KIT_KEY` (it fails with INPUT_VALIDATION_FAILED otherwise). The slippage policy is fixed at 300 bps on the server (`lib/constants/swap.ts:31`).
- Legacy `gateway-sdk.ts` is marked deprecated but still used for delegate registration and the payout fallback. It polls DCW for up to 90s inside a request.
- The Arc viem chain def says native `decimals: 6` (`gateway-sdk.ts:57`). Arc native gas USDC is 18 decimals and the ERC-20 interface is 6. Use the ERC-20 address for balances.
- Supabase packages are pinned to `latest` (drift risk). The README clone URL points to an old repo (`akelani-circle/fintech-starter`).
- Webhooks need a public URL (ngrok). Without one, balances refresh only on poll or manual action.
