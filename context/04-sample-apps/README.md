# 04 · Sample apps: index, fastest paths per RFB, and reusable snippets
This file indexes Circle's open-source Arc sample apps and related repos, says which one to fork for each RFB, and points to the best file:line for each building block.
Sources: .firecrawl/tameion.md ("Reference implementations · Arc sample apps"), https://docs.arc.network/arc/references/sample-applications (`.firecrawl/docs/arc-llms-full.txt:18856-18900`), `gh repo list circlefin` (99 repos, pulled 2026-09-29), shallow clones in `refs/circlefin/` (re-create them with `bash refs/clone.sh`, or refresh with `--update`)
Verified: 2026-09-29

Each repo has its own card in this folder (`<repo>.md`) covering stack, architecture, Circle products with file:line references, env var names, run steps, contracts, AI usage, what to reuse, and gotchas. Paths below are relative to `refs/circlefin/<repo>/` unless written out in full.

## Index

| Repo @ sha | One-liner | RFB | Circle products used | Stack |
|---|---|---|---|---|
| [arc-fintech](arc-fintech.md) @0b10d38 | Multichain treasury console: dev wallets on 4 testnets, Gateway unified balance, send/bridge/swap/earn, Compliance screening | **RFB1** (organizer pick); also RFB2 payouts, RFB5 screening | Dev-Controlled Wallets (SCA+EOA), App Kit (send/bridge/swap/unified balance), EarnKit, Onramp Kit, Compliance Engine, webhooks | Next 16.2, React 19, Supabase, viem |
| [arc-escrow](arc-escrow.md) @d5006bc | Freelance escrow: GPT reads the contract, a Refund Protocol escrow is deployed per deal, GPT-4o validates the deliverable image, then release or refund | **RFB3** (organizer pick); RFB2 doc parsing | Dev-Controlled Wallets, Smart Contract Platform deploy, webhooks, faucet | Next 14.2, Supabase, openai 6.22, Solidity |
| [arc-x402-circle-wallets](arc-x402-circle-wallets.md) @f5f217b | **README-only stub, no code.** Promises an agent paying x402 services from a dev-controlled wallet | **RFB4** (organizer pick) | (none; see card for the pattern to use instead) | none |
| [arc-nanopayments](arc-nanopayments.md) @a29f920 | x402 seller paywall plus a buyer script paying sub-cent USDC through Gateway batching | RFB4; RFB2 | x402 batching (`@circle-fin/x402-batching` 2.0.4), Gateway | Next 16.1, Supabase, viem |
| [arc-multichain-wallet](arc-multichain-wallet.md) @3bca13f | Unified USDC balance across Arc, Base Sepolia and Fuji using the raw Gateway API | RFB1 (unified balance) | Dev-Controlled Wallets v10, Gateway (raw burn intents) | Next latest, wagmi |
| [arc-stablecoin-fx](arc-stablecoin-fx.md) @779eb1a | Server-side USDC↔EURC swaps with a bps platform fee | RFB1 (FX rebalance); RFB2/4 | App Kit Swap + adapter-circle-wallets, Dev-Controlled Wallets, webhook | Next 16.2, app-kit ^1.4, Supabase |
| [arc-p2p-payments](arc-p2p-payments.md) @1698907 | Gasless P2P USDC payments from a passkey-owned modular smart account | RFB4 (human-approval leg); RFB2 | Modular Wallets (bundler + paymaster), webhooks with signature check | Next latest, Supabase |
| [arc-commerce](arc-commerce.md) @1a3a5e0 | Buy credits with USDC; a webhook credits the account; admin treasury send/bridge | RFB2 (AR); RFB1 | Dev-Controlled Wallets v10, App Kit 1.7 (send, CCTP Fast bridge), webhooks | Next 16.1, wagmi, Supabase |
| [arc-ecommerce-payments](arc-ecommerce-payments.md) @be2017d | Storefront checkout on the Commerce Payments Protocol escrow: authorize, capture, void, refund in USDC or EURC | RFB3 (better escrow base); RFB2/4 | Dev-Controlled Wallets (EOA), Smart Contract Platform deploy plus event monitor, faucet | Next 16.2, viem, RainbowKit |
| [arc-defi-lend-borrow](arc-defi-lend-borrow.md) @d621644 | Deposit cirBTC as collateral, borrow (mock) USDC | weak RFB1 | Modular Wallets | Next, Hardhat |
| [arc-prediction-markets](arc-prediction-markets.md) @0f40195 | UMA OOv2 markets plus a constant-product AMM, deployed to Arc | none directly (oracle pattern could serve RFB3 disputes) | Modular Wallets | Next, Hardhat, UMA |
| [circle-cctp-fulfiller-repayment](circle-cctp-fulfiller-repayment.md) @271cdc6 | Pay first, settle later: a fulfiller pays now, then CCTP V2 burns on Arc and mints into an escrow to repay | RFB2 (timing); RFB3 | CCTP V2 contracts + Iris attestation API (raw viem) | tsx scripts, Foundry |
| [docs-examples](docs-examples.md) @b04f580 | Minimal official App Kit demos: bridge, earn, onramp, send, swap, transfer widget, unified balance, plus entity secret and user-wallet demos | snippet source for all RFBs | App Kit (all kits), Dev and User-Controlled Wallets | Vite + TS, app-kit ^1.15 |
| [agent-stack-starter-kits](agent-stack-starter-kits.md) @3996330 | 6 agent kits (Claude Agent SDK, OpenAI Agents, Vercel AI, LangChain, Mastra, Google ADK) that pay via the `circle` CLI Agent Wallet | RFB4 | Circle Agent Stack (CLI, Agent Wallet, skills) | Bun, Node 22.15+ |
| [skills](skills.md) @58ab864 | Circle's 18 AI-coding skills plus the codegen MCP server | all (build-time aid) | all products (docs) | Markdown |
| [sidequestor](sidequestor.md) @142ae7a | Circle-authored local agent that watches Slack, email and GitHub, with spend caps, approvals and an event ledger (no Circle APIs) | RFB4 patterns (decision log, budgets) | none | Python 3.11 |
| [arc-remote-signer](arc-remote-signer.md) @a9e9fdb | Nitro-Enclave gRPC signer for Arc validator consensus keys | security story only | none | Go, AWS Nitro/KMS |

