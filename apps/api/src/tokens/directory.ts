// What a token is (R1, R10): one description for any address on Arc, built from the verified list, the market's
// lists and the contract itself. The order of trust: Kawase's canonical list → LI.FI's Arc list (and a CoinGecko
// id from GeckoTerminal) → the contract's own symbol/name/decimals, read once and kept. The copycat rule runs on
// every description: a stablecoin's symbol at a non-canonical address is an impersonator (hard-blocked); a listed
// token's symbol at another address is a lookalike (cards/trade.md).
import { inArray, and, eq } from "drizzle-orm";
import { erc20Abi, getAddress, parseAbi, type Address, type PublicClient } from "viem";

import type { TokenStatus, TokenView } from "@kawase/api-client";
import { tokenMetadata, type Db } from "@kawase/db";
import {
  CANONICAL_TOKENS,
  canonicalToken,
  isImpostor,
  normalizeSymbol,
  type NetworkId,
  type TokenKind,
} from "@kawase/networks";

import type { MarketData, TokenMarket } from "../market/sources";

const ERC4626 = parseAbi(["function asset() view returns (address)"]);
const SYMBOL_MAX = 24;
/** symbol, name, decimals, asset: the reads per unknown token in the metadata multicall. */
const READS_PER_TOKEN = 4;
const NAME_MAX = 64;

type Metadata = typeof tokenMetadata.$inferSelect;

export class TokenDirectory {
  constructor(
    private readonly db: Db,
    private readonly market: MarketData,
  ) {}

  /** Describe many tokens at once; unknown contracts are read on chain once and remembered. */
  async describe(network: NetworkId, chainId: number, client: PublicClient | undefined, addresses: readonly string[], markets?: Map<string, TokenMarket>): Promise<Map<string, TokenView>> {
    const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
    const listed = await this.market.listed(chainId);
    const stored = await this.metadata(chainId, client, unique.filter((address) => !canonicalToken(network, address)));
    const listedSymbols = this.listedSymbols(network, listed);
    const out = new Map<string, TokenView>();
    for (const address of unique) {
      const canonical = canonicalToken(network, address);
      const list = listed.get(address);
      const meta = stored.get(address);
      const market = markets?.get(address);
      const symbol = clean(canonical?.symbol ?? list?.symbol ?? meta?.symbol ?? market?.symbol ?? "?", SYMBOL_MAX);
      const name = clean(canonical?.name ?? list?.name ?? meta?.name ?? market?.name ?? symbol, NAME_MAX);
      const decimals = canonical?.decimals ?? meta?.decimals ?? list?.decimals ?? market?.decimals;
      if (decimals === undefined) continue;
      const kind: TokenKind = canonical?.kind ?? (meta?.underlying ? "position" : "token");
      out.set(address, {
        chainId,
        address: getAddress(address),
        symbol,
        name,
        decimals,
        logoUrl: list?.logoUrl ?? market?.logoUrl ?? null,
        kind,
        status: this.status(network, address, symbol, Boolean(canonical), Boolean(list) || Boolean(market?.coingeckoId), listedSymbols, decimals),
        isTest: network === "testnet",
      });
    }
    return out;
  }

  /** Normalised symbol → the address the lists vouch for (canonical first). */
  private listedSymbols(network: NetworkId, listed: Map<string, { symbol: string }>) {
    const bySymbol = new Map<string, string>();
    for (const [address, token] of listed) if (!bySymbol.has(normalizeSymbol(token.symbol))) bySymbol.set(normalizeSymbol(token.symbol), address);
    for (const token of CANONICAL_TOKENS[network]) bySymbol.set(normalizeSymbol(token.symbol), token.address.toLowerCase());
    return bySymbol;
  }

  status(network: NetworkId, address: string, symbol: string, canonical: boolean, listed: boolean, listedSymbols: Map<string, string>, decimals?: number): TokenStatus {
    if (canonical) return "canonical";
    if (isImpostor(network, symbol, address, decimals)) return "impersonator";
    const owner = listedSymbols.get(normalizeSymbol(symbol));
    if (owner && owner !== address.toLowerCase()) return "lookalike";
    return listed ? "listed" : "unverified";
  }

  /** Symbol → listed address map, for callers that classify market rows themselves. */
  async symbolOwners(network: NetworkId, chainId: number) {
    return this.listedSymbols(network, await this.market.listed(chainId));
  }

  /** Stored metadata, reading on chain (one multicall) whatever is not stored yet. */
  private async metadata(chainId: number, client: PublicClient | undefined, addresses: string[]): Promise<Map<string, Metadata>> {
    const out = new Map<string, Metadata>();
    if (addresses.length === 0) return out;
    const rows = await this.db
      .select()
      .from(tokenMetadata)
      .where(and(eq(tokenMetadata.chainId, chainId), inArray(tokenMetadata.address, addresses)));
    for (const row of rows) if (!row.broken) out.set(row.address, row);
    const known = new Set(rows.map((row) => row.address));
    const unread = addresses.filter((address) => !known.has(address));
    if (unread.length === 0 || !client) return out;
    const calls = unread.flatMap((address) => {
      const target = address as Address;
      return [
        { address: target, abi: erc20Abi, functionName: "symbol" },
        { address: target, abi: erc20Abi, functionName: "name" },
        { address: target, abi: erc20Abi, functionName: "decimals" },
        { address: target, abi: ERC4626, functionName: "asset" },
      ] as const;
    });
    const results = await client.multicall({ contracts: calls, allowFailure: true }).catch(() => undefined);
    if (!results) return out;
    const fresh: Metadata[] = [];
    unread.forEach((address, index) => {
      const [symbol, name, decimals, asset] = results.slice(index * READS_PER_TOKEN, (index + 1) * READS_PER_TOKEN);
      const ok = symbol?.status === "success" && decimals?.status === "success";
      fresh.push({
        chainId,
        address,
        symbol: ok ? clean(String(symbol.result), SYMBOL_MAX) : "?",
        name: name?.status === "success" ? clean(String(name.result), NAME_MAX) : ok ? clean(String(symbol.result), NAME_MAX) : "?",
        decimals: ok ? Number(decimals.result) : 0,
        underlying: asset?.status === "success" ? String(asset.result).toLowerCase() : null,
        broken: !ok,
        createdAt: new Date(),
      });
    });
    if (fresh.length > 0) await this.db.insert(tokenMetadata).values(fresh).onConflictDoNothing();
    for (const row of fresh) if (!row.broken) out.set(row.address, row);
    return out;
  }
}

/** Control, zero-width and bidirectional-override code points: a contract could use them to disguise a symbol. */
const INVISIBLE: readonly { from: number; to: number }[] = [
  { from: 0x0000, to: 0x001f },
  { from: 0x007f, to: 0x009f },
  { from: 0x200b, to: 0x200f },
  { from: 0x202a, to: 0x202e },
  { from: 0x2066, to: 0x2069 },
];

/** Contract strings are untrusted: no invisible characters, bounded length. */
function clean(text: string, max: number) {
  const visible = [...text].filter((char) => {
    const code = char.codePointAt(0)!;
    return !INVISIBLE.some(({ from, to }) => code >= from && code <= to);
  });
  return visible.join("").trim().slice(0, max) || "?";
}
