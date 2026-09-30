# Tokens and assets on Arc mainnet

Purpose: which tokens actually exist and trade on Arc mainnet (5042) today, how much stablecoin is there, and whether meme-coin activity exists (it does, a lot). This is for the agent's token resolver, safety warnings, and the "meme coins" feature.

Sources:
- `context/01-arc/network-config.md` (official asset addresses, code-verified 2026-09-29)
- LI.FI token list: `https://li.quest/v1/tokens?chains=5042` → `.firecrawl/product/census/lifi-tokens-arc.json`
- GeckoTerminal: `https://api.geckoterminal.com/api/v2/networks/arc/pools?sort=h24_volume_usd_desc` (pages 1–3) → `gt-pools_page_*.json`; dexes → `gt-dexes_page_*.json`
- DeFiLlama stablecoins: `https://stablecoins.llama.fi/stablecoinchains`, `/stablecoins` → `llama-stablechains.json`, `llama-stables.json`
- Morpho API `https://blue-api.morpho.org/graphql` → `morpho-arc2.json`
- RPC `eth_call` probes on `https://rpc.mainnet.arc.io` → `rpc-token-probes.txt`, `rpc-misc-probes.txt`
- Circle/Arc mainnet blog `arcio-blog-mainnet.md`, Circle press release `press-mainnet.md`
- All local paths are under `.firecrawl/product/census/`.

Verified: 2026-09-29

## Headline answers

- **Circle-issued assets on mainnet:** USDC (native gas plus ERC-20 view), EURC, USYC (allowlisted), cirBTC. Also bridged **WETH**. [VERIFIED] (network-config.md, eth_getCode)
- **Stablecoin float on Arc (DeFiLlama):** USDC ≈ **$460.5M**, EURC ≈ **$5.6M**, GBPA (Agant GBP) ≈ **$0.76M**. [VERIFIED API, 2026-09-29] (`llama-stables.json`)
- **Meme coins: yes, a large and very active scene** from about 2026-09-16 onward. At least 15 launchpads are listed on DeFiLlama, and dozens of meme tokens with $0.7M–$15M in 24h volume trade on Uniswap v4. [VERIFIED] (see below)
- **ARC (network token):** minted at genesis (10B), **not launched or tradeable**. Any "ARC" token on a DEX is not official. [VERIFIED press release plus whitepaper page]

## Official and institutional assets

| Asset | Mainnet address | Status | Source |
|---|---|---|---|
| USDC | native, plus `0x3600000000000000000000000000000000000000` (6 dp view) | Live | [VERIFIED] network-config.md |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | Live | [VERIFIED] |
| USYC | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | Live; allowlisted, non-US, $100k minimum | [VERIFIED] |
| cirBTC | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | Live. Main pool cirBTC/USDC 0.01% on Uniswap v3 had $4.6M 24h volume and $11.4M liquidity | [VERIFIED] GeckoTerminal |
| WETH (bridged) | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | Live | [VERIFIED] |
| LINK | `0x76a443768a5e3b8d1aed0105fc250877841deb40` | Listed in Chainlink docs | [VERIFIED] (smartcontractkit/documentation `link-token-contracts.mdx`) |
| wARS (Peso Argentino) | `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D` | In LI.FI list | [VERIFIED listed] |
| GBPA | (address not captured) | DeFiLlama shows ~$0.76M | [VERIFIED API] |
| Other local stablecoins: AUDD, AUDF, BRLA, CADD, CHFAU, EURAU, JPYC, KRW1, MXNB, QCAD, SEKAU, TRYB, wBRL, wCLP, wCOP, wMXN, wPEN, ZARU | — | "Arc supports ..." (Circle blog). Live status per token was not checked. | [REPORTED] arcio-blog-mainnet.md |
| BUIDL (BlackRock/Securitize), JAAA and JTRSY (Janus Henderson) | — | "launch natively on Arc" | [REPORTED] Circle blog; addresses not found |

### Yield-bearing vault tokens (Morpho V2 vaults and Aave wrappers)

[VERIFIED via Morpho API and RPC `name()`]

