# 01-arc: Arc knowledge base (index)

Purpose: entry point for everything about **Arc**, Circle's stablecoin-native EVM L1, for Tameion Agents Hackathon builders. Explains what is in each file and where to look for any given fact.

Sources:
- https://docs.arc.io/llms.txt and https://docs.arc.io/llms-full.txt (local copies: `.firecrawl/docs/arc-llms.txt`, `.firecrawl/docs/arc-llms-full.txt`)
- Live RPC checks against `rpc.testnet.arc.io` and `rpc.mainnet.arc.io`, 2026-09-29
- npm registry and GitHub API, 2026-09-29
- Prior research (read-only): `/Users/abu/dev/hackathon/arc-agent/docs/wiki/*.md`, checked 2026-07-28 to 2026-08-08
- Hackathon materials: `.firecrawl/tameion.md`, `.firecrawl/kickoff-slides.txt`, `.firecrawl/arc-node-canteen.html`

Verified: 2026-09-29

## Files

| File | Contents |
|---|---|
| [overview-and-architecture.md](overview-and-architecture.md) | What Arc is. Malachite + Reth. Finality. The USDC 18/6 model. Privacy (APS, not live). Post-quantum. Roadmap. **Mainnet status.** Hard forks. |
| [network-config.md](network-config.md) | Chain IDs, RPCs (Circle, providers, Canteen), explorers, faucet, viem/wagmi/Reown config, **every contract address** (mainnet and testnet, code-verified) |
| [gas-and-fees.md](gas-and-fees.md) | 20 gwei floor, EWMA, cost per action, fee math, error table, gas-sponsorship options, App Kit/CCTP/Gateway fees |
| [deploying-contracts.md](deploying-contracts.md) | Arc Foundry, stock Foundry, Hardhat, viem, Circle Contracts templates, Blockscout verification, porting checklist |
| [app-kit.md](app-kit.md) | Send, Bridge, Swap, Unified Balance, Earn, Onramp: packages and versions, adapters, code, supported chains and tokens, fees, custom fees, events |
| [transactions-memo-batching.md](transactions-memo-batching.md) | Memo (invoice IDs on payments), Multicall3From (batch payouts), EIP-3009 gasless, detecting incoming USDC (EIP-7708) |
| [account-abstraction-relayers-paymasters.md](account-abstraction-relayers-paymasters.md) | ERC-4337 (EntryPoint v0.7), EIP-7702, paymasters (18-dp deposits), relayers, Gas Station, policy-constrained agent wallets |
| [agentic-and-ai.md](agentic-and-ai.md) | Arc MCP, Circle skills, Arc Studio CLI, **ERC-8004** identity and reputation, **ERC-8183** job escrow, x402/nanopayments pointers |
| [stablecoins-fx-and-yield.md](stablecoins-fx-and-yield.md) | EURC, USYC, cirBTC, WETH. Swap vs StableFX. Earn vs USYC. The treasury-agent pattern. |
| [ecosystem-and-infrastructure.md](ecosystem-and-infrastructure.md) | Node providers, indexers, oracles, compliance, AA vendors, integrate guides, running a node |
| [tutorials-index.md](tutorials-index.md) | Every docs page (146), one line each with URL |
| [sample-applications.md](sample-applications.md) | Official sample apps plus arc-x402-circle-wallets, with RFB mapping |
| [gotchas.md](gotchas.md) | 46 sharp edges (decimals, reverts, fee floor, events, tooling, App Kit) |

## Where to look for X

