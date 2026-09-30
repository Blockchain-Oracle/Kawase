import type { NetworkId } from "./network-id";
import { getNetwork } from "./contexts";

export class NetworkMismatchError extends Error {
  constructor(readonly details: Record<string, unknown>) {
    super("Network mismatch: nothing was sent.");
    this.name = "NetworkMismatchError";
  }
}

/**
 * K6 hard stop before any signature or submission: the intent, the session, the wallet environment
 * and the RPC's reported chain must all agree. No retry on the other network.
 */
export function assertSameNetwork(input: {
  intentNetwork: NetworkId;
  sessionNetwork: NetworkId;
  walletNetwork: NetworkId;
  rpcChainId: number;
}): void {
  const expectedChainId = getNetwork(input.intentNetwork).chainId;
  const agree =
    input.intentNetwork === input.sessionNetwork &&
    input.intentNetwork === input.walletNetwork &&
    input.rpcChainId === expectedChainId;
  if (!agree) throw new NetworkMismatchError({ ...input, expectedChainId });
}
