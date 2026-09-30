# Yield on Arc

Purpose: where an agent can put idle USDC or EURC on Arc to earn yield, live rates, and what a consumer can do vs a business.

Sources (`E/` = `.firecrawl/product/02-defi/`):
- Circle Earn service (what `kit.earn.*` calls): `GET https://api.circle.com/v1/earnKit/vaults/explore?chain=ARC|ARC-TESTNET[&asset=EURC]` (keyless) → `E/circle-earn-vaults-*.json`. Endpoint, base URL, and chain codes are in `@circle-fin/app-kit@1.15.3` `earn.mjs:14553-14572, 17814-17850`.
- Earn fee docs: https://docs.arc.io/app-kit/concepts/earn-fees (`.firecrawl/docs/arc-llms-full.txt:905-1009`)
- Morpho API `https://api.morpho.org/graphql` (chains, vaultV2s, markets, morphoBlues) → `E/morpho-api-*.json`
- Aave address book `bgd-labs/aave-address-book` `src/ts/AaveV4Arc.ts` → `E/aave-address-book-AaveV4Arc.ts`; Aave v3 API `api.v3.aave.com/graphql` chains → `E/aave-api-chains.json`
- DefiLlama protocols → `E/defillama-protocols.json`; DefiLlama yields `yields.llama.fi/pools` (no Arc pools; `E/defillama-yields-arc.json` is `[]`)
- Arc launch blog partner list: https://www.arc.io/blog/arc-economic-os-internet
- Existing library: `context/03-circle-platform/usyc.md`, `context/04-sample-apps/arc-defi-lend-borrow.md`, `context/01-arc/stablecoins-fx-and-yield.md`
- Code checks: `E/onchain-checks-2026-09-29.txt`

Verified: 2026-09-29

## 1. App Kit Earn = Morpho vaults on Arc

- `kit.earn.exploreVaults` calls `GET https://api.circle.com/v1/earnKit/vaults/explore` with `chain=ARC` or `ARC-TESTNET`, plus optional `protocol, asset, minApy, minTvl, sortBy, page, pageSize`. Defaults are "USDC asset, TVL sort, first page of 100" (`earn.mjs:17814-17820`). The keyless call worked [VERIFIED].
- Every vault returned is `"protocol":"MORPHO"` [VERIFIED]. Each vault includes `currentApy, nativeApy, apyProfile{d7,d30,d90,rewardShare,source:"morpho:avgNetApy"}, fee{performance,management}, totalDeposits, liquidity, status ("active"|"low_liquidity"), circleGuarded, manager{name,type:"curator"}, riskSignals{warnings,earnKitWarnings}`.
- Crosschain Earn deposits accept Ethereum, Arbitrum, and Base as sources (`earn.mjs`, `EARN_BRIDGE_SOURCE_CHAIN_TO_API`) [VERIFIED code].
- Fees (docs): Morpho performance fee 0–50% and management fee 0–5%/yr, both taken from returns. No same-chain deposit fee. Withdrawal fee "0, subject to change". Principal can fall "in extreme market conditions" [VERIFIED docs].

### Arc mainnet vaults (27 returned, 2026-09-29 01:52 UTC; `E/circle-earn-vaults-ARC.json`)

Top entries by the API's sort (APY), plus the large ones:

| Vault | Asset | Address | Current APY | Deposits | Available liquidity | Status | Curator |
|---|---|---|---|---|---|---|---|
| Bitwise Premium RWA USDC | USDC | `0x7610094b846657dcf166d59e42973db52c7015f9` | 5.05% (d7 6.10%) | $127k | $5.8k | low_liquidity | Bitwise |
| Dialectic RWA USDC | USDC | `0x6bdfe1165d5165808d02de05969c9a19e9b7cf30` | 0.80% | $14 | $13 | active | Dialectic Meccanico |
| Galaxy USDC | USDC | `0x8e357432cc12ff425c36432f312968aeb16112af` | 0.41% | **$84.8M** | $4.5M | low_liquidity, `circleGuarded: true` | Galaxy Curation |
| Keyrock Prime USDC | USDC | `0x5befab92a5a3d60f578cb51eeb4e4fd50a1e3123` | 0.41% | $75.0M | $4.5M | low_liquidity | Keyrock |
| Gauntlet USDC Prime | USDC | `0xdeccd53be5453215821184824b519e04c7e00bc7` | 0% | $94.8k | – | active | Gauntlet |
| Steakhouse Prime USDC | USDC | `0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298` | 0% | $88.9k | – | active | Steakhouse Financial |
| Galaxy EURC | EURC | `0x389abdf4355e0cf4f19298179991705a98f21c18` | 0.12% | $502k | $502k | active | Galaxy Curation |
| Gauntlet EURC Prime / Steakhouse Prime EURC | EURC | `0x0586…50B9` / `0xbeef00be…41D1` | 0% | ~$8.9k each | – | active | – |

