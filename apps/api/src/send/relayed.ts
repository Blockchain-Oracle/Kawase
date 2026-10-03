// Gas-free sends (plan §A.4 12, §B "Gas"): Arc gas is paid in USDC, so a wallet sending its last USDC (or holding
// only EURC) has nothing left for the fee — a dead end. Circle's USDC and EURC on Arc implement EIP-3009
// (`transferWithAuthorization`; read on chain 10-02: name "USDC"/"EURC", version "2", on testnet and mainnet), so the
// person signs one typed message with Face ID — from, to, exactly this amount, valid for minutes, a fresh nonce — and
// Kawase's relayer sends it and pays the fee. The signature can only ever move that amount to that recipient once.
// Kawase pays the fee (shown on the card); a per-person daily cap bounds what that can cost.
import { randomBytes } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { parseAbi, parseSignature, toHex, verifyTypedData, type Address, type Hex } from "viem";

import { MS_PER_SECOND, RELAYED_SENDS_PER_DAY } from "@kawase/config";
import { txAttempts, type Db } from "@kawase/db";

import type { NetworkClients } from "../wallet/chain";

const MS_PER_DAY = 86_400_000;
const NONCE_BYTES = 32;
const VERSION = "2";
/** Legacy ECDSA recovery ids are 27/28; viem gives yParity 0/1 for compact signatures. */
const LEGACY_V_OFFSET = 27n;
/** The relayer carries sends only while it holds at least this much gas (0.05 USDC, in Arc's 18-decimal native units). */
const RELAYER_MIN_GAS = 50_000_000_000_000_000n;

export const EIP3009_ABI = parseAbi([
  "function name() view returns (string)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** What is stored with the approval and handed to the wallet to sign (numbers as strings, for JSON). */
export type StoredAuthorization = {
  kind: "authorization";
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  message: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex };
};

/** The tokens the relayer can carry: this network's USDC and EURC (both EIP-3009). */
export const relayable = (clients: NetworkClients, token: string) =>
  [clients.network.addresses.usdc, clients.network.addresses.eurc].some((address) => address.toLowerCase() === token.toLowerCase());

/** The relayer has gas to pay with (mainnet stays off until it is funded). */
export async function relayerReady(clients: NetworkClients): Promise<boolean> {
  const balance = await clients.client.getBalance({ address: clients.relayerAddress }).catch(() => BigInt(0));
  return balance >= RELAYER_MIN_GAS;
}

/** Whether the person still has relayed sends left today (Kawase pays their fees). */
export async function relaysLeft(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ used: count() })
    .from(txAttempts)
    .where(and(eq(txAttempts.userId, userId), eq(txAttempts.kind, "send_relayed"), gte(txAttempts.createdAt, new Date(Date.now() - MS_PER_DAY))));
  return Number(row?.used ?? 0) < RELAYED_SENDS_PER_DAY;
}

/** The typed message for exactly this transfer, valid for `ttlSeconds` from now, with a fresh nonce. */
export async function authorizationFor(clients: NetworkClients, draft: { from: Address; to: Address; asset: Address; amount: bigint }, ttlSeconds: number): Promise<StoredAuthorization> {
  const validBefore = Math.floor(Date.now() / MS_PER_SECOND) + ttlSeconds;
  const name = await clients.client.readContract({ address: draft.asset, abi: EIP3009_ABI, functionName: "name" });
  return {
    kind: "authorization",
    domain: { name, version: VERSION, chainId: clients.network.chainId, verifyingContract: draft.asset },
    message: { from: draft.from, to: draft.to, value: draft.amount.toString(), validAfter: "0", validBefore: String(validBefore), nonce: toHex(randomBytes(NONCE_BYTES)) },
  };
}

/** The typed data the wallet signs (viem's shape). */
export const typedDataOf = (stored: StoredAuthorization) => ({
  domain: stored.domain,
  types: TYPES,
  primaryType: "TransferWithAuthorization" as const,
  message: { ...stored.message, value: BigInt(stored.message.value), validAfter: BigInt(stored.message.validAfter), validBefore: BigInt(stored.message.validBefore) },
});

/** The same, as JSON for the app (numbers as strings; the wallet's signer reads them as uint256). */
export const serializableTypedData = (stored: StoredAuthorization) => ({
  domain: stored.domain as Record<string, unknown>,
  types: TYPES as unknown as Record<string, { name: string; type: string }[]>,
  primaryType: "TransferWithAuthorization",
  message: stored.message as Record<string, unknown>,
});

/** The signature is the sender's, over exactly the stored message (the message itself matched the draft when made). */
export async function signedBySender(stored: StoredAuthorization, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: stored.message.from, ...typedDataOf(stored), signature }).catch(() => false);
}

/** The relayer sends it and pays the fee; returns the transaction hash. */
export async function relayAuthorization(clients: NetworkClients, stored: StoredAuthorization, signature: Hex): Promise<Hex> {
  const { v, r, s, yParity } = parseSignature(signature);
  const recovery = v ?? BigInt(yParity) + LEGACY_V_OFFSET;
  const { message } = stored;
  return clients.relayer.writeContract({
    address: stored.domain.verifyingContract,
    abi: EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [message.from, message.to, BigInt(message.value), BigInt(message.validAfter), BigInt(message.validBefore), message.nonce, Number(recovery), r, s],
    chain: clients.network.viemChain,
    account: clients.relayer.account!,
  });
}
