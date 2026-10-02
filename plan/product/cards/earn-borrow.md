# Card: Earn and borrow

Purpose: the how-ladder for earning on any asset and borrowing against any accepted collateral, across Arc protocols. Rules: R1–R3, R5, R7.
Sources: the yield/bridge fact sheet (2026-10-02 live reads: the Morpho API `api.morpho.org/graphql`, the Merkl API, Arc RPC); `02-defi-bridge-trade/yield.md`; `packages/integrations/app-kit/src/earn.ts`.
Verified: 2026-10-02

## Live options on Arc mainnet (examples of the computed result, not a fixed list)
| Source | Assets | How | APY | Withdrawable now | Risk chip |
|---|---|---|---|---|---|
| Aave V4 Core Hub | USDC (EURC, cirBTC, WETH supply too) | **Main Spoke `0xB843…134d` `supply(reserveId, amount, onBehalfOf)` / `withdraw`**: reads confirmed live; `reserveId` comes from `getReserve(i)` over the 4 reserves. **Not the ERC-4626 wrapper `0x42EAB6…eB83`, which holds only ~4,040 USDC** (live read 10-02) | ~0.9% (USDC, calculated) | hub-level ~$76M | Blue-chip lending |
| Morpho V2 vault: Bitwise Premium RWA USDC `0x7610…15F9` | USDC | ERC-4626 | ~4.4% | ~$59k of $473k | RWA credit, small |
| Morpho V2 vault: Galaxy EURC `0x389a…1c18` | EURC | ERC-4626 | ~1.1% | ~$349k | Curated vault |
| Morpho V2 vaults: Galaxy/Keyrock USDC | USDC | ERC-4626 | ~0.8% | **$0 / $392**, so **hidden** (G1) | — |
| Morpho Blue markets (sUSDai, PST) | USDC | `supply` | ~5% | ~$20k each | Credit risk named (USD.ai, PST) |
| Aero LP + Merkl rewards | USDC-EURC, cirBTC-USDC, WETH-USDC | Aero position + Merkl claim | 27% / 61% / 55% APR (rewards) | pool TVL | **Advanced:** impermanent loss and range risk |
| Testnet | USDC | App Kit Earn mock vaults | mock | mock | TESTNET |

Data: the Morpho API (`vaultV2s`, `chainId_in:[5042]`: `netApy`, `liquidityUsd`); Aave V4 hub reads (`getAssetDrawnRate`, `getAddedAssets`, `getAssetTotalOwed`, `getAssetConfig`); `api.merkl.xyz/v4/opportunities?chainId=5042`.

## Earn
| Lens | Answer |
|---|---|
| Entry | Home "For you" (idle cash) · token page "Earn" · Earn screen · chat ("best yield for my USDC") · auto-save automation |
| Which | Any held asset that some source accepts; the **yield-options card** lists every source for it, ranked by APY among sources with enough **withdrawable liquidity** for the amount |
| How much | Amount or Max; a per-source cap warning when the vault is small (e.g. "this vault holds $473k; your $50k would be 10%") |
| How | Options card → choose (default = best liquid) → review (APY, withdrawable, fees, risk, protocol mark) → Face ID → one batch (approve + deposit) |
| How long | Seconds |
| What if | Liquidity drops later → withdraw shows "N available now" + queue/partial; the APY changes → shown live; the source is paused → read-only with the reason |
| After | Position on Home and the token page; Activity row; weekly yield in the report; alerts on APY drop or liquidity crunch |
| Consistency | The same position card for every source; the same asset picker |

## Withdraw from a position
Amount or All → available-now check → Face ID → receipt. Partial when liquidity is short, with the remainder offered as a reminder or automation.

## Borrow
| Lens | Answer |
|---|---|
| Entry | Token page "Borrow against" · Borrow screen · chat ("borrow 100 USDC against my cirBTC") |
| Which | Collateral: any held asset a market accepts (Aave V4: cirBTC, WETH; Morpho: cirBTC, sUSDai, PST…). Loan: USDC or EURC where available |
| Live options | Aave V4 Main Spoke: USDC ~2.1% (~$76M available), EURC ~0.05%. Morpho cirBTC → EURC ~2.7% ($10k). Morpho cirBTC → USDC effectively closed ($392) → hidden |
| How much | Collateral + loan amount with a **live health gauge**, max LTV, liquidation price |
| How | Review → Face ID → batch (supply collateral + set as collateral + borrow) |
| What if | Health falls → push at thresholds (e.g. 1.5, 1.2) with one-tap repay or add collateral; liquidation → explained in Activity |
| After | Borrow position (debt, health, rate) on Home; repay / add collateral actions |

## Acceptance (walk on a phone, mainnet small amounts)
- [ ] "Best yield for 20 USDC" → the card shows Aave V4 first (liquid), Bitwise as higher-yield, the stuck vaults absent → deposit → position on Home.
- [ ] Withdraw half from Aave → instant.
- [ ] Borrow 5 USDC against cirBTC on Aave V4 → the health gauge moves as you type → position shows health → repay all.
