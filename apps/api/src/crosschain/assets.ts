// The asset on each side of a cross-chain move. On Arc: an address, a verified symbol ("WETH", "cirBTC") or a listed
// one ("TOLLY"), described by the token directory (decimals, and whether it is a lookalike or an impersonator, which
// is never moved). On another chain: its native coin ("ETH", "POL", "AVAX") or a token LI.FI lists there by symbol.
// "As itself": the same asset on the other side, by symbol, with the Bitcoin and Ether wrappers each chain uses.
import { isAddress, zeroAddress, type Address, type PublicClient } from "viem";

import type { CrossChainAssetView, TokenView } from "@kawase/api-client";
import { lifiToken } from "@kawase/integrations-bridges";
import { CANONICAL_TOKENS, normalizeSymbol, type NetworkContext } from "@kawase/networks";

import type { TokenDirectory } from "../tokens/directory";

export type MoveAsset = CrossChainAssetView & { native: boolean; usdc: boolean; status: TokenView["status"] | "remote"; priceUsd?: number | null };

const NATIVE_DECIMALS = 18;
/** Each chain's native coin, by chain id. */
const NATIVE_SYMBOLS: Readonly<Record<number, string>> = { 1: "ETH", 8453: "ETH", 42161: "ETH", 10: "ETH", 137: "POL", 43114: "AVAX" };
/** The same asset under the names other chains give it (first found wins). */
const SAME_ASSET: Readonly<Record<string, readonly string[]>> = {
  cirbtc: ["cbBTC", "WBTC", "BTC.b"],
  cbbtc: ["cirBTC"],
  wbtc: ["cirBTC"],
  "btc.b": ["cirBTC"],
  eth: ["WETH"],
  weth: ["WETH", "WETH.e"],
  "weth.e": ["WETH"],
};
const BLOCKED: ReadonlySet<string> = new Set(["lookalike", "impersonator"]);

const norm = (text: string) => text.trim().toLowerCase();

export const isBlocked = (asset: MoveAsset) => BLOCKED.has(asset.status);

/** An asset on Arc as asked; undefined when nothing was said ("USDC" then), "unknown" when nothing matches. */
export async function arcAsset(network: NetworkContext, client: PublicClient, directory: TokenDirectory | undefined, text: string | null): Promise<MoveAsset | "unknown"> {
  const wanted = text?.trim() || "USDC";
  const canonical = CANONICAL_TOKENS[network.id].find((token) => norm(token.symbol) === norm(wanted) || (isAddress(wanted) && norm(token.address) === norm(wanted)));
  let address: string | undefined = canonical?.address ?? (isAddress(wanted) ? wanted : undefined);
  if (!address && directory) address = (await directory.symbolOwners(network.id, network.chainId).catch(() => undefined))?.get(normalizeSymbol(wanted));
  if (!address) return "unknown";
  const usdc = norm(address) === norm(network.addresses.usdc);
  if (canonical) return { chainId: network.chainId, address: canonical.address, symbol: canonical.symbol, decimals: canonical.decimals, native: false, usdc, status: "canonical" };
  const described = directory ? (await directory.describe(network.id, network.chainId, client, [norm(address)]).catch(() => undefined))?.get(norm(address)) : undefined;
  if (!described) return "unknown";
  return { chainId: network.chainId, address: described.address, symbol: described.symbol, decimals: described.decimals, native: false, usdc, status: described.status };
}

/** An asset on another chain as asked: its native coin or a token LI.FI lists there. */
export async function remoteAsset(chain: { chainId: number; usdc: Address }, text: string | null): Promise<MoveAsset | "unknown"> {
  const wanted = text?.trim() || "USDC";
  if (norm(wanted) === "usdc" || norm(wanted) === norm(chain.usdc)) return { chainId: chain.chainId, address: chain.usdc, symbol: "USDC", decimals: 6, native: false, usdc: true, status: "remote" };
  const native = NATIVE_SYMBOLS[chain.chainId];
  if (native && (norm(wanted) === norm(native) || norm(wanted) === zeroAddress)) return { chainId: chain.chainId, address: zeroAddress, symbol: native, decimals: NATIVE_DECIMALS, native: true, usdc: false, status: "remote" };
  const found = await lifiToken(chain.chainId, wanted).catch(() => undefined);
  if (!found) return "unknown";
  return { chainId: chain.chainId, address: found.address, symbol: found.symbol, decimals: found.decimals, native: false, usdc: norm(found.address) === norm(chain.usdc), status: "remote", priceUsd: found.priceUsd };
}

/** The same asset on the far chain of a move out (by symbol, then its other names); undefined when it is not there. */
export async function counterpartThere(chain: { chainId: number; usdc: Address }, asset: MoveAsset): Promise<MoveAsset | undefined> {
  if (asset.usdc) return { chainId: chain.chainId, address: chain.usdc, symbol: "USDC", decimals: 6, native: false, usdc: true, status: "remote" };
  for (const name of [asset.symbol, ...(SAME_ASSET[norm(asset.symbol)] ?? [])]) {
    const found = await remoteAsset(chain, name).catch(() => "unknown" as const);
    if (found !== "unknown" && !found.native) return found;
  }
  return undefined;
}

/** The same asset on Arc for a move in (ETH → WETH, cbBTC → cirBTC); undefined when Arc has none (it arrives as USDC). */
export function counterpartOnArc(network: NetworkContext, asset: MoveAsset): MoveAsset | undefined {
  for (const name of [asset.symbol, ...(SAME_ASSET[norm(asset.symbol)] ?? [])]) {
    const token = CANONICAL_TOKENS[network.id].find((entry) => norm(entry.symbol) === norm(name));
    if (token) return { chainId: network.chainId, address: token.address, symbol: token.symbol, decimals: token.decimals, native: false, usdc: norm(token.address) === norm(network.addresses.usdc), status: "canonical" };
  }
  return undefined;
}

export const assetView = (asset: MoveAsset): CrossChainAssetView => ({ chainId: asset.chainId, address: asset.address, symbol: asset.symbol, decimals: asset.decimals });