| Token | Address | TVL (Morpho API) | Net APY (API `avgNetApy`) |
|---|---|---|---|
| Galaxy USDC (arcUSDC) | `0x8E357432CC12ff425c36432F312968aEb16112AF` | $84.8M | 0.34% |
| Keyrock Prime USDC (krUSDC) | `0x5bEfAb92a5A3D60F578Cb51EEb4e4FD50a1e3123` | $75.0M | 0.34% |
| Galaxy EURC (arcEURC) | `0x389abDf4355e0cF4f19298179991705a98f21c18` | $0.57M | 0.12% |
| Bitwise Premium RWA USDC (PAPY) | `0x7610094B846657dCF166D59e42973db52c7015F9` | $0.13M | 5.04% |
| Gauntlet EURC Prime | `0x05863F54B05e96092069eF30c9Ca6060336e50B9` | $10k | 0% |
| Steakhouse Prime USDC/EURC, Gauntlet USDC Balanced, Dialectic RWA USDC, Pangolins USDC | see `morpho-arc2.json` | <$20 each | — |
| Wrapped Aave Core USDC / EURC / cirBTC / WETH | `0x42EAB6…eB83` / `0x5A10b1…8d2c` / `0x83D364…6F13` / `0xe8B890…e59D` | — | — |

Note: the API returned several "Test" vaults (e.g. "Test", "Arc Test 2", "pjvk"). An agent must filter vaults by curator or allowlist, not by name. [VERIFIED presence; filtering advice is INFERENCE]

APY caveat: Morpho's `avgNetApy` values look very low (~0.3%) for the two large USDC vaults. I did not cross-check them against the Morpho UI. [UNKNOWN whether this is a units issue or genuinely low early-market rates]

## Meme coins and launchpad tokens

### Launchpads (DeFiLlama category "Launchpad", chain Arc, all listed 2026-09-16 or later)

[VERIFIED DeFiLlama `https://api.llama.fi/protocols` → `llama-arc-protocols.json`. Site titles checked with curl where noted.]

| Launchpad | TVL on Arc (DeFiLlama) | Mechanism (from DeFiLlama description or site) | URL |
|---|---|---|---|
| Argus World | $1.57M | "Tax-token launchpad ... single-sided Uniswap v4 position held by a locker" | https://arguspad.io |
| Tolly | $265k | "a token launchpad on Arc" | (none listed) |
| LIFT V2 / V1 | $56k / $15k | launchpad | https://lift.fun (site title "LIFT") |
| NOXA Fun | $26k | "Hybrid launchpad with V3 single-sided LP and graduation" | https://fun.noxa.eth.limo/ |
| Foci | $24k | launchpad | https://foci.family/ |
| SolonPad | $19k | locked Uniswap v4 pools or "Pons V2 bonding" | https://solonpad.fun ("SolonPad — Launch on Arc") |
| ARK Launch | $10k | launchpad | — |
| Mercurifi | $6k | "Bonding-curve launchpad ... every price and fee is a dollar figure" | https://launch.mercuri.finance |
| Synthra Launchpad | $3k | — | https://app.synthra.org |
| Arctide Launchpad | $2k | "Exchange, launchpad and social trading app" | https://arctide.app |
| Lunya Launchpad | $2k | bonding curve → Lunya DEX | https://lunya.io ("Lunya — Where DeFi happens on Arc") |
| Wonk Fun | $1.6k | — | https://wonk.fun ("Wonk: Launch and Trade Memecoins on Arc Chain") |
| arcpad.meme | $0.7k | "memecoin launchpad on Arc" | https://arcpad.meme |
| Load | $0.1k | "USDC-native launchpad ... Bonding-curve and Instant Uniswap V3 / V4" | https://load.fun ("Meme Launchpad on Arc") |

