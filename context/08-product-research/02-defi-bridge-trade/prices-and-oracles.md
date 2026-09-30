# Price and market data for the agent

Purpose: which on-chain oracles and off-chain price APIs give the agent prices on Arc, with live-read addresses.

Sources (`E/` = `.firecrawl/product/02-defi/`):
- Chainlink feed addresses: `bgd-labs/aave-address-book` `src/ts/ChainlinkArc.ts` → `E/aave-address-book-ChainlinkArc.ts`. Values read live with `cast call` → `E/onchain-checks-2026-09-29.txt`.
- RedStone relayer manifest: `redstone-finance/redstone-oracles-monorepo/packages/relayer-remote-config/main/relayer-manifests-multi-feed/arcMultiFeed.json` → `E/redstone-arcMultiFeed.json`
- Pyth: `pyth-network/pyth-crosschain` `contract_manager/src/store/{chains/EvmChains.json, contracts/EvmPriceFeedContracts.json}` → `E/pyth-*.json`; Hermes `hermes.pyth.network/v2/updates/price/latest` → `E/pyth-hermes-eurusd.json`
- Stork: https://docs.stork.network/resources/contract-addresses/evm (Arc section) → `E/stork-evm-addresses.html`
- Arc oracle docs: https://docs.arc.io/arc/tools/oracles (`.firecrawl/docs/arc-llms-full.txt:19290-19360`)
- CoinGecko `/api/v3/asset_platforms`, `/simple/token_price/arc` → `E/coingecko-*.json`; GeckoTerminal `/networks/arc/*`; DexScreener `/token-pairs/v1/arc/…`
- Circle swap service rates `GET https://api.circle.com/v1/stablecoinKits/rates` → `E/circle-swap-rates.json`
- LI.FI `/v1/tokens?chains=5042` (`priceUSD` field) → `E/lifi-tokens-arc.json`

Verified: 2026-09-29

## 1. On-chain oracles on Arc mainnet

Values were read on 2026-09-29 ~02:06 UTC. Code sizes come from `eth_getCode`.

| Oracle | Feed | Address | Live value (updatedAt UTC) | Testnet |
|---|---|---|---|---|
| **Chainlink** (SVR feeds, 8 dp) | USDC / USD | `0xBC88A5182848151AE1f7b4877021F828d8F4D735` | 0.99997920 (2026-09-28 15:21) | no code |
| | EUR / USD | `0xa4266689D107aF71c7dBE975cfB92aB40E7b4EFE` | 1.13739000 (2026-09-28 16:51) | no code |
| | EURC / USD | `0x71B0305ACA6A29d6485f9e4ac5a333af5Df2b62c` | 1.13722369 (2026-09-28 16:53) | no code |
| | BTC / USD | `0x7777547914e03BCbB04Ae034942765a0dbb26aE3` | 82,832.46 (2026-09-29 01:19) | no code |
| | ETH / USD | `0x2c7Dc3567b3490f53A8d32625d766834dd023F60` | 2,657.53 (2026-09-29 01:32) | no code |
| **RedStone** (push, adapter `0xe1df239Ac22E8a873B2a4dF975C8dfc3249350e4`) | USDC | `0xBC00346ef584737ED7E56ae72C0004080e9F2977` | 0.99981492 | no code |
| | BTC | `0xf5528a63c0d6E5F23Fe8A4f0Dac2Ae7A04174753` | 83,000.10 | no code |
| | EUROC (EURC) | `0x7C687d7Cf9d2899326d868Fdd33D75F270525d4c` | 1.13733062 | no code |
| **Pyth** (pull) | contract | mainnet `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`, testnet `0x2880aB155794e7179c9eE2e38200202908C17B43` | Mainnet `getPriceUnsafe(ETH/USD)` reverts `0x14aebe68` (PriceFeedNotFound), so nobody has pushed that feed yet. Testnet returns ETH/USD 2,450.00 last updated 2026-08-26, which is stale. | code on both |
| **Stork** (pull) | contract | `0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62` (listed for mainnet and testnet) | not read. Prior work notes a 3600 s staleness window (`context/07-prior-work/arc-agent-lessons.md:25`) | code on both |
| Chronicle | – | [UNKNOWN] (listed in Arc docs; no addresses fetched) | – | – |

Notes:
- The Chainlink and RedStone feeds also back Aave V4 on Arc: `MAIN_SPOKE_EURC_PRICE_FEED` = `0x3b38…3914`, and the BTC and ETH spoke feeds equal the Chainlink addresses above (`E/aave-address-book-AaveV4Arc.ts`) [VERIFIED].
- **Heartbeat is slow for FX.** USDC/EUR/EURC updated ~9–11 h before the read, so they update on deviation, not on a clock. The agent must check `updatedAt` and treat stale data as a sanity bound only [VERIFIED values; INFERENCE on policy].
- **Testnet has no Chainlink or RedStone feeds** at these addresses. For testnet price checks use Pyth or Stork (pull) or off-chain APIs [VERIFIED].
- Pyth's off-chain Hermes endpoint `https://hermes.pyth.network/v2/updates/price/latest?ids[]=…` returned `unauthorized` today, so pulling Pyth updates may now require an API key or a different host [VERIFIED response; cause UNKNOWN].

## 2. Off-chain price APIs

| API | Arc support | Notes |
|---|---|---|
| **CoinGecko** | Yes: asset platform `{"id":"arc","chain_identifier":5042,"native_coin_id":"usd-coin"}` | Keyless `simple/token_price/arc` works but is limited to **1 contract per call** without a plan (error 10012). cirBTC → $82,996 [VERIFIED] |
| **GeckoTerminal** | Yes: network `arc`, pools and DEX list | Keyless, rate-limited (429 after a few calls) [VERIFIED] |
| **DexScreener** | Yes: chainId `arc` | Keyless pairs, volume, liquidity, and txn counts [VERIFIED] |
| **LI.FI tokens** | Yes: `priceUSD` per Arc token | Keyless; 41 mainnet tokens [VERIFIED] |
| **Circle `/v1/stablecoinKits/rates`** | Yes: keys `Arc` (82 tokens) and `Arc_Testnet` (2) | Keyless; used by `kit.getTokenRates()` [VERIFIED] |
| **Morpho / Circle Earn APIs** | Vault APYs (see `yield.md`) | Keyless [VERIFIED] |
| CoinMarketCap, DefiLlama, Dune, Allium | Named Arc launch partners (arc.io blog) [REPORTED]; DefiLlama `/v2/chains` has Arc with TVL $526.7M [VERIFIED] | – |

## 3. Recommended pricing stack [INFERENCE]

1. **Quote-time price:** the quote itself (App Kit `estimateSwap`, bridge quotes).
2. **Sanity bound:** Chainlink on mainnet for USDC/EUR/EURC/BTC/ETH. Reject the quote if it deviates more than X% from the oracle and `updatedAt` is recent enough. On testnet, use CoinGecko or LI.FI prices.
3. **Meme tokens:** there are no oracles, so use DexScreener or GeckoTerminal for price, liquidity, and volume, plus GoPlus risk data (`tx-safety-services.md`).
4. **Portfolio valuation:** Circle rates or LI.FI `priceUSD` (single call for all Arc tokens).
