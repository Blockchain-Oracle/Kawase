# arc-prediction-markets
Binary (YES/NO) prediction markets on Arc testnet: a self-deployed UMA Optimistic Oracle V2 stack resolves outcomes, a constant-product AMM trades Long/Short position tokens, and users connect via MetaMask or Circle passkey modular wallet (gasless).
Sources: https://github.com/circlefin/arc-prediction-markets, refs/circlefin/arc-prediction-markets @ 0f40195, https://docs.arc.io/build/sample-apps/arc-prediction-markets (listed at .firecrawl/docs/arc-llms-full.txt:18897; card at :35672; page body not in dump)
Verified: 2026-09-29

## 1. What it does
- Home grid of markets by category (`lib/markets.ts`): one live on-chain BTC market ("Will Bitcoin exceed $100,000 before June 1, 2026?", `scripts/deploy.ts:48-49`) + 11 static demo cards with placeholder addresses `0x...0001` etc. (`lib/markets.ts:59-97`) + user-created markets from `data/markets.json` via `GET /api/markets`.
- Faucet button mints ARCT test collateral (`allocateTo`, `hooks/market/useMarketActions.ts:54`).
- Trade: approve ARCT, `buyYes/buyNo/sellYes/sellNo` on the AMM (`hooks/amm/useAMMTrade.ts:36-87`), with previews via `calcBuy*/calcSell*`. Or mint/redeem Long+Short pairs directly 1:1 on the market (`create`/`redeem`, `hooks/market/useMarketActions.ts:71,88`).
- Resolve (anyone): propose price to OO (1e18 YES / 0 NO / 5e17 undetermined) - the frontend first bumps the UMA `Timer` to wall-clock time in the same UserOp batch (`hooks/market/useOracleActions.ts:53-140`); optional `disputePrice` (:167); after 60 s liveness call `oo.settle` (:188-275) which triggers `priceSettled` callback on the market.
- Redeem: `settle(longTokens, shortTokens)` on the market burns tokens for ARCT per settlement price (`hooks/market/useMarketActions.ts:104`).
- Create market: dialog POSTs a question to `/api/create-market`, which server-side deploys a new market + AMM with the deployer `PRIVATE_KEY`, initializes the OO request, seeds 1,000 ARCT, and appends to `data/markets.json` (`app/api/create-market/route.ts:144-329`).

## 2. RFB fit
- Primary: none directly. Closest: RFB3 Contractor & Vendor Network (the UMA optimistic "propose -> dispute window -> settle" pattern is a ready-made trust-minimized way to resolve "was milestone delivered?" for escrow release) and RFB4 (server-side agent key deploying/operating contracts on Arc with viem `nonceManager`).
- Secondary: RFB5 Compliance (optimistic assertions as an auditable dispute trail); RFB1 (hedging markets - weak).
- Missing: no USDC (collateral is mintable ARCT, 18 decimals), no Circle server wallets, no AI, no real UMA DVM (MockOracleAncillary), no auth on market creation.

## 3. Tech stack + versions (package.json)
- Next.js 16.2.0, React 19.2.4, TypeScript 5, Tailwind 4, shadcn 4.1 + @base-ui/react 1.3.
- `wagmi` ^3.5.0, `viem` ^2.47.5, `@tanstack/react-query` ^5.91.3, `@circle-fin/modular-wallets-core` ^1.0.13.
- Contracts: `@uma/core` ^2.62.2 (imports + prebuilt artifacts), `@openzeppelin/contracts` ^4.9.6, Hardhat ^2.22.0 + hardhat-toolbox ^4.0.0 (ethers v6), Solidity 0.8.17 (`hardhat.config.ts:35`).
- No database (file-based `data/markets.json`). Node v18+ (README); `reset` script uses `node --experimental-strip-types` (Node 22.6+). npm. Package name `uma-prediction-market`.

