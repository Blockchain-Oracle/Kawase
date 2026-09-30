# DeFi on Arc: bridge, trade, earn (capability matrix)

Purpose: a one-page answer to "what can an Arc agent actually swap, bridge, earn, and trade today, on mainnet vs testnet, and through which API", with pointers to the evidence.

Sources: the files in this folder, and raw API/RPC responses under `.firecrawl/product/02-defi/` (124 files, including `onchain-checks-2026-09-29.txt`), all fetched 2026-09-29. Rules: `../RESEARCH-RULES.md`.

Verified: 2026-09-29

## Files
- [bridges-and-aggregators.md](bridges-and-aggregators.md): 15 bridges/aggregators checked, live Base↔Arc fee comparison
- [swaps-and-dexes.md](swaps-and-dexes.md): App Kit Swap internals, DEX deployments, aggregator APIs
- [yield.md](yield.md): Earn vaults (Morpho), Morpho and Aave V4 markets, USYC, consumer vs business
- [tokens-meme-trading.md](tokens-meme-trading.md): live meme and launchpad activity on Arc, token universe, crosschain reach
- [prices-and-oracles.md](prices-and-oracles.md): Chainlink, RedStone, Pyth, and Stork on Arc; CoinGecko and others
- [tx-safety-services.md](tx-safety-services.md): Tenderly, Blockaid, GoPlus; gas specifics
- [cheapest-route-design.md](cheapest-route-design.md): [INFERENCE] comparison design

## Capability matrix

| Action | Mainnet (5042) | Testnet (5042002) | Via | Evidence |
|---|---|---|---|---|
| Bridge USDC in/out of Arc | Yes | Yes | App Kit Bridge = CCTP V2 (+CCTPx for EURC/WETH/cirBTC); $0 protocol fee both ways on Standard | Iris fee API `E/cctp-fees-*.json` [VERIFIED] |
| Unified crosschain USDC balance | Yes | Yes | Gateway (`gateway-api.circle.com/v1/info` lists Arc domain 26) | [VERIFIED] |
| Compare third-party bridges | Yes: Across, Relay, LI.FI, Socket, deBridge (keyless quotes) | Only LI.FI (intents) besides Circle | Direct APIs | [VERIFIED] |
| Bridge via LayerZero/Stargate, Squid, 0x, 1inch | Chain supported (LZ, 0x docs), but quotes need keys | – | – | [VERIFIED listing] / [UNKNOWN price] |
| Wormhole, Hyperlane, CCIP messaging | Yes (contracts have code) | Wormhole token bridge, CCIP yes; Hyperlane no | SDK / on-chain | [VERIFIED] |
| Axelar | **No** | No | – | [VERIFIED absent] |
| Swap USDC↔EURC, cirBTC, WETH | Yes | Yes (USDC/EURC; poor rate: 100 USDC → 82.26 EURC) | App Kit Swap (LI.FI → Fly underneath), KyberSwap, LI.FI | [VERIFIED] |
| DEXes | Uniswap v3/v4/v2, Aero (Slipstream), Lunya, Curve, Sushi, Synthra, Archery, … | Uniswap v4 and Lunya contracts have code; liquidity [UNKNOWN] | – | [VERIFIED code/listing] |
| Swap aggregators | App Kit, LI.FI, KyberSwap (keyless); 0x (key); 1inch [REPORTED] | App Kit, LI.FI | – | ParaSwap/Velora: **no** [VERIFIED] |
| Earn yield (consumer) | Yes: App Kit Earn = 27 Morpho vaults; large ones ~0.3–0.4% APY, small ones up to ~5% | Yes: 2 mock vaults (4.2%, 3.5%) | `api.circle.com/v1/earnKit/vaults/explore` (keyless) | [VERIFIED] |
| Lend / borrow | Morpho Blue ($295.6M Arc TVL), Aave V4 ($179.5M) | Circle sample only (mock) | Direct contracts | [VERIFIED]; Aave rates [UNKNOWN] |
| USYC (T-bills) | Businesses only: non-US, $100k min, allowlist | Allowlist ticket | Teller | [VERIFIED in `usyc.md`] |
| Meme / launchpad trading | **Yes, live**: Argus, Tolly, LIFT, NOXA, Foci, Lunya launchpads; memecoin pools with up to ~$1M/day volume | **No** (LI.FI lists only USDC/EURC) | KyberSwap, LI.FI, Uniswap v4 | [VERIFIED] |
| Crosschain to meme chains (Base, Solana) | Yes, Relay/LI.FI quote Arc USDC → Solana USDC / Base ETH | No | Relay, LI.FI | [VERIFIED quotes] |
| On-chain prices | Chainlink (USDC, EUR, EURC, BTC, ETH), RedStone; Pyth/Stork pull | Pyth/Stork only | – | [VERIFIED reads] |
| Off-chain prices | CoinGecko (`arc`), GeckoTerminal, DexScreener, LI.FI, Circle rates | Circle rates / LI.FI | – | [VERIFIED] |
| Token / address risk | GoPlus (keyless), Blockaid (key) | GoPlus **not** supported | – | [VERIFIED] |
| Tx simulation | RPC `eth_call`; Tenderly lists Arc | Same | – | [VERIFIED listing] |

## Headline findings
1. **CCTP is the cheapest USDC bridge** in both directions. Across direct is the cheapest third party (~$0.013 per 100 USDC). Aggregators add their own fees: LI.FI 0.25%, Socket 20 bps [VERIFIED].
2. **App Kit Swap is LI.FI underneath** (route `provider: "lifi"`, tool `fly`). It came out ~0.25% better than calling LI.FI directly [VERIFIED].
3. **Arc mainnet already has a meme/launchpad scene.** Testnet has none, so meme features can only be demoed against mainnet [VERIFIED].
4. **Real yield is low on size:** ~0.4% USDC in the $75–85M vaults. The ~5% vaults are small and liquidity-constrained [VERIFIED].
5. **Testnet is thin.** Most third-party bridges, oracles, and risk APIs are mainnet-only [VERIFIED].

## Key unknowns
- Aave V4 rates on Arc; Tenderly and Blockaid runtime behaviour on Arc (keys needed).
- Pricing from Squid, LayerZero/Stargate, 0x, and 1inch (keys needed).
- Whether `kit.swap` executes arbitrary Arc tokens (the service quoted ARGUS; the docs say only USDC/EURC/cirBTC).
- Pump.fun or Doppler on Arc (only [REPORTED]).
- Pyth Hermes returned `unauthorized`; the pull-update path needs checking.
