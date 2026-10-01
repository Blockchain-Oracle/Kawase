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

/** Gas for an approve + burn batch when an estimate is not possible yet (measured 180,015 on Arc testnet, 2026-10-01). */
export const BRIDGE_BATCH_GAS_ESTIMATE = 400_000n;
/** Who moves bridged USDC today (shown on the confirm card). */
export const BRIDGE_PROVIDER_LABEL = "Circle CCTP · App Kit";
/**
 * The fee cap a bridge shows and enforces is the route's quoted fee plus this much headroom: Circle's forwarder fee
 * drifts by a few millionths between quotes (0.054614 → 0.054639 USDC within an hour, 2026-10-01), which must not
 * turn every approval into a new version. What arrives is still the amount less the actual fee.
 */
export const BRIDGE_FEE_HEADROOM_PERCENT = 120n;

/** Gas for an approve + vault deposit or withdrawal batch when an estimate is not possible (measured 424,936 on Arc testnet). */
export const EARN_BATCH_GAS_ESTIMATE = 600_000n;
/** A deposit must return, and a withdrawal must pay, at least this share of the vault's own preview (App Kit builds at 99.5%). */
export const EARN_FLOOR_BPS = 9_900n;
/** A withdrawal may burn at most this share of the vault's preview in shares. */
export const EARN_SHARES_CEILING_BPS = 10_100n;
