// The swap legs of a margin batch, from KyberSwap (trade.md venues: keyless, EOA calldata, approve + router call in
// the same 7702 batch). While drafting only the quote is needed; while approving, the router calldata is built a
// little tighter than the quote (build re-prices the route) and checked before it is used: the router, exactly this
// amount in, the wallet as the only recipient, no fee, and an on-chain minimum at least the quoted one.
import { KyberSwapError, approveRouterCall, build, checkKyberSwap, quote, type KyberRoute } from "@kawase/integrations-kyberswap";
import type { Address } from "viem";

import type { Swapper } from "./plan";

export class SwapLegError extends Error {
  constructor(readonly reason: string) {
    super(`margin swap leg refused: ${reason}`);
    this.name = "SwapLegError";
  }
}

/** A batch needs several legs in a row; one slow answer should not lose the whole plan, so each call gets a second try. */
const ATTEMPTS = 2;
async function retried<T>(run: () => Promise<T>): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (error) {
      failure = error;
      if (error instanceof KyberSwapError && error.code === "no_route") break;
    }
  }
  throw failure;
}

export function kyberSwapper(input: { chainId: number; wallet: Address; slippageBps: number; buildSlippageBps: number; mode: "quote" | "build" }): Swapper {
  return async (tokenIn, tokenOut, amountIn) => {
    const route: KyberRoute = await retried(() => quote({ chainId: input.chainId, tokenIn, tokenOut, amountIn, sender: input.wallet, recipient: input.wallet, slippageBps: input.slippageBps }));
    if (input.mode === "quote") return { amountOut: route.amountOut, minOut: route.minOut, calls: [], venues: route.venues };
    const transaction = await retried(() => build(route, { slippageBps: input.buildSlippageBps }));
    const check = checkKyberSwap(transaction, { tokenIn, tokenOut, amountIn, recipient: input.wallet, minOut: route.minOut });
    if (!check.ok) throw new SwapLegError(check.reason);
    return {
      amountOut: transaction.amountOut,
      minOut: check.decoded.minReturnAmount,
      calls: [approveRouterCall(tokenIn, amountIn), { to: transaction.to, data: transaction.data, value: transaction.value }],
      venues: route.venues,
    };
  };
}
