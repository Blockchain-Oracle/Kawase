import { arc, arcTestnet } from "viem/chains";
import type { Chain } from "viem";
import type { NetworkId } from "./network-id";
import { NETWORK_ADDRESSES, SHARED_ADDRESSES } from "./addresses";

/** CCTP V2 and Gateway domain id for Arc (both networks). Source: context/01-arc/network-config.md */
export const ARC_CCTP_DOMAIN = 26;

/** Everything network-specific the app needs, resolved server-side from the session (K6). Never chosen by the model (K2). */
export type NetworkContext = {
  id: NetworkId;
  chainId: number;
  viemChain: Chain;
  /** Circle Wallets / Developer API blockchain id. */
  circleBlockchain: "ARC" | "ARC-TESTNET";
  /** Circle App Kit chain id. */
  appKitChain: "Arc" | "Arc_Testnet";
  /** Name of the env var holding the Circle API key for this environment (the key itself is never here). */
  circleKeyRef: "CIRCLE_LIVE_API_KEY" | "CIRCLE_TEST_API_KEY";
  isRealMoney: boolean;
  cctpDomain: number;
  addresses: typeof SHARED_ADDRESSES & (typeof NETWORK_ADDRESSES)[NetworkId];
};

export const NETWORKS = {
  mainnet: {
    id: "mainnet",
    chainId: arc.id,
    viemChain: arc,
    circleBlockchain: "ARC",
    appKitChain: "Arc",
    circleKeyRef: "CIRCLE_LIVE_API_KEY",
    isRealMoney: true,
    cctpDomain: ARC_CCTP_DOMAIN,
    addresses: { ...SHARED_ADDRESSES, ...NETWORK_ADDRESSES.mainnet },
  },
  testnet: {
    id: "testnet",
    chainId: arcTestnet.id,
    viemChain: arcTestnet,
    circleBlockchain: "ARC-TESTNET",
    appKitChain: "Arc_Testnet",
    circleKeyRef: "CIRCLE_TEST_API_KEY",
    isRealMoney: false,
    cctpDomain: ARC_CCTP_DOMAIN,
    addresses: { ...SHARED_ADDRESSES, ...NETWORK_ADDRESSES.testnet },
  },
} as const satisfies Record<NetworkId, NetworkContext>;

export function getNetwork(id: NetworkId): NetworkContext {
  return NETWORKS[id];
}

export function networkForChainId(chainId: number): NetworkContext | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId);
}
