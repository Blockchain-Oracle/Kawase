// Which token a business means (R1: every asset is first-class): "USDC", "EURC", "cirBTC", a symbol from Arc's lists,
// or a contract address — resolved through A's asset registry (AssetService.search: canonical tokens, Arc's listed
// tokens, what the wallet holds). Only canonical and listed tokens are accepted for money owed to someone: a lookalike
// or impersonator symbol is refused, and an unknown symbol asks for the address.
import { getAddress, isAddress } from "viem";

import type { TokenView } from "@kawase/api-client";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import type { AssetService } from "../tokens/service";
import type { Chains } from "../wallet/chain";

export type ResolvedToken = { address: `0x${string}`; symbol: string; decimals: number; name: string; logoUrl: string | null };
export type TokenResolver = (user: SessionUser, network: NetworkId, asset: string) => Promise<ResolvedToken>;

const TRUSTED = new Set<TokenView["status"]>(["canonical", "listed"]);
const RANK: Record<string, number> = { canonical: 0, listed: 1 };
const UNRANKED = Object.keys(RANK).length;

const resolved = (token: TokenView): ResolvedToken => ({ address: getAddress(token.address), symbol: token.symbol, decimals: token.decimals, name: token.name, logoUrl: token.logoUrl });

export function tokenResolver(assets: AssetService): TokenResolver {
  return async (user, network, asset) => {
    const query = asset.trim();
    const found = await assets.search(user, network, query);
    if (isAddress(query)) {
      const exact = found.find((entry) => entry.token.address.toLowerCase() === query.toLowerCase());
      if (!exact || exact.token.status === "lookalike" || exact.token.status === "impersonator") throw problem(HTTP.unprocessable, "validation", "that token can't be used for payments");
      return resolved(exact.token);
    }
    const candidates = found
      .filter((entry) => entry.token.symbol.toLowerCase() === query.toLowerCase() && TRUSTED.has(entry.token.status))
      .sort((a, b) => (RANK[a.token.status] ?? UNRANKED) - (RANK[b.token.status] ?? UNRANKED) || Number(b.held) - Number(a.held));
    const [best] = candidates;
    if (!best) throw problem(HTTP.unprocessable, "validation", `no listed token ${query} on Arc; give its address`);
    return resolved(best.token);
  };
}

const STABLE_DECIMALS = 6;

/** USDC and EURC straight from the network's addresses; anything else through the registry (when there is one). */
export async function businessToken(chains: Chains, resolveToken: TokenResolver | undefined, user: SessionUser, asset: string): Promise<Pick<ResolvedToken, "address" | "symbol" | "decimals">> {
  const upper = asset.trim().toUpperCase();
  const clients = chains.get(user.activeNetwork);
  if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
  if (upper === "USDC" || upper === "EURC") {
    return { address: getAddress(upper === "EURC" ? clients.network.addresses.eurc : clients.network.addresses.usdc), symbol: upper, decimals: STABLE_DECIMALS };
  }
  if (!resolveToken) throw problem(HTTP.unprocessable, "validation", "only USDC and EURC here");
  const token = await resolveToken(user, user.activeNetwork, asset);
  return { address: token.address, symbol: token.symbol, decimals: token.decimals };
}
