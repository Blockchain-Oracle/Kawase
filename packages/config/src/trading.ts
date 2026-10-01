// Swaps (Stage 6). Gas numbers come from the first one-transaction swap on Arc testnet (approve + swap batched
// through the wallet's EIP-7702 code, 2026-10-01): 551,419 gas used; App Kit's own gasLimit hint was 630,000.

/** Gas for an approve + swap batch when an estimate is not possible yet (the calls are only built at approval). */
export const SWAP_BATCH_GAS_ESTIMATE = 700_000n;
/** A swap quote older than this is fetched again before it is shown as current. */
export const SWAP_QUOTE_TTL_S = 30;
/** Who quotes and routes swaps today (shown on the confirm card). */
export const SWAP_PROVIDER_LABEL = "Circle App Kit";

/**
 * The swap route is built with the slippage floor divided by this the person was shown ("at least X"). The other
 * half absorbs the price moving between the quote and the signature, so a small tick does not force a new version;
 * a bigger move does, because the calls' own minimum then falls below what was shown.
 */
export const SWAP_ROUTE_SLIPPAGE_DIVISOR = 2;
