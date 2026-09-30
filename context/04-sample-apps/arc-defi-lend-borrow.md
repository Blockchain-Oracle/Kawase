# arc-defi-lend-borrow
Minimal collateralized lending dApp on Arc testnet: deposit cirBTC as collateral, borrow (mock) USDC up to a collateral factor, repay, withdraw; wallets via MetaMask or Circle passkey modular wallet (gasless).
Sources: https://github.com/circlefin/arc-defi-lend-borrow, refs/circlefin/arc-defi-lend-borrow @ d621644, https://docs.arc.io/build/sample-apps/arc-defi-lend-borrow (listed at .firecrawl/docs/arc-llms-full.txt:18895; card at :34942; page body not in dump)
Verified: 2026-09-29

## 1. What it does
- Connect via injected wallet (wagmi `injected()`) or Circle passkey smart account (register/login with WebAuthn; credential id + address cached in localStorage) (`contexts/WalletContext.tsx:117-200`).
- Deposit cirBTC: approve cirBTC to the lending contract, then `depositCollateral(amount)` (`hooks/lending/useLendingActions.ts:91-135`).
- Borrow: `takeLoan(amount)` up to `collateralBalances * collateralFactor / 100` (default 50%) (`contracts/LendingBorrowing.sol:72-88`).
- Repay (partial or full) after approving USDC: `repayLoan(amount)`; withdraw unlocked collateral: `withdrawCollateral(amount)` (`contracts/LendingBorrowing.sol:91-119`).
- In-app faucet button mints mock USDC via `allocateTo` on the TestnetERC20 (`hooks/lending/useLendingActions.ts:77-80`).
- Dashboard polls pool liquidity, collateral, loan, maxBorrow every 5 s (`hooks/lending/useLendingState.ts:39-46`, `lib/wagmi.ts:23-24`); each confirmed action is logged to a Supabase `transactions` table client-side (`hooks/useTransactions.ts:49`, `lib/supabase/transactions.ts:66-82`) and shown in a sortable history table.

## 2. RFB fit
- Primary: RFB1 Intelligent Business Treasury (weak fit) - shows a working on-chain credit primitive on Arc (borrow USDC against BTC collateral) that a treasury agent could use for short-term liquidity; also the cleanest example here of dual-wallet (EOA + passkey SCA) contract writes.
- Secondary: RFB4 (the `useContractWrite` hook is a template for an agent executing arbitrary contract calls gaslessly via UserOps); RFB3 (the Solidity pattern of lock-funds/release-on-condition is adjacent to escrow).
- Missing: no price oracle, interest, liquidation, yield (USYC), policy limits, AI, or backend - everything is client-side. Loan token is a mock USDC, not Arc USDC.

## 3. Tech stack + versions (package.json)
- Next.js 16.2.0, React 19.2.4, TypeScript 5, Tailwind 4, shadcn 4.1 + @base-ui/react 1.3.
- Wallet/chain: `wagmi` ^3.5.0, `viem` ^2.47.5, `@tanstack/react-query` ^5.91.3, `@circle-fin/modular-wallets-core` ^1.0.13.
- Contracts: Hardhat ^2.22.0 + `@nomicfoundation/hardhat-toolbox` ^4.0.0 (ethers v6), Solidity 0.8.17 with optimizer runs 1,000,000 (`hardhat.config.ts:21-28`), `@openzeppelin/contracts` ^4.9.6, ts-node, dotenv.
- DB: `@supabase/supabase-js` ^2.104.0, supabase CLI ^2.93.0 (Docker).
- Node v18+ (README). npm. Note package.json `name` is `arc-borrow-lend` and its description is stale ("deposit USDC as collateral and borrow ARCT").

## 4. Architecture
- `refs/circlefin/arc-defi-lend-borrow/contracts/LendingBorrowing.sol` - lending pool (collateral/loan tokens, collateral factor, one loan per user).
- `refs/circlefin/arc-defi-lend-borrow/contracts/TestnetERC20.sol` - freely mintable ERC20 with configurable decimals (`allocateTo`).
- `refs/circlefin/arc-defi-lend-borrow/scripts/deploy-lending.ts` - deploys mock USDC (8 dec) + LendingBorrowing, mints, funds pool, writes addresses to `.env.local`; clears stuck nonces first.
- `refs/circlefin/arc-defi-lend-borrow/hardhat.config.ts` - `arcTestnet` network + ArcScan verify config.
- `refs/circlefin/arc-defi-lend-borrow/contexts/WalletContext.tsx` - dual wallet state (wagmi + Circle passkey), `initCircleAccount`, `connectCircle`, `ensureCircleSigner` (lazy passkey signer on click).
- `refs/circlefin/arc-defi-lend-borrow/hooks/useContractWrite.ts` - unified write: UserOp with paymaster for Circle, `writeContractAsync` for MetaMask; long-poll for UserOp receipts.
- `refs/circlefin/arc-defi-lend-borrow/hooks/lending/useLendingState.ts` / `useLendingActions.ts` - reads (multicall) and writes (approve/deposit/withdraw/borrow/repay/mint).
- `refs/circlefin/arc-defi-lend-borrow/lib/circle.ts` - cached passkey transport, modular transport, Circle public client.
- `refs/circlefin/arc-defi-lend-borrow/lib/wagmi.ts` - Arc testnet chain def + wagmi config.
- `refs/circlefin/arc-defi-lend-borrow/lib/contracts/{addresses.ts,abis/*}` - addresses from env + ABIs; decimals constants.
- `refs/circlefin/arc-defi-lend-borrow/lib/errors.ts` - revert-reason -> friendly message mapping.
- `refs/circlefin/arc-defi-lend-borrow/lib/supabase/{client,transactions}.ts`, `hooks/useTransactions.ts`, `components/transactions/*` - history persistence + table.
- `refs/circlefin/arc-defi-lend-borrow/app/page.tsx` - single-page UI.

