/** Arc silently drops transactions with maxFeePerGas below 20 gwei (context/01-arc/gotchas.md). */
export const MIN_MAX_FEE_PER_GAS_GWEI = 20n;

/**
 * USDC kept aside for network fees when the wallet pays them itself (a send above the allowance, any EURC send).
 * An ERC-20 transfer on Arc costs about 0.01 USDC at today's base fee; this covers a few [INFERENCE, checked
 * against `eth_estimateGas` × `maxFeePerGas` on testnet when Stage 5 was built].
 */
export const GAS_FLOAT_USDC_BASE_UNITS = 50_000n;
/** Head-room on a gas estimate, in percent, so a small change between draft and signature does not fail. */
export const GAS_ESTIMATE_HEADROOM_PERCENT = 130n;
/** A draft's fee cap is this many times the fee at drafting time; a fresher fee above it means a new draft. */
export const MAX_FEE_DRAFT_MULTIPLIER = 3n;