### Other circlefin repos (not cloned; there if you need them)
- **Contracts:** `evm-gateway-contracts`, `evm-cctp-contracts`, `stablecoin-evm` (USDC/EURC FiatToken), `buidl-wallet-contracts` (ERC-6900 modular accounts, useful for an on-chain PolicyWallet in RFB4), `sponsored-cctp-extension-contracts`, `evm-cpn-contracts` (Circle Payments Network), `evm-xreserve-contracts`, `seizure-registry-contracts` (empty).
- **SDKs and tools:** `modularwallets-web-sdk`, `w3s-pw-web-sdk`, `circle-nodejs-sdk`, `dev-wallet-pytools`, `contract-cli`, `cctp-go`, `arc-foundry` (Foundry fork with `arc-anvil`), `arc-node`.
- **Other samples:** `circle-bridge-kit-transfer`, `circle-cctp-crosschain-transfer`, `onramp-kit-demo`, `payments-sample-app`, `w3s-*-sample-app-wallets` (mobile), `msca-wallet-recovery`.
- **Agent/AI research:** `circle-ooak` (Python Object-Oriented Agent Kit), `txt2txn-web` / `txt2txn-service` (AI intents research), `recibo` (encrypted memos on ERC-20 transfers, which could be used to attach invoice references to payments for RFB2).
- **Avoid:** `refund-protocol` has a README warning of an arbiter-drain flaw (and arc-escrow vendors the same code; see below). `ai-agents-blockchain-payment-system-sample-app`, `arc-defi-lending-and-borrowing` and `circle-research` are empty (size 0).
- The official docs index (`arc-llms-full.txt:18856`) lists 10 apps. It **omits** `arc-x402-circle-wallets`, and adds `arc-prediction-markets`, which the hackathon page does not list.

## Fastest path to a demo per RFB

**RFB1 Treasury:** fork `arc-fintech`. Before `npm run build` works, you must fix or remove its Onramp imports: the code imports the private package `@crcl-main/onramp-kit`, but `package.json` declares `@circle-fin/onramp-kit` (see the card). Wallets, send, Gateway deposit and bridge work with only a Circle API key, an entity secret and local Supabase. You then add the missing AI layer: a forecast/allocation agent that calls the existing routes (`app/api/bridge/rebalance/route.ts:308-320`, `app/api/payout/route.ts:404-438`, `lib/circle/app-kit-swap.ts:172`). For yield, App Kit Earn is **Morpho vaults, not USYC**. USYC needs a KYC allowlist and the Teller contract (testnet addresses are in [docs-examples.md](docs-examples.md)). Show USYC via Teller if you are allowlisted; otherwise use Earn and label it clearly.

