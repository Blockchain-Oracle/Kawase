// What automations need from the market: a token as the person said it, and the best executable quote for an exact
// amount right now — the same venues the swap ticket fans out to (Kyber, App Kit, LI.FI), never a price feed (a feed's
// heartbeat is too coarse to trigger on, 07-automations-contacts-safety/automations.md).
import { erc20Abi, getAddress, isAddress, type Address } from "viem";

import { DEFAULT_LIMITS } from "@kawase/config";
import { CANONICAL_TOKENS, type NetworkId } from "@kawase/networks";

import type { SwapVenues } from "../swap/venues";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";

export type MarketToken = { address: Address; symbol: string; decimals: number };
export type MarketQuote = { estimatedOut: bigint; minOut: bigint; venue: string };

export type AutomationMarket = {
  token(user: SessionUser, network: NetworkId, words: string): Promise<MarketToken | undefined>;
  quote(network: NetworkId, from: Address, tokenIn: MarketToken, tokenOut: MarketToken, amountIn: bigint): Promise<MarketQuote | undefined>;
};

const WORDS: Record<string, string> = { dollar: "USDC", dollars: "USDC", usd: "USDC", usdc: "USDC", euro: "EURC", euros: "EURC", eur: "EURC", eurc: "EURC" };

export function automationMarket(chains: Chains, venues: SwapVenues, assets: AssetService | undefined): AutomationMarket {
  return {
    async token(user, network, words) {
      const text = words.trim();
      const canonical = CANONICAL_TOKENS[network];
      const named = WORDS[text.toLowerCase()];
      if (named) {
        const found = canonical.find((entry) => entry.symbol === named);
        return found ? { address: getAddress(found.address), symbol: found.symbol, decimals: found.decimals } : undefined;
      }
      if (isAddress(text, { strict: false })) {
        const known = canonical.find((entry) => entry.address.toLowerCase() === text.toLowerCase());
        if (known) return { address: getAddress(known.address), symbol: known.symbol, decimals: known.decimals };
        const clients = chains.get(network);
        if (!clients) return undefined;
        const [symbol, decimals] = await Promise.all([
          clients.client.readContract({ address: text as Address, abi: erc20Abi, functionName: "symbol" }),
          clients.client.readContract({ address: text as Address, abi: erc20Abi, functionName: "decimals" }),
        ]).catch(() => [undefined, undefined] as const);
        return symbol && decimals !== undefined ? { address: getAddress(text), symbol, decimals } : undefined;
      }
      const bySymbol = canonical.find((entry) => entry.symbol.toLowerCase() === text.toLowerCase());
      if (bySymbol) return { address: getAddress(bySymbol.address), symbol: bySymbol.symbol, decimals: bySymbol.decimals };
      // Any other name: the best match of a search, held and verified first (the same as a trade from chat).
      const [best] = assets ? await assets.search(user, network, text).catch(() => []) : [];
      return best ? { address: getAddress(best.token.address), symbol: best.token.symbol, decimals: best.token.decimals } : undefined;
    },

    async quote(network, from, tokenIn, tokenOut, amountIn) {
      const clients = chains.get(network);
      if (!clients) return undefined;
      const limits = DEFAULT_LIMITS[network];
      const { quotes } = await venues
        .quoteAll({ network: clients.network, client: clients.client, from, tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, decimalsIn: tokenIn.decimals, decimalsOut: tokenOut.decimals, slippageBps: limits.maxSlippageOtherBps })
        .catch(() => ({ quotes: [] }));
      const best = quotes[0];
      return best ? { estimatedOut: best.estimatedOut, minOut: best.minOut, venue: best.venue } : undefined;
    },
  };
}