| I need… | Go to |
|---|---|
| Chain ID / RPC URL / explorer | [network-config.md#networks](network-config.md) |
| USDC, EURC, CCTP, Gateway, Permit2, or Multicall address | [network-config.md#contract-addresses](network-config.md) |
| Why my tx never mined | [gas-and-fees.md](gas-and-fees.md) (20 gwei floor), [gotchas.md](gotchas.md) #14 |
| Why my balance is off by 10^12 | [gotchas.md](gotchas.md) #1–3, [overview](overview-and-architecture.md#stablecoin-native-model-the-most-important-concept) |
| How to deploy and verify a contract | [deploying-contracts.md](deploying-contracts.md) |
| Bridge USDC from Base/Ethereum/Solana to Arc | [app-kit.md#bridge](app-kit.md) |
| One USDC balance across chains | [app-kit.md#unified-balance](app-kit.md) |
| Convert USDC↔EURC | [app-kit.md#swap](app-kit.md), [stablecoins-fx-and-yield.md](stablecoins-fx-and-yield.md) |
| Earn yield on idle USDC | [stablecoins-fx-and-yield.md](stablecoins-fx-and-yield.md), [app-kit.md#earn](app-kit.md) |
| Put an invoice number on a payment | [transactions-memo-batching.md#memo](transactions-memo-batching.md) |
| Pay 50 contractors in one tx | [transactions-memo-batching.md#multicall3from](transactions-memo-batching.md) |
| Detect a customer payment | [transactions-memo-batching.md#detecting-incoming-usdc](transactions-memo-batching.md) |
| Gasless payments / sponsor gas | [account-abstraction-relayers-paymasters.md](account-abstraction-relayers-paymasters.md) |
| Agent onchain identity or reputation | [agentic-and-ai.md#erc-8004](agentic-and-ai.md) |
| Escrowed agent jobs | [agentic-and-ai.md#erc-8183](agentic-and-ai.md) |
| Give my coding agent Arc docs | [agentic-and-ai.md#tooling-setup](agentic-and-ai.md) (`claude mcp add --transport http arc-docs https://docs.arc.io/mcp`) |
| A starting repo for my RFB | [sample-applications.md](sample-applications.md) |
| Oracles, indexers, compliance vendors | [ecosystem-and-infrastructure.md](ecosystem-and-infrastructure.md) |
| An official tutorial on topic Y | [tutorials-index.md](tutorials-index.md) |

## Five facts every hackathon builder should know

1. **USDC is gas and money, with one balance and two faces.** Native is 18 decimals (`msg.value`, gas). ERC-20 `0x3600000000000000000000000000000000000000` is 6 decimals. Mixing them is off by 10^12.
2. **Set `maxFeePerGas` ≥ 20 gwei** or txs are silently dropped. A transfer costs about $0.0004–$0.001.
3. **One confirmation is final** (<1 s, no reorgs). Agents can act on a receipt immediately. Detect incoming USDC via the system emitter `0xffff…FfFE` (18 dp), not only `0x3600…`.
4. **Mainnet is live (chain 5042, since 2026-09-16)** and judges value mainnet traction more. Testnet (5042002) has the faucet, Arc Studio, and the documented ERC-8004/8183 deployments.
5. **App Kit** (`@circle-fin/app-kit` 1.15.3) is the fastest path to Circle-tool points. Arc is the only chain supporting all six capabilities (Send, Bridge, Swap, Unified Balance, Earn, Onramp). Add **Memo** or **Multicall3From** for AP/AR-grade reconciliation and batch payouts.

## Stale vs current (prior research and hackathon links)

| Claim (where) | Status on 2026-09-29 |
|---|---|
| "Arc is Testnet-only" (arc-agent wiki 2026-07-28; docs `llms.txt`) | **Stale.** Public mainnet launched 2026-09-16, chain 5042, `rpc.mainnet.arc.io`. The llms.txt line is outdated. |
| App Kit has 4 capabilities (arc-agent wiki; hackathon page) | **Stale.** There are now 6: + **Onramp** and **Earn**. |
| App Kit 1.11.0 / Bridge Kit 1.12.2 / UB Kit 1.3.1 (arc-agent wiki) | **Stale.** Now app-kit 1.15.3, bridge-kit 1.15.1, unified-balance-kit 1.7.0, swap-kit 1.7.0, earn-kit 1.8.0, onramp-kit 1.0.2. |
| Swap needs a Kit Key (community FAQ) | **Superseded.** Kit keys are legacy. Use the optional `apiKey` from the Circle Console (rate-limited without it). |
| "CCTP Fast Transfer unavailable on Arc Testnet" (arc-agent wiki) | **Reframed.** Circle's table lists Arc's Fast source as **N/A** (Arc attests in ~1 block anyway). App Kit defaults to FAST for inbound routes. |
| Agent Wallets are Arc Testnet only (arc-agent wiki) | **Stale.** Circle lists `ARC` (mainnet) and `ARC-TESTNET`. |
| `docs.arc.network` (hackathon page and slides) | Still works: **301 → docs.arc.io**. |
| `testnet.arcscan.app` (Canteen page, viem) | Works: **301 → explorer.testnet.arc.io**. |
| `rpc.testnet.arc.network` (viem default) | Still answers (chain 5042002). The docs now use `rpc.testnet.arc.io`. |
| Native-USDC semantics, Memo/Multicall3From addresses, EURC/USYC testnet addresses, 20 gwei floor (arc-agent wiki) | **Still correct.** |
| "Fees ~$0.01" (hackathon slides) | Conservative. Docs target ~$0.001 per ERC-20 transfer. |

## Gaps (not covered by the Arc docs)

- No official **mainnet** addresses for ERC-8004 or ERC-8183. Canonical ERC-8004 addresses have code on mainnet (see network-config), but they are unofficial.
- No official Hardhat walkthrough. The config in deploying-contracts.md is standard EVM practice, not from Arc docs.
- Earn vault list and APYs, Swap liquidity depth, and StableFX access terms are not enumerated in the docs. Query them at runtime (`exploreVaults`, `estimateSwap`) or see the Circle section.
- Circle-side products (Wallets, Agent Wallets/CLI, Gateway API, Nanopayments/x402, CCTP raw API, StableFX, Paymaster) are documented in Circle's docs and belong to the Circle section of this library.
