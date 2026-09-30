# Apps and protocols on Arc (the big table)

Purpose: every app or protocol found on Arc, by category. For each: URL, mainnet or testnet, how it was verified, and whether an agent can call it through an API or SDK. Wallets, oracles, indexers, explorers, and ramps are in [wallets-and-infra.md](wallets-and-infra.md). Tokens are in [tokens-and-assets.md](tokens-and-assets.md).

Sources:
- DeFiLlama `https://api.llama.fi/v2/chains` (Arc chainId 5042, TVL **$526.7M**) and `https://api.llama.fi/protocols` filtered to chain "Arc" → `.firecrawl/product/census/llama-arc-protocols.json` (42 protocols; the 8 "Archway" false matches are excluded)
- GeckoTerminal `networks/arc/dexes` (21 DEX sources) and top pools → `gt-dexes_page_*.json`, `gt-pools_page_*.json`
- LI.FI `https://li.quest/v1/chains`, `/v1/tools?chains=5042` → `lifi-chains.json`, `lifi-tools-arc.json`
- Relay `https://api.relay.link/chains`, Across `https://app.across.to/api/available-routes?destinationChainId=5042`, deBridge `https://dln.debridge.finance/v1.0/supported-chains-info`, LayerZero `https://metadata.layerzero-api.com/v1/metadata/deployments` → `relay-chains.json`, `across-routes.json`, `debridge.json`, `lz-deployments.json`
- Morpho GraphQL → `morpho-arc2.json`; RPC probes → `rpc-dex-probes.txt`, `rpc-misc-probes.txt`, `rpc-8004-probe.txt`
- Circle x402 Discovery API `https://api.circle.com/v2/x402/discovery/resources?network=eip155:5042` → `x402-discovery-arc-all.json`
- Arc Portal Discover `https://portal.arc.io/discover` → `portal-discover.md`; Arc Portal agent page → `portal-agent.md`
- arc.io/ecosystem directory (186 entries) → `arcio-ecosystem-parsed.json`
- Circle press release 2026-09-16 (`press-mainnet.md`), BusinessWire 2026-08-05 (`bw-validators.md`), Arc mainnet blog (`arcio-blog-mainnet.md`)
- curl site-title checks → `url-status.txt`; web search notes → `websearch-and-webfetch-notes.md`
- All local paths are under `.firecrawl/product/census/`.

Verified: 2026-09-29

## How to read "Verified by"

- **LLAMA**: DeFiLlama lists the protocol with a nonzero chain "Arc" entry. This is a third-party adapter reading onchain data, so it is strong evidence of mainnet deployment. [VERIFIED API]
- **GT**: GeckoTerminal indexes pools for this DEX on network `arc`. [VERIFIED API]
- **RPC**: I confirmed the contract has code on `rpc.mainnet.arc.io` today. [VERIFIED]
- **API**: the protocol's own API returns chain 5042. [VERIFIED]
- **PORTAL**: listed on Circle's Arc Portal Discover page. This is a first-party curation, not proof of contracts. [REPORTED+]
- **PR**: named in a Circle press release or blog, or the arc.io ecosystem page. [REPORTED]
- **SITE**: the site's own title or README claims Arc mainnet. [REPORTED]

## 1. First-party Circle/Arc apps (what the agent competes with or builds on)

