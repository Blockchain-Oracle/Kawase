// Any token on a network, by a verified symbol ("USDC", "cirBTC") or its address, with its decimals and price (R1).
// One lookup shared by sends, requests and withdrawals, so they all see a token the same way.
import { isAddress, type Address } from "viem";

import { CANONICAL_TOKENS, normalizeSymbol } from "@kawase/networks";

import type { TokenLookup } from "../send/facts";
import type { Chains } from "../wallet/chain";
import type { AssetService } from "./service";

export function tokenLookup(chains: Chains, assets: AssetService | undefined): TokenLookup {
  return async (network, value) => {
    const clients = chains.get(network);
    if (!assets || !clients) return undefined;
    const text = value.trim();
    const address = isAddress(text) ? text.toLowerCase() : CANONICAL_TOKENS[network].find((token) => normalizeSymbol(token.symbol) === normalizeSymbol(text))?.address.toLowerCase();
    if (!address) return undefined;
    const described = await assets.directory.describe(network, clients.network.chainId, clients.client, [address]);
    const token = described.get(address);
    if (!token) return undefined;
    const { prices } = await assets.prices(network, [address]).catch(() => ({ prices: new Map<string, { priceUsd: number | null }>() }));
    return { address: token.address as Address, symbol: token.symbol, decimals: token.decimals, priceUsd: prices.get(address)?.priceUsd ?? null };
  };
}
