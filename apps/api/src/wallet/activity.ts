// The wallet's money history on one network, from the chain's own explorer (ArcScan, Blockscout's v2 api):
// USDC and EURC transfers in and out of the user's address. Counterparties Kawase knows are labelled — its own
// agent and relayer wallets, and Circle's faucet when a transfer in matches a faucet claim the user made — and
// everything else stays an address. Read-only and cached for a few seconds per address.
import { getAddress, type Address } from "viem";

import type { NetworkContext, NetworkId } from "@kawase/networks";

export type ActivityAsset = "USDC" | "EURC";
export type CounterpartyLabel = "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self";

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
};

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
const cache = new Map<string, { at: number; items: ActivityItem[] }>();

export type KnownWallets = { agent: Address; relayer: Address };

export async function fetchActivity(
  network: NetworkContext,
  address: Address,
  known: KnownWallets,
  faucetClaims: Date[],
): Promise<ActivityItem[]> {
  const key = `${network.id}:${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const explorer = network.viemChain.blockExplorers?.default.url;
  if (!explorer) return [];
  const response = await fetch(`${explorer}/api/v2/addresses/${address}/token-transfers?type=ERC-20`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`explorer ${response.status}`);
  const { items = [] } = (await response.json()) as { items?: BlockscoutTransfer[] };

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
    const at = new Date(transfer.timestamp);
    result.push({
      id: `${transfer.transaction_hash}:${transfer.log_index}`,
      network: network.id,
      direction: inbound ? "in" : "out",
      asset,
      amount: transfer.total.value,
      counterparty,
      counterpartyLabel: label(counterparty, known, self, inbound, at, faucetClaims),
      txHash: transfer.transaction_hash,
      at: at.toISOString(),
      explorerUrl: `${explorer}/tx/${transfer.transaction_hash}`,
    });
  }
  cache.set(key, { at: Date.now(), items: result });
  return result;
}

/** How close a claim must be to a transfer in for it to be that claim's drip (the claim is written after the drip). */
const FAUCET_WINDOW_MS = 300_000;

function label(counterparty: Address, known: KnownWallets, self: string, inbound: boolean, at: Date, claims: Date[]): CounterpartyLabel | null {
  const lower = counterparty.toLowerCase();
  if (lower === self) return "self";
  if (lower === known.agent.toLowerCase()) return "kawase_agent";
  if (lower === known.relayer.toLowerCase()) return "kawase_relayer";
  if (inbound && claims.some((claim) => Math.abs(at.getTime() - claim.getTime()) <= FAUCET_WINDOW_MS)) return "circle_faucet";
  return null;
}
