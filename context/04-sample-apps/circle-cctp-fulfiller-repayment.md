# circle-cctp-fulfiller-repayment
Pay first, settle later: a chosen "fulfiller" pays a contractor on Ethereum Sepolia with its own USDC. Later the platform burns USDC from its Arc Testnet treasury via CCTP V2, the mint lands in an `IntentRepaymentEscrow` contract, and the operator releases the repayment to the fulfiller.
Sources: https://github.com/circlefin/circle-cctp-fulfiller-repayment, refs/circlefin/circle-cctp-fulfiller-repayment @ 271cdc6 (single commit "feat: initial commit (#1)"), no official docs page found in the arc/circle llms dumps
Verified: 2026-09-29

## 1. What it does
1. `npm run intent` writes a local intent record to `data/intents.json`: `intentId` = keccak(recipient, amount, priority, now), plus recipient, `amountUsdc`, `priority` (fast/cheap) and `maxFeeBps`.
2. `npm run fulfill`:
   - `chooseFulfiller` picks one of 3 mock profiles (alpha, beta, gamma) by amount cap, fee cap and priority.
   - That fulfiller's key sends USDC to the recipient on Sepolia.
   - The operator calls `registerIntentRepayment` on the escrow.
3. `npm run settle`:
   - Quotes the Iris fee, approves, and calls `depositForBurn` on Arc (domain 26) with `mintRecipient` = the escrow on Sepolia (domain 0).
   - Polls Iris `/v2/messages` for the attestation, then calls `receiveMessage` on Sepolia.
   - Calls `releaseToFulfiller`.
4. `npm run status` prints the state. `npm run serve` gives a vanilla HTML UI on :3001 that shells out to the same npm scripts.
- The state machine is resumable: intent_created, payout_sent, fulfilled, settlement_pending, mint_completed, repaid.

## 2. RFB fit
- **Primary: RFB2 AP/AR Automation (payment timing).** The payee gets paid instantly on their chain and treasury settles later from Arc. It is a pattern for crosschain vendor payouts.
- Secondary:
  - RFB3 Contractor/Vendor Network: fulfiller selection is a toy "network" with fee/speed/capacity. The on-chain escrow register/release pattern also applies.
  - RFB1: Arc-held treasury settling obligations on other chains.
- **Missing:**
  - No AI. Selection is a sort (`src/lib/flow-logic.ts:61-89`).
  - No Circle wallets. Raw private keys are used.
  - No screening, no reputation, no invoices.
  - The fulfiller fee (`feeBps`) is never actually paid: repayment equals the fronted amount.
  - No real solver competition. Single trusted operator.

## 3. Tech stack + versions
- TypeScript ESM scripts run with `node --env-file=.env --import=tsx`. Node `>=22` (`engines`).
- Dependencies: viem `^2.51.3`; dev dependencies tsx `^4.22.3`, typescript `^6.0.3`, `@types/node` `^25.9.1`. No framework.
- Foundry for the contract (`foundry.toml`: src=contracts, test=test, no libs). Solidity `^0.8.24`.
- Plain `node:http` server (`server.ts`) plus static `public/index.html`, `scripts.js` and `style.css`.

