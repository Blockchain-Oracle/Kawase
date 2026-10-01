// The wallet's money history on one network, from the chain's own explorer (ArcScan, Blockscout's v2 api):
// USDC and EURC transfers in and out of the user's address. Counterparties Kawase knows are labelled — its own
// agent and relayer wallets, and Circle's faucet only when the sender is one of the faucet's own wallets (never
// because a transfer happened near a claim: Codex review R15) — and everything else stays an address. The
// explorer answers one page; whether there is more, and where the full history is, go with it so the app can say
// so. Read-only and cached for a few seconds per address.
import { getAddress, type Address } from "viem";

import type { NetworkContext, NetworkId } from "@kawase/networks";

import { CIRCLE_FAUCET_SENDERS } from "../faucet/circle-faucet";

export type ActivityAsset = "USDC" | "EURC";
export type CounterpartyLabel = "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | "swap";

export type ActivityItem = {
  id: string;
  network: NetworkId;
  direction: "in" | "out";
  asset: ActivityAsset;
  /** Base units (6 decimals). */
  amount: string;
  counterparty: Address;
  counterpartyLabel: CounterpartyLabel | null;
  txHash: string;
  at: string;
  explorerUrl: string;
  /** A swap: this item is what came in, and this is what went out for it, in the same transaction. */
  swap?: { asset: ActivityAsset; amount: string } | undefined;
};

/** One page of history: the newest transfers, whether older ones exist, and the explorer page with all of them. */
export type ActivityPage = { items: ActivityItem[]; more: boolean; historyUrl: string | null };

type BlockscoutTransfer = {
  from: { hash: string };
  to: { hash: string };
  token: { address_hash: string; symbol: string };
  total: { value: string };
  transaction_hash: string;
  log_index: number;
  timestamp: string;
};

const CACHE_MS = 8_000;
const FETCH_TIMEOUT_MS = 8_000;
const cache = new Map<string, { at: number; page: ActivityPage }>();

export type KnownWallets = { agent: Address; relayer: Address };

export async function fetchActivity(network: NetworkContext, address: Address, known: KnownWallets): Promise<ActivityPage> {
  const key = `${network.id}:${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.page;

  const explorer = network.viemChain.blockExplorers?.default.url;
  if (!explorer) return { items: [], more: false, historyUrl: null };
  const response = await fetch(`${explorer}/api/v2/addresses/${address}/token-transfers?type=ERC-20`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`explorer ${response.status}`);
  const { items = [], next_page_params: next } = (await response.json()) as { items?: BlockscoutTransfer[]; next_page_params?: unknown };

  const assets: Record<string, ActivityAsset> = {
    [network.addresses.usdc.toLowerCase()]: "USDC",
    [network.addresses.eurc.toLowerCase()]: "EURC",
  };
  const self = address.toLowerCase();
  const result: ActivityItem[] = [];
  for (const transfer of items) {
    const asset = assets[transfer.token.address_hash.toLowerCase()];
    if (!asset) continue;
    const inbound = transfer.to.hash.toLowerCase() === self;
    const counterparty = getAddress(inbound ? transfer.from.hash : transfer.to.hash);
    result.push({
      id: `${transfer.transaction_hash}:${transfer.log_index}`,
      network: network.id,
      direction: inbound ? "in" : "out",
      asset,
      amount: transfer.total.value,
      counterparty,
      counterpartyLabel: label(network.id, counterparty, known, self, inbound),
      txHash: transfer.transaction_hash,
      at: new Date(transfer.timestamp).toISOString(),
      explorerUrl: `${explorer}/tx/${transfer.transaction_hash}`,
    });
  }
  const page: ActivityPage = { items: foldSwaps(result), more: Boolean(next), historyUrl: `${explorer}/address/${address}` };
  cache.set(key, { at: Date.now(), page });
  return page;
}

function label(network: NetworkId, counterparty: Address, known: KnownWallets, self: string, inbound: boolean): CounterpartyLabel | null {
  const lower = counterparty.toLowerCase();
  if (lower === self) return "self";
  if (lower === known.agent.toLowerCase()) return "kawase_agent";
  if (lower === known.relayer.toLowerCase()) return "kawase_relayer";
  if (inbound && CIRCLE_FAUCET_SENDERS[network]?.has(lower)) return "circle_faucet";
  return null;
}

/**
 * One transaction in which the wallet sent one currency and received another is a swap from the person's side:
 * its two transfers become one item (what came in, with what went out for it), so a swap reads as one movement.
 */
const SWAP_LEGS = 2;

function foldSwaps(items: ActivityItem[]): ActivityItem[] {
  const byTx = new Map<string, ActivityItem[]>();
  for (const item of items) byTx.set(item.txHash, [...(byTx.get(item.txHash) ?? []), item]);
  const folded: ActivityItem[] = [];
  const done = new Set<string>();
  for (const item of items) {
    if (done.has(item.txHash)) continue;
    const legs = byTx.get(item.txHash) ?? [item];
    const into = legs.filter((leg) => leg.direction === "in");
    const out = legs.filter((leg) => leg.direction === "out");
    if (legs.length === SWAP_LEGS && into.length === 1 && out.length === 1 && into[0]!.asset !== out[0]!.asset) {
      done.add(item.txHash);
      folded.push({ ...into[0]!, id: `${item.txHash}:swap`, counterparty: out[0]!.counterparty, counterpartyLabel: "swap", swap: { asset: out[0]!.asset, amount: out[0]!.amount } });
    } else folded.push(item);
  }
  return folded;
}
