# Wallets, oracles, indexers, explorers, and ramps on Arc

Purpose: which wallets support Arc mainnet (for "connect your wallet" and for telling users where their funds show up), and which oracles, indexers, explorers, and on/off-ramps an agent can call on Arc. This file extends [context/01-arc/ecosystem-and-infrastructure.md](../../01-arc/ecosystem-and-infrastructure.md) and does not repeat its tables.

Sources:
- MetaMask extension repo: `ui/components/app/assets/enablement/arc.ts`, `shared/constants/bridge.ts`, `CHANGELOG.md` (GitHub API, 2026-09-29)
- Trust Wallet `wallet-core/registry.json` (raw GitHub)
- `https://chainid.network/chains.json` → `.firecrawl/product/census/chainid.json`
- Rabby `https://api.rabby.io/v1/chain/list` → `rabby-chains.json`
- viem repo `src/chains/definitions/arc.ts` (GitHub code search)
- Pyth `contract_manager/src/store/chains/EvmChains.json` and `.../contracts/EvmPriceFeedContracts.json` (raw GitHub)
- Chainlink docs repo `src/config/data/chains.json`, `ccip/selectors.yml`, `link-token-contracts.mdx`
- The Graph networks registry `https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json` → `thegraph-registry.json`
- Envio HyperSync `https://5042.hypersync.xyz/height`
- Blockscout `https://chains.blockscout.com/api/chains` → `blockscout-chains.json`
- Transak `https://api.transak.com/api/v2/currencies/crypto-currencies` → `transak.json`; MoonPay `https://api.moonpay.com/v3/currencies` → `moonpay.json`
- Arc docs tools pages (`.firecrawl/docs/arc-llms-full.txt:19034-19285`), Circle press release and Arc mainnet blog, `websearch-and-webfetch-notes.md`
- All local paths are under `.firecrawl/product/census/`.

Verified: 2026-09-29

## Wallets supporting Arc mainnet

| Wallet | Status | Evidence |
|---|---|---|
| **MetaMask** | **Native support** (built-in chain, Arc-specific UX that merges native USDC and the `0x3600…` ERC-20 into one balance, Arc swaps and bridge with a USDC→EURC default, security screening) | [VERIFIED code]: `arc.ts` defines `ARC_NATIVE_CAIP_CHAIN_ID = 'eip155:5042'`. CHANGELOG: "Added Arc USDC reserve for swaps and bridges...", "Expanded address security screening to 15 additional networks, including ... Arc". Note: "Removed Stellar and Arc from the default bridge network list when remote configuration is unavailable" |
| **Trust Wallet** | Chain in wallet-core registry (`id: arc`, chainId 5042) | [VERIFIED registry] |
| **Phantom** | Day-one support | [REPORTED] solanacompass.com; Circle PR lists Phantom |
| **Rabby** | Named in Circle blog. Rabby's public chain API did **not** return 5042 today. A secondary source says it needs a manual add. | [REPORTED / API negative] |
| **Rainbow** | Named in Circle PR and blog | [REPORTED]; repo check inconclusive |
| **Coinbase Wallet** | Not named in Circle's wallet list. Custom-network add only. | [REPORTED] (trustswap.com); "Coinbase ... will be live on Arc soon" refers to the exchange [REPORTED] |
| Ledger, OKX Wallet, Binance Wallet, Bitget Wallet, Gate Web3, KuCoin Web3, SafePal, Tangem, imToken, DCent, Backpack, Bron, ether.fi, Zerion, Para, Alcove, Superfluid, WalletConnect | Named as day-one wallets or consumer apps | [REPORTED] (press release, Arc blog) |
| Any EVM wallet (manual add) | chainid.network lists Arc (5042) with RPCs `rpc.mainnet.arc.io`, blockdaemon, drpc, and explorer `explorer.arc.io` | [VERIFIED] (`chainid.json`) |
| viem | `arc` and `arcTestnet` chain definitions, plus `cirbtc`, `usdc`, `eurc` token definitions | [VERIFIED code search] |

Embedded and AA wallet SDKs (Circle Wallets, Privy, Dynamic, Turnkey, Crossmint, ZeroDev, Pimlico, Biconomy, Alchemy, Thirdweb, Para, MetaMask Embedded, Blockradar) are covered in 01-arc. The Arc docs list them. [VERIFIED docs]

UX caveat from MetaMask's code [VERIFIED]: "Arc does not show the ERC20 token in the UI, instead the ERC20 token is synced with its native token", with an exception for swap and bridge flows. Our agent should show **one** USDC balance too.

## Oracles

