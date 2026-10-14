// The phone's own price (D38 guard, research 02-autonomy): a quote it fetches itself from KyberSwap's keyless
// aggregator API, never from Kawase's server, so a server that proposes a bad minimum cannot also vouch for it.
// Test tokens have no market: each is priced at its mainnet twin (the same rule the api uses for test money).
// KyberSwap answers browsers too (CORS allows `x-client-id` from any origin; checked 2026-10-14), so the web app
// prices the same way.
import { USDC_ERC20_DECIMALS } from "@kawase/money";
import { arcStablecoin, arcNetworkOf, priceSourceOf, vouchedToken } from "@kawase/wallet";
import type { Address } from "viem";

const KYBER_API = "https://aggregator-api.kyberswap.com";
/** KyberSwap's slug for Arc mainnet (its supported-chains list); it does not serve Arc testnet. */
const KYBER_SLUGS: Readonly<Record<number, string>> = { 5042: "arc" };
const CLIENT_ID = "kawase";
const QUOTE_TIMEOUT_MS = 5_000;
const TEN = 10n;
const NONE = 0n;

export type QuoteInput = { chainId: number; tokenIn: Address; tokenOut: Address; amountIn: bigint };
/** What `amountIn` of tokenIn buys in tokenOut's base units right now, or undefined when it cannot be priced. */
export type PhoneQuote = (input: QuoteInput) => Promise<bigint | undefined>;

/** KyberSwap's best route for exactly `amountIn`, priced on the token's market (mainnet twins for test money). */
export function kyberQuote(fetchImpl: typeof fetch = fetch, timeoutMs = QUOTE_TIMEOUT_MS): PhoneQuote {
  return async ({ chainId, tokenIn, tokenOut, amountIn }) => {
    const from = priceSourceOf(chainId, tokenIn);
    const to = priceSourceOf(chainId, tokenOut);
    if (!from || !to || from.chainId !== to.chainId || amountIn <= NONE) return undefined;
    const slug = KYBER_SLUGS[from.chainId];
    if (!slug) return undefined;
    const query = new URLSearchParams({ tokenIn: from.token, tokenOut: to.token, amountIn: amountIn.toString() });
    try {
      const response = await fetchImpl(`${KYBER_API}/${slug}/api/v1/routes?${query}`, { headers: { "x-client-id": CLIENT_ID }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { code?: number; data?: { routeSummary?: { amountOut?: unknown } } };
      const out = body.code === 0 ? body.data?.routeSummary?.amountOut : undefined;
      if (typeof out !== "string" || !/^\d+$/.test(out)) return undefined;
      const amount = BigInt(out);
      return amount > NONE ? amount : undefined;
    } catch {
      return undefined;
    }
  };
}

const rescale = (amount: bigint, from: number, to: number) => (from === to ? amount : from > to ? amount / TEN ** BigInt(from - to) : amount * TEN ** BigInt(to - from));

/**
 * A token amount in US dollars (6-decimal base units, like the budget), by the phone's own reckoning: a dollar
 * stablecoin Kawase vouches for is its own amount; anything else is what the phone's quote says it sells for in USDC.
 */
export async function usdValueOf(chainId: number, token: Address, amount: bigint, quote: PhoneQuote): Promise<bigint | undefined> {
  const known = vouchedToken(chainId, token);
  if (known?.kind === "dollar" && known.peg === "USD") return rescale(amount, known.decimals, USDC_ERC20_DECIMALS);
  const network = arcNetworkOf(chainId);
  const usdc = network ? arcStablecoin(network, "USDC") : undefined;
  if (!usdc) return undefined;
  return quote({ chainId, tokenIn: token, tokenOut: usdc, amountIn: amount });
}