| Name | URL | Net | Verified by | Agent API/SDK |
|---|---|---|---|---|
| **Arc Portal**: consumer hub with Earn, Swap, Send, **Agent**, Discover. "Users can create agent wallets directly in Arc Portal, set spend limits and permissions." Fiat onramp: "Debit, Apple Pay, or Google Pay". | https://portal.arc.io | Mainnet | Scraped live page (`arc-portal.md`, `portal-agent.md`) [VERIFIED page]; blog [VERIFIED] | No public API found [UNKNOWN] |
| Arc Portal "Agent": "Create a wallet with a spending cap, hand the setup prompt to Claude Code, Codex, or any AI agent — and it transacts on its own". Sample paid tools: Polymarket feed $0.012, Tavily $0.0612, X signals $0.004, Browserbase $0.4012. | https://portal.arc.io/agent | Mainnet | [VERIFIED page] | Via Circle Agent Stack (below) |
| **Circle Agent Stack**: Agent Wallets, Nanopayments, **Agent Marketplace** | https://agents.circle.com | Mainnet | [VERIFIED] docs (`.firecrawl/docs/circle-llms-full.txt:81-139`) plus the live Discovery API | Circle CLI, APIs, skills |
| **Arc Studio**: onchain coding agent | https://studio.arc.io | Mainnet | PR [REPORTED]; 403 to curl | — |
| **App Kits**: Send, Bridge, Swap, Unified Balance, Earn, Onramp | https://docs.arc.io/app-kit | Both | [VERIFIED] (`context/01-arc/app-kit.md`) | `@circle-fin/app-kit` |
| **StableFX** (RFQ FX, FxEscrow `0xe2E5…DFe6`) | https://www.circle.com/stablefx | Mainnet | RPC code [VERIFIED] (network-config.md); "StableFX is live today on Arc" [VERIFIED blog] | Circle API (institutional access) |
| **Circle Gateway / CCTP V2** | circle.com/gateway | Both | RPC [VERIFIED]; LLAMA lists Circle Gateway $307k on Arc | Circle APIs, App Kit |
| Circle Payments Network | circle.com/cpn | Mainnet | PR "integrated natively into Arc" [REPORTED] | Circle CPN API (institutional) |

## 2. DEXes and AMMs