## 4. Architecture
- `refs/circlefin/circle-cctp-fulfiller-repayment/contracts/IntentRepaymentEscrow.sol`: operator-only repayment registry and release.
- `refs/circlefin/circle-cctp-fulfiller-repayment/test/IntentRepaymentEscrow.t.sol`: a single Foundry test with a mock USDC (`testRegistersAndRepaysSelectedFulfiller`, `:34`).
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/config/env.ts`: env loading plus checked-in defaults (USDC addresses, Iris sandbox URL, recipient, poll settings, fee buffer).
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/config/chains.ts`: viem clients (`arcTestnet` from `viem/chains`, Sepolia via `https://1rpc.io/sepolia`), accounts, CCTP domains.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts`: approve, Iris fee quote, `depositForBurn`, attestation fetch, `receiveMessage`.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/repayment.ts`: fulfiller payout transfer, register, release.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/flow-logic.ts`: `chooseFulfiller`, fee math, finality threshold.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/fulfillers.ts`: the 3 mock profiles.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/runtime.ts`: JSON file persistence plus `logStep`.
- `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/abis.ts`: USDC, TokenMessengerV2, MessageTransmitterV2 and escrow ABIs.
- `refs/circlefin/circle-cctp-fulfiller-repayment/scripts/{create-intent,fulfill-intent,start-settlement,print-status}.ts`: the CLI steps.
- `refs/circlefin/circle-cctp-fulfiller-repayment/server.ts`: UI server. Routes: `/api/status`, `/api/balances`, and `POST /api/{intent,fulfill,settle,status}`, which run `execFile("npm", ...)` (`:160`).

## 5. Circle products used
| Product | Package/API | Where | What the call does |
|---|---|---|---|
| CCTP V2 fee quote | Iris `GET {iris}/v2/burn/USDC/fees/26/0` | `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts:118-133` | Min fee (bps) for the chosen finality threshold (1000 fast / 2000 finalized) |
| CCTP V2 burn | TokenMessengerV2 `depositForBurn(amount, 0, bytes32(escrow), USDC, 0x0, maxFee, minFinality)` via viem | `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts:188-219` (approve `:92-107`) | Burns Arc USDC; the mint recipient is the escrow contract |
| CCTP V2 gross-up | fee math | `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts:151-186` | Computes the source amount so that destination amount >= target repayment |
| CCTP V2 attestation | Iris `GET {iris}/v2/messages/26?transactionHash=` | `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts:221-244`, poll loop `scripts/start-settlement.ts:34-46` | Returns message plus attestation (10s x 60) |
| CCTP V2 mint | MessageTransmitterV2 `receiveMessage(message, attestation)` | `refs/circlefin/circle-cctp-fulfiller-repayment/src/lib/cctp.ts:250-269` | Mints USDC into the escrow on Sepolia; "Nonce already used" is treated as done (`start-settlement.ts:48-50`) |
| USDC ERC-20 | `transfer` | `src/lib/repayment.ts:62-83` | Fulfiller fronts the payout on Sepolia |

Addresses:

| Item | Value | Where |
|---|---|---|
| TokenMessengerV2 (testnet) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `src/lib/cctp.ts:58` |
| MessageTransmitterV2 (testnet) | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | `src/lib/cctp.ts:59` |
| Iris sandbox | `https://iris-api-sandbox.circle.com` | `src/config/env.ts:26` |

No Circle SDKs (no DCW, App Kit or Bridge Kit). Everything is raw viem plus the Iris HTTP API.

## 6. Env vars
`OPERATOR_PRIVATE_KEY`, `FULFILLER_ALPHA_PRIVATE_KEY`, `FULFILLER_BETA_PRIVATE_KEY`, `FULFILLER_GAMMA_PRIVATE_KEY`, `REPAYMENT_CONTRACT_ADDRESS`. Other settings are hardcoded in `src/config/env.ts:22-37`.

## 7. How to run
```
cp .env.example .env        # fill 4 private keys + REPAYMENT_CONTRACT_ADDRESS
npm install
forge test                  # or npm run test:contract
npm run serve               # UI at http://localhost:3001
# or CLI:
npm run intent [-- --amount 3 --priority cheap --max-fee-bps 20 --recipient 0x...]
npm run fulfill && npm run status && npm run settle && npm run status
```
Prerequisites:
- The operator needs Arc Testnet USDC (gas plus the burn) and Sepolia ETH.
- Fulfillers need Sepolia ETH and Sepolia USDC.
- An escrow on Sepolia. The demo escrow is `0x65b1210b4ee0e56f03184b454b3bd035e8c6bdf0` (README), but its OPERATOR is fixed to whoever deployed it, so to call register/release yourself you must deploy your own. There is no deploy script. Use `forge create contracts/IntentRepaymentEscrow.sol:IntentRepaymentEscrow --constructor-args <sepoliaUSDC> <operator>`.
- Other scripts: `npm run typecheck`, `npm run build:contract`.

