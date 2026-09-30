# Arc docs: every tutorial, quickstart, and guide

Purpose: a one-line index of every page in the Arc docs, grouped by task, with URLs. Use it to jump straight to the official walkthrough.

Sources:
- https://docs.arc.io/llms.txt
- https://docs.arc.io/llms-full.txt (local copy `.firecrawl/docs/arc-llms-full.txt`, 146 pages)

Verified: 2026-09-29

Append `.md` to any URL for raw markdown (e.g. `https://docs.arc.io/arc/tutorials/deploy-on-arc.md`). The Arc MCP server (`https://docs.arc.io/mcp`) serves the same pages. Pages tagged `<TryOnArcStudio/>` can be opened in Arc Studio.

## Network quickstarts and tutorials (Solidity, Foundry, Circle Contracts)

| Page | What you do |
|---|---|
| [Install Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry) | Install `arc-forge`, `arc-cast`, `arc-anvil` |
| [Deploy on Arc](https://docs.arc.io/arc/tutorials/deploy-on-arc) | Init, test, deploy, verify (Blockscout), and interact with Counter on testnet |
| [Port a contract to Arc](https://docs.arc.io/arc/tutorials/porting-contracts-to-arc) | 8-point audit checklist for USDC-native semantics |
| [Troubleshoot with Arc Foundry](https://docs.arc.io/arc/tutorials/troubleshoot-with-arc-foundry) | `arc-cast run` replay, `arc-anvil --fork-url`, fork tests |
| [Deploy contracts (Circle Contracts)](https://docs.arc.io/arc/tutorials/deploy-contracts) | Deploy ERC-20/721/1155/Airdrop templates from a Circle SCA wallet, gas sponsored |
| [Interact with contracts](https://docs.arc.io/arc/tutorials/interact-with-contracts) | Mint, transfer, and airdrop with the Circle Contracts API |
| [Monitor contract events](https://docs.arc.io/arc/tutorials/monitor-contract-events) | Circle event monitors and webhooks |
| [Send USDC with a transaction memo](https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo) | `Memo.memo()` wrapping a USDC transfer and querying by `memoId` (viem, ethers, Python) |
| [Send batch USDC transfers](https://docs.arc.io/arc/tutorials/batch-usdc-transfers) | `Multicall3From.aggregate3()` payouts with sender preserved (viem, ethers, Python) |

## Agentic

| Page | What you do |
|---|---|
| [Agentic Economy (use-case hub)](https://docs.arc.io/build/agentic-economy) | Overview of ERC-8004 and ERC-8183 plus samples |
| [Register your first AI agent](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent) | ERC-8004 register, reputation, and validation (Circle Wallets or viem; Node or Python) |
| [Create your first ERC-8183 job](https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job) | Job create, budget, fund escrow, submit, complete |
| [Arc MCP server](https://docs.arc.io/ai/mcp) | Docs MCP for Claude Code, Cursor, VS Code, Windsurf |
| [AI skills](https://docs.arc.io/ai/skills) | Install circlefin/skills |
| [Arc Studio](https://docs.arc.io/ai/arc-studio) | Prompt-to-app builder (testnet) |
| [Arc Studio CLI](https://docs.arc.io/ai/arc-studio-cli) | Headless or subagent contract generation and deploy |

## Use-case hubs (Build section)

[Build overview](https://docs.arc.io/build) · [P2P Payments](https://docs.arc.io/build/payments) · [eCommerce Checkout](https://docs.arc.io/build/ecommerce) · [Stablecoin FX](https://docs.arc.io/build/stablecoin-fx) · [Borrow and lend](https://docs.arc.io/build/borrow-and-lend) · [Prediction markets](https://docs.arc.io/build/prediction-markets) · [Agentic Economy](https://docs.arc.io/build/agentic-economy). Each lists sample apps, quickstarts, and "why Arc" points.

## App Kit: quickstarts

| Page | What you do |
|---|---|
| [Install App Kit](https://docs.arc.io/app-kit/tutorials/installation) | Core package plus adapters |
| [Adapter setups](https://docs.arc.io/app-kit/tutorials/adapter-setups) | Viem, Ethers, Solana, Circle Wallets (dev and user); Turnkey and Privy; custom RPC |
| [Bridge tokens across blockchains](https://docs.arc.io/app-kit/quickstarts/bridge-tokens-across-blockchains) | Browser wallet (EIP-6963) or Circle Wallets; Sepolia↔Arc, Solana↔Arc |
| [Send tokens (same chain)](https://docs.arc.io/app-kit/quickstarts/send-tokens-same-chain) | `kit.send` |
| [Swap tokens (same chain)](https://docs.arc.io/app-kit/quickstarts/swap-tokens-same-chain) | USDC↔EURC on Arc Testnet |
| [Swap tokens crosschain](https://docs.arc.io/app-kit/quickstarts/swap-tokens-crosschain) | Swap and bridge in one call |
| [Unified Balance: deposit and spend](https://docs.arc.io/app-kit/quickstarts/unified-balance-deposit-and-spend) | Multi-chain deposit, then spend on Arc |
| [Unified Balance: delegate deposit and spend](https://docs.arc.io/app-kit/quickstarts/unified-balance-delegate-deposit-and-spend) | Backend delegate EOA spends for an owner (SCA or Privy) |
| [Earn: deposit](https://docs.arc.io/app-kit/quickstarts/earn-deposit) / [Earn: withdraw](https://docs.arc.io/app-kit/quickstarts/earn-withdraw) | Vault discovery, deposit, redeem |
| [Onramp: embed widget](https://docs.arc.io/app-kit/quickstarts/onramp-embed-widget) | Server session route plus iframe |

## App Kit: how-tos

- Bridge: [collect fee](https://docs.arc.io/app-kit/tutorials/bridge/collect-bridge-fee) · [transfer speed and max fee](https://docs.arc.io/app-kit/tutorials/bridge/configure-transfer-speed) · [estimate costs](https://docs.arc.io/app-kit/tutorials/bridge/estimate-costs) · [pay fees on source](https://docs.arc.io/app-kit/tutorials/bridge/pay-fees-on-source) · [recipient address](https://docs.arc.io/app-kit/tutorials/bridge/specify-recipient-address) · [Forwarding Service](https://docs.arc.io/app-kit/tutorials/bridge/use-forwarding-service)
- Swap: [collect fee](https://docs.arc.io/app-kit/tutorials/swap/collect-swap-fee) · [estimate rate](https://docs.arc.io/app-kit/tutorials/swap/estimate-swap-rate) · [token rates](https://docs.arc.io/app-kit/tutorials/swap/get-token-rates) · [slippage or stop limit](https://docs.arc.io/app-kit/tutorials/swap/set-slippage-tolerance-or-stop-limit) · [recipient](https://docs.arc.io/app-kit/tutorials/swap/specify-recipient-address)
- Unified Balance: [check balance](https://docs.arc.io/app-kit/tutorials/unified-balance/check-unified-balance) · [custom spend fees](https://docs.arc.io/app-kit/tutorials/unified-balance/collect-custom-spend-fees) · [estimate spend fees](https://docs.arc.io/app-kit/tutorials/unified-balance/estimate-spend-fees) · [manage delegates](https://docs.arc.io/app-kit/tutorials/unified-balance/manage-delegates) · [remove funds trustlessly (7-day)](https://docs.arc.io/app-kit/tutorials/unified-balance/remove-funds-trustlessly) · [select source chains](https://docs.arc.io/app-kit/tutorials/unified-balance/select-source-blockchains) · [fast deposits](https://docs.arc.io/app-kit/tutorials/unified-balance/use-fast-deposits) · [Forwarding Service](https://docs.arc.io/app-kit/tutorials/unified-balance/use-forwarding-service)
- Earn: [check position](https://docs.arc.io/app-kit/tutorials/earn/check-position) · [crosschain deposit](https://docs.arc.io/app-kit/tutorials/earn/crosschain-deposit) · [preview operations](https://docs.arc.io/app-kit/tutorials/earn/preview-operations)
- Onramp: [session minting](https://docs.arc.io/app-kit/tutorials/onramp/customize-session-minting) · [iframe vs popup](https://docs.arc.io/app-kit/tutorials/onramp/iframe-vs-popup) · [lifecycle events](https://docs.arc.io/app-kit/tutorials/onramp/handle-lifecycle-events)

## App Kit: concepts and references

[Bridge fees](https://docs.arc.io/app-kit/concepts/bridge-fees) · [Swap fees](https://docs.arc.io/app-kit/concepts/swap-fees) · [Unified Balance fees](https://docs.arc.io/app-kit/concepts/unified-balance-fees) · [Earn fees](https://docs.arc.io/app-kit/concepts/earn-fees) · [SDK reference](https://docs.arc.io/app-kit/references/sdk-reference) · [Supported blockchains and tokens](https://docs.arc.io/app-kit/references/supported-blockchains) · [Bridge error recovery](https://docs.arc.io/app-kit/references/bridge-error-recovery) · [Unified Balance error recovery](https://docs.arc.io/app-kit/references/unified-balance-error-recovery) · [Earn error handling](https://docs.arc.io/app-kit/references/earn-error-handling) · [Onramp error handling](https://docs.arc.io/app-kit/references/onramp-error-handling) · [Onramp hosting requirements](https://docs.arc.io/app-kit/references/onramp-hosting-requirements)

## Concepts

[Arc Network overview](https://docs.arc.io/arc-chain) · [System overview](https://docs.arc.io/arc/concepts/system-overview) · [Consensus layer](https://docs.arc.io/arc/concepts/consensus-layer) · [Execution layer](https://docs.arc.io/arc/concepts/execution-layer) · [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality) · [Stablecoin native model](https://docs.arc.io/arc/concepts/stablecoin-native-model) · [Stable fee design](https://docs.arc.io/arc/concepts/stable-fee-design) · [Transaction memos](https://docs.arc.io/arc/concepts/transaction-memos) · [Batched transactions](https://docs.arc.io/arc/concepts/batched-transactions) · [Opt-in privacy](https://docs.arc.io/arc/concepts/opt-in-privacy) · [Post-quantum security](https://docs.arc.io/arc/concepts/post-quantum-security) · [Running a node](https://docs.arc.io/arc/concepts/running-a-node)

## References

[Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc) · [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints) · [Contract addresses](https://docs.arc.io/arc/references/contract-addresses) · [EVM differences](https://docs.arc.io/arc/references/evm-differences) · [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees) · [USDC system events](https://docs.arc.io/arc/references/usdc-system-events) · [Node requirements](https://docs.arc.io/arc/references/node-requirements) · [Sample apps](https://docs.arc.io/arc/references/sample-applications)

## Tools

[Node providers](https://docs.arc.io/arc/tools/node-providers) · [Data indexers](https://docs.arc.io/arc/tools/data-indexers) · [Oracles](https://docs.arc.io/arc/tools/oracles) · [Account abstraction](https://docs.arc.io/arc/tools/account-abstraction) · [Compliance](https://docs.arc.io/arc/tools/compliance-vendors) · [Explorer (testnet)](https://explorer.testnet.arc.io) · [Explorer (mainnet)](https://explorer.arc.io) · [Faucet](https://faucet.circle.com)

## Integrate (for wallets, exchanges, and infrastructure; also useful for payment agents)

[Integrate overview](https://docs.arc.io/integrate) · [Connect (integrators)](https://docs.arc.io/integrate/connect-to-arc) · [Deploy (integrators)](https://docs.arc.io/integrate/deploy-on-arc) · [EVM differences](https://docs.arc.io/integrate/evm-differences)
- Wallets: [overview](https://docs.arc.io/integrate/wallets) · [add Arc to a wallet](https://docs.arc.io/integrate/wallets/add-arc-to-a-wallet) · [fee display](https://docs.arc.io/integrate/wallets/fee-display) · [transaction lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle)
- Exchanges: [overview](https://docs.arc.io/integrate/exchanges) · [CCTP bridging](https://docs.arc.io/integrate/exchanges/cctp-bridging) · [custody](https://docs.arc.io/integrate/exchanges/custody) · [deposits](https://docs.arc.io/integrate/exchanges/deposits) · [withdrawals](https://docs.arc.io/integrate/exchanges/withdrawals)
- DeFi: [overview](https://docs.arc.io/integrate/defi) · [AMM and pools](https://docs.arc.io/integrate/defi/amm-and-pools)
- Infrastructure: [overview](https://docs.arc.io/integrate/infrastructure) · [bridges](https://docs.arc.io/integrate/infrastructure/bridges) · [blocklist compliance](https://docs.arc.io/integrate/infrastructure/compliance) · [indexing events](https://docs.arc.io/integrate/infrastructure/indexing-events)
- On/off-ramps: [overview](https://docs.arc.io/integrate/on-off-ramps) · [add Arc to your platform](https://docs.arc.io/integrate/on-off-ramps/add-arc-to-your-platform)
- Relayers and paymasters: [overview](https://docs.arc.io/integrate/relayers-and-paymasters) · [EIP-3009 relayer](https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer) · [ERC-4337 paymaster](https://docs.arc.io/integrate/relayers-and-paymasters/deploy-a-paymaster)

## Node operation

[Run an Arc node](https://docs.arc.io/arc/tutorials/run-an-arc-node) · [Deploy node as a service (systemd)](https://docs.arc.io/arc/tutorials/deploy-node-as-service) · [Monitor a node](https://docs.arc.io/arc/tutorials/monitor-a-node) · [Prometheus and Grafana](https://docs.arc.io/arc/tutorials/set-up-node-monitoring)

## Outside docs.arc.io but Arc-relevant

- Circle skills: https://github.com/circlefin/skills (`plugins/circle/skills/use-arc/SKILL.md`)
- Code samples for the docs: https://github.com/circlefin/docs-examples (e.g. `app-kit-bridge-solana`)
- Arc Foundry: https://github.com/circlefin/arc-foundry · Arc node: https://github.com/circlefin/arc-node · Malachite: https://github.com/circlefin/malachite
- Community and FAQs: https://community.arc.io (e.g. App Kit FAQ blog) · Discord: https://discord.com/invite/buildonarc
- Canteen Arc RPC and CLI: https://arc-node.thecanteenapp.com · https://github.com/the-canteen-dev/ARC-cli