| Name | URL | Net | Arc TVL (LLAMA) | Verified by | Agent API/SDK |
|---|---|---|---|---|---|
| **Uniswap V3** | app.uniswap.org | Mainnet | $38.0M | LLAMA, GT, **RPC**: factory `0xf0db7b58379503491d857db50ac9ece64c653918` (24.5 KB code) | Uniswap SDK plus the factory. Arc is **not** in `@uniswap/sdk-core` main `addresses.ts` today [VERIFIED absent], so addresses must be supplied manually |
| **Uniswap V4** | app.uniswap.org | Mainnet | $6.0M | LLAMA, GT (most meme pools) | v4 SDK; PoolManager address not captured [UNKNOWN] |
| Uniswap V2 | app.uniswap.org | Mainnet | $0.6M | LLAMA, GT, **RPC** factory `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | Standard V2 router |
| **Aero** (Aerodrome Slipstream, plus "Aero Lite") | https://aero.xyz | Mainnet | $2.78M + $2.78M | LLAMA, GT, **RPC** factory `0xb89df768af2cfe637ceb352c587fe8edaf491d03`; PORTAL | Contracts only [UNKNOWN SDK for Arc] |
| Curve DEX | curve.finance | Mainnet | $0 | LLAMA, GT | Curve API [UNKNOWN Arc coverage] |
| SushiSwap V2/V3/V4 | sushi.com | Mainnet | $3k | LLAMA, GT | Sushi API [UNKNOWN Arc] |
| **Archery V3** ("USDC-native ... ve(3,3)") | https://archery.wtf | Mainnet | $0.69M | LLAMA, GT, **RPC** factory `0xc481038c013fe96f38ce7a2dc417b2b1b78b16a4`; SITE | Contracts only |
| Synthra V3 | https://app.synthra.org | Mainnet | $83k | LLAMA, GT, PORTAL | — |
| Arctide DEX | https://arctide.app | Mainnet | $70k | LLAMA | — |
| DyorSwap AMM | dyorswap.finance | Mainnet | $85k | LLAMA, GT | — |
| Lunya DEX | https://lunya.io | Mainnet | $15k | LLAMA, GT; SITE | — |
| Buglefamily | https://bugle.family (403) | Mainnet | $2k | LLAMA | — |
| UnitFlow Finance | https://unitflow.finance | Mainnet | — | GT | — |
| Uniswap Pools.trade | — | Mainnet | — | GT; PR (pools.trade) | — |
| XyloNet ("swaps, bridging, and ERC-4626 vaults alongside PayX for identity-linked USDC tipping") | https://www.xylonet.xyz | Mainnet? | — | PORTAL only | [UNKNOWN] |
| Fluid, Alcove, Definitive, Doppler, Alph, Swapper, RhinoFi | — | — | — | PR / arc.io ecosystem only | [REPORTED only] |
| **Perps / orderbook**: Hibachi ("stablecoin-native orderbook exchange for perpetual futures and FX"), edgeX, Extended, Aster, o1.exchange | various | — | edgeX Bridge $2.5M (LLAMA) | Hibachi = PORTAL; edgeX = LLAMA (bridge); others PR | [UNKNOWN] |

## 3. Aggregators (swap and bridge routing)

| Name | Net | Verified by | Agent API/SDK |
|---|---|---|---|
| **LI.FI** | 5042 **and** 5042002 | **API**: `/v1/chains` returns both. Its tools on Arc: bridges across, symbiosis, gasZipBridge, relaydepository, polymer, eco, lifiIntents, garden, smartDeposits, layerswap; exchanges kyberswap, fly, nordstern, lifiIntentsDex | REST API plus `@lifi/sdk`, no key for basic use [VERIFIED endpoint] |
| **Relay** | 5042 | **API** `/chains` returns `arc`, not disabled | REST API |
| **KyberSwap** | 5042 | Via LI.FI tools list [VERIFIED indirect]; PR | KyberSwap aggregator API [UNKNOWN direct check] |
| 1inch, 0x, Bungee/Socket | — | PR only | 1inch/0x need API keys; Arc support [UNKNOWN] |
| Symbiosis | Mainnet | LLAMA ($48k); LI.FI tool | API |
| DexFi Aggregator | Mainnet | LLAMA ($15k) | — |
| vfat.io (yield aggregator) | Mainnet | LLAMA ($154k) | — |
| **Bankr** ("AI agent that can buy, sell, swap coins") | — | arc.io ecosystem, PR [REPORTED] | Bankr API [UNKNOWN Arc] |

## 4. Bridges

| Name | Net | Verified by | Notes / API |
|---|---|---|---|
| **Circle CCTP V2** (domain 26) and **Gateway** | Both | RPC [VERIFIED] | App Kit Bridge / Unified Balance. The canonical route for USDC and EURC |
| **Across** | Mainnet | **API**: 18 inbound USDC routes to 5042 (from chains 1, 10, 56, 130, 137, 143, 324, 480, 999, 1868, 4217, 4663, 8453, 42161, 43114, 57073, 59144); PORTAL | Across API (quotes) |
| **Relay** | Mainnet | API | Relay API |
| **deBridge (DLN)** | Mainnet | **API** supported-chains includes chainId 5042 | DLN API |
| **LayerZero** (eids 30417 mainnet, 40434 testnet) | Both | **API** metadata `arc-mainnet` | LZ endpoints |
| Stargate | Mainnet? | PORTAL; PR. Stargate `/api/v1/chains` did **not** list 5042 today | [UNKNOWN live routes] |
| Symbiosis, Gas.zip, Garden, Layerswap, Eco, Polymer | Mainnet | LI.FI tools list | Through LI.FI |
| edgeX Bridge, SoDEX Bridge | Mainnet | LLAMA ($2.5M, $42k) | Exchange deposit bridges |
| Wormhole, Aleo (xReserve), Fast | — | PR | [REPORTED] |

For "compare bridges for the cheapest fee" [INFERENCE]: LI.FI (which aggregates Across, Relay, Symbiosis, Gas.zip, and others), Relay, Across, and deBridge each expose quote APIs with 5042, and App Kit gives the CCTP/Gateway route. Those are five independently quotable paths.

## 5. Lending, borrowing, and yield vaults

| Name | URL | Net | Arc TVL | Verified by | Agent API/SDK |
|---|---|---|---|---|---|
| **Morpho** (Blue markets plus V2 vaults by Galaxy, Keyrock, Gauntlet, Steakhouse, Bitwise, Dialectic) | app.morpho.org | Mainnet | **$295.6M** (largest on Arc) | LLAMA; **API** (`chains` includes 5042, vaults and markets returned); RPC on vault tokens | Morpho GraphQL API plus SDK [VERIFIED API]. Top market: USDC loan vs cirBTC collateral, $184.8M supplied |
| **Aave V4** (Core hub: USDC, EURC, cirBTC, WETH) | aave.com | Mainnet | **$179.5M** | LLAMA; RPC "Wrapped Aave Core USDC" `0x42EAB6…eB83`; PORTAL; PR quote from Stani Kulechov | Aave V4 SDK or API [UNKNOWN Arc coverage] |
| Circle Earn Kit / "Circle Guarded vaults" | portal.arc.io/earn | Mainnet | — | Portal page [VERIFIED page] | `@circle-fin/app-kit` Earn (`exploreVaults`) |
| Maple (syrupUSDC) | maple.finance | Mainnet | — | PORTAL; a Morpho market uses syrupUSDC collateral [VERIFIED API] | — |
| Lagoon (vault infra) | lagoon.finance | Mainnet | $0 | LLAMA | — |
| KPK (asset manager) | kpk.io | Mainnet | $6 | LLAMA | — |
| Merkl (incentives) | — | — | — | PR | Merkl API [UNKNOWN Arc] |
| Superform, Huma, USD.ai (sUSDai market exists on Morpho) | — | — | — | PR; sUSDai seen as Morpho collateral [VERIFIED] | — |
| **USYC** (T-bill fund, allowlisted) | circle.com/usyc | Mainnet | — | RPC | Teller contract |

## 6. Stablecoin FX

| Name | Net | Verified by | Agent API/SDK |
|---|---|---|---|
| App Kit Swap (USDC↔EURC) | Both | [VERIFIED] docs | App Kit |
| Circle StableFX (RFQ, 20+ local stablecoins) | Mainnet | RPC plus blog | Circle API, institutional |
| Uniswap / Aero EURC pools | Mainnet | GT/LLAMA (pool-level detail not captured) | DEX |
| Hibachi (FX price discovery, perps) | — | PORTAL | [UNKNOWN] |

## 7. Launchpads and meme-coin platforms

There are 14 DeFiLlama-listed launchpads, plus Aka.fun, o1 Launchpad, Minara.fun, Faze, Virtuals, Long.supply (GT), and ACTFUN (SITE). The full table is in [tokens-and-assets.md](tokens-and-assets.md) (section "Launchpads"). **None of them publish an API I could verify.** Integration would be through contracts, or through buying the graduated tokens on Uniswap v4 via LI.FI or Relay. [VERIFIED absence of documented APIs in what I checked; not exhaustive]

Pump.fun, fomo, Doppler, Virtuals: named in Circle materials. Only Virtuals appears as a GT source. [REPORTED]

## 8. NFT marketplaces and collectibles

| Name | Net | Verified by | Notes |
|---|---|---|---|
| OpenSea | Mainnet | Search result page `opensea.io/discover/chain/arc`; nftcalendar "OpenSea to Support Arc From Day One"; PR lists OpenSea | [REPORTED]. OpenSea API Arc chain slug not verified |
| ArcLotls ("on-chain collectible protocol ... proof-of-work NFT creation") | Mainnet | LLAMA ($225, "Gamified Mining") | — |
| Orixa / ORIXIANS | — | Search snippet only | [REPORTED, weak] |
| Genesis Pad (NFT mint) | Testnet | Cryptonomist guide | [REPORTED, testnet] |

No major Arc-native NFT marketplace with meaningful volume was found. [UNKNOWN volumes]

## 9. Naming services (ENS-like)

No official Circle/Arc name service and **no ENS deployment on Arc** were found. Several independent projects compete: [VERIFIED absence in Arc docs, Circle PRs, and arc.io ecosystem; search not exhaustive]

| Name | TLD | URL | Net | Verified by |
|---|---|---|---|---|
| **ArcNS** (Arc Name Services) | `.arc`, `.circle` | https://arcns-app.vercel.app, README says frontend at arcname.services | Mainnet (README: deployed 2026-09-16) | **RPC**: ArcNSRegistry `0xcA4d60A6d237EDa59aA1F57EbAe6B3150BcAb8Fb` has code; `.arc` registrar `0x1a99540B48A21db03c768760052c3F915F9852aB` `name()` = "ArcNS arc Name" [VERIFIED]. Repo github.com/cekuu35/arcns (0 stars, created 2026-09-20) |
| Arc names | `.arc` | https://arcname.io | Mainnet (SITE) | [REPORTED] |
| dotarc | `.arc` | https://dotarc.org | SITE | [REPORTED] |
| Arc Name Service (ZNS.bio) | `.arc` | https://arcnames.co | SITE | [REPORTED] |
| Contour | `.contour` | github.com/yusufky63/arc-name-services | — | [REPORTED] |
| InfinityName | — | — | Testnet | Cryptonomist [REPORTED] |

Implication [INFERENCE]: several projects claim `.arc`, so "alice.arc" can resolve differently depending on the registry. For v1 the agent should rely on its own contacts book, and treat any name service as optional with explicit confirmation.

## 10. Payments apps

| Name | Net | Verified by | Notes |
|---|---|---|---|
| Arc Portal Send | Mainnet | [VERIFIED page] | Circle's own |
| Rain (cards), Thunes, Wirex | — | BusinessWire [REPORTED] | "routing real-world stablecoin payment and settlement flows through Arc" |
| MoneyGram, Visa, Mastercard, Global Payments, JCB, BVNK, Tazapay, UQPay, OwlPay, Alfred Pay, Pulsar, Noah, HIFI, Catena, Cycles | — | PR / blog [REPORTED] | Institutional, no consumer API verified |
| Superfluid (streaming) | — | blog [REPORTED] | — |
| XyloNet PayX (USDC tipping) | — | PORTAL | — |

## 11. Agent identity (ERC-8004) and agent marketplaces

| Name | Net | Verified by | Agent API |
|---|---|---|---|
| **ERC-8004 IdentityRegistry** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (`name()` = "AgentIdentity", symbol "AGENT") | Mainnet | **RPC**: code at block 13,344,062 (timestamp 1785595911). `ownerOf(0..331)` succeed and `ownerOf(332)` fails → **~332 agents registered** [VERIFIED calls; the count assumes sequential IDs with no burns, INFERENCE] | Contract; 8004scan |
| ERC-8004 ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Mainnet | RPC code (130 bytes, a proxy) | Contract |
| Testnet 8004 registries (`0x8004A818…`), ERC-8183 `0x0747…4583` | Testnet | Arc docs (network-config.md) | Contract |
| **8004scan** (AltLayer explorer) | Multi-chain incl. Arc | Site live [VERIFIED 200]; Arc agents #1 "APEX Faucet" and #211 "APEX Watchtower" [REPORTED via awesome-erc8004 PR #116] | Web; API [UNKNOWN] |
| **Circle Agent Marketplace** (x402 catalog) | Mainnet | **Discovery API** [VERIFIED] | `GET https://api.circle.com/v2/x402/discovery/resources?network=eip155:5042`, no key |
| Virtuals (Arc) | Mainnet | GT dex source | [UNKNOWN] |
| Kite AI, Orthogonal, BlockRun, Arrays, Ornn, Alethieum, Architect | — | Press release ("Building the agentic economy") | Orthogonal and BlockRun are **live on the x402 catalog** (below) |