GeckoTerminal also indexes these launchpad or DEX sources on Arc: **Aka.fun** ("RWA-Powered Launchpad on Arc"), **o1 Launchpad (Arc)**, **Minara.fun**, **Faze** ("Launch and trade your way"), **Virtuals (Arc)**, **Long.supply** ("Stocks on Arc"). [VERIFIED GeckoTerminal dex list plus curl site titles]. **ACTFUN** (https://actfun.pro, "Arc Mainnet Token Launchpad") exists. [VERIFIED site title]. Pump.fun is named as a partner in Circle's blog. [REPORTED; no Arc pool source for Pump.fun on GeckoTerminal as of today]

### Most-traded tokens (GeckoTerminal top pools by 24h volume, 2026-09-29)

[VERIFIED `gt-pools_page_1_sort_h24_volume_usd_desc.json`]

| Pool | DEX | 24h vol | Liquidity | Notes |
|---|---|---|---|---|
| BTC / USDB 0.3% | Uniswap v3 | $43.1M | $91.4M | **Suspicious.** "BTC" `0x30ed6a37…6f0c` has 9 decimals and 78,000 supply. "USDB" (Blockchain USD) `0x9696b5e8…8932` has 8 decimals and 10B supply. Neither is Circle's cirBTC or any known stablecoin. [VERIFIED RPC metadata; "self-minted wash liquidity" is INFERENCE] |
| USDB / ATC 0.25% | Uniswap v4 | $17.9M | $56.8M | Same USDB plus "Atlantis Coin". Suspicious for the same reasons. [INFERENCE] |
| ARGUS / USDC | Uniswap v4 | $15.7M | $5.3M | Argus launchpad token |
| TOLLY / USDC | Uniswap v4 | $9.4M | $1.7M | Tolly launchpad token |
| FAZE / USDC | Uniswap v4 | $6.1M | $1.0M | |
| DIVIDEND, CATZ, ASTOCK, COOL, REGI, CRCL, FOCI, AMC, ARCLIGHT, MEMESPAD, AF, WONK, DUKE, LONG, HTTPS, MURMUR, BAGFI, ARCMAN, MALA, ARCT, ARCUS, … | mostly Uniswap v4 | $0.7M–$5M each | $10k–$3M | Pools created 2026-09-24/25 |
| cirBTC / USDC, WETH / USDC | Aero | $1.8M each | ~$0.9M | Legitimate blue-chip pairs |

### Copycat and impersonation risk (important for the agent)

[VERIFIED via RPC `name()`/`symbol()` on two addresses each]
- **ARGUS**: two different contracts both named "Argus" / ARGUS: `0x8adf1c44…b603c` (GeckoTerminal top pool) and `0xeCe5cA8b…cb3c` (LI.FI list).
- **CRCL "Circle Internet Group • Arc Token"**: two contracts, `0xbee49e32…9014` and `0x2ba0f44B…043B`. What they are (a tokenized stock? a meme?) is [UNKNOWN]. The name impersonates Circle.
- **AMC "Arc Meme Coin"**: two contracts, `0x5eeb6d9e…5656` and `0xa9d83218…0ef9`.
- **"Architects"** token `0x8bcb9427…a4F0` and **"Arcade"** `0xcaaD9713…4549` reuse Arc community branding.

Agent design implication [INFERENCE]: resolve tickers to addresses through a curated allowlist (Circle assets plus the LI.FI or Uniswap token list), show the contract address and liquidity before any meme swap, and warn when two tokens share a symbol.

## What an agent can call

| Need | Endpoint | Status |
|---|---|---|
| Token list with prices | `GET https://li.quest/v1/tokens?chains=5042` (41 tokens) | [VERIFIED] |
| Pools, volume, trending | GeckoTerminal public API, network id `arc` (heavily rate-limited: 429s seen) | [VERIFIED] |
| Token prices | CoinGecko asset platform id `arc` (`chain_identifier: 5042`) | [VERIFIED] (`cg-platforms.json`) |
| Stablecoin supply | DeFiLlama stablecoins API, chain `Arc` | [VERIFIED] |
| Vaults and APYs | Morpho GraphQL (`chainId_in:[5042]`); App Kit Earn `exploreVaults` | [VERIFIED Morpho] |
| Token metadata | RPC `eth_call` name/symbol/decimals | [VERIFIED] |
| Explorer token API | `https://explorer.arc.io/api/v2/tokens` returned a **Cloudflare challenge** to curl | [VERIFIED blocked] |
