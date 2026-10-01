// Where bridge routes come from. In the api this is Circle App Kit's CCTP with the forwarder
// (packages/integrations/app-kit); tests that never bridge get `noBridges`.
import type { Address, Hex, PublicClient } from "viem";

import type { ApiEnv } from "@kawase/env";
import {
  bridgeDestinations,
  bridgeProgress,
  estimateBridge,
  mintedTo,
  prepareBridge,
  type BridgeDestination,
  type BridgeEstimate,
  type BridgeProgress,
  type SwapCall,
} from "@kawase/integrations-app-kit";
import type { NetworkContext } from "@kawase/networks";

export type BridgeEngineInput = {
  network: NetworkContext;
  client: PublicClient;
  from: Address;
  destination: BridgeDestination;
  recipient: Address;
  /** Decimal USDC. */
  amount: string;
};

export type BridgeEngine = {
  destinations(network: NetworkContext): BridgeDestination[];
  estimate(input: BridgeEngineInput): Promise<BridgeEstimate>;
  prepare(input: BridgeEngineInput): Promise<SwapCall[]>;
  progress(network: NetworkContext, burnTxHash: Hex): Promise<BridgeProgress | null>;
  minted(destination: BridgeDestination, mintTxHash: Hex, recipient: Address): Promise<bigint | undefined>;
};

export function appKitBridges(env: ApiEnv): BridgeEngine {
  const key = (network: NetworkContext) => (network.isRealMoney ? env.CIRCLE_LIVE_API_KEY : env.CIRCLE_TEST_API_KEY) ?? "";
  return {
    destinations: bridgeDestinations,
    estimate: (input) => estimateBridge({ ...input, apiKey: key(input.network) }),
    prepare: (input) => prepareBridge({ ...input, apiKey: key(input.network) }),
    progress: bridgeProgress,
    minted: mintedTo,
  };
}

export const noBridges: BridgeEngine = {
  destinations: bridgeDestinations,
  estimate: () => Promise.reject(new Error("bridges are not configured")),
  prepare: () => Promise.reject(new Error("bridges are not configured")),
  progress: () => Promise.resolve(null),
  minted: () => Promise.resolve(undefined),
};
