# arc-x402-circle-wallets
Promised: an AI agent that pays for paywalled x402 services on its own from a Circle developer-controlled wallet, settling USDC on Arc testnet. Delivered: a README-only stub with no code.
Sources: https://github.com/circlefin/arc-x402-circle-wallets, refs/circlefin/arc-x402-circle-wallets @ f5f217b, (no official sample-app page; the closest official page is https://developers.circle.com/gateway-nanopayments/quickstarts/buyer, "Circle Wallets" tab, in `.firecrawl/docs/circle-llms-full.txt:64087`)
Verified: 2026-09-29

> **STATUS: EMPTY.** The repo has 1 file (`README.md`, 2 lines) and 1 commit, `f5f217b` "Initial commit", dated 2026-08-11. It has no package.json, no source, no contracts and no env file. The organizers still map **RFB4** to this repo. Treat it as a spec, not as code, and build the pattern from the sources listed in section 10.

## 1. What it does (promised, per README)
- An AI agent holds a **Circle developer-controlled wallet** (custodial, API key plus entity secret; no private key in the agent process).
- The agent calls a paywalled HTTP service and receives `402 Payment Required` with x402 payment requirements.
- The agent signs the x402 payment authorization with the dev-controlled wallet and retries. USDC settles on **Arc testnet**.
- "No human in the loop": the agent pays on its own.
- Full README text: `refs/circlefin/arc-x402-circle-wallets/README.md:1-2`.

## 2. RFB fit
- **Primary: RFB4 Autonomous Business Operator.** It gives the agent a wallet holding USDC that buys services over x402. This is the organizer's canonical repo for RFB4.
- Secondary: RFB2 (an AP agent paying vendor APIs per call) and RFB1 (a treasury agent buying data feeds).
- Missing for RFB4, and everything else, because the repo has no code: budgets and approval limits (on-chain or policy), a decision log, escalation to a human, and service discovery. You have to build all of it.

## 3. Tech stack + versions
None in the repo. Expected stack, taken from the official buyer quickstart (`circle-llms-full.txt:64107-64130`):
- Node.js v22.6+ (the quickstart runs `.ts` natively with `node --env-file=.env pay.ts`)
- `@circle-fin/developer-controlled-wallets`
- `@circle-fin/x402-batching` (the `BatchEvmScheme` and `CHAIN_CONFIGS` exports from `/client`)

## 4. Architecture
- `refs/circlefin/arc-x402-circle-wallets/README.md`: the only file, holding the one-sentence description.

## 5. Circle products/SDKs used
None in code. The intended products, and where each is actually demonstrated:

| product | package/API | where (working reference) | what the call does |
|---|---|---|---|
| Developer-Controlled Wallets: create | `@circle-fin/developer-controlled-wallets` `createWalletSet` / `createWallets` | `refs/circlefin/arc-escrow/generate-wallet.mjs:44,51` (blockchain `ARC-TESTNET` at :40) | Creates a wallet set and an Arc testnet wallet. **Change `accountType: "SCA"` to `"EOA"` for x402** (see section 11). |
| Dev-Controlled Wallets: sign x402 authorization | `circleClient.signTypedData({walletAddress, blockchain:"ARC-TESTNET", data})` | `.firecrawl/docs/circle-llms-full.txt:64224-64259` | Signs the EIP-3009/EIP-712 authorization that `BatchEvmScheme` builds. No private key is exposed. |
| Gateway deposit via dev wallet | `createContractExecutionTransaction` calls `approve(address,uint256)` and then `deposit(address,uint256)` on the Gateway Wallet | `circle-llms-full.txt:64298-64345` | Funds the Gateway balance that nanopayments draw from. |
| Gateway balance | `POST https://gateway-api-testnet.circle.com/v1/balances` `{token:"USDC",sources:[{domain:26,depositor}]}` | `circle-llms-full.txt:64347-64370`; same call at `refs/circlefin/arc-nanopayments/app/api/gateway/balance/route.ts:58-67` | Reads the available Gateway USDC on Arc (domain 26). |
| x402 client pay | `batchScheme.createPaymentPayload(x402Version, gatewayOption)`, then retry with a `PAYMENT-SIGNATURE` header | `circle-llms-full.txt:64409-64478` | Picks the `accepts[]` entry where `extra.name==="GatewayWalletBatched"` and network is `eip155:5042002`, builds the payload and retries. |
| x402 seller (to test against) | `createGatewayMiddleware({sellerAddress}).require("$0.01")` or `BatchFacilitatorClient` | `refs/circlefin/skills/plugins/circle/skills/accept-agent-payments/references/express-integration.md:13-27`; `refs/circlefin/arc-nanopayments/lib/x402.ts:70-192` | Creates the paywall that returns 402 and verifies and settles payments. |
| Agent wallet spending caps (Agent Stack, not dev-controlled) | `circle wallet limit set --per-tx --daily --weekly --monthly` | `refs/circlefin/skills/plugins/circle/skills/agent-wallet-policy/SKILL.md:65-69` | Circle-enforced caps. **Mainnet only**, and confirmed by an email OTP. |