| Oracle | Arc mainnet evidence | Agent use |
|---|---|---|
| **Pyth** | [VERIFIED]: Pyth contract-manager lists chain `arc` (networkId 5042) and price-feed contract `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` ("pro-compatible-production"). RPC shows code (177 bytes, a proxy). Testnet `0x2880aB155794e7179c9eE2e38200202908C17B43`. | Pull prices off-chain via Hermes, or read onchain |
| **Chainlink** | [VERIFIED docs repo]: chain "Arc Network Mainnet" 5042; **CCIP** chain selector entry `arc-mainnet`; **LINK token** `0x76a443768a5e3b8d1aed0105fc250877841deb40`. Data-feed addresses on Arc: [UNKNOWN] (the reference-data-directory URLs I tried returned 404) | CCIP; feeds TBD |
| RedStone, Chronicle, Stork | Listed on Arc docs oracles page [VERIFIED docs]; Stork addresses at docs.stork.network (#arc) | Per provider |

## Indexers and data

| Provider | Arc evidence | Agent use |
|---|---|---|
| **The Graph** | [VERIFIED registry]: `arc` (eip155:5042) and `arc-testnet` with gateway and Studio. Firehose `arc.firehose.pinax.network:443`, Substreams `arc.substreams.pinax.network:443` | Subgraphs |
| **Envio HyperSync** | [VERIFIED]: `https://5042.hypersync.xyz/height` returned 23,293,947 (matches the mainnet head). Queries need an Envio API token. | Fast history (e.g. "all my past transfers") |
| **Goldsky** | Arc docs list it [VERIFIED docs]. ArcNS README runs a Goldsky mainnet subgraph [REPORTED]. Goldsky also sells 11 x402 endpoints on Arc [VERIFIED Discovery API] | Subgraphs, Mirror |
| Alchemy, Thirdweb Insight, Zerion API, Pinax | Arc docs [VERIFIED docs] | Webhooks and portfolio (Zerion is a good fit for "notify me when paid") |
| DeFiLlama | [VERIFIED]: chain `Arc` in `/v2/chains` (TVL $526.7M) and stablecoins API | TVL, yields, stables |
| CoinGecko / GeckoTerminal | [VERIFIED]: asset platform `arc` (chain_identifier 5042); GeckoTerminal network `arc` | Prices and trending pools (rate-limited) |
| Dune, Allium, CoinMarketCap | Arc blog [REPORTED] | — |

## Explorers

| Explorer | Evidence | API for agents |
|---|---|---|
| **Blockscout** `https://explorer.arc.io` (mainnet), `https://explorer.testnet.arc.io` | [VERIFIED]: chains.blockscout.com lists 5042 "Arc Mainnet" and 5042002 "Arc Testnet" | `/api/v2/*` returned a **Cloudflare "Just a moment..." challenge** to curl today, so server-side agent calls may be blocked. [VERIFIED blocked] Use RPC, HyperSync, or Goldsky instead |
| 8004scan | Agent explorer, site live [VERIFIED 200] | [UNKNOWN] |
| arc-scan.org | Appeared in search (`docs.arc-scan.org`) | [REPORTED; not checked] |

Public RPC limits relevant to an agent [VERIFIED today]: `rpc.mainnet.arc.io` rejected `eth_getLogs` over ~10k blocks ("requested range too large") and returned "requested data not available" for a 1,000-block window. dRPC free allows ≤10,000 blocks. Blockdaemon returned "pruned history unavailable". **An agent needs an indexer for history.** (`rpc-8004-probe.txt` plus manual curl)

## On/off-ramps

| Ramp | Evidence | Notes |
|---|---|---|
| **Circle Onramp Kit / Arc Portal onramp** | Portal page: "Debit, Apple Pay, or Google Pay. No spread, no conversion fee — funds land on Arc" [VERIFIED page]; `@circle-fin/onramp-kit` 1.0.2 (01-arc) | Embeddable widget plus SDK |
| **MoonPay** | [VERIFIED API]: currency `usdc_arc`, networkCode `arc`, chainId 5042 | Widget, API |
| **Transak** | [VERIFIED API]: USDC on network `arc`, `isAllowed: true` | Widget, API |
| Ramp, Ramp Network, Yellow Card, zkp2p, Bridge (Stripe), Avenia, Noah | arc.io ecosystem / blog [REPORTED] | — |
| Off-ramp to bank | Via CEXs (see apps-and-protocols §13) or the providers above | Off-ramp support per provider [UNKNOWN] |

## Compliance and security (for pre-send screening)

Chainalysis, Elliptic, TRM Labs (Arc docs [VERIFIED docs]); Blockaid, Hypernative, Socure, Tenderly (Arc blog [REPORTED]). MetaMask already screens Arc addresses [VERIFIED CHANGELOG].
