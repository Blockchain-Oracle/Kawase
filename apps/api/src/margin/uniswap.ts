// The swap legs of a protective close (take-profit / stop-loss), through Uniswap v3 on Arc: SwapRouter02's
// `exactInputSingle` takes a static struct, so the grants the person signed pin its tokens, fee tier and recipient (no
// caveat can pin KyberSwap's, which sits in a dynamic struct). Before the grants exist, QuoterV2 is asked for every
// fee tier with a pool and the best is taken (that is the tier the grants then pin); a close under the grants quotes
// only their tier. The minimum is the quote less the protection's slippage.
import { encodeFunctionData, erc20Abi, parseAbi, type Address, type PublicClient } from "viem";

import { MARGIN_PROTECTION } from "@kawase/config";

import type { Swapper } from "./plan";

const BPS = 10_000n;
const ZERO = 0n;
const NO_PRICE_LIMIT = 0n;

const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const quoterAbi = parseAbi(["function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"]);
const routerAbi = parseAbi(["function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"]);

export class NoUniswapRoute extends Error {
  constructor(readonly tokenIn: Address, readonly tokenOut: Address) {
    super(`no Uniswap v3 pool can swap ${tokenIn} for ${tokenOut} now`);
    this.name = "NoUniswapRoute";
  }
}

/** The best fee tier's quote for exactly `amountIn` (only `fee`'s, when the grants pin one). */
export async function uniswapQuote(client: PublicClient, tokenIn: Address, tokenOut: Address, amountIn: bigint, fee?: number): Promise<{ fee: number; amountOut: bigint }> {
  const { factory, quoter } = MARGIN_PROTECTION.uniswap;
  const candidates: readonly number[] = fee === undefined ? MARGIN_PROTECTION.feeTiers : [fee];
  const tiers = await Promise.all(
    candidates.map(async (tier) => {
      const pool = await client.readContract({ address: factory, abi: factoryAbi, functionName: "getPool", args: [tokenIn, tokenOut, tier] }).catch(() => undefined);
      if (!pool || BigInt(pool) === ZERO) return undefined;
      const quoted = await client
        .simulateContract({ address: quoter, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn, fee: tier, sqrtPriceLimitX96: NO_PRICE_LIMIT }] })
        .catch(() => undefined);
      return quoted ? { fee: tier, amountOut: quoted.result[0] } : undefined;
    }),
  );
  const best = tiers.flatMap((tier) => (tier ? [{ fee: tier.fee as number, amountOut: tier.amountOut }] : [])).sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1))[0];
  if (!best || best.amountOut === ZERO) throw new NoUniswapRoute(tokenIn, tokenOut);
  return best;
}

export function uniswapSwapper(input: { client: PublicClient; wallet: Address; slippageBps: number; mode: "quote" | "build"; fee?: number | undefined }): Swapper {
  const { router } = MARGIN_PROTECTION.uniswap;
  return async (tokenIn, tokenOut, amountIn) => {
    const best = await uniswapQuote(input.client, tokenIn, tokenOut, amountIn, input.fee);
    const minOut = (best.amountOut * (BPS - BigInt(input.slippageBps))) / BPS;
    const venues = ["uniswap-v3"];
    if (input.mode === "quote") return { amountOut: best.amountOut, minOut, calls: [], venues };
    const swap = encodeFunctionData({ abi: routerAbi, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee: best.fee, recipient: input.wallet, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: NO_PRICE_LIMIT }] });
    return {
      amountOut: best.amountOut,
      minOut,
      calls: [
        { to: tokenIn, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, amountIn] }), value: ZERO },
        { to: router, data: swap, value: ZERO },
      ],
      venues,
    };
  };
}
