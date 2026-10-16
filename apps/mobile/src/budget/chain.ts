// The phone's own chain reads for the budget guard, straight from Arc's public RPC (viem's chain definitions),
// never through Kawase's server: the wallet's kill-switch nonce, and a vault's own preview of a deposit or withdraw.
// A read that fails returns undefined; the guard then treats the action as unpriced (not silent), never as fine.
import { DELEGATION_FRAMEWORK_MANAGER, BUDGET_ENFORCERS } from "@kawase/wallet";
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from "viem";
import { ARC_CHAINS } from "@kawase/networks";

// Arc's chains with its current endpoints (testnet moved to arc.io; viem's built-ins still carry the old hosts).
const { mainnet: arc, testnet: arcTestnet } = ARC_CHAINS;

const NONCE_ABI = parseAbi(["function currentNonce(address delegationManager, address delegator) view returns (uint256)"]);
const VAULT_ABI = parseAbi(["function previewDeposit(uint256 assets) view returns (uint256)", "function previewWithdraw(uint256 assets) view returns (uint256)"]);
const READ_TIMEOUT_MS = 6_000;

export type VaultPreview = { sharesIn: bigint; sharesOut: bigint };

export type ChainReads = {
  /** The wallet's NonceEnforcer nonce: every grant and leaf it signs now must carry exactly this. */
  nonce: (chainId: number, wallet: Address) => Promise<bigint | undefined>;
  /** Shares a deposit of `assets` mints, and shares a withdraw of `assets` burns, by the vault's own preview. */
  vaultPreview: (chainId: number, vault: Address, assets: bigint) => Promise<VaultPreview | undefined>;
};

const CHAINS = { [arc.id]: arc, [arcTestnet.id]: arcTestnet } as const;
const clients = new Map<number, PublicClient>();

function clientFor(chainId: number): PublicClient | undefined {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) return undefined;
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({ chain, transport: http(undefined, { timeout: READ_TIMEOUT_MS }) }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}

/** Reads over Arc's public RPC. */
export const arcReads: ChainReads = {
  async nonce(chainId, wallet) {
    const client = clientFor(chainId);
    if (!client) return undefined;
    return client
      .readContract({ address: BUDGET_ENFORCERS.nonce, abi: NONCE_ABI, functionName: "currentNonce", args: [DELEGATION_FRAMEWORK_MANAGER, wallet] })
      .catch(() => undefined);
  },
  async vaultPreview(chainId, vault, assets) {
    const client = clientFor(chainId);
    if (!client) return undefined;
    try {
      const [sharesIn, sharesOut] = await Promise.all([
        client.readContract({ address: vault, abi: VAULT_ABI, functionName: "previewDeposit", args: [assets] }),
        client.readContract({ address: vault, abi: VAULT_ABI, functionName: "previewWithdraw", args: [assets] }),
      ]);
      return { sharesIn, sharesOut };
    } catch {
      return undefined;
    }
  },
};
