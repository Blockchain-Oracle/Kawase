# Arc ecosystem tools and node operation

Purpose: third-party infrastructure listed by Arc (node providers, indexers, oracles, compliance, AA), integration guides, and a condensed "run your own node" reference.

Sources:
- https://docs.arc.io/arc/tools/node-providers
- https://docs.arc.io/arc/tools/data-indexers
- https://docs.arc.io/arc/tools/oracles
- https://docs.arc.io/arc/tools/compliance-vendors
- https://docs.arc.io/arc/tools/account-abstraction
- https://docs.arc.io/integrate (wallets, exchanges, on/off-ramps, DeFi, infrastructure)
- https://docs.arc.io/arc/concepts/running-a-node
- https://docs.arc.io/arc/references/node-requirements
- https://docs.arc.io/arc/tutorials/run-an-arc-node
- https://github.com/circlefin/arc-node (v0.8.0, released 2026-08-28)

Verified: 2026-09-29

## Providers listed in the docs

| Category | Providers | Notes for agents |
|---|---|---|
| **Node / RPC** | Alchemy, Blockdaemon, dRPC, QuickNode (and Circle's public RPC) | Circle's public endpoints need no key. Alchemy adds Data APIs, webhooks, and Wallet APIs. See [network-config.md](network-config.md). |
| **Data indexers** | Alchemy (Data APIs, webhooks), Envio (HyperIndex), Goldsky (subgraphs, Mirror streaming to a DB), Pinax (RPC archive, Firehose, Substreams), The Graph (subgraphs, Substreams), Thirdweb Insight, Zerion API (portfolio, PnL, wallet-activity subscriptions) | Use Zerion or Alchemy webhooks for "notify me when a customer pays". Use Goldsky Mirror to stream into Postgres for a ledger. |
| **Oracles** | Chainlink (Data Feeds, Data Streams), Chronicle (DeFi feeds, Proof of Asset), Pyth (pull/push; crypto, FX, equities), RedStone (push/pull), Stork (low-latency pull; addresses at docs.stork.network … #arc) | You need an oracle for FX (EUR/USD) or randomness, since `PREVRANDAO` is 0. Look up per-feed addresses on each provider's site. |
| **Compliance** | Chainalysis, Elliptic, TRM Labs | Screening before payment avoids gas-burning blocklist reverts. Fits RFB 5. |
| **Account abstraction** | Alchemy, Biconomy, Blockradar, Circle Wallets, Crossmint, Dynamic, MetaMask Embedded Wallets, Para, Pimlico, Privy, Thirdweb, Turnkey, ZeroDev | See [account-abstraction-relayers-paymasters.md](account-abstraction-relayers-paymasters.md) |
| **Launch-day DeFi (press)** | Uniswap, Aave, Morpho, Chainlink, MetaMask, Alchemy | From the Circle mainnet press release. Check each protocol's own docs for Arc addresses. |

## Integration guides (docs.arc.io/integrate)

| Guide | Useful for |
|---|---|
| [Wallets: add Arc](https://docs.arc.io/integrate/wallets/add-arc-to-a-wallet), [fee display](https://docs.arc.io/integrate/wallets/fee-display), [transaction lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle) | Show one USDC balance (never native and ERC-20 as two rows). Fees in USD. Two-state lifecycle (pending or final). |
| [Exchanges: deposits](https://docs.arc.io/integrate/exchanges/deposits), [withdrawals](https://docs.arc.io/integrate/exchanges/withdrawals), [custody](https://docs.arc.io/integrate/exchanges/custody), [CCTP bridging](https://docs.arc.io/integrate/exchanges/cctp-bridging) | Payment-receiving agents: HD deposit addresses, system-emitter detection, sweeping, raw CCTP `depositForBurn` with domain 26 |
| [On/off-ramps](https://docs.arc.io/integrate/on-off-ramps/add-arc-to-your-platform) | Single-asset USDC config for ramp providers |
| [DeFi: AMM and pools](https://docs.arc.io/integrate/defi/amm-and-pools) | Use `0x3600…` as the pool token. Decimal conversion factor 1e12. |
| [Infrastructure: bridges](https://docs.arc.io/integrate/infrastructure/bridges), [indexing events](https://docs.arc.io/integrate/infrastructure/indexing-events), [compliance](https://docs.arc.io/integrate/infrastructure/compliance) | Confirmations = 1. Index EIP-7708 plus Memo, blocklist, and CCTP events. Attribute Memo and Multicall3From calls. |
| [Relayers and paymasters](https://docs.arc.io/integrate/relayers-and-paymasters) | EIP-3009 relayer, ERC-4337 paymaster |

## Running a node (only if you need an unmetered RPC or independent verification)

Anyone can run a **full node** (not a validator). It verifies validator signatures on each block, re-executes every transaction, and serves JSON-RPC on `localhost:8545`. It does not participate in consensus.

| Item | Value |
|---|---|
| OS | Linux (Ubuntu 22.04+, Debian 12+). macOS works for the binaries. |
| CPU / RAM / Disk / Net | High clock speed / **64 GB+** / **1 TB+ NVMe** (TLC) / 24 Mbps+ |
| Binaries | `arc-node-execution` (Reth), `arc-node-consensus` (Malachite), `arc-snapshots` |
| Version | v0.8.0 on both networks. Zero7/Zero8 activated on mainnet 2026-09-10 15:00 UTC. |
| Sync | **Snapshot only**, since syncing from genesis is unsupported. Testnet: ~68 GB EL + 16 GB CL compressed (→ ~103 GB + 36 GB). Keep ≥150 GB free. |
| Ports | 8545 JSON-RPC, 8551 Engine API (RPC mode), 9001 EL metrics, 29000 CL metrics, 31000 CL RPC |
| EL↔CL | IPC (default) at `/run/arc/reth.ipc` and `/run/arc/auth.ipc`. RPC+JWT mode is deprecated and will be removed in v0.9.0. |
| Public node flags | `--public-api` (hides pending-tx RPCs, restricts to eth/net/web3/rpc). `--full` enables pruning and is required on first start from a pruned snapshot. |
| Relay endpoints (CL fetches blocks) | Mainnet: `rpc.mainnet.arc.io`, `rpc.drpc.mainnet.arc.io`, `rpc.blockdaemon.mainnet.arc.io`, `rpc.quicknode.mainnet.arc.io`. Testnet: `rpc.testnet.arc.io`, `rpc.drpc.testnet.arc.io`, `rpc.blockdaemon.testnet.arc.io`. |

```bash
export ARC_HOME="${ARC_HOME:-$HOME/.arc}"
curl -L https://raw.githubusercontent.com/circlefin/arc-node/main/arcup/install | bash
source "$ARC_HOME/env"
mkdir -p ~/.arc/execution ~/.arc/consensus && sudo install -d -o $USER /run/arc
arc-snapshots download --chain=arc-testnet --execution-path ~/.arc/execution --consensus-path ~/.arc/consensus
arc-node-consensus init --home ~/.arc/consensus
# then start the EL (--chain arc-testnet --rpc.forwarder https://rpc.testnet.arc.io/ ...) and then the CL. Full flags are in the tutorial.
```
Other paths: build from source, or Docker Compose (**testnet only**). The node tutorials also cover systemd services ([deploy-node-as-service](https://docs.arc.io/arc/tutorials/deploy-node-as-service)), health checks ([monitor-a-node](https://docs.arc.io/arc/tutorials/monitor-a-node)), and Prometheus and Grafana ([set-up-node-monitoring](https://docs.arc.io/arc/tutorials/set-up-node-monitoring)).
For a two-week hackathon, **don't run a node**. Use the public RPC, the Canteen RPC, or Alchemy or QuickNode.