## 5. Circle products/SDKs used
| product | package/API | where | what the call does |
|---|---|---|---|
| Modular Wallets - passkey transport | `toPasskeyTransport(clientUrl, clientKey)` | `refs/circlefin/arc-defi-lend-borrow/lib/circle.ts:48-54` | Circle WebAuthn RP transport |
| Modular Wallets - RPC transport | `toModularTransport(`${clientUrl}/arcTestnet`, clientKey)` | `lib/circle.ts:56-65` | Circle bundler/RPC for Arc testnet |
| Modular Wallets - passkey register/login | `toWebAuthnCredential({mode: WebAuthnMode.Register, username})` / `Login` with `credentialId` hint | `contexts/WalletContext.tsx:160-186, 219-221` | Creates/loads passkey; random `user_xxxxxxxx` username |
| Modular Wallets - smart account | `toCircleSmartAccount({client: getCirclePublicClient(), owner: toWebAuthnAccount({credential})})` | `contexts/WalletContext.tsx:119-125` | Circle SCA owned by passkey |
| Modular Wallets - bundler (gasless) | viem `createBundlerClient({..., paymaster: true, userOperation.estimateFeesPerGas: 50 gwei / 2 gwei})` | `contexts/WalletContext.tsx:127-138` | Sponsored UserOps with hardcoded Arc fees |
| Modular Wallets - contract call | `client.sendUserOperation({calls:[{to, data: encodeFunctionData(...)}], paymaster: true})` + looped `waitForUserOperationReceipt({timeout: 60_000})` | `hooks/useContractWrite.ts:60-131` | Gasless arbitrary contract write; tolerates slow Arc bundler |
| cirBTC (Circle wrapped BTC token) | ERC20 at `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | `scripts/deploy-lending.ts:28`; `lib/contracts/addresses.ts:21-23` | Collateral token (8 decimals, FiatTokenProxy) |
| Circle faucet | https://faucet.circle.com | README, `scripts/deploy-lending.ts:112` | Arc testnet USDC for gas |

Not used: Dev-controlled wallets, App Kit/Bridge/CCTP, Gateway, x402, webhooks, USYC, Compliance.

## 6. Env vars (names only)
From `.env.example`: `PRIVATE_KEY` (deployer), `NEXT_PUBLIC_RPC_URL` (defaults to public Arc RPC), `ARCSCAN_API_KEY` (verify, optional), `NEXT_PUBLIC_CIRCLE_CLIENT_KEY`, `NEXT_PUBLIC_CIRCLE_CLIENT_URL`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_LENDING_ADDRESS`, `NEXT_PUBLIC_CIRBTC_ADDRESS` (last three auto-written by deploy), `NEXT_PUBLIC_EXPLORER_URL` (optional), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## 7. How to run
Prereqs: Node 18+, Docker (Supabase), an exportable-key EOA funded with Arc testnet USDC (gas), optional Circle Modular Wallets client key/URL, and some cirBTC (no public faucet - see gotchas).
```sh
npm install
cp .env.example .env.local        # set PRIVATE_KEY (+ Circle client key/url)
npm run db:start && npm run db:status   # copy Supabase URL + publishable key
npm run compile
npm run deploy:lending            # hardhat run scripts/deploy-lending.ts --network arcTestnet
npm run dev                       # http://localhost:3000
```
Other scripts: `db:stop`, `db:reset`, `build`, `start`, `lint`. For passkeys without hardware use Chrome DevTools > WebAuthn virtual authenticator (ctap2, internal, resident keys + UV) per README.