## 4. Architecture
- `refs/circlefin/arc-prediction-markets/contracts/EventBasedPredictionMarket.sol` - UMA OO V2 event-based market; mints Long/Short ExpandedERC20s; OO callbacks.
- `refs/circlefin/arc-prediction-markets/contracts/PredictionMarketAMM.sol` - constant-product YES/NO AMM with fee, built on market `create/redeem`.
- `refs/circlefin/arc-prediction-markets/scripts/deploy.ts` - deploys UMA infra from `@uma/core` artifacts (Timer, Finder, IdentifierWhitelist, AddressWhitelist, Store, TestnetERC20 ARCT, MockOracleAncillary, OptimisticOracleV2), wires Finder, whitelists, deploys BTC market + AMM, writes `.env.local`.
- `refs/circlefin/arc-prediction-markets/scripts/reset-markets.ts` - wipes `data/markets.json`.
- `refs/circlefin/arc-prediction-markets/app/api/create-market/route.ts` - server-side viem deployer (reads Hardhat `artifacts/`).
- `refs/circlefin/arc-prediction-markets/app/api/markets/route.ts` - returns `data/markets.json`.
- `refs/circlefin/arc-prediction-markets/app/market/[address]/page.tsx` - market detail; `contexts/MarketAddressContext.tsx` scopes hooks to one market/AMM pair.
- `refs/circlefin/arc-prediction-markets/contexts/WalletContext.tsx` - dual wallet (wagmi injected + Circle passkey SCA).
- `refs/circlefin/arc-prediction-markets/hooks/useContractWrite.ts` - unified EOA / UserOp write.
- `refs/circlefin/arc-prediction-markets/hooks/amm/*`, `hooks/market/*` - state reads, trades, oracle propose/dispute/settle (with Timer bump), token balances.
- `refs/circlefin/arc-prediction-markets/lib/circle.ts` - passkey/modular transports + `estimateUserOpFees` (pimlico gas price with 1 gwei min priority, block-baseFee fallback).
- `refs/circlefin/arc-prediction-markets/lib/chain.ts`, `lib/wagmi.ts` - Arc testnet chain def; `lib/contracts/{addresses,abis/*}` - env addresses + ABIs (market, amm, oracle, timer, erc20).
- `refs/circlefin/arc-prediction-markets/components/{trading,actions,market,wallet}/*` - UI.

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Modular Wallets - transports | `toPasskeyTransport`, `toModularTransport(`${clientUrl}/arcTestnet`, clientKey)` | `refs/circlefin/arc-prediction-markets/lib/circle.ts` | Circle passkey RP + bundler/RPC for Arc |
| Modular Wallets - passkey | `toWebAuthnCredential` Login, fallback Register with `user_<uuid8>` | `contexts/WalletContext.tsx:152-165` | Try login first, else register |
| Modular Wallets - smart account + bundler | `toCircleSmartAccount({client, owner: toWebAuthnAccount})`, `createBundlerClient({paymaster: true, userOperation.estimateFeesPerGas: estimateUserOpFees})` | `contexts/WalletContext.tsx:113-136`; `lib/circle.ts:119-139` | Gasless SCA with dynamic Arc fee estimation |
| Modular Wallets - batched gasless call | `bundlerClient.sendUserOperation({calls:[Timer.setCurrentTime, OO.proposePrice], paymaster: true})` | `hooks/market/useOracleActions.ts:87-107` | Atomic multi-call UserOp |
| Modular Wallets - generic write | `sendUserOperation({calls:[{to, data}], paymaster: true})` | `hooks/useContractWrite.ts:~60-64` | All market/AMM writes for passkey users |
| Circle faucet | https://faucet.circle.com | README | Arc testnet USDC for gas |

Not used: Dev-controlled wallets, App Kit/Bridge/CCTP, Gateway, x402, webhooks, USYC, Compliance. USDC is only the gas token here.

