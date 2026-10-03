// M7, payouts part (security review 2026-10-03): every payout line goes through the same send rules as a single send.
// A contact whose address changed is on hold, the person's limits apply with each line counted on top of the ones
// before it, and the batch's spend is reserved in the ledger under the person's lock when the signed batch comes back,
// so it counts against later sends and payouts. The chain is in memory; the database is real.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { contactAddresses, contacts, createDb, limits, spendLedger, users, wallets } from "@kawase/db";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { AuditWriter } from "../src/audit/writer";
import { PayoutService } from "../src/business/payouts";
import { ContactService } from "../src/contacts/service";
import { ProblemError } from "../src/http/problem";
import { spent } from "../src/send/facts";
import { Recipients } from "../src/send/recipients";
import type { SessionUser } from "../src/types";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import type { WalletService } from "../src/wallet/service";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
const usdc = (value: string) => parseUnits(value, 6);
const address = () => privateKeyToAccount(generatePrivateKey()).address;
const HOUR_MS = 3_600_000;

/** Arc testnet with plain accounts everywhere and plenty of USDC in the wallet. */
const chains: Chains = {
  available: ["testnet"],
  get: () =>
    ({
      network: getNetwork("testnet"),
      relayerAddress: address(),
      ops: { walletId: "ops", address: address() },
      client: {
        getCode: async () => "0x",
        getBalance: async () => 0n,
        estimateFeesPerGas: async () => ({ maxFeePerGas: 40_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
        readContract: async ({ functionName }: { functionName: string }) => (functionName === "isBlacklisted" ? false : usdc("1000")),
      },
    }) as unknown as NetworkClients,
};

const { db, pool } = url ? createDb(url, { poolSize: 4 }) : ({} as ReturnType<typeof createDb>);
let user: SessionUser;
let walletAddress: Address;
const sent: string[] = [];

/** The wallet as payouts use it: the batch is "signed" and confirmed at once. */
const walletStub = {
  userWallet: async () => ({ address: walletAddress }),
  submitTransaction: async () => {
    const tx = `0x${randomUUID().replace(/-/g, "").padEnd(64, "0")}` as Hex;
    sent.push(tx);
    return { tx, status: "confirmed" as const };
  },
} as unknown as WalletService;

const service = () => {
  const log = createLogger({ service: "payouts-m7-test", level: "silent" });
  return new PayoutService(db, chains, walletStub, new Recipients(db, new ContactService(db)), new AuditWriter(db, log));
};

before(async () => {
  if (!url) return;
  walletAddress = address();
  const [row] = await db.insert(users).values({ isAnonymous: false, email: `payouts-m7-${randomUUID()}@example.test` }).returning();
  await db.insert(wallets).values({ userId: row!.id, role: "user", custody: "turnkey", address: walletAddress, providerRef: {} });
  user = { ...row!, activeNetwork: "testnet" } as unknown as SessionUser;
  // 5 USDC a payment, 10 a day.
  await db.insert(limits).values([
    { userId: user.id, network: "testnet", kind: "per_tx", value: usdc("5") },
    { userId: user.id, network: "testnet", kind: "daily", value: usdc("10") },
  ]);
});

after(async () => {
  if (!url) return;
  if (user) await db.delete(users).where(eq(users.id, user.id));
  await pool.end();
});

test("payout lines go through the send rules: limits per line and per day, and a changed address on hold", { skip: !url }, async () => {
  // Bob's address changed an hour ago: the new one waits out its cooldown.
  const [bob] = await db.insert(contacts).values({ userId: user.id, displayName: "Bob" }).returning();
  const old = address();
  await db.insert(contactAddresses).values([
    { contactId: bob!.id, userId: user.id, address: old, source: "typed", status: "active", isPreferred: true },
    { contactId: bob!.id, userId: user.id, address: address(), source: "typed", status: "pending_cooldown", isPreferred: false, version: 2, activatesAt: new Date(Date.now() + HOUR_MS) },
  ]);
  const result = await service().create(user, {
    asset: "USDC",
    lines: [
      { recipient: address(), amount: "4" },
      { recipient: address(), amount: "6" },
      { recipient: address(), amount: "4" },
      { recipient: address(), amount: "4" },
      { recipient: "Bob", amount: "1" },
    ],
  });
  assert.equal(result.payout, null);
  assert.deepEqual(
    result.problems.map((entry) => [entry.index, entry.problem]),
    [
      [1, "limit"], // 6 is over 5 a payment
      [2, "limit"], // 4 + 6 + 4: the batch as typed is over 10 a day from here on
      [3, "limit"],
      [4, "hold"], // the hold is said first (Bob would also be over the day)
    ],
  );
});

test("a payout's spend is reserved under the lock and counts against what comes after", { skip: !url }, async () => {
  const payouts = service();
  const first = await payouts.create(user, { asset: "USDC", lines: [{ recipient: address(), amount: "3" }, { recipient: address(), amount: "3" }] });
  assert.ok(first.payout, JSON.stringify(first.problems));
  const second = await payouts.create(user, { asset: "USDC", lines: [{ recipient: address(), amount: "5" }] });
  assert.ok(second.payout, "on its own it fits");

  const done = await payouts.submit(user, first.payout.id, { requestId: randomUUID(), signedTransaction: "0x01" });
  assert.equal(done.status, "confirmed");
  const [reserved] = await db.select().from(spendLedger).where(eq(spendLedger.payoutId, first.payout.id));
  assert.equal(reserved!.amount, usdc("6"));
  assert.equal(reserved!.state, "committed");
  assert.equal((await spent(db, user.id, "testnet", "USDC", randomUUID())).day, usdc("6"), "sends see the payout's spend");

  // 6 already out today: the second payout (5) no longer fits the 10-a-day limit, and nothing is sent.
  const before = sent.length;
  await assert.rejects(payouts.submit(user, second.payout.id, { requestId: randomUUID(), signedTransaction: "0x01" }), (error: unknown) => error instanceof ProblemError && error.code === "intent_blocked");
  assert.equal(sent.length, before);
  const [still] = await db.select().from(spendLedger).where(and(eq(spendLedger.payoutId, second.payout.id)));
  assert.equal(still, undefined, "nothing reserved for a payout that did not go");
});
