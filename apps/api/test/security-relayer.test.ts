// H5 (security review 2026-10-03): Kawase's gas relayer cannot be drained. A 7702 setup is sponsored only for the
// wallet's own authorization at its current nonce, never for a wallet already set up, and only so many times per
// wallet; relayed batches (payouts, revokes, rails) are simulated before the relayer pays, counted per person under the
// person's lock, and the network's daily gas budget refuses everything past it with a clear reason; the same request
// submitted twice is sent once. The chain is in memory (the relayer's sends are counted); the database is real.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { keccak256, toHex, type Address, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { RELAYED_SENDS_PER_DAY, RELAYER_DAILY_GAS_BUDGET, SPONSORED_SETUP_ATTEMPTS } from "@kawase/config";
import { createDb, txAttempts, users, wallets } from "@kawase/db";
import { DELEGATION_FRAMEWORK, getNetwork, type NetworkId } from "@kawase/networks";

import { ProblemError } from "../src/http/problem";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
const SET_UP_CODE = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const GWEI = 1_000_000_000n;
const FEE = 40n * GWEI;
const RELAYER_GAS = 10n ** 18n;
const ESTIMATE = 100_000n;

/** One network's chain in memory: what the wallet's code is, whether the redeem would revert, and every relayed send. */
function fakeChain(id: NetworkId) {
  const state = { code: "0x" as Hex, setsUpOnSend: true, reverts: false, sends: 0, nonce: 0 };
  const relayerAddress = privateKeyToAccount(generatePrivateKey()).address;
  const clients = {
    network: getNetwork(id),
    relayerAddress,
    ops: { walletId: "ops", address: relayerAddress },
    client: {
      getCode: async () => state.code,
      getBalance: async () => RELAYER_GAS,
      getTransactionCount: async () => state.nonce,
      estimateFeesPerGas: async () => ({ maxFeePerGas: FEE, maxPriorityFeePerGas: GWEI }),
      estimateGas: async () => {
        if (state.reverts) throw new Error("execution reverted");
        return ESTIMATE;
      },
      waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: "success", transactionHash: hash, gasUsed: ESTIMATE / 2n, effectiveGasPrice: FEE / 2n, logs: [] }),
    },
    relayer: {
      account: { address: relayerAddress },
      sendTransaction: async () => {
        state.sends += 1;
        if (state.setsUpOnSend) state.code = SET_UP_CODE;
        // A moment on the wire, so requests at the same time overlap.
        await new Promise((resolve) => setTimeout(resolve, 30));
        return keccak256(toHex(`${relayerAddress}:${state.sends}:${randomUUID()}`));
      },
    },
  } as unknown as NetworkClients;
  const chains: Chains = { available: [id], get: (network) => (network === id ? clients : undefined) };
  return { state, chains };
}

const { db, pool } = url ? createDb(url, { poolSize: 6 }) : ({} as ReturnType<typeof createDb>);
const made: string[] = [];

async function person() {
  const key = privateKeyToAccount(generatePrivateKey());
  const [row] = await db.insert(users).values({ isAnonymous: false, email: `relayer-${randomUUID()}@example.test` }).returning();
  await db.insert(wallets).values({ userId: row!.id, role: "user", custody: "turnkey", address: key.address, providerRef: {} });
  made.push(row!.id);
  return { userId: row!.id, key };
}

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "sent";
  } catch (error) {
    return error instanceof ProblemError ? error.code : String(error);
  }
};

before(() => undefined);
after(async () => {
  if (!url) return;
  for (const id of made) await db.delete(users).where(eq(users.id, id));
  await pool.end();
});

test("a setup is sponsored only for the wallet's own authorization at its nonce, once per wallet", { skip: !url }, async () => {
  const { state, chains } = fakeChain("testnet");
  const service = new WalletService(db, chains);
  const { userId, key } = await person();
  const network = getNetwork("testnet");
  const authorize = (signer: typeof key, nonce: number) =>
    signer.signAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator as Address, chainId: network.chainId, nonce });

  // Someone else's signature, or the right one for another nonce: refused before the relayer pays anything.
  const stranger = privateKeyToAccount(generatePrivateKey());
  assert.equal(await refusal(service.setupSubmit(userId, "testnet", await authorize(stranger, 0))), "signature_mismatch");
  assert.equal(await refusal(service.setupSubmit(userId, "testnet", await authorize(key, 5))), "validation");
  assert.equal(state.sends, 0);

  // The wallet's own, at its nonce: sent once. Asked again once set up: nothing is sent.
  const done = await service.setupSubmit(userId, "testnet", await authorize(key, 0));
  assert.equal(done.setUp, true);
  assert.equal(state.sends, 1);
  const again = await service.setupSubmit(userId, "testnet", await authorize(key, 0));
  assert.deepEqual(again, { tx: null, setUp: true });
  assert.equal(state.sends, 1, "a wallet already set up is never set up again");

  // A wallet that keeps asking (the setup lands but the code is gone again) gets a set number of relayed attempts.
  const other = await person();
  state.code = "0x";
  state.setsUpOnSend = false;
  for (let attempt = 0; attempt < SPONSORED_SETUP_ATTEMPTS; attempt++) assert.equal(await refusal(service.setupSubmit(other.userId, "testnet", await authorize(other.key, 0))), "upstream");
  const sendsBefore = state.sends;
  assert.equal(await refusal(service.setupSubmit(other.userId, "testnet", await authorize(other.key, 0))), "relay_limit");
  assert.equal(state.sends, sendsBefore, "past the attempts, nothing is sent");
});

