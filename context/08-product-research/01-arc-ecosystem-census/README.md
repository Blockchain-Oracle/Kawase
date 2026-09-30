# 01: Arc ecosystem census (index and summary)

Purpose: an evidence-backed census of what exists on Arc as of 2026-09-29 that a consumer or small-business AI agent could act on or integrate with. It covers community programs, apps and protocols, tokens, wallets, infrastructure, and the gaps. Mainnet launched 2026-09-16 (chain 5042). Testnet is 5042002.

Sources: listed per file. Raw evidence (API responses, scrapes, RPC probe outputs) is in `.firecrawl/product/census/`. The key ones are DeFiLlama (`llama-arc-protocols.json`), GeckoTerminal (`gt-*.json`), LI.FI (`lifi-*.json`), Circle x402 Discovery (`x402-discovery-arc-all.json`), Morpho (`morpho-arc2.json`), RPC probes (`rpc-*.txt`), Arc House pages (`ah-*.txt`), the Circle press release (`press-mainnet.md`), BusinessWire (`bw-validators.md`), the Arc mainnet blog (`arcio-blog-mainnet.md`), Arc Portal (`arc-portal.md`, `portal-*.md`), and the ARC whitepaper (`arc-token-whitepaper.txt`).

Verified: 2026-09-29

## Files

| File | Contents |
|---|---|
| [arc-house-and-community.md](arc-house-and-community.md) | Arc House (Abu's "arcade school"), Architects tiers, points table, roles, KYC, **airdrop/ARC token facts**, "Arc Academy" (doesn't exist), live programs (Microgrants, Acceleration Season) |
| [apps-and-protocols.md](apps-and-protocols.md) | The big table: first-party Circle apps, DEXes, aggregators, bridges, lending, FX, launchpads, NFTs, name services, payments, ERC-8004, x402, CEXs |
| [tokens-and-assets.md](tokens-and-assets.md) | Circle assets, vault tokens, stablecoin float, **meme-coin scene**, copycat tokens, token-data APIs |
| [wallets-and-infra.md](wallets-and-infra.md) | Wallet support (MetaMask native, verified in code), oracles (Pyth verified), indexers, explorers (API blocked), ramps (MoonPay and Transak verified) |
| [gaps-and-unknowns.md](gaps-and-unknowns.md) | What's missing, what's unverified, next checks |

## Category → count live on mainnet → notable

"Live" means verified today by an API that returns chain 5042, onchain code, or DeFiLlama/GeckoTerminal indexing. Counts in parentheses are named in Circle/partner material but not independently verified.

