# Arc gas and fees

Purpose: how gas works on Arc (paid in USDC), the exact fee parameters, how to set tx fields, how to show fees in dollars, and what the App Kit, CCTP, and Gateway fees are.

Sources:
- https://docs.arc.io/arc/references/gas-and-fees
- https://docs.arc.io/arc/concepts/stable-fee-design
- https://docs.arc.io/arc/references/evm-differences#fee-market-and-block-behavior
- https://docs.arc.io/integrate/wallets/fee-display
- https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer
- https://docs.arc.io/app-kit/concepts/bridge-fees, swap-fees, unified-balance-fees, earn-fees
- Circle docs (`.firecrawl/docs/circle-llms-full.txt`): CCTP fee tables, Gateway gas-fee table
- Live RPC on 2026-09-29: mainnet `eth_gasPrice` = 20 gwei (+1 wei), testnet = 25 gwei; `baseFeePerGas` = 20 gwei on both; `eth_maxPriorityFeePerGas` = 1 wei

Verified: 2026-09-29

## Parameters

| Parameter | Value |
|---|---|
| Gas unit | USDC, native, **18 decimals**. 1 gwei = 1e-9 USDC. |
| Model | EIP-1559, with the per-block base fee recalculation replaced by an **EWMA** of block utilization |
| Base fee target | ~$0.001 per ERC-20 transfer (design target) |
| **Minimum base fee** | **20 gwei**. `maxFeePerGas` below this is *silently dropped* by the mempool: no error receipt, never mined. Some RPCs return `transaction underpriced`. |
| Max base fee | 20,000 gwei (hard ceiling) |
| Capacity | 30M gas/block, ~60M gas/s at 0.5 s blocks |
| Base fee destination | **Not burned.** Base fee and tip both go to the block beneficiary. |
| Next block's base fee | Published in the parent header's `extraData` as 8-byte big-endian. Live: `0x00000004a817c800` = 20,000,000,000 wei = 20 gwei. |
| Priority fee | `0` is accepted and usually enough; use 1 gwei under load. `eth_maxPriorityFeePerGas` returns 1 wei. |

EWMA formula (conceptual):
```
utilization_ewma(n) = alpha * block_utilization(n) + (1 - alpha) * utilization_ewma(n-1)
base_fee(n) = adjust(base_fee(n-1), utilization_ewma(n-1), target) clamped to [20 gwei, 20000 gwei]
```

## What things cost (at the 20 gwei floor)

| Action | Gas | USDC cost |
|---|---|---|
| Native USDC send | 21,000 | 21,000 × 20e9 = 4.2e14 wei = **$0.00042** |
| ERC-20 `transfer` (~40–65k) | ~50,000 | ~**$0.001** |
| EIP-3009 `transferWithAuthorization` | ~65,000 (docs) | ~$0.0013 |
| Contract deploy (1M gas) | 1,000,000 | $0.02 |

The hackathon slides quote "~$0.01 per transaction". The docs target ~$0.001. Both are negligible for agent use.

## Setting transaction fields

```ts
// viem: explicitly floor fees (belt and braces; viem's estimator normally returns ≥ 20 gwei)
import { parseGwei } from "viem";
const fees = await publicClient.estimateFeesPerGas();
const floor = parseGwei("20");
const hash = await walletClient.sendTransaction({
  to, value,                                   // value is 18-decimal native USDC!
  maxFeePerGas: fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor,
  maxPriorityFeePerGas: 0n,
});
```

```ts
// ethers (from docs.arc.io gas-and-fees)
const tx = await wallet.sendTransaction({
  to: recipient,
  value: ethers.parseUnits("1", 18),      // 1 USDC native. NOTE: the docs' own example uses parseUnits("1", 6), which sends 1e-12 USDC. That is a docs bug; native value is 18-dec.
  maxFeePerGas: ethers.parseUnits("20", "gwei"),
});
```

