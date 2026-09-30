# Arc overview and architecture

Purpose: what Arc is and how it works (consensus, execution, finality, the USDC-as-gas model, privacy, post-quantum work, roadmap, and mainnet status), with the numbers a builder needs.

Sources:
- https://docs.arc.io/arc-chain
- https://docs.arc.io/arc/concepts/system-overview
- https://docs.arc.io/arc/concepts/consensus-layer
- https://docs.arc.io/arc/concepts/execution-layer
- https://docs.arc.io/arc/concepts/deterministic-finality
- https://docs.arc.io/arc/concepts/stablecoin-native-model
- https://docs.arc.io/arc/concepts/opt-in-privacy
- https://docs.arc.io/arc/concepts/post-quantum-security
- https://github.com/circlefin/arc-node CHANGELOG (v0.8.0, 2026-08-28)
- https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet
- https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026
- Live RPC checks, 2026-09-29

Verified: 2026-09-29

## One paragraph

Arc is Circle's open, EVM-compatible Layer-1 "purpose-built for programmable money." **USDC is the native gas token**, so there is no volatile token. Finality is **deterministic and sub-second**: Malachite BFT under Proof-of-Authority, with blocks every ~0.48 s. Execution runs on **Reth** at the **Osaka** EVM baseline plus some Amsterdam features (EIP-7708). EURC and USYC are native at genesis. It integrates directly with Circle's platform: CCTP, Gateway, Wallets, App Kit, StableFX, and Agent Stack. Circle positions it for payments, lending, FX, treasury, and agentic commerce ([arc-chain](https://docs.arc.io/arc-chain)).

## Network properties

| Property | Value |
|---|---|
| Consensus | Malachite BFT (Tendermint family), permissioned PoA validator set |
| Execution | Reth (Rust Ethereum client), EVM at the Osaka hard fork, plus EIP-7708 from Amsterdam |
| Gas token | USDC (native, 18 decimals). ERC-20 view at `0x3600…0000` (6 decimals). |
| Block time | ~0.48 s on testnet ("~2 blocks/s") |
| Finality | Deterministic, under 1 s. 1 confirmation is final. `safe` and `finalized` tags both resolve to `latest`. |
| Throughput (benchmarks) | 3,000+ TPS with 20 validators, under 350 ms finality. 10,000+ TPS with 4 validators. |
| Gas limit | 30M gas/block (~60M gas/s). Confirmed live: `gasLimit` = 30,000,000. |
| Validators | Permissioned and known institutions: SOC 2, geographically distributed, rotating proposer, uptime SLAs. The founding cohort includes BlackRock, Visa, Mastercard, and DTCC ([press](https://www.circle.com/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)). |
| Developer access | Permissionless. Anyone can deploy contracts or run a (non-validating) full node. |
| Chain IDs | Mainnet `5042`, testnet `5042002` |

## Two-layer architecture

```
JSON-RPC submit → mempool (sig/balance/nonce) → proposer bundles block → pre-vote → pre-commit (>2/3) → COMMIT (final)
   → Reth executes (EVM + Fee Manager + future modules) → state root
```

- **Consensus layer (Malachite)** ([consensus-layer](https://docs.arc.io/arc/concepts/consensus-layer)): Propose, then Pre-vote, then Pre-commit, then Commit. Two-phase voting means two conflicting blocks can never both finalize, so there are no reorgs. It is safe with fewer than 1/3 faulty validators and live with at least 2/3 honest and online. "Optimistic responsiveness" means there are no artificial timeouts.
- **Execution layer (Reth)** ([execution-layer](https://docs.arc.io/arc/concepts/execution-layer)) maintains state, executes the EVM, and computes the state root. Arc adds protocol-level modules:

| Module | Status | Function |
|---|---|---|
| Fee Manager | Live | USDC-denominated base fee with EWMA smoothing, targeting ~$0.001 per tx. See [gas-and-fees.md](gas-and-fees.md). |
| CallFrom precompile | Live | Preserves the original `msg.sender` through Memo and Multicall3From |
| Arc Privacy Sector (APS) | **Planned** | Confidential Solidity execution |
| Stablecoin Services | **Planned** | Cross-currency settlement, paymaster-sponsored txs, multi-stablecoin gas |

Precompiles live at `0x1800…0000` through `…0004` (Native Coin Authority, Native Coin Control/blocklist, System Accounting, Call From, PQ Signature Verify). See [network-config.md](network-config.md).

## Finality: why it matters for agents

| Network | Finality |
|---|---|
| Arc | under 1 s, deterministic |
| Ethereum L1 | 12–15 min |
| Optimistic L2 | ~7 days (withdrawal) |

A transaction has two states only: **pending** or **final** ([transaction-lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle)). An agent can trigger downstream effects (ledger write, webhook, next payment) as soon as it has the receipt. It needs no confirmation counting, reorg rollback, or retry-on-reorg logic. Circle's CCTP and Gateway attest Arc burns after ~1 block (~0.5 s), so Arc as a source chain is fast. Other chains as source still take 13–19 min for standard attestation.

## Stablecoin-native model (the most important concept)

[stablecoin-native-model](https://docs.arc.io/arc/concepts/stablecoin-native-model)

- **One USDC balance, two interfaces:**

| Interface | Decimals | Used for |
|---|---|---|
| Native (`eth_getBalance`, `msg.value`, gas) | **18** | Gas, native sends, `msg.value` |
| ERC-20 at `0x3600000000000000000000000000000000000000` | **6** | `transfer`, `approve`, `transferFrom`, allowances, permit/EIP-3009 |

- Both interfaces move the **same** balance. The ERC-20 `balanceOf` truncates the last 12 decimals, so sub-micro-USDC dust is invisible there but still exists natively. A `balanceOf` of 0 does not mean the native balance is 0.
- Every USDC movement emits a `Transfer` from the system emitter `0xffff…fffE` (18 decimals, EIP-7708). ERC-20 calls also emit a 6-decimal `Transfer` from `0x3600…`. Pick one emitter to avoid double counting.
- **EURC** (6 decimals) is a standard ERC-20, native at genesis and not bridged. **USYC** is a yield-bearing tokenized money market fund, permissioned (non-US institutions, $100k minimum). **cirBTC** (8 decimals) and bridged **WETH** (18 decimals) also exist.
- Gas launches as USDC only. Multi-stablecoin gas and protocol paymasters are "Stablecoin Services" (planned). Today, sponsor gas through ERC-4337 paymasters or Circle Gas Station. See [account-abstraction-relayers-paymasters.md](account-abstraction-relayers-paymasters.md).

## Opt-in privacy: Arc Privacy Sector (APS), **not live**

[opt-in-privacy](https://docs.arc.io/arc/concepts/opt-in-privacy). "Privacy features are on the roadmap and not yet available on Arc."
- Design: one chain, two execution environments (public EVM and private APS) whose state roots commit in the same block. You encrypt a normal EVM tx with the APS network public key and send it as calldata to a precompile. Validators run APS inside hardware enclaves (TEEs). Only an ack and a fixed gas cost are public. There are no public return values or logs.
- Synchronous composability between public and private contracts (atomic, no bridge).
- **Default-deny isolation**: per-selector policies (`Open`, `Restricted`, `Locked`), trust domains via `addTrustee`, runtime visibility enforcement, events off by default, sanitized reverts, and constant-time gas reporting.
- Cryptography: X-Wing KEM (X25519 + ML-KEM-768), HKDF-SHA256, and AES-256-GCM(-SIV); TLS 1.3 with X25519MLKEM768. The master secret key is Shamir-shared across validators and only reconstructable inside attested enclaves.
- Hackathon implication: **do not promise confidential payments on Arc** in a demo. Memos and all transfers are public today.

## Post-quantum security

[post-quantum-security](https://docs.arc.io/arc/concepts/post-quantum-security)
- **Live on mainnet:** `SLH-DSA-SHA2-128s` verification via the precompile at `0x1800…0004`. Contracts can verify PQ-signed messages as an app-layer authorization primitive, and the signer doesn't need an Arc account.
- Future: native PQ wallet signing (likely EIP-8141 frame transactions), PQ privacy (near-term, with APS), offchain infrastructure upgrades (mid-term), and PQ validator signatures (long-term).

## Roadmap items (not available yet)

- APS privacy, Stablecoin Services (multi-stablecoin gas and paymasters), and native PQ tx signing.
- Malachite: multi-proposer, fewer consensus rounds, and a possible move from PoA to **permissioned PoS**.
- Fee parameters "may be adjusted before mainnet launch". This caveat is still printed on the gas pages even though mainnet is live. Read `eth_gasPrice` live.

## Mainnet status (important; resolves stale info)

- **Arc public mainnet launched 2026-09-16** ([Circle press release](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet), [arc.io blog](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026)). Launch partners include Uniswap, Aave, Morpho, Chainlink, MetaMask, and Alchemy.
- Live check on 2026-09-29: `rpc.mainnet.arc.io` returns chain `0x13b2`, block ~23.3M, and `baseFeePerGas` 20 gwei. Mainnet block 1 timestamp is 2026-05-15, so the chain ran privately before the public launch.
- The docs **index `llms.txt` still says "Arc is currently available on Testnet only"**. That line is stale. The reference pages (connect, RPC, contract addresses) all have Mainnet tabs.
- Mainnet caveats for builders: there is no faucet ("request gas USDC through your Circle point of contact", or bridge USDC in via CCTP or Gateway). **Arc Studio deploys to testnet only.** The ERC-8004 and ERC-8183 docs cover testnet only. Swap works on mainnet and on Arc testnet.
- Hackathon scoring: "Mainnet > Testnet" for traction. "Real customers transacting in real USDC on mainnet count more", but test USDC counts ([tameion.md](../../.firecrawl/tameion.md)).

## Hard forks (node-level)

The arc-node CHANGELOG names hard forks "ZeroN". **Zero5** (testnet) switched native-USDC events from the `NativeCoin*` events at `0x1800…0000` to EIP-7708 `Transfer` from `0xffff…fffE`. Mainnet has used EIP-7708 since genesis. **Zero7/Zero8** activated on testnet on 2026-09-03 15:00 UTC and on mainnet on 2026-09-10 15:00 UTC (v0.8.0). Zero8 charges a uniform 200-gas penalty for rejected delegatecalls into stateful Arc precompiles. v0.8.0 also changed RPC error strings for insufficient balance: `eth_call` and `eth_estimateGas` now return revm `OutOfFunds` text, and simple transfers return `gas required exceeds allowance`. Tooling that matches `insufficient funds for gas * price + value` must be updated ([CHANGELOG](https://github.com/circlefin/arc-node/blob/main/CHANGELOG.md)).
