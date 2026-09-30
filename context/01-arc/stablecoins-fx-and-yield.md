# Stablecoins, FX, and yield on Arc

Purpose: the assets and venues available to a treasury agent on Arc (USDC, EURC, USYC, cirBTC), how to convert between currencies (App Kit Swap, StableFX), and where to park idle cash (Earn, USYC).

Sources:
- https://docs.arc.io/arc/concepts/stablecoin-native-model
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/build/stablecoin-fx
- https://docs.arc.io/app-kit/swap, /app-kit/earn, /app-kit/concepts/swap-fees, /app-kit/concepts/earn-fees
- https://developers.circle.com/stablefx and https://developers.circle.com/tokenized/usyc/overview (details in the Circle section)

Verified: 2026-09-29

## Assets

| Asset | Mainnet | Testnet | dp | How to get it (testnet) |
|---|---|---|---|---|
| USDC | native + `0x3600…0000` | same | 18/6 | faucet.circle.com |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | faucet.circle.com (select EURC) or swap USDC→EURC |
| USYC | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | 6 | Allowlist via a Circle Support ticket (24–48h), then the Teller `0x9fdF…105A` or usyc.dev.hashnote.com |
| cirBTC | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | 8 | Swap or bridge |
| WETH (bridged) | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | `0x2c4047028a72803939b6fb674D01bC059B5C4961` | 18 | Bridge (CCTP expanded assets) |

USDC and EURC are native to Arc (deployed at genesis, moved crosschain only by CCTP burn/mint, never wrapped).

## FX options

| Option | Model | Use when |
|---|---|---|
| **App Kit Swap** (`kit.swap`, tokenIn `USDC`, tokenOut `EURC`) | Liquidity provider route. 2 bps provider fee plus an optional custom fee (90/10). Default slippage 300 bps. Supports `stopLimit`. | Agent needs EUR to pay an EU invoice. Works on Arc testnet and mainnet. Sample: `arc-stablecoin-fx`. |
| **StableFX** (Circle) | Enterprise RFQ with onchain settlement through **FxEscrow** (mainnet `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6`, testnet `0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10`). Requires a USDC allowance to **Permit2** `0x000000000022D473030F116dDEE9F6B43aC78BA3`. | Institutional size, firm quotes. Access is via Circle (see the Circle section). |
| Oracles (Pyth, Chainlink, RedStone, Stork, Chronicle) | EUR/USD reference price for sanity checks and forecasting | Validate the swap quote before executing. Let agents check the price first. |

```ts
const est = await kit.estimateSwap({ from: { adapter, chain: "Arc_Testnet" }, tokenIn: "USDC", tokenOut: "EURC", amountIn: "1000.00" });
if (Number(est.amountOut) / 1000 > minAcceptableRate) {
  await kit.swap({ from: { adapter, chain: "Arc_Testnet" }, tokenIn: "USDC", tokenOut: "EURC", amountIn: "1000.00",
                   config: { apiKey: process.env.CIRCLE_API_KEY, stopLimit: (1000 * minAcceptableRate).toFixed(2) } });
}
```

## Yield on idle treasury cash

| Option | Access | Notes |
|---|---|---|
| **App Kit Earn** | Anyone. USDC and EURC on Arc. | Non-custodial vault shares over lending protocols (Morpho named). Performance fee 0–50% and management fee 0–5%/yr come from returns. No same-chain deposit fee. Withdrawal fee 0 (subject to change). Principal can drop in extreme markets. Use `exploreVaults({ chain, sortBy: "apy" })`, `getDepositQuote`, `deposit`, `getPosition`, `withdraw`. |
| **USYC** | Allowlisted, non-US institutions, $100k minimum on mainnet | Tokenized T-bill money market fund. Mint and redeem vs USDC through the Teller. Hackathon slides pitch it as "the reserve that earns while it waits". Testnet access needs a support ticket, so plan ahead. |
| Launch DeFi (Aave, Morpho, Uniswap per press) | Permissionless | Not documented in Arc docs. Check each protocol for Arc addresses. |

## Treasury-agent pattern (how the pieces fit)

1. **See**: Unified Balance `getBalances` (crosschain USDC) plus `eth_getBalance` and `balanceOf` on Arc, and EURC `balanceOf`.
2. **Forecast and decide**: offchain LLM logic with oracle prices.
3. **Move**: `kit.unifiedBalance.spend` or `kit.bridge` to bring USDC onto Arc; `kit.swap` USDC→EURC for EUR payables.
4. **Pay**: Memo-wrapped transfers for reconciliation, or Multicall3From for batch payroll.
5. **Park**: `kit.earn.deposit` or USYC for surplus. Withdraw ahead of forecast payables.
6. **Prove**: log every tx hash, memoId, and App Kit `traceId`. Optionally record an ERC-8004 reputation or ERC-8183 job.
