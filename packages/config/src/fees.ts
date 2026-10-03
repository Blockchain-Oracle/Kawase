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

/**
 * The fee reserve ("~N actions left", plan §A.4 12): what one action costs is read from Arc's current gas price ×
 * a typical action's gas (a token transfer ≈ 65k; a 7702 batch ≈ 200k), with the same headroom as a send draft.
 * Arc's minimum is 20 gwei, so one transfer is ~0.0013 USDC at the floor [INFERENCE: computed, see fee-reserve.ts].
 */
export const ACTION_GAS = { transfer: 65_000n, batch: 200_000n } as const;
/** "Send max" keeps this many typical actions' fees in the wallet (when the wallet pays its own fees). */
export const FEE_RESERVE_ACTIONS = 10;
/** The reserve chip warns at this many actions left or fewer. */
export const FEE_RESERVE_LOW_ACTIONS = 3;
/** Gas-free sends through the EIP-3009 relayer (Kawase pays the fee) per person per day: a bound on what it can cost. */
export const RELAYED_SENDS_PER_DAY = 20;