## 12. x402 services payable in USDC on Arc mainnet

[VERIFIED: Circle Discovery API, 2026-09-29 (`x402-discovery-arc-all.json`)]
- **687** services accept `eip155:5042` (asset `0x3600…0000`), out of **1,337** in the whole catalog. **0** accept Arc testnet `eip155:5042002`.
- By provider: Orthogonal 293, AIsa API 135, QuickNode 132, BlockRun.AI 114, Goldsky 11, Exa 2.
- By category: FINANCIAL_ANALYSIS 181, DATA_ENRICHMENT 170, WEB_SEARCH_RESEARCH 133, INFRASTRUCTURE 94, PREDICTION_MARKETS 62, SOCIAL_INTELLIGENCE 29, CREATIVE 18.
- Settlement: Circle **Facilitator Service** "settles USDC on Arc, Base, and Polygon PoS" (EIP-3009 `exact`), and Gateway nanopayments (`GatewayWalletBatched`). [VERIFIED docs] (`.firecrawl/docs/circle-llms-full.txt:61862`)

Implication [INFERENCE]: the "marketplace" feature can be built today. Search the Discovery API, show price and schema, then pay per call from the user's capped agent wallet.

## 13. Exchanges (CEX) with Arc deposits or withdrawals

Named as live: Binance, Bitrue, Bitso, Bitvavo, Bybit, Coins.ph, Gate, Kraken, KuCoin, LBank, MEXC, Mobee, OKX, OSL, Paribu, PDAX, SwissBorg, Tokocrypto, Upbit, Wenia. "Coinbase and others will be live on Arc soon." [REPORTED] (`arcio-blog-mainnet.md`). Portal Discover lists Binance, Bybit, Kraken, OKX, and Robinhood. Per-exchange Arc deposit support was not verified individually. [UNKNOWN]

## 14. Reference: arc.io/ecosystem directory

186 partner entries were parsed (`arcio-ecosystem-parsed.json`), with categories that include DEXs (19), Wallet Services (19), CEXs (18), Fintechs (13), Tokenized Assets (12), Banks (11), Stablecoin Issuers (8), Oracles (4), and RPC Providers (4). This is a **partner-logo wall**: [REPORTED] only, per RESEARCH-RULES rule 3.