**RFB2 AP/AR:** there is no invoice-parsing sample. Combine these:
- arc-escrow's GPT document extraction (`arc-escrow/app/api/contracts/analyze/route.ts:40-107`)
- arc-fintech's payout router and screening (`lib/compliance/utils.ts:36`)
- webhook reconciliation from `arc-commerce/app/api/circle/webhook/route.ts:180-253`
- payment timing ideas from `circle-cctp-fulfiller-repayment`

**RFB3 Contractor:** the organizer pick is `arc-escrow`, which is the fastest demo because it has AI validation built in. Its escrow contract, though, is Refund Protocol with the unfixed `earlyWithdrawByArbiter` drain (`contracts/escrow_smart_contract/RefundProtocol.sol:239-302`), and the deployed bytecode doesn't match the source (`lib/constants.ts:33`). Two ways forward:
- **Quickest:** keep arc-escrow's AI and UX, and swap the contract for your own milestone escrow.
- **Alternative:** use `arc-ecommerce-payments`' authorize/partial-capture escrow as the milestone engine (`lib/operator/operations.ts:44-129`), triggered by arc-escrow's validator (`app/api/contracts/validate-work/route.ts:102-207`).

**RFB4 Operator:** the organizer's repo is empty. Build it from these pieces:
1. **Wallet:** create a dev-controlled wallet as an **EOA** (Gateway x402 verifies with `ecrecover`), e.g. `arc-escrow/generate-wallet.mjs:44-55` with `accountType` changed.
2. **x402 buyer signer:** Circle's quickstart "Circle Wallets" tab (`.firecrawl/docs/circle-llms-full.txt:64183-64478`: `BatchEvmScheme` + `signTypedData`, Gateway deposit, pay).
3. **Paid service to buy from:** `arc-nanopayments/lib/x402.ts:70-192`.
4. **Agent loop and approval hook:** `agent-stack-starter-kits/kits/claude-agent-sdk/src/index.ts:260-269` (`canUseTool`).
5. **Decision log and spend caps:** patterns from `sidequestor` (`dispatch/spend-window.py:91-176`, `approval_state.py`).

   **On-chain limits:** the Agent Wallet's `circle wallet limit set` works on mainnet only. An on-chain budget has to be your own contract, or an ERC-6900 module from `buidl-wallet-contracts`.

   **Faster, CLI-based alternative:** `agent-stack-starter-kits` plus the `pay-via-agent-wallet` skill. It defaults to mainnet/Base (`chains.ts:31`), so repoint it to Arc testnet.

**RFB5 Compliance:** the only screening code in any sample is `arc-fintech/lib/compliance/utils.ts:36` (Compliance Engine). There is no skill for it, and screening is enforced only in the UI; unknown results default to PASS. Build the risk-tier agent around that call and enforce it server-side in the payout path.

## Reusable snippets (best file:line)