test("relayed batches: simulated first, sent once per request, counted per person under the lock", { skip: !url }, async () => {
  const { state, chains } = fakeChain("testnet");
  state.code = SET_UP_CODE;
  state.setsUpOnSend = false;
  const service = new WalletService(db, chains);
  const { userId, key } = await person();
  const call = { to: privateKeyToAccount(generatePrivateKey()).address, data: "0x" as Hex };
  const signed = async () => {
    const request = await service.relayedBatchRequest(userId, "testnet", "payout", [call]);
    return { requestId: request.requestId, signature: await key.signTypedData(request.typedData as unknown as TypedDataDefinition) };
  };

  // A redeem that would revert (used, expired, failing) costs nothing, and the request stays open for another try.
  const failing = await signed();
  state.reverts = true;
  assert.equal(await refusal(service.submitRelayedBatch(userId, failing.requestId, failing.signature)), "simulation_failed");
  assert.equal(state.sends, 0);
  state.reverts = false;

  // The same request twice at once (a double tap): one send, one answer for both.
  const [first, second] = await Promise.all([
    service.submitRelayedBatch(userId, failing.requestId, failing.signature),
    service.submitRelayedBatch(userId, failing.requestId, failing.signature),
  ]);
  assert.equal(state.sends, 1);
  assert.equal(first.tx, second.tx);
  const [attempt] = await db.select().from(txAttempts).where(eq(txAttempts.txHash, first.tx));
  assert.equal(attempt!.gasCost, (ESTIMATE / 2n) * (FEE / 2n), "what the receipt says it paid");

  // One relay short of the day's count, two batches at once: one goes, the other is refused under the lock.
  const earlier = Array.from({ length: RELAYED_SENDS_PER_DAY - 2 }, () => ({
    userId,
    network: "testnet" as const,
    chainId: getNetwork("testnet").chainId,
    kind: "send_relayed",
    provider: "relayer" as const,
    idempotencyKey: randomUUID(),
    fromAddress: call.to,
    status: "confirmed" as const,
    gasCost: 1n,
  }));
  await db.insert(txAttempts).values(earlier);
  const [a, b] = [await signed(), await signed()];
  const outcomes = await Promise.all([refusal(service.submitRelayedBatch(userId, a.requestId, a.signature)), refusal(service.submitRelayedBatch(userId, b.requestId, b.signature))]);
  assert.deepEqual(outcomes.sort(), ["relay_limit", "sent"]);
  assert.equal(state.sends, 2);
  // And the next request is refused before the person is asked to sign anything.
  assert.equal(await refusal(service.relayedBatchRequest(userId, "testnet", "payout", [call])), "relay_limit");
  // Turning a grant off is not one of the day's relays.
  assert.equal(await refusal(service.relayedBatchRequest(userId, "testnet", "revoke_grant", [call])), "sent");
});

test("the relayer's daily gas budget refuses everything past it, with its own reason", { skip: !url }, async () => {
  // Mainnet rows here (the mainnet relayer carries nothing in local tests), removed straight after.
  const { state, chains } = fakeChain("mainnet");
  state.code = SET_UP_CODE;
  const service = new WalletService(db, chains);
  const spender = await person();
  const { userId } = await person();
  const [row] = await db
    .insert(txAttempts)
    .values({
      userId: spender.userId,
      network: "mainnet",
      chainId: getNetwork("mainnet").chainId,
      kind: "payout_relayed",
      provider: "relayer",
      idempotencyKey: randomUUID(),
      fromAddress: spender.key.address,
      status: "confirmed",
      gasCost: RELAYER_DAILY_GAS_BUDGET.mainnet,
    })
    .returning({ id: txAttempts.id });
  try {
    const call = { to: privateKeyToAccount(generatePrivateKey()).address, data: "0x" as Hex };
    assert.equal(await refusal(service.relayedBatchRequest(userId, "mainnet", "payout", [call])), "relayer_budget_spent");
  } finally {
    await db.delete(txAttempts).where(eq(txAttempts.id, row!.id));
  }
  assert.equal(state.sends, 0);
});
