// The chain's side of Activity: every token's transfers in and out of one address, from Alchemy's Transfers API
// (`alchemy_getAssetTransfers`; the lead's live check on Arc mainnet 2026-10-02, and testnet on 10-02 from here: Arc's
// USDC arrives as an ERC-20 transfer of 0x3600… with 6 decimals, EURC as its own contract, so no native/ERC-20
// double count). Two calls (from, to), newest first, with block timestamps. The explorer API sits behind Cloudflare,
// so it is not used here. Cached a few seconds per address; the key never leaves the server.
import { getAddress, type Address } from "viem";

import type { NetworkId } from "@kawase/networks";

import { assertAlchemyOpen, noteAlchemyAnswer } from "../market/alchemy-quota";

const SLUG: Record<NetworkId, string> = { mainnet: "arc-mainnet", testnet: "arc-testnet" };
const PAGE = "0x64";
const TIMEOUT_MS = 8_000;
const CACHE_MS = 8_000;
const NATIVE_DECIMALS = 18;
const ERC20_DECIMALS = 6;
const TEN = 10n;
const ZERO = 0n;
const SCALE = TEN ** BigInt(NATIVE_DECIMALS - ERC20_DECIMALS);

type AlchemyTransfer = {
  category: "erc20" | "external" | string;
  hash: string;
  from: string;
  to: string | null;
  asset: string | null;
  uniqueId: string;
  rawContract: { value: string | null; address: string | null; decimal: string | null };
  metadata?: { blockTimestamp?: string };
};

export type ChainTransfer = {
  id: string;
  txHash: string;
  direction: "in" | "out";
  token: Address;
  symbol: string;
  decimals: number;
  /** Base units of the token. */
  amount: bigint;
  counterparty: Address;
  at: string;
};

const cache = new Map<string, { at: number; value: { transfers: ChainTransfer[]; more: boolean } }>();

async function page(network: NetworkId, apiKey: string, side: "fromAddress" | "toAddress", address: Address) {
  // While Alchemy is paused after a 429 this throws at once, and the feed reads the explorer instead.
  assertAlchemyOpen();
  const response = await fetch(`https://${SLUG[network]}.g.alchemy.com/v2/${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [{ [side]: address, category: ["erc20", "external"], withMetadata: true, order: "desc", maxCount: PAGE, excludeZeroValue: true }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    noteAlchemyAnswer(response.status, await response.text().catch(() => ""));
    throw new Error(`alchemy ${response.status}`);
  }
  const body = (await response.json()) as { result?: { transfers: AlchemyTransfer[]; pageKey?: string }; error?: { code?: number; message: string } };
  if (!body.result) {
    // JSON-RPC can also carry the 429 in the body.
    if (body.error?.code) noteAlchemyAnswer(body.error.code, body.error.message);
    throw new Error(`alchemy: ${body.error?.message ?? "no result"}`);
  }
  return body.result;
}

/** The newest transfers of every token in and out of `address` on one network. */
export async function chainTransfers(network: NetworkId, apiKey: string, address: Address, usdc: Address): Promise<{ transfers: ChainTransfer[]; more: boolean }> {
  const key = `${network}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [sent, received] = await Promise.all([page(network, apiKey, "fromAddress", address), page(network, apiKey, "toAddress", address)]);
  const self = address.toLowerCase();
  const seen = new Set<string>();
  const transfers: ChainTransfer[] = [];
  for (const [entries, direction] of [[sent.transfers, "out"], [received.transfers, "in"]] as const) {
    for (const entry of entries) {
      const counterparty = direction === "out" ? entry.to : entry.from;
      if (!counterparty || !entry.rawContract.value) continue;
      // A native value transfer is Arc's USDC at 18 decimals; it is counted once, as USDC (6).
      const native = entry.category === "external";
      const token = native ? usdc : (entry.rawContract.address as Address | null);
      if (!token) continue;
      const raw = BigInt(entry.rawContract.value);
      const amount = native ? raw / SCALE : raw;
      if (amount === ZERO) continue;
      const id = `${entry.uniqueId}:${direction}`;
      const twin = `${entry.hash}:${direction}:${token.toLowerCase()}:${amount}`;
      if (seen.has(id) || (native && seen.has(twin))) continue;
      seen.add(id);
      seen.add(twin);
      // A transfer to oneself shows once, as out.
      if (direction === "in" && entry.from.toLowerCase() === self) continue;
      transfers.push({
        id,
        txHash: entry.hash,
        direction,
        token: getAddress(token),
        symbol: native ? "USDC" : (entry.asset ?? ""),
        decimals: native ? ERC20_DECIMALS : entry.rawContract.decimal ? Number(BigInt(entry.rawContract.decimal)) : ERC20_DECIMALS,
        amount,
        counterparty: getAddress(counterparty),
        at: entry.metadata?.blockTimestamp ?? new Date(0).toISOString(),
      });
    }
  }
  transfers.sort((a, b) => b.at.localeCompare(a.at));
  const value = { transfers, more: Boolean(sent.pageKey ?? received.pageKey) };
  cache.set(key, { at: Date.now(), value });
  return value;
}
