// Where swap quotes and calls come from. In the api this is Circle App Kit (packages/integrations/app-kit); tests
// that never swap get `noSwaps`. The kit's API key is per environment and never leaves the server.
import type { Address, PublicClient } from "viem";

import type { ApiEnv } from "@kawase/env";
import { marketPrices, prepareSwap, quoteSwap, type SwapCall, type SwapQuote } from "@kawase/integrations-app-kit";
import type { NetworkContext } from "@kawase/networks";

export type SwapEngineInput = {
  network: NetworkContext;
  client: PublicClient;
  from: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Decimal amount of tokenIn. */
  amountIn: string;
};

export type SwapEngine = {
  quote(input: SwapEngineInput & { slippageBps: number; decimalsOut: number }): Promise<SwapQuote>;
  /** The exact calls, routed at this slippage; their own on-chain minimum is checked by the caller. */
  prepare(input: SwapEngineInput & { slippageBps: number }): Promise<SwapCall[]>;
  /** USD price per token address (lowercased), for the market-rate comparison. */
  prices(network: NetworkContext, tokens: readonly Address[]): Promise<Map<string, number>>;
  /** API keys for the keyed swap venues (Uniswap Trading API, 0x); they never leave the server. */
  venueKeys?: { uniswap?: string | undefined; zerox?: string | undefined };
};

export function appKitSwaps(env: ApiEnv): SwapEngine {
  // Mainnet works keyless (App Kit's permissionless path) until the LIVE key is approved.
  const key = (network: NetworkContext) => (network.isRealMoney ? env.CIRCLE_LIVE_API_KEY : env.CIRCLE_TEST_API_KEY) ?? "";
  return {
    quote: (input) => quoteSwap({ ...input, apiKey: key(input.network) }),
    prepare: (input) => prepareSwap({ ...input, apiKey: key(input.network) }),
    prices: (network, tokens) => marketPrices(network, key(network), tokens),
    // Read straight from the process until @kawase/env lists them (requested from the Wallet lane, which owns env).
    venueKeys: { uniswap: process.env.UNISWAP_API_KEY || undefined, zerox: process.env.ZEROX_API_KEY || undefined },
  };
}

export const noSwaps: SwapEngine = {
  quote: () => Promise.reject(new Error("swaps are not configured")),
  prepare: () => Promise.reject(new Error("swaps are not configured")),
  prices: () => Promise.resolve(new Map()),
};
