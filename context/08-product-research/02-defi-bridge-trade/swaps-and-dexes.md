# Swaps and DEXes on Arc

Purpose: what App Kit Swap actually routes through, which DEXes are deployed on Arc (with addresses and code checks), and which swap aggregator APIs an agent can call for Arc.

Sources (`E/` = `.firecrawl/product/02-defi/`):
- Circle swap service (what App Kit Swap calls): `GET https://api.circle.com/v1/stablecoinKits/quote` (keyless) → `E/circle-swap-quote-*.json`. Endpoint and base URL were found in `@circle-fin/app-kit@1.15.3` `swap.mjs:12546, 13398-13425`.
- Swap fee docs: https://docs.arc.io/app-kit/concepts/swap-fees (`.firecrawl/docs/arc-llms-full.txt:1010-1060`)
- KyberSwap: `GET https://aggregator-api.kyberswap.com/arc/api/v1/routes` → `E/kyberswap-route-arc-*.json`
- LI.FI same-chain quotes → `E/lifi-quote-arc-usdc-*.json`; tools → `E/lifi-tools-arc*.json`
- Uniswap sdk-core `ARC_ADDRESSES` (https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts#L527) → `E/uniswap-sdk-core-addresses.ts`; UniswapX playbook https://github.com/Uniswap/UniswapX/blob/main/playbook/chains/arc.md → `E/uniswapx-playbook-arc.md`
- 0x: https://docs.0x.org/docs/introduction/supported-chains.md → `E/0x-supported-chains.md`; 0x-settler `chain_config.json` → `E/0x-settler-chain_config.json`
- DefiLlama `https://api.llama.fi/protocols` and `/v2/chains` → `E/defillama-*.json`; GeckoTerminal `/networks/arc/dexes` and `/pools` → `E/geckoterminal-arc-*.json`
- Lunya: https://www.lunya.io/, https://github.com/KyberNetwork/kyberswap-dex-lib/pull/1676 [REPORTED]
- Aero: https://www.theblock.co/post/378634/aerodrome-upgrades-evm-extensions-circles-arc-metadex [REPORTED]
- 1inch: https://1inch.com/blog/post/1inch-lands-on-arc [REPORTED]
- Code checks: `E/onchain-checks-2026-09-29.txt`

Verified: 2026-09-29

## 1. What App Kit Swap routes through

- `kit.swap` / `kit.estimateSwap` call Circle's "Stablecoin Service" at `https://api.circle.com/v1/stablecoinKits/quote` (plus `/swap`, `/swap/status`, `/rates`) (`app-kit swap.mjs:12546`, `:13398`) [VERIFIED].
- A keyless quote for 100 USDC → EURC on Arc mainnet returned `"route":{"provider":"lifi","steps":[{"type":"swap","tool":"fly","toolName":"Fly",...}]}`, with `estimatedAmount 87.961648 EURC`, `minAmount 85.322798` (default 300 bps slippage), `gasCostUSD 0.0031`, and `"fees":[]` (`E/circle-swap-quote-arc-usdc-eurc-100.json`) [VERIFIED].
  - **So App Kit Swap is LI.FI underneath**, and on Arc LI.FI picks the "Fly" DEX aggregator. The docs describe the provider only as "third-party liquidity service" with a 2 bps provider fee (`arc-llms-full.txt:1010-1060`) [VERIFIED].
  - The Circle quote did **not** carry LI.FI's 0.25% fee. The same pair via `li.quest` directly returned 87.741744 EURC with a `"LIFI Fixed Fee" 0.2501 USD` (`E/lifi-quote-arc-usdc-eurc-100.json`). **App Kit Swap was ~0.25% better than calling LI.FI directly** [VERIFIED, one sample].
- Testnet: 100 USDC → **82.257098 EURC** on Arc Testnet (same LI.FI/Fly route), about 6.5% worse than mainnet, so testnet liquidity is thin (`E/circle-swap-quote-arctestnet-usdc-eurc-100.json`) [VERIFIED].
- The service API also quoted a meme token: 10 USDC → 529.11 ARGUS on mainnet (`E/circle-swap-quote-arc-usdc-argus-10.json`). The docs say Arc Swap accepts USDC, EURC, and cirBTC (`app-kit.md`). No explicit token allowlist appears in the `swap.mjs` zod schema (`serviceSwapParamsSchema`, `:12299`). Whether `kit.swap` would execute an arbitrary Arc token was **not tested** [UNKNOWN].
- Crosschain Base USDC → Arc EURC returned `{"code":331001,"message":"No route available"}` (`E/circle-swap-quote-base-usdc-to-arc-eurc-100.json`) [VERIFIED].
- Fees: a 2 bps provider fee on every swap, plus an optional custom fee split 90% to you and 10% to Arc [VERIFIED docs].

Sanity check: Chainlink EURC/USD on Arc read 1.13722 (`E/onchain-checks-2026-09-29.txt`), so 100 USDC ≈ 87.93 EURC at the oracle. The App Kit quote (87.96) and KyberSwap (87.96) are both within ~0.05% of it [VERIFIED].

## 2. DEXes deployed on Arc mainnet

TVL is from DefiLlama `api.llama.fi/protocols`, `chainTvls.Arc` (`E/defillama-protocols.json`). Arc chain TVL is **$526.7M** (`E/defillama-chains.json`) [VERIFIED].

| DEX | Evidence of deployment | Key addresses (code bytes, mainnet / testnet) | Arc TVL (DefiLlama) |
|---|---|---|---|
| **Uniswap v3** | sdk-core `ARC_ADDRESSES`; TOLLY/USDC pool `factory()` = v3 factory | Factory `0xf0db7b58379503491d857db50ac9ece64c653918` (24,535 / 0); SwapRouter02 `0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77` (24,497 / 0); QuoterV2 `0x7dfd4f31be6814d2906bde155c3e1b146eac1468` (8,273 / 0) | $38.0M |
| **Uniswap v4** | sdk-core; KyberSwap routes CRCL and ARGUS through `uniswap-v4`; GoPlus lists v4 pools | PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951` (24,009 / **24,009**); V4Quoter `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` (6,118 / 6,118); PositionManager `0x6049c9a0e26405c0985f9e3685c87d0ae917f82b` (23,877 / 23,877) | $6.0M |
| Uniswap v2 | GeckoTerminal dex `uniswap-v2-arc`; DefiLlama "Uniswap V2" | [UNKNOWN] factory address | $0.6M |
| **Aero** (Aerodrome Slipstream / "Aero Lite") | KyberSwap `exchange: "aero-cl"` for the USDC/EURC and USDC/WETH pools; pool `factory()` → `0xb89Df768aF2CFE637ceB352c587Fe8edAf491d03` | CL factory `0xb89D…1d03` (9,492 / 0) | $2.78M + $2.78M |
| **Lunya** (Uni v3 core port + launchpad) | KyberSwap `exchange: "lunya"` for cirBTC and WETH; pool factory `0x711492DF23F320745de6fD7f0ab9564FDBfeA016` | Factory (8,099 / **8,099**) | $15k |
| Curve | GeckoTerminal dex `curve-arc` | [UNKNOWN] | not in top list |
| SushiSwap v2/v3, Synthra V3, Archery V3, DyorSwap, Arctide, Unitflow | GeckoTerminal dex IDs and/or DefiLlama | [UNKNOWN] | Archery $0.69M, Synthra $83k, DyorSwap $85k, Arctide $70k |
| UniswapX (Dutch orders) | Playbook: "Contracts deployed 2026-06-12", `V3DutchOrderReactor 0x0000000015134054eA82AE0bb9fda66b36402C36` | (17,206 / 0). Playbook says "SDK/service wiring (Phases 2–4) pending" | – |
| No "native Arc DEX" by Circle | Circle's FX venue is StableFX (RFQ, FxEscrow), not an AMM (`stablecoins-fx-and-yield.md`) | – | – |

Uniswap v4 PoolManager/Quoter/PositionManager and the Lunya factory also have code on **Arc Testnet** at the same addresses [VERIFIED code]. Whether they hold liquid testnet pools is [UNKNOWN]: LI.FI on testnet only offers `fly` and `lifiIntentsDex` (`E/lifi-tools-arct.json`).

Largest pool by 24h volume in GeckoTerminal's default list: **cirBTC/USDC 0.01% on uniswap-v3-arc, $4.63M volume, $11.45M reserve**. EURC/USDC 0.05% on uniswap-v3-arc showed $17.5k volume and $30.9k reserve (`E/geckoterminal-arc-pools.json`) [VERIFIED].

KyberSwap routing observed (`E/kyberswap-route-arc-usdc-*.json`):
- USDC→EURC via `aero-cl` pool `0xbe080ac37ad1305dfcc9521f5e6f68cfdc41b7fa` (poolType uniswapv3)
- USDC→cirBTC via `lunya` `0xf098…1746`
- USDC→WETH via `lunya` then `aero-cl`
- USDC→ARGUS via `lunya` then `uniswap-v4`
- USDC→CRCL via `uniswap-v4`
- USDC→TOLLY via `uniswap-v3` `0x162d…6a72`

## 3. Swap aggregator APIs and Arc

| Aggregator | Arc mainnet | Arc testnet | Agent access | Evidence |
|---|---|---|---|---|
| **Circle App Kit Swap** (LI.FI underneath) | Yes | Yes | Keyless quotes work; API key optional (shared rate limit without it) | [VERIFIED] |
| **LI.FI** | Yes: exchanges `kyberswap, fly, nordstern, lifiIntentsDex` | Yes: `fly, lifiIntentsDex` | Keyless; 0.25% default fee | [VERIFIED] |
| **KyberSwap** | Yes, `/arc/api/v1/routes` returns routes | [UNKNOWN] | Keyless (sent `x-client-id`); route summary includes `gasUsd`, `amountOutUsd`, per-hop `exchange` | [VERIFIED] |
| **0x Swap API** | Listed: "Arc 5042 ✅ Swap API ✅ Gasless API" | – | Needs an API key (`/swap/chains` → "No API key found") | [VERIFIED docs]. Settler AllowanceHolder `0x0000000000001fF3684f28c67538d4D072C22734` has code. |
| **1inch** | "Arc will be available immediately through the 1inch APIs" (blog, 2026-09-16) | – | Needs a 1inch API key (not tested) | [REPORTED] |
| **Fly** | Used by LI.FI and Circle on Arc | Used on testnet | No direct API checked | [VERIFIED indirectly] |
| **ParaSwap / Velora** | **No.** `network=5042` → "Invalid network. Supported chains: 1, 10, 56, 100, 130, 137, 146, 4663, 8453, 42161, 43114" | No | – | [VERIFIED] `E/paraswap-price-arc.json` |
| **Odos** | [UNKNOWN] (`/info/chains` returned Cloudflare "error code: 1033") | – | – | `E/odos-chains.json` |
| **OpenOcean** | [UNKNOWN] (Cloudflare challenge page) | – | – | `E/openocean-quote-arc*.json` |

The Arc launch blog names these trading partners: "Aero and Uniswap … 0x, 1inch, Alph, Aster, Bankr, Curve, Definitive, Doppler, edgeX, Extended, fomo, Hibachi, KyberSwap, LI.FI, o1.Exchange, Merkl, OpenSea, pools.trade, Pump.fun, RhinoFi, Robinhood, and Swapper" (https://www.arc.io/blog/arc-economic-os-internet) [REPORTED].

## 4. Price comparison, 100 USDC → EURC (Arc mainnet)

| Source | EURC out | Notes |
|---|---|---|
| KyberSwap direct | 87.962708 | gas $0.0066, via aero-cl |
| Circle App Kit (LI.FI → Fly) | 87.961648 | fees `[]`; docs say 2 bps provider fee |
| LI.FI direct | 87.741744 | includes 0.25% LI.FI fee |

## Gaps
- Uniswap v2, Curve, and Sushi addresses on Arc were not collected [UNKNOWN].
- No swap was executed on either network. Execution, slippage, and approval flows are untested here. The prior project `arc-agent` did execute App Kit USDC↔EURC swaps on testnet (`context/07-prior-work/README.md:24`).
- The 1inch and 0x Arc APIs were not exercised (keys needed).
