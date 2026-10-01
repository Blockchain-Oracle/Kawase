// One set of chain clients per network: a public client for reads, the relayer for 7702 setups, and the
// agent's redeeming wallet. Mainnet only exists here when MAINNET_ENABLED is set with its keys.
import {
  createPublicClient,
  createWalletClient,
  http,
  nonceManager,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { ApiEnv } from "@kawase/env";
import { getNetwork, type NetworkContext, type NetworkId } from "@kawase/networks";

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

function clientsFor(
  id: NetworkId,
  relayerKey: string,
  ops: { walletId: string; address: Address },
  rpcUrl?: string,
): NetworkClients {
  const network = getNetwork(id);
  const transport = http(rpcUrl);
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
      ),
    );
  }
  return { available: [...clients.keys()], get: (network) => clients.get(network) };
}
