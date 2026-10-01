// Where earn vaults and their calls come from: Circle App Kit Earn (Morpho vaults on Arc, mock Morpho vaults on Arc
// Testnet). Tests that never earn get `noEarn`. The vault list is cached for a minute per network.
import type { Address, PublicClient } from "viem";

import type { ApiEnv } from "@kawase/env";
import {
  exploreVaults,
  prepareEarnDeposit,
  prepareEarnWithdraw,
  vaultPosition,
  vaultPreview,
  type EarnVault,
  type SwapCall,
  type VaultPosition,
} from "@kawase/integrations-app-kit";
import type { NetworkContext } from "@kawase/networks";

export type EarnEngineInput = { network: NetworkContext; client: PublicClient; from: Address; vault: Address; amount: string };

export type EarnEngine = {
  vaults(network: NetworkContext): Promise<EarnVault[]>;
  deposit(input: EarnEngineInput): Promise<SwapCall[]>;
  withdraw(input: EarnEngineInput): Promise<SwapCall[]>;
  position(client: PublicClient, vault: Address, owner: Address): Promise<VaultPosition>;
  preview(client: PublicClient, vault: Address, assets: bigint): Promise<{ sharesIn: bigint; sharesOut: bigint }>;
};

const VAULTS_CACHE_MS = 60_000;

export function appKitEarn(env: ApiEnv): EarnEngine {
  const key = (network: NetworkContext) => (network.isRealMoney ? env.CIRCLE_LIVE_API_KEY : env.CIRCLE_TEST_API_KEY) ?? "";
  const cache = new Map<string, { at: number; vaults: EarnVault[] }>();
  return {
    vaults: async (network) => {
      const hit = cache.get(network.id);
      if (hit && Date.now() - hit.at < VAULTS_CACHE_MS) return hit.vaults;
      const vaults = await exploreVaults(network, key(network));
      cache.set(network.id, { at: Date.now(), vaults });
      return vaults;
    },
    deposit: (input) => prepareEarnDeposit({ ...input, apiKey: key(input.network) }),
    withdraw: (input) => prepareEarnWithdraw({ ...input, apiKey: key(input.network) }),
    position: vaultPosition,
    preview: vaultPreview,
  };
}

export const noEarn: EarnEngine = {
  vaults: () => Promise.resolve([]),
  deposit: () => Promise.reject(new Error("earn is not configured")),
  withdraw: () => Promise.reject(new Error("earn is not configured")),
  position: () => Promise.resolve({ shares: 0n, assets: 0n }),
  preview: () => Promise.resolve({ sharesIn: 0n, sharesOut: 0n }),
};
