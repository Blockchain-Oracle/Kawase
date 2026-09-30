# Tokens and meme trading on Arc

Purpose: establish whether meme or launchpad trading exists on Arc, what the realistic "token trading" scope is, and whether the agent can reach meme markets on other chains.

Sources (`E/` = `.firecrawl/product/02-defi/`):
- LI.FI token list for Arc: `https://li.quest/v1/tokens?chains=5042|5042002` → `E/lifi-tokens-arc*.json`
- deBridge Arc token list: `https://dln.debridge.finance/v1.0/token-list?chainId=5042` → `E/debridge-tokens-arc.json`
- GeckoTerminal: `https://api.geckoterminal.com/api/v2/networks/arc/pools`, `/dexes` → `E/geckoterminal-arc-pools.json`, `E/geckoterminal-arc-dexes.json`
- DexScreener: `https://api.dexscreener.com/token-pairs/v1/arc/0xeCe5…2cb3c` → `E/dexscreener-arc-argus.json`
- DefiLlama `https://api.llama.fi/protocols` (category "Launchpad", `chainTvls.Arc`) → `E/defillama-protocols.json`
- GoPlus token security, Arc → `E/goplus-token-security-arc-argus.json`
- Relay and LI.FI crosschain quotes → `E/relay-quote-arc-to-solana-100usdc.json`, `E/relay-quote-arc-usdc-to-base-eth-100.json`, `E/lifi-quote-arc-to-solana-100usdc.json`
- Lunya launchpad description: https://www.lunya.io/, https://github.com/DefiLlama/DefiLlama-Adapters/pull/21077 [REPORTED]
- KyberSwap "Arcade launchpad hook" PR: https://github.com/KyberNetwork/kyberswap-dex-lib/pull/1674 [REPORTED]
- Arc launch blog partner list: https://www.arc.io/blog/arc-economic-os-internet [REPORTED]

Verified: 2026-09-29

## 1. Yes: meme and launchpad trading is live on Arc mainnet (not testnet)

Evidence [VERIFIED]:
- **Launchpads with Arc TVL on DefiLlama:** Argus World ($1.57M), Tolly ($265k), LIFT V2 ($56k), NOXA Fun ($26k), Foci ($24k), SolonPad ($19k), LIFT V1 ($15k).
- **GeckoTerminal DEX ids on Arc:** `argus`, `aka-fun`, `o1-launchpad-arc`, `minara-fun`, `virtuals-arc`, `long-supply`, `faze`, `foci`, `lunya`, and others.
- **Top GeckoTerminal pools (24h volume)** include memecoin pairs such as ARCLIGHT/USDC ($846k vol, $7.4k reserve, argus), UBI/USDC ($1.04M, uniswap-v4-arc), ARCAT/USDC ($576k, uniswap-v2-arc), ARCOON/USDC ($259k, uniswap-v4-arc), and several "SAFEMOON", "ArcTools", and "ARCIRCLE" clones on `argus` with ~$4k reserves each.
- **ARGUS token** (`0xeCe5cA8bf9220718E5727754026757512212cb3c`):
  - DexScreener: `priceUsd 0.01895`, 24h volume $251,765, liquidity $708k, FDV $17.66M, 30 pairs.
  - GoPlus: `holder_count 20628`, `is_honeypot 0`, `is_mintable 0`, `buy_tax 0`, `sell_tax 0`.
- **Aggregator token lists include meme tokens.** LI.FI lists 41 Arc mainnet tokens, for example ARGUS, TOLLY, FAZE, ASTOCK, ARCT, DUKE, ARCASH, ARCUS, FOCI, MALA, ARCAT, ARCMAN, PP, LONG, COOL, MURMUR, ARCADE, SQDLR, and wARS. deBridge lists ASPAD, MEMESPAD, ARCANINE, KAIRO, and others.
- **Routing works:** KyberSwap routes USDC→ARGUS (lunya → uniswap-v4) and USDC→TOLLY (uniswap-v3). LI.FI quotes USDC→ARGUS via Fly. Circle's swap service also quoted USDC→ARGUS (see `swaps-and-dexes.md`).
- **Testnet:** LI.FI lists only USDC and EURC on 5042002 [VERIFIED]. There is no meme market to demo on testnet.

Launchpad mechanics: Lunya "sells a token along a constant-product curve over virtual reserves until it graduates into a DEX pool" [REPORTED]. Arc launch trading partners include "Pump.fun", "Doppler", "fomo", and "Bankr" (arc.io blog) [REPORTED]. No Pump.fun contract on Arc was verified [UNKNOWN].

## 2. Realistic token universe on Arc mainnet

| Class | Tokens (addresses from `network-config.md` or LI.FI) | Liquidity signal |
|---|---|---|
| Stablecoins / FX | USDC `0x3600…`, EURC `0xbEf5…21c1`, wARS `0x0DC4…D90D`. Circle's release says "more than 20 fiat stablecoins" incl. JPYC, KRW1, TRYB [REPORTED] | EURC/USDC v3 pool reserve only ~$31k (GeckoTerminal); aero-cl pool used by KyberSwap |
| BTC / ETH | cirBTC `0x171A…BAA0`, WETH `0x128c…4EDB` | cirBTC/USDC 0.01% v3: $11.45M reserve, $4.63M 24h volume |
| Yield-bearing receipts | Morpho vault shares (arcUSDC, krUSDC, steakUSDC, gtusdcp, PAPY…), Aave V4 `waCore*`, syrupUSDC, sUSDai, PST | Held, not traded |
| Tokenized equity-like | "CRCL" `0x2ba0f44BDfC17FbA30edA9cdBeCB908cA45B043B` (LI.FI price $84.57; KyberSwap routes via uniswap-v4) | Issuer and backing [UNKNOWN]. Treat as unverified. |
| Memecoins / launchpad tokens | See §1 | Mostly thin ($4k–$250k reserves); some $700k (ARGUS) |

## 3. Reaching meme markets on other chains

The agent can move Arc USDC to chains with bigger meme markets through quote APIs that already list Arc [VERIFIED quotes]:
- **Arc USDC → Solana USDC**: Relay 99.909886 out of 100 ($0.090 relayer, ~1 s); LI.FI `polymerStandard` 99.73005.
- **Arc USDC → Base ETH**: Relay 0.037484 ETH for 100 USDC.
- A Base/Solana meme buy would then be a second swap on that chain. Relay's "any token" support (`tokenSupport: "All"` on its Arc entry) suggests one-step crosschain buys are possible [INFERENCE; not tested for a meme token].

Scope implications [INFERENCE]:
- Trading off-Arc makes the agent a general multichain trading bot. It needs a Solana wallet (App Kit supports Solana adapters) and risk tooling per chain. It also dilutes the "Arc agent" story for the Arc-focused hackathon.
- Recommended scope for the demo: Arc-native FX (USDC↔EURC), cirBTC/WETH, and **opt-in** Arc meme tokens behind risk checks (GoPlus supports Arc, see `tx-safety-services.md`). Crosschain meme buys can be a stretch goal via Relay.
- Memecoins are highly speculative. Most Arc meme pools hold <$10k reserves, so slippage caps and a warning card are mandatory [INFERENCE].

## Gaps
- No verified Pump.fun or Doppler contracts on Arc [UNKNOWN].
- GeckoTerminal's sorted/`include=dex` and `new_pools` calls hit a 429 rate limit. Only the default pool list was saved.
- Token metadata quality: LI.FI marks the Arc USDC entry `verificationStatus: "unverified"`, so token-verification flags on Arc are immature [VERIFIED].