| Category | Verified live on mainnet | (+ reported only) | Notable |
|---|---|---|---|
| First-party Circle/Arc apps | 6 | (+2) | **Arc Portal** (swap, send, earn, **agent wallets with spend caps**), Agent Stack/Marketplace, App Kits, StableFX, CCTP/Gateway, Onramp |
| DEXes / AMMs | 14 | (+10) | Uniswap V3 ($38M TVL) and V4 (meme hub), Aero, Archery, Curve, Sushi, Synthra, Lunya, Arctide |
| Aggregators | 5 | (+4) | **LI.FI** (API, 5042 and 5042002), **Relay**, KyberSwap (via LI.FI), Symbiosis, DexFi |
| Bridges | 13 | (+4) | CCTP/Gateway, **Across** (18 inbound routes), Relay, deBridge, LayerZero, Symbiosis, edgeX and SoDEX bridges, plus Gas.zip, Garden, Layerswap, Eco, and Polymer via LI.FI |
| Lending / yield vaults | 5 | (+4) | **Morpho $295.6M** (largest), **Aave V4 $179.5M**, Circle Earn vaults, Lagoon, KPK |
| Stablecoin FX | 3 | (+1) | App Kit Swap, StableFX (FxEscrow), DEX EURC pools |
| Launchpads / meme platforms | 14 on DeFiLlama, +6 on GeckoTerminal, +1 site | (+3: Pump.fun, fomo, Doppler) | Argus, Tolly, LIFT, SolonPad, Mercurifi, Load, arcpad.meme, Wonk, Aka.fun, Virtuals |
| NFT marketplaces / collectibles | 1 (ArcLotls, tiny) | (+2: OpenSea, Orixa) | No meaningful Arc-native NFT market found |
| Name services | 1 (ArcNS, code verified) | (+4) | No official or ENS service; competing `.arc` registries |
| Payments apps (consumer) | 1 (Arc Portal Send) | (+15 institutional) | Rain, Thunes, Wirex, MoneyGram, Visa (PR only) |
| Wallets | 2 verified in code or registry (MetaMask, Trust) | (+~20) | Phantom, Rabby, Rainbow, Ledger, OKX, and more (PR) |
| Oracles | 2 (Pyth contract; Chainlink CCIP/LINK) | (+3 docs-listed: RedStone, Chronicle, Stork) | Chainlink feed addresses unknown |
| Indexers / data | 4 (The Graph, Envio HyperSync, DeFiLlama, CoinGecko/GT) | (+5 docs-listed) | Goldsky, Alchemy, Zerion, Thirdweb, Pinax |
| Explorers | 2 (Blockscout, 8004scan) | (+1) | Blockscout API is Cloudflare-blocked for curl |
| On/off-ramps | 3 (Circle Onramp, MoonPay, Transak) | (+6) | |
| ERC-8004 registries | 1 set (Identity + Reputation) | — | **~332 agents** registered on mainnet |
| x402 services | **687 endpoints / 6 providers** | — | Orthogonal, AIsa, QuickNode, BlockRun, Goldsky, Exa. **0 on testnet** |

## The findings that matter most for the product

1. **Circle already ships a consumer "Arc super-app" with agents.** Arc Portal does swap, send, earn, onramp, app discovery, and "Give your agents a wallet ... with a spending cap", with the setup prompt handed to Claude Code or Codex. Our agent must differentiate with voice, multilingual support, automations, contacts, notifications, and generative UI, not the basic actions. [VERIFIED `portal-agent.md`, `arc-portal.md`]
2. **Arc House / Architects is real and points-based, and points are explicitly not airdrop eligibility.** There are 6 tiers (0–90,000 points), and points come from hackathons (500/1,000), grants (2,000), daily activity, posts, and events. The ARC token was minted (10B), but "No ARC token has been launched". The agent must say this plainly. [VERIFIED]
3. **Meme coins are big on Arc.** 14+ launchpads, and dozens of tokens doing $0.7M–$15M/day on Uniswap v4. There is also serious **impersonation and wash-volume risk**: duplicate ARGUS, CRCL, and AMC contracts, and a "BTC/USDB" pool with $43M/day built on non-Circle tokens. A token allowlist and warnings are mandatory. [VERIFIED data; risk is INFERENCE]
4. **The x402 marketplace is live and callable today, on mainnet only.** 687 Arc-payable services through a keyless Discovery API. [VERIFIED]
5. **Bridge comparison is feasible.** LI.FI, Relay, Across, deBridge, and CCTP/App Kit all have quotable APIs that include 5042. [VERIFIED chain support; fee comparison not yet run]
6. **Yield is Morpho plus Aave.** They hold $475M of the $527M chain TVL, and Morpho has a public GraphQL API. [VERIFIED]
7. **Infrastructure gaps.** The public RPCs can't serve log history, the explorer API is bot-blocked, and there is no official name service. Plan for an indexer and an in-app contacts book. [VERIFIED]

## What an agent can call without an account (quick list)

LI.FI `li.quest/v1/*` · Relay `api.relay.link` · Across `app.across.to/api` · deBridge `dln.debridge.finance` · Morpho `blue-api.morpho.org/graphql` · DeFiLlama `api.llama.fi` and `stablecoins.llama.fi` · GeckoTerminal `api.geckoterminal.com/api/v2/networks/arc/*` (rate-limited) · Circle x402 Discovery `api.circle.com/v2/x402/discovery/resources?network=eip155:5042` · Pyth Hermes · RPC `rpc.mainnet.arc.io`. [VERIFIED responding 2026-09-29, except Pyth Hermes, which was not called]
