// One set of chain clients per network: a public client for reads, the relayer for 7702 setups, and the
// agent's redeeming wallet. Mainnet only exists here when MAINNET_ENABLED is set with its keys.
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  nonceManager,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { ApiEnv } from "@kawase/env";
import { ARC_RPC, getNetwork, type NetworkContext, type NetworkId } from "@kawase/networks";

export type NetworkClients = {
  network: NetworkContext;
  client: PublicClient;
  relayer: WalletClient;
  relayerAddress: Address;
  /** The Circle developer-controlled wallet that redeems allowances. */
  ops: { walletId: string; address: Address };
};

export type Chains = {
  available: NetworkId[];
  get(network: NetworkId): NetworkClients | undefined;
};

const withPrefix = (key: string): Hex => (key.startsWith("0x") ? (key as Hex) : `0x${key}`);

const ALCHEMY_SLUG: Record<NetworkId, string> = { mainnet: "arc-mainnet", testnet: "arc-testnet" };
/**
 * Arc's own RPC first, then the provider-run endpoints, then Alchemy (`ARC_RPC`, docs.arc.io): one public endpoint
 * rate-limits ("Request exceeds defined limit"), and on 10-15 that failed a person's wallet read on mainnet with a 500
 * (Alchemy's monthly quota was spent too). On 10-16 testnet's old arc.network names stopped resolving and every testnet
 * call fell through to the spent Alchemy quota. A failed or refused call moves to the next; reverts are not retried.
 */
export function arcTransport(id: NetworkId, rpcUrl?: string, alchemyKey?: string) {
  const urls = [rpcUrl, ...ARC_RPC[id], alchemyKey ? `https://${ALCHEMY_SLUG[id]}.g.alchemy.com/v2/${alchemyKey}` : undefined];
  return fallback(urls.filter((url): url is string => Boolean(url)).map((url) => http(url)));
}

function clientsFor(
  id: NetworkId,
  relayerKey: string,
  ops: { walletId: string; address: Address },
  rpcUrl?: string,
  alchemyKey?: string,
): NetworkClients {
  const network = getNetwork(id);
  const transport = arcTransport(id, rpcUrl, alchemyKey);
  // Sign-ups that set up at the same moment each send a relayed transaction; the nonce manager hands them out in
  // order within this process, so two setups never race for the same nonce.
  const account = privateKeyToAccount(withPrefix(relayerKey), { nonceManager });
  return {
    network,
    client: createPublicClient({ chain: network.viemChain, transport }),
    relayer: createWalletClient({ account, chain: network.viemChain, transport }),
    relayerAddress: account.address,
    ops,
  };
}

export function createChains(env: ApiEnv): Chains {
  const clients = new Map<NetworkId, NetworkClients>();
  clients.set(
    "testnet",
    clientsFor(
      "testnet",
      env.RELAYER_PRIVATE_KEY_TESTNET,
      { walletId: env.OPS_WALLET_ID_TESTNET, address: env.OPS_WALLET_ADDRESS_TESTNET as Address },
      env.ARC_RPC_URL_TESTNET,
      env.ALCHEMY_API_KEY,
    ),
  );
  if (
    env.MAINNET_ENABLED &&
    env.RELAYER_PRIVATE_KEY_MAINNET &&
    env.OPS_WALLET_ID_MAINNET &&
    env.OPS_WALLET_ADDRESS_MAINNET
  ) {
    clients.set(
      "mainnet",
      clientsFor(
        "mainnet",
        env.RELAYER_PRIVATE_KEY_MAINNET,
        { walletId: env.OPS_WALLET_ID_MAINNET, address: env.OPS_WALLET_ADDRESS_MAINNET as Address },
        env.ARC_RPC_URL_MAINNET,
        env.ALCHEMY_API_KEY,
      ),
    );
  }
  return { available: [...clients.keys()], get: (network) => clients.get(network) };
}
