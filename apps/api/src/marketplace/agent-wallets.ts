// The per-user agent wallets (cards/marketplace.md, X29): Circle developer-controlled EOAs, one per person per
// network, in one wallet set Kawase finds by name (or makes once). TEST keys on testnet, LIVE keys on mainnet; the keys
// never leave the api. The wallet signs x402 payments and Gateway withdrawals (EIP-712) and sends its own contract calls
// through the same Circle client as the ops wallet (`OpsExecutor`).
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { getAddress, type Address, type Hex } from "viem";

import type { ApiEnv } from "@kawase/env";
import { getNetwork, type NetworkId } from "@kawase/networks";

export type TypedDataInput = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type AgentWalletProvider = {
  /** A new EOA for one person on one network. */
  create(network: NetworkId, refId: string): Promise<{ walletId: string; address: Address }>;
  signTypedData(network: NetworkId, walletId: string, typedData: TypedDataInput): Promise<Hex>;
};

const WALLET_SET_NAME = "kawase-agent-wallets";
/** EIP-712 domain fields in their canonical order, with their types. */
const DOMAIN_FIELDS = [
  ["name", "string"],
  ["version", "string"],
  ["chainId", "uint256"],
  ["verifyingContract", "address"],
  ["salt", "bytes32"],
] as const;

/** Circle signs the JSON form of EIP-712: the domain's type spelled out and every bigint as a decimal string. */
export function circleTypedDataJson(input: TypedDataInput): string {
  const domainType = DOMAIN_FIELDS.filter(([field]) => input.domain[field] !== undefined).map(([name, type]) => ({ name, type }));
  const typed = {
    types: { EIP712Domain: domainType, ...Object.fromEntries(Object.entries(input.types).filter(([name]) => name !== "EIP712Domain")) },
    domain: input.domain,
    primaryType: input.primaryType,
    message: input.message,
  };
  return JSON.stringify(typed, (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
}

export function circleAgentWallets(env: ApiEnv): AgentWalletProvider {
  const clients = {
    testnet: initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET }),
    mainnet:
      env.CIRCLE_LIVE_API_KEY && env.CIRCLE_LIVE_ENTITY_SECRET
        ? initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_LIVE_API_KEY, entitySecret: env.CIRCLE_LIVE_ENTITY_SECRET })
        : undefined,
  } as const;
  const client = (network: NetworkId) => {
    const found = clients[network];
    if (!found) throw new Error(`No Circle client for ${network}`);
    return found;
  };
  const walletSets = new Map<NetworkId, Promise<string>>();
  const walletSet = (network: NetworkId) => {
    let found = walletSets.get(network);
    if (!found) {
      found = (async () => {
        const listed = (await client(network).listWalletSets()).data?.walletSets ?? [];
        const existing = listed.find((set) => (set as { name?: string }).name === WALLET_SET_NAME);
        if (existing?.id) return existing.id;
        const created = await client(network).createWalletSet({ name: WALLET_SET_NAME, idempotencyKey: randomUUID() });
        const id = created.data?.walletSet?.id;
        if (!id) throw new Error("Circle returned no wallet set");
        return id;
      })();
      // A failure is not remembered: the next call asks again.
      found.catch(() => walletSets.delete(network));
      walletSets.set(network, found);
    }
    return found;
  };

  return {
    async create(network, refId) {
      const response = await client(network).createWallets({
        blockchains: [getNetwork(network).circleBlockchain],
        count: 1,
        walletSetId: await walletSet(network),
        accountType: "EOA",
        metadata: [{ name: `agent-wallet`, refId }],
        idempotencyKey: randomUUID(),
      });
      const wallet = response.data?.wallets?.[0];
      if (!wallet?.id || !wallet.address) throw new Error("Circle returned no wallet");
      return { walletId: wallet.id, address: getAddress(wallet.address) };
    },
    async signTypedData(network, walletId, typedData) {
      const response = await client(network).signTypedData({ walletId, data: circleTypedDataJson(typedData) });
      const signature = response.data?.signature;
      if (!signature) throw new Error("Circle returned no signature");
      return (signature.startsWith("0x") ? signature : `0x${signature}`) as Hex;
    },
  };
}
