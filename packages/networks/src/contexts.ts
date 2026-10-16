import { arc, arcTestnet } from "viem/chains";
import type { Chain } from "viem";
import type { NetworkId } from "./network-id";
import { NETWORK_ADDRESSES, SHARED_ADDRESSES } from "./addresses";

/** CCTP V2 and Gateway domain id for Arc (both networks). Source: context/01-arc/network-config.md */
export const ARC_CCTP_DOMAIN = 26;

/**
 * Arc's RPC endpoints, primary first (docs.arc.io "Connect to Arc", checked 10-16). Testnet moved from arc.network to
 * arc.io: the old names (rpc.testnet.arc.network and the providers' *.testnet.arc.network) no longer resolve, while
 * viem's built-in chain and Circle's kits still carry them — so Kawase names its own and never relies on a built-in.
 */
export const ARC_RPC = {
  mainnet: ["https://rpc.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io", "https://rpc.drpc.mainnet.arc.io", "https://rpc.quicknode.mainnet.arc.io"],
  testnet: ["https://rpc.testnet.arc.io", "https://rpc.blockdaemon.testnet.arc.io", "https://rpc.drpc.testnet.arc.io", "https://rpc.quicknode.testnet.arc.io"],
} as const satisfies Record<NetworkId, readonly string[]>;

/** viem's Arc chains with Arc's current endpoints (wallets add the network from these; clients default to them). */
export const ARC_CHAINS = {
  mainnet: { ...arc, rpcUrls: { default: { http: [ARC_RPC.mainnet[0]] } } },
  testnet: { ...arcTestnet, rpcUrls: { default: { http: [ARC_RPC.testnet[0]] } } },
} as const satisfies Record<NetworkId, Chain>;

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
    viemChain: ARC_CHAINS.mainnet,
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
    viemChain: ARC_CHAINS.testnet,
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