## 8. Smart contracts
`refs/circlefin/circle-cctp-fulfiller-repayment/contracts/IntentRepaymentEscrow.sol`:
- `constructor(address usdcAddress, address operatorAddress)` (`:32`). Both are immutable.
- `registerIntentRepayment(bytes32 intentId, address fulfiller, uint256 amount, address recipient)`, onlyOperator (`:43-57`). Reverts with `RepaymentExists` on a duplicate and emits `IntentRepaymentRegistered`.
- `releaseToFulfiller(bytes32 intentId)`, onlyOperator (`:60-69`). It checks that the intent exists, that it is not already repaid, and that the contract's **total** USDC balance is at least the amount. It then marks the intent repaid, calls `transfer`, and emits `RepaidToFulfiller`.
- Chain facts:
  - Arc domain `26` and Sepolia domain `0` (`src/config/chains.ts:76-77`); finality 1000/2000 (`:78-79`).
  - Arc USDC `0x3600000000000000000000000000000000000000` and Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (`src/config/env.ts:23-24`).
  - The Arc chain comes from `viem/chains` `arcTestnet` with the default RPC.

## 9. AI/LLM usage
None. The "selection" is a deterministic filter and sort (`src/lib/flow-logic.ts:61-89`) over the profiles in `src/lib/fulfillers.ts:28-53` (alpha 5bps/slow/100 cap, beta 12bps/fast, gamma 3bps/3 USDC cap).

## 10. Reusable for a hackathon entry
- **Clean CCTP V2 from Arc with viem:** lift `src/lib/cctp.ts:92-269` (approve, fee quote, `depositForBurn`, Iris poll, `receiveMessage`) to bridge Arc treasury USDC to any CCTP chain without the SDK. Change `DESTINATION_DOMAIN`, the RPC and the USDC address.
- **Fee gross-up:** `quoteBurnForTargetDestination` (`src/lib/cctp.ts:151-186`) guarantees the net amount arriving, which matters for exact invoice settlement in RFB2.
- **Escrow register/release pattern** (`contracts/IntentRepaymentEscrow.sol:43-69`) is a minimal base for RFB3 milestone escrow. Add per-intent funded accounting, refunds and a deadline.
- **Selection hook:** swap `chooseFulfiller` (`src/lib/flow-logic.ts:61`) for an LLM or reputation-scored vendor/route selector, and log the rationale into the intent `logs[]` array (`scripts/fulfill-intent.ts:57-61`). This works as an agent decision log.
- **Resumable status machine with JSON persistence:** `src/lib/runtime.ts` plus the status checks in `scripts/start-settlement.ts:56-125`. A cheap way to make an agent retry-safe.
- **Replay-safe mint:** treat "Nonce already used" as success (`scripts/start-settlement.ts:48-50`, `:89-96`).

## 11. Limitations / gotchas
- **Raw private keys in `.env`** for the operator and 3 fulfillers. There are no Circle wallets. One operator key signs on both chains (`src/config/chains.ts:28-31`).
- **Escrow accounting is pooled:** `releaseToFulfiller` checks only `balanceOf(this) >= amount` (`IntentRepaymentEscrow.sol:64`). One intent can be paid from another intent's mint. There is no refund or cancel, no deadline, and no link between a CCTP message and an intentId. The README says the intent record "is not a canonical CCTP message nonce".
- The fulfiller is repaid only the principal. `feeBps` is used for selection but never paid.
- `server.ts` has no auth and listens on port 3001 (Node default host = all interfaces). Its POST endpoints move real testnet funds by running npm scripts. There is a single global `isRunningAction` lock.
- A hardcoded public Sepolia RPC (`https://1rpc.io/sepolia`, `src/config/chains.ts:26`) may rate-limit. The default recipient is checked in (`src/config/env.ts:25`).
- `intentId` uses `Date.now()`, so it is not deterministic across retries of `intent`.
- There is no deploy script, and the README demo escrow's operator is not you.
- The corridor is fixed to Arc to Sepolia. Testnet only. It is a single initial commit, so expect it to be lightly maintained.