The same mainnet list includes junk or test vaults named "Test", "Test 3", "Arc Test 2", "pjvk", "rwa USDC", and two unnamed vaults, each with $0–2 deposits [VERIFIED]. **The agent must filter**, for example by curator present, `minTvl`, and `status`, and must not show raw `sortBy: "apy"` results to users [INFERENCE].

Morpho's own API agrees on scale: Galaxy USDC `totalAssetsUsd` $84.80M with `avgNetApy` 0.325%, and Keyrock $75.0M with 0.325% (`E/morpho-api-vaultv2-arc.json`) [VERIFIED].

### Arc Testnet vaults (`E/circle-earn-vaults-ARC-TESTNET.json`)

| Vault | Address | APY | Deposits |
|---|---|---|---|
| EarnKit USDC Vault (Arc Testnet) | `0xaabbef1d3971c710276ed41ec791bbe14cdb8e88` | 4.2% (`nativeApy 0`, `rewardShare 1`) | 0 |
| MockMorphoVault (Arc Testnet) | `0x8f2d33b5d4b9b5f02df635ae308f7b4c9da8d2dc` | 3.5% | 0 |

Testnet has USDC only and mock yields. It is fine for a demo flow but not a real rate [VERIFIED].

## 2. Lending markets on Arc mainnet

| Protocol | Evidence | Arc TVL (DefiLlama) | Rates fetched? |
|---|---|---|---|
| **Morpho Blue** | Morpho API `morphoBlues` → `0x34CD04070dD72b14E241112F6d83812Df5Af7fCD` (code 15,582 B mainnet; 0 testnet) | **$295.6M** | Yes (below) |
| **Aave V4** | Address book `AaveV4Arc.ts` (CHAIN_ID 5042): CORE_HUB `0x17288dfc86205301064577b98B02b81017e6F79C`, MAIN_SPOKE `0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d`, FOREX_SPOKE `0x4164EBCAF74670aa74C8D4F59de6157c0780F1bB` (all have code on mainnet, none on testnet). Assets: USDC, EURC, cirBTC, WETH. Tokenization spokes (the `waCore*` tokens LI.FI lists) e.g. USDC `0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83` | **$179.5M** | **No.** The Aave v3 API chain list has no 5042, and no v4 API was found [UNKNOWN] |
| Circle sample `arc-defi-lend-borrow` | Testnet-only demo contract with mock USDC, no oracle, interest, or liquidation (`context/04-sample-apps/arc-defi-lend-borrow.md`) | – | – |

Morpho markets on Arc (top by supply; `E/morpho-api-markets-arc.json`) [VERIFIED]:

| Loan / collateral | Supply USD | Supply APY | Borrow APY |
|---|---|---|---|
| USDC / cirBTC | $184.8M | 0.41% | 0.42% |
| EURC / cirBTC | $1.20M | 0.30% | 0.43% |
| USDC / sUSDai | $86.6k | 5.64% | 6.24% |
| USDC / PST | $41.5k | 5.30% | 5.90% |

Other yield-adjacent Arc protocols in DefiLlama: vfat.io ($154k) and DexFi Aggregator ($15k) (yield aggregators), plus Uniswap/Aero LP positions [VERIFIED listing only].

## 3. USYC (tokenized T-bill fund)

Unchanged from `context/03-circle-platform/usyc.md` [VERIFIED there]: non-US persons only, institutional KYC, **$100,000 minimum**, and address allowlisting in `Entitlements` (mainnet `0xb69e…a5ca72`). Mint and redeem through the Teller (mainnet `0x51A8…0f9b`). Testnet allowlisting takes a Circle Support ticket (24–48 h). Yield ≈ overnight fed funds.

## 4. Consumer vs business

| Action | Consumer (retail user of the agent) | Business / treasury |
|---|---|---|
| App Kit Earn (Morpho vaults) | Yes. Permissionless and non-custodial; the user signs `deposit` and holds vault shares [VERIFIED docs] | Yes |
| Morpho / Aave V4 direct supply | Yes (permissionless contracts) [INFERENCE from open deployments; no ToS checked] | Yes |
| USYC | **No** (non-US institutions, $100k min, allowlist) | Only if eligible and onboarded |
| StableFX (FX, not yield) | No (enterprise RFQ via Circle) | Via Circle onboarding |

## 5. Reality check on rates [VERIFIED numbers, INFERENCE conclusion]

- The large vaults pay ~0.3–0.4% APY on USDC (Galaxy, Keyrock, and the $184.8M USDC/cirBTC Morpho market). The ~5% options hold only $40k–$130k with thin available liquidity and are flagged `low_liquidity`.
- The agent should present yield as "~0.4% on size, up to ~5% in small curated vaults with liquidity caveats", not a headline 5%.

## Gaps
- Aave V4 supply and borrow rates on Arc [UNKNOWN]. The next step is to read the Hub/Spoke contracts or find an Aave v4 API.
- Vault risk semantics of `circleGuarded` and `riskSignals.circleSentinel` are undocumented in what was fetched [UNKNOWN].
- No deposit or withdraw was executed.