## 6. Env vars
None in the repo. The quickstart uses `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` (`circle-llms-full.txt:64164-64167`). Add a seller-side `SELLER_ADDRESS` if you also run the paywall.

## 7. How to run
Nothing runs. To get the promised demo, use one of these:
1. **Official buyer quickstart, Circle Wallets tab** (`circle-llms-full.txt:64087-64520`): `npm init -y && npm pkg set type=module && npm install @circle-fin/developer-controlled-wallets @circle-fin/x402-batching`, write `pay.ts`, then `npm run pay`. It needs the seller quickstart (`circle-llms-full.txt:64758`) running at `http://localhost:3000/premium-data`.
2. **arc-nanopayments** as the seller: `npm run dev` exposes `/api/premium/*`. Replace its raw-private-key buyer (`agent.mts`) with the dev-wallet signer from option 1.

Prerequisites: a Circle Console API key, a registered entity secret (`refs/circlefin/docs-examples/entity-secret-setup/`), an EOA wallet on ARC-TESTNET, and testnet USDC from https://faucet.circle.com (on Arc it also pays gas).

## 8. Smart contracts
None in the repo. Relevant Arc testnet addresses from the adjacent sources:
- USDC (ERC-20 view, 6 decimals): `0x3600000000000000000000000000000000000000`
- Gateway Wallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`. Gateway Minter: `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` (`skills/plugins/circle/skills/use-gateway/SKILL.md:49-50`)
- Chain id `5042002`, x402 network `eip155:5042002`, CCTP/Gateway domain `26`.

## 9. AI/LLM usage
None in the repo. The "agent" part is unspecified. For ready-made LLM agent loops that pay over x402, see `refs/circlefin/agent-stack-starter-kits`. Those use Circle **Agent Wallets** via the `circle` CLI, which are not dev-controlled wallets.

## 10. Reusable for a hackathon entry: how to build the RFB4 pattern without this repo
1. **Wallet:** lift `createWalletSet`/`createWallets` from `refs/circlefin/arc-escrow/generate-wallet.mjs:35-56` and set `accountType: "EOA"`, `blockchains: ["ARC-TESTNET"]`.
2. **Signer:** copy the `BatchEvmScheme` plus `circleClient.signTypedData` adapter from `circle-llms-full.txt:64183-64260`. It is the key glue between a dev-controlled wallet and x402.
3. **Fund Gateway:** copy `ensureGatewayBalance` (approve, deposit, then poll) from `circle-llms-full.txt:64298-64394`.
4. **Pay:** copy `payForResource` from `circle-llms-full.txt:64409-64478`, and wrap it as an LLM tool (for example in the Vercel AI SDK or Claude Agent SDK kit shapes in `agent-stack-starter-kits/kits/*/src/tools.ts`).
5. **Paywall to buy from:** reuse `refs/circlefin/arc-nanopayments/lib/x402.ts:70-192` (`withGateway(handler, "$0.01", path)`), or the Express `createGatewayMiddleware` snippet.
6. **Budget / approval limits (RFB4 core):** dev-controlled wallets get no Circle spending policy from the CLI. `circle wallet limit` applies to Agent Wallets only, and on mainnet only. Options:
   - an app-level cap like `arc-nanopayments/agent.mts:34-36,234-254,282-284`, which pauses and asks the human for more allowance;
   - a command-level approval gate like `agent-stack-starter-kits/packages/kit-core/src/approval.ts:43-63,182-186`;
   - for truly on-chain limits, your own Solidity spending-policy contract on Arc that holds USDC and enforces per-tx and daily caps plus an allowlist (the agent's dev-controlled wallet calls it via `createContractExecutionTransaction`).
7. **Decision log / reconciliation:** record each paid call. See the `payment_events` table in `arc-nanopayments/supabase/migrations/20260310000000_create_transactions.sql` and the seller-side `onSettleFailure` hook at `circle-llms-full.txt:64062-64078`.

## 11. Limitations / gotchas
- **No code at all.** Do not cite it as a working reference in a submission; cite the quickstart and the repos above.
- **The x402 wallet must be an EOA.** Gateway checks the EIP-3009 signature with `ecrecover`, so SCA wallets are not supported (`circle-llms-full.txt:64097-64101`). arc-escrow and arc-fintech create **SCA** wallets, so do not copy their `accountType` as-is.
- Pick the `accepts[]` option whose network matches `ARC-TESTNET` (`eip155:5042002`). Otherwise the EIP-712 `chainId` won't match the signer (`circle-llms-full.txt:64399-64404`).
- The dev-wallet `signTypedData` needs an explicit `EIP712Domain` type and a stringified `chainId`/bigints (`circle-llms-full.txt:64224-64241`).
- The seller returns data once Gateway accepts the payment. Batched on-chain settlement lands minutes later (`circle-llms-full.txt:64514-64520`), so reconcile asynchronously.
- Agent Stack spending policies (`circle wallet limit set`) are **mainnet-only** and OTP-gated. They are unusable for an Arc-testnet autonomous demo, so budget enforcement must live in your app or contract.
