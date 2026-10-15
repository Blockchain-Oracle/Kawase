// Gas-free sends (plan §A.4 12, §B "Gas"): Arc gas is paid in USDC, so a wallet sending its last USDC (or holding
// only EURC) has nothing left for the fee — a dead end. Circle's USDC and EURC on Arc implement EIP-3009
// (`transferWithAuthorization`; read on chain 10-02: name "USDC"/"EURC", version "2", on testnet and mainnet), so the
// person signs one typed message with Face ID — from, to, exactly this amount, valid for minutes, a fresh nonce — and
// Kawase's relayer sends it and pays the fee. The signature can only ever move that amount to that recipient once.
// Kawase pays the fee (shown on the card). What the relayer may spend is bounded (security review H5): a per-person
// daily count of relayed transactions and share of its gas, and a daily gas budget per network, each checked under a
// lock together with the attempt row that reserves the gas, so parallel requests cannot all fit.
import { randomBytes } from "node:crypto";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { parseAbi, parseSignature, toHex, verifyTypedData, type Address, type Hex } from "viem";

import { MIN_MAX_FEE_PER_GAS_GWEI, MS_PER_SECOND, RELAYED_SENDS_PER_DAY, RELAYER_DAILY_GAS_BUDGET, RELAYER_GAS_PER_PERSON_DAY } from "@kawase/config";
import { txAttempts, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { NetworkClients } from "../wallet/chain";

const MS_PER_DAY = 86_400_000;
const GWEI = 1_000_000_000n;
const ZERO = 0n;
const ONE = 1n;
const NONCE_BYTES = 32;
const VERSION = "2";
/** Legacy ECDSA recovery ids are 27/28; viem gives yParity 0/1 for compact signatures. */
const LEGACY_V_OFFSET = 27n;
/** The relayer carries sends only while it holds at least this much gas (0.05 USDC, in Arc's 18-decimal native units). */
export const RELAYER_MIN_GAS = 50_000_000_000_000_000n;

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

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Why the relayer will not carry one more transaction for this person now. */
export type RelayRefusal = "person_limit" | "budget_spent";

/**
 * The person's daily relays: gas-free sends (`send_relayed`) and every relayed batch (`<kind>_relayed`). Setups are
 * apart, and so are revokes: turning a grant off is never refused for having sent too much today (its gas still counts).
 */
const RELAYED_KIND = sql`${txAttempts.kind} like '%\\_relayed' and ${txAttempts.kind} <> 'revoke_grant_relayed'`;
/** The batch kind whose relays are not counted (see RELAYED_KIND). */
export const REVOKE_KIND = "revoke_grant";

/**
 * What the relayer spent or reserved in the last day on this network, all told and for one person, and that person's
 * relayed count. A transaction refused before it was broadcast cost nothing and does not count.
 */
async function relayerUse(executor: Executor, userId: string, network: NetworkId) {
  const [row] = await executor
    .select({
      total: sql<string>`coalesce(sum(${txAttempts.gasCost}), 0)`,
      mine: sql<string>`coalesce(sum(${txAttempts.gasCost}) filter (where ${txAttempts.userId} = ${userId}), 0)`,
      relays: sql<string>`count(*) filter (where ${txAttempts.userId} = ${userId} and ${RELAYED_KIND})`,
    })
    .from(txAttempts)
    .where(
      and(
        eq(txAttempts.provider, "relayer"),
        eq(txAttempts.network, network),
        ne(txAttempts.status, "not_sent"),
        gte(txAttempts.createdAt, new Date(Date.now() - MS_PER_DAY)),
      ),
    );
  return { total: BigInt(row?.total ?? "0"), mine: BigInt(row?.mine ?? "0"), relays: Number(row?.relays ?? 0) };
}

/**
 * Whether the relayer can carry one more transaction for this person costing up to `cost` (Arc native units): within
 * the network's daily gas budget, the person's share of it and, when `counted` (a send or a batch, not a setup), their
 * daily number of relays.
 */
export async function relayRefusal(executor: Executor, input: { userId: string; network: NetworkId; cost: bigint; counted: boolean }): Promise<RelayRefusal | undefined> {
  const use = await relayerUse(executor, input.userId, input.network);
  // Asked before the cost is known (0): any transaction costs something, so a budget used to the last unit is spent.
  const cost = input.cost > ZERO ? input.cost : ONE;
  if (use.total + cost > RELAYER_DAILY_GAS_BUDGET[input.network]) return "budget_spent";
  if ((input.counted && use.relays >= RELAYED_SENDS_PER_DAY) || use.mine + cost > RELAYER_GAS_PER_PERSON_DAY[input.network]) return "person_limit";
  return undefined;
}

/** The lock every send and relayed transaction takes first: one decision at a time per person and network. */
export const lockPerson = (tx: Tx, userId: string, network: NetworkId) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${network}`}, 0))`);

/**
 * The relayer's budget under its network lock, inside the caller's transaction and after `lockPerson` (always in that
 * order): the answer holds until the caller's attempt row, carrying `gasCost`, commits with the transaction.
 */
export async function reserveRelay(tx: Tx, input: { userId: string; network: NetworkId; cost: bigint; counted: boolean }): Promise<RelayRefusal | undefined> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`relayer:${input.network}`}, 0))`);
  return relayRefusal(tx, input);
}

/** The gas price a relayer transaction is reserved at: the network's max fee now, never below Arc's floor. */
export async function relayGasPrice(clients: NetworkClients): Promise<bigint> {
  const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
  const fees = await clients.client.estimateFeesPerGas().catch(() => ({ maxFeePerGas: floor }));
  return fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
}

/** A refusal as the api answers it. */
export const relayProblem = (refusal: RelayRefusal) =>
  refusal === "budget_spent"
    ? problem(HTTP.serviceUnavailable, "relayer_budget_spent", "Kawase's network fees for today are used up; the wallet pays its own fee until then")
    : problem(HTTP.tooManyRequests, "relay_limit", "Kawase has paid this person's network fees enough times today");

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