- Use type-2 (EIP-1559) or type-4 (EIP-7702) transactions. **Type-3 blob txs are rejected.**
- Fee RPCs: `eth_gasPrice`, `eth_feeHistory`, `eth_maxPriorityFeePerGas`, `eth_estimateGas`. The docs say values "remain accurate for a reasonable submission window" because of smoothing.
- Circle Wallets (dev-controlled) transactions take `fee: { type: "level", config: { feeLevel: "MEDIUM" } }`, and Circle computes the gas.

## Recording and displaying fees in USDC

```ts
const gasCostWei = receipt.gasUsed * receipt.effectiveGasPrice; // 18-dec native USDC
const gasCostUsdc6 = gasCostWei / 10n ** 12n;                    // 6-dec ERC-20 units (truncates)
const display = formatUnits(gasCostWei, 18);                     // "0.00042" USDC
```
- Gas fees **do not emit Transfer events**. Derive them from receipts (`gasUsed × effectiveGasPrice`). Block rewards are attributed through `block.miner`.
- Show fees in dollars, not gwei ([fee-display](https://docs.arc.io/integrate/wallets/fee-display)).
- An agent ledger should book gas as an expense line using the receipt math above. Emitter-based transfer indexing will not catch it.

## Common errors

| Error | Cause | Fix |
|---|---|---|
| tx pending forever / `transaction underpriced` | `maxFeePerGas` < 20 gwei | Set ≥ 20 gwei |
| `intrinsic gas too low` | gasLimit < 21,000 | Estimate |
| `insufficient funds for gas * price + value` (pre-v0.8) / `OutOfFunds…` or `gas required exceeds allowance` (node v0.8.0+) | Not enough native USDC for value + gas | Fund with USDC. Remember value and gas draw from the **same** USDC balance. |
| Reverted receipt with gas consumed | Blocklist hit, zero-address value send, or send to a destructed account | See [gotchas.md](gotchas.md) |

## Who pays gas: options

| Option | Details |
|---|---|
| EOA holds USDC | Default. Each agent wallet needs a USDC float. |
| Circle Gas Station | Sponsors gas for Circle dev-controlled **SCA** wallets. The docs say it "automatically sponsors your transaction fees on Arc Testnet" ([deploy-contracts](https://docs.arc.io/arc/tutorials/deploy-contracts)). |
| EIP-3009 relayer | The user signs `transferWithAuthorization` and your relayer EOA pays gas. See [account-abstraction-relayers-paymasters.md](account-abstraction-relayers-paymasters.md). |
| ERC-4337 paymaster | EntryPoint v0.7 deposit denominated in **18-decimal** native USDC. Pimlico and Alchemy support Arc. |
| Circle Nanopayments / Gateway | Batched offchain x402 authorizations. The buyer pays no per-payment gas (Circle docs). |

## App Kit, CCTP, and Gateway fees (for money-movement agents)

| Product | Fee |
|---|---|
| App Kit **custom fee** (bridge, swap, unified-balance spend) | You set it. It is split **90% to your fee recipient, 10% to Arc**. It is added on top of a bridge but carved out of a swap or spend amount. |
| CCTP Standard transfer | 0 bps from every source (Arc included) |
| CCTP Fast transfer | Varies by source. Arc as a source is "N/A" (already fast). Bridging **from** Arc: the amount must exceed the CCTPv2 max fee (**~1.4 USDC** on testnet) or the burn reverts with `Max fee must be less than amount`. |
| CCTP Forwarding Service | Circle-set fee, deducted from the destination mint (or paid on source with `config.feePayment: "source"`) |
| **Swap** provider fee | **2 bps** (0.02%) of the post-custom-fee amount |
| **Gateway / Unified Balance** crosschain spend | **0.5 bps** (0.005%), and 0 if same-chain. Plus per-burn-intent source gas: **Arc $0.0035**, Arbitrum $0.01, Base $0.01, Avalanche $0.02, HyperEVM $0.05, OP $0.0015, Ethereum $1.00 (Circle Gateway docs). |
| Earn | Vault performance fee (Morpho 0–50%) and management fee (0–5%/yr), both from returns. 0 deposit fee same-chain. CCTP fees for crosschain deposits. 0 withdrawal fee (subject to change). |

Always pass human-readable decimal strings ("1.00") to App Kit. It converts to base units internally.