## 8. Smart contracts
`contracts/LendingBorrowing.sol` (Ownable, SafeERC20, pragma ^0.8.0, compiled 0.8.17):
- State: `collateralToken`, `lendingToken` (immutable, :33-34), `collateralFactor` (:35), `collateralBalances` (:37), `loans` struct {amount, collateral, isActive} (:27-31,38).
- `constructor(collateralToken, lendingToken, collateralFactor 1-100)` :47-58
- `depositCollateral(amount)` :63-68 (transferFrom; needs approve)
- `takeLoan(amount)` :72-88 (one active loan; `amount <= collateral*factor/100`; pool liquidity check; snapshots collateral as locked)
- `repayLoan(amount)` :91-106 (partial ok; clears loan at 0)
- `withdrawCollateral(amount)` :109-119 (only unlocked portion)
- `fundPool(amount)` onlyOwner :124-128; `setCollateralFactor` onlyOwner :131-135
- Views: `maxBorrow` :140-143, `availableCollateral` :146-149, `poolLiquidity` :152-154
- Events: CollateralDeposited, CollateralWithdrawn, LoanTaken, LoanRepaid, PoolFunded, CollateralFactorUpdated (:40-45).
`contracts/TestnetERC20.sol`: ERC20 with custom decimals and public unrestricted `allocateTo(address,uint256)` mint (:22-24).
Deploy: `scripts/deploy-lending.ts` - `clearStuckNonces` (:66-93, 5x gas self-transfers), deploy TestnetERC20("USD Coin","USDC",8) (:131-135), mint 100k (:138-140), deploy LendingBorrowing(cirBTC, mockUSDC, 50) (:149-157), approve + fundPool 50k (:181-182), write `.env.local` (:189-193).
Arc testnet facts: chain id `5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app` with verify API `https://testnet.arcscan.app/api` (`hardhat.config.ts:30-50`), native USDC 18 decimals (`lib/wagmi.ts:30-54`, fees: defaultPriorityFee 2 gwei, baseFeeMultiplier 2), cirBTC `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` (8 decimals). No deployed LendingBorrowing address is committed (each dev deploys their own).

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- Lift `hooks/useContractWrite.ts:49-165` as a generic "write any contract from EOA or passkey SCA" hook; its UserOp receipt long-poll (:99-131) handles Arc bundler latency that otherwise surfaces as false failures.
- Lift `contexts/WalletContext.tsx:117-145` (Circle smart account + paymaster bundler with fixed fees) for a gasless Arc client; `ensureCircleSigner` (:210-240) shows how to rehydrate a passkey session without prompting on page load.
- Lift `hardhat.config.ts:17-50` as the Arc testnet Hardhat network + ArcScan verification block, and `scripts/deploy-lending.ts:47-93` for `.env.local` address write-back and stuck-nonce clearing.
- Adapt `LendingBorrowing.sol` lock/release pattern (`takeLoan` snapshot locking + `withdrawCollateral` available-balance check) into a milestone escrow or a "credit line" contract for an agent treasury (RFB1/RFB3); swap the mock loan token for Arc USDC `0x3600000000000000000000000000000000000000` (6 decimals).
- Lift `lib/errors.ts` revert-reason mapping pattern for friendly agent/user error messages.

## 11. Limitations / gotchas
- cirBTC has no public faucet (README: FiatTokenProxy, Circle-whitelisted minters only) - you need an allocation from Circle Discord or a wallet that holds some; without it you can't demo deposit/borrow. Workaround for a demo: redeploy with a TestnetERC20 as collateral too.
- No price oracle: borrow limit compares raw token units 1:1 (`LendingBorrowing.sol:76`), i.e. 1 cirBTC is valued at 1 USDC; only "works" because both tokens are 8 decimals. No interest, no liquidation, one loan per user, collateral deposited after taking a loan is not counted toward that loan.
- Loan token is a mock "USDC" with 8 decimals and an unrestricted public mint (`TestnetERC20.sol:22-24`) - anyone can mint unlimited. Pointing at real Arc USDC requires changing `LOAN_DECIMALS` to 6 (`lib/contracts/addresses.ts:39-40`) and breaks the 1:1 factor math.
- Contract comments/natspec still describe the old design (USDC collateral, ARCT loan) (`LendingBorrowing.sol:8-34`).
- `addresses.ts` uses `??` on env vars, so an empty-string env value yields `""` rather than the fallback (`lib/contracts/addresses.ts:21-31`).
- Public Arc RPC rate-limits (HTTP 429) under the 4-5 s polling; set `NEXT_PUBLIC_RPC_URL` to a dedicated provider (README).
- Passkey bundler uses hardcoded fees 50 gwei max / 2 gwei priority (`WalletContext.tsx:133-136`); may fail if Arc base fee rises.
- Supabase `transactions` RLS policies are `select using (true)` / `insert with check (true)` (`supabase/migrations/20260421165323_init_transactions.sql:40-44`) - anyone with the publishable key can insert fake history; rows are written client-side only after confirmation, so failed txs are not recorded.
- Deployment needs an EOA private key; Circle passkey wallets cannot deploy (README). Deploy script writes all of `.env.local` back out, dropping comments.
- Testnet only; no backend, no auth.