## 6. Env vars (names only)
From `.env.example` + README: `PRIVATE_KEY` (deployer; also used server-side by `/api/create-market`), `NEXT_PUBLIC_ALCHEMY_RPC_URL` (optional; defaults to public Arc RPC, `lib/chain.ts:21-22`), `NEXT_PUBLIC_CIRCLE_CLIENT_KEY`, `NEXT_PUBLIC_CIRCLE_CLIENT_URL`, auto-written: `NEXT_PUBLIC_MARKET_ADDRESS`, `NEXT_PUBLIC_AMM_ADDRESS`, `NEXT_PUBLIC_ARCT_ADDRESS`, `NEXT_PUBLIC_OO_V2_ADDRESS`, `NEXT_PUBLIC_FINDER_ADDRESS`, `NEXT_PUBLIC_TIMER_ADDRESS`, `NEXT_PUBLIC_MOCK_ORACLE_ADDRESS`.

## 7. How to run
Prereqs: Node 18+ (22.6+ for `npm run reset`), EOA private key funded with Arc testnet USDC for gas (many deploy txs), optional Circle Modular Wallets client key/URL.
```sh
npm install
cp .env.example .env.local     # set PRIVATE_KEY (+ Circle client key/url)
npm run compile                # REQUIRED: /api/create-market reads artifacts/ at runtime
npm run deploy                 # hardhat run scripts/deploy.ts --network arcTestnet
npm run dev                    # http://localhost:3000
npm run reset                  # optional: wipe user-created markets
```
Also `test:contracts` (hardhat test; no test dir in repo), `build`, `start`, `lint`. Passkey emulation: Chrome DevTools > WebAuthn virtual authenticator (README).