| Need | Best source | Alternatives |
|---|---|---|
| Create a dev-controlled wallet | `arc-fintech/app/api/wallet/route.ts:105-112` (SCA); `arc-fintech/lib/circle/create-gateway-eoa-wallets.ts:50` (EOA) | `arc-stablecoin-fx/src/lib/circle/wallets.ts:33-57`; one SCA on 3 chains in one call: `arc-multichain-wallet/app/api/wallet-set/route.ts:93-98`; entity-secret setup script: `docs-examples/entity-secret-setup/index.ts:55-59` and `arc-stablecoin-fx/scripts/generate-wallet.ts:90-149` |
| Send USDC on Arc (server wallet) | `arc-commerce/lib/actions/admin-wallets.ts:208-220` (App Kit `send`) | `arc-fintech/lib/circle/app-kit-send.ts:182-200` (with workaround at :125-152); browser: `docs-examples/app-kit-send/src/main.ts:117-122`; raw viem: `arc-nanopayments/agent.mts:138-155` |
| CCTP / Bridge Kit bridging | `arc-fintech/app/api/bridge/rebalance/route.ts:148` (estimate), `:308-320` (execute) | `arc-commerce/lib/actions/admin-wallets.ts:306-327`; `docs-examples/app-kit-bridge-evm/src/main.ts:110-121`; raw CCTP V2 (burn → Iris → mint): `circle-cctp-fulfiller-repayment/src/lib/cctp.ts:92-269` |
| Gateway (unified balance) | App Kit: `docs-examples/app-kit-unified-balance/src/main.ts:167-171` (deposit), `:219-223` (balances), `:249-258` (spend) | `arc-fintech/app/api/gateway/deposit/route.ts:97`, `app/api/payout/route.ts:404-438`; raw burn intent: `arc-multichain-wallet/lib/circle/gateway-sdk.ts:711-822` then mint at `:538-600` |
| x402 pay (buyer) | `arc-nanopayments/agent.mts:159-162, 267-268`; Gateway top-up `:174-221` | dev-wallet signer: `.firecrawl/docs/circle-llms-full.txt:64183-64260`; CLI: `skills/plugins/circle/skills/pay-via-agent-wallet/SKILL.md:72-82` |
| x402 paywall (seller) | `arc-nanopayments/lib/x402.ts:45-192` (verify :111, settle :126) | `skills/.../accept-agent-payments/references/express-integration.md:13-27` |
| Escrow create / release / refund | Commerce Payments: `arc-ecommerce-payments/lib/operator/operations.ts:44-129` (authorize/capture/void/refund) | arc-escrow deploy `app/api/contracts/escrow/route.ts:112-131`, release `app/api/contracts/validate-work/route.ts:256-270`, refund `app/api/contracts/escrow/refund/route.ts:116` (flawed contract); simple register/release escrow: `circle-cctp-fulfiller-repayment/contracts/IntentRepaymentEscrow.sol:43-69` |
| AI validation of a deliverable | `arc-escrow/app/api/contracts/validate-work/route.ts:102-207` (GPT-4o vision; passes only if valid and confidence is HIGH) | contract extraction: `arc-escrow/app/api/contracts/analyze/route.ts:40-107` |
| FX swap USDC↔EURC | `arc-stablecoin-fx/src/lib/appkit/swap.ts:102-158` (fee, stopLimit, approve retry); quote `:69-90` | `arc-fintech/lib/circle/app-kit-swap.ts:172`; browser: `docs-examples/app-kit-swap/src/main.ts:110-115` |
| Yield (Earn vaults) | `docs-examples/app-kit-earn/src/main.ts:104` (vaults), `:196` (deposit), `:297` (withdraw) | Earn is Morpho vaults, not USYC |
| Circle webhook verification | `arc-fintech/app/api/circle/webhook/route.ts:116-153` | `arc-p2p-payments/app/api/webhooks/circle/route.ts:429-512`; `arc-commerce/app/api/circle/webhook/route.ts:180-253` (raw-body check plus dedupe) |
| Passkey / modular gasless tx | `arc-p2p-payments/components/web3-provider.tsx:195-249`, `sendUSDC` at `:515-553` | UserOp fee estimator: `arc-prediction-markets/lib/circle.ts:119-139`; `arc-defi-lend-borrow/hooks/useContractWrite.ts:49-165` |
| Spending policy / human approval | off-chain: `arc-nanopayments/agent.mts:234-254`; `agent-stack-starter-kits/packages/kit-core/src/approval.ts:43-63` | Agent Wallet caps: `skills/.../agent-wallet-policy/SKILL.md:65-69` (mainnet only); no sample enforces limits on-chain |
| Address screening | `arc-fintech/lib/compliance/utils.ts:36` | none |
| Gasless EIP-3009 payer authorization | `arc-ecommerce-payments/lib/payments/authorization.ts:45-96`; token domains `lib/arc/tokens.ts:37-55` | none |

## Arc testnet facts seen in the code (verify before hardcoding)
- **Chain:** id `5042002`; CCTP/Gateway domain `26`.
- **USDC:** `0x3600000000000000000000000000000000000000`. It is the native gas token with 18 decimals; the ERC-20 view uses 6. Several samples' viem chain definitions wrongly set native decimals to 6.
- **EURC:** `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`.
- **Gateway contracts:** GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, GatewayMinter `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` (`skills/plugins/circle/skills/use-gateway/SKILL.md:49-50`).
- **RPC / explorer:** the current docs dump uses `rpc.testnet.arc.io` (156 hits) and never `rpc.testnet.arc.network`. The samples use the `.network` RPC and the `testnet.arcscan.app` explorer, so check which host responds.

## Cross-cutting gotchas
- Every sample is a testnet demo. Most have routes that skip auth or ownership checks, or have row-level security off:
  - arc-escrow, arc-p2p-payments, arc-multichain-wallet, arc-commerce (users can credit themselves), arc-nanopayments (unauthenticated Gateway withdraw).
  - Hardcoded demo admin logins: arc-commerce, arc-nanopayments.
  - Do not deploy any of them publicly as-is.
- **Legacy `KIT_KEY`:** App Kit Swap samples use it. Current docs say to pass a Circle API key as `apiKey` instead (`arc-llms-full.txt:11862`).
- **No sample has a real LLM agent loop that moves money on Arc.** arc-nanopayments' README describes LangChain, but it's unused. The only LLM usage is arc-escrow's GPT calls and the agent-stack kits (which default to the CLI on mainnet).