## 8. Smart contracts
`contracts/EventBasedPredictionMarket.sol` (is UMA `Testable`, 318 lines):
- Constructor(pairName, collateralToken, customAncillaryData, finder, timer, proposerReward, livenessTime, proposerBond) :94-125 - requires `YES_OR_NO_QUERY` whitelisted and collateral whitelisted; deploys Long ("PLT") and Short ("PST") ExpandedERC20 tokens.
- `initializeMarket()` :131-142 - pulls proposerReward from caller, calls `_requestOraclePrice`.
- `priceSettled(identifier, timestamp, ancillaryData, price)` :150-175 - OO-only callback; maps price to settlementPrice 1e18 / 5e17 / 0; ignores stale timestamps.
- `priceDisputed(...)` :185-203 - OO-only; re-requests with fresh timestamp.
- `create(n)` :213-218 (1 ARCT -> 1 Long + 1 Short), `redeem(n)` :224-229 (pair -> 1 ARCT), `settle(long, short)` :237-253 (post-resolution payout).
- `_requestOraclePrice()` :262-297 - `requestPrice`, `setCustomLiveness`, `setBond`, `setEventBased`, `setCallbacks(false, true, true)`.
`contracts/PredictionMarketAMM.sol` (ReentrancyGuard, 231 lines):
- Constructor(market, feeBps<10000) :39-46; `initialize(liquidity)` :48-67 (one-time, anyone; mints pairs, sets equal reserves).
- `buyYes` :77-103, `buyNo` :105-123, `sellYes` :127-154, `sellNo` :156-179 (all `whenActive` = not resolved).
- Views: `getYesPrice` :181 (= reserveNo/(reserveYes+reserveNo)), `getNoPrice` :187, `getReserves` :192, `calcBuyYes/No` :197-213, `calcSellYes/No` :215-231.
Deploy (`scripts/deploy.ts`): CONFIG :46-68 (pairName BTC100K, ARCT 18 dec, default OO liveness 7200 s, market liveness 60 s, proposer reward 10 ARCT, bond 100 ARCT, AMM fee 200 bps, seed 1000 ARCT, deployer mint 100k); UMA infra :174-213; Finder wiring :221-225 (IdentifierWhitelist, CollateralWhitelist, Store, Oracle=MockOracleAncillary, OptimisticOracleV2); whitelist :229-233; market + AMM :247-294; env write :296-307.
Server-side deploy per market: `app/api/create-market/route.ts:36-40` (same params), deploy :230-250, approve+initialize :255-269, AMM deploy+seed :273-304.
Arc testnet facts: chain id `5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`, native USDC 18 decimals, fees defaultPriorityFee 2 gwei / baseFeeMultiplier 2 (`lib/chain.ts:24-48`). No deployed addresses committed.

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- Lift the UMA-on-Arc bootstrap (`scripts/deploy.ts:25-44` artifact loader + :174-233 deploy/wire) to get an Optimistic Oracle on Arc testnet; then use OO V2 `requestPrice`/`proposePrice`/`settle` + `priceSettled` callback (`EventBasedPredictionMarket.sol:150-175, 262-297`) as a dispute-able "deliverable accepted?" oracle for milestone escrow (RFB3): agent (or AI validator) proposes YES, client has a liveness window to dispute, escrow releases on `priceSettled`.
- Lift `app/api/create-market/route.ts:178-304` as a template for a server-side agent that deploys and initializes contracts on Arc with viem (`privateKeyToAccount(..., { nonceManager })`, direct Arc RPC because Alchemy's Arc mempool reports stale nonces - comment at :179-181).
- Lift `lib/circle.ts:119-139` `estimateUserOpFees` - the most robust Arc UserOp fee estimator among the samples (pimlico tiers + 1 gwei floor + baseFee fallback).
- Lift the batched UserOp pattern (`hooks/market/useOracleActions.ts:87-107`) for atomic approve+action flows (e.g., approve USDC + fund escrow in one passkey tap).
- Reuse `PredictionMarketAMM` pricing views (`getYesPrice`) if you want a market-implied probability signal (e.g., vendor delivery-risk markets) - niche.

## 11. Limitations / gotchas
- Time is controlled by UMA `Timer`, not block time: every contract reads `getCurrentTime()` from a Timer whose `setCurrentTime` is callable by anyone, and the frontend sets it to wall-clock before propose/settle (`hooks/market/useOracleActions.ts:90-100, 117-124, 238, 264`). Liveness can be bypassed by setting time forward - demo only.
- DVM is `MockOracleAncillary` (admin pushes prices) - disputes are not truly arbitrated.
- `/api/create-market` is unauthenticated and spends the deployer key (mints ARCT, deploys 2 contracts, ~7 txs per call); anyone can drain gas. Writes to `data/markets.json` on local disk - won't persist on serverless (Vercel) and has no locking. Requires `npm run compile` so `artifacts/` exists at runtime (`route.ts:44-48`). Server hardcodes public Arc RPC (`route.ts:184`), ignoring `NEXT_PUBLIC_ALCHEMY_RPC_URL`.
- Every custom market is hardcoded to category "Crypto" (`route.ts:314`); pairName = first 10 alphanumerics of title (`route.ts:173-176`).
- AMM: `initialize` callable by anyone once; no LP token / remove-liquidity, so seed liquidity is locked forever; no way for the AMM to claim its leftover Long/Short after resolution; trading stops once resolved (`whenActive`). No slippage/minOut params on buy/sell (front-run-able).
- Collateral ARCT is freely mintable (UMA TestnetERC20). Swapping in Arc USDC (6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`) requires whitelisting it in AddressWhitelist and adjusting UI decimals; README's "USDC" naming in AMM (`usdcAmount`) is misleading - it's ARCT.
- The BTC market question references "before June 1, 2026" (already past as of this card).
- README screenshot alt text says "Arc Nanopayments Demo" (copy-paste); `data/markets.json` ships empty (0 bytes; handled as `[]`).
- Passkey connect tries Login first and silently falls back to Register on any error (`contexts/WalletContext.tsx:152-165`), which can create duplicate wallets if the user just cancels the prompt.
- Testnet only; no backend auth, no DB.
