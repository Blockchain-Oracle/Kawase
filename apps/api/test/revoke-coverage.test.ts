// H4: what revoke-all, the exit kit and Delete account offer to revoke is every grant the chain would still honour —
// signed, not expired, never revoked on chain — whatever its status here: an allowance set aside by a raise, a widened
// automation's old grant, protection grants left after a manual close (six per position, 90 days), a grant turned off
// in the database only. Not one still waiting for its signature, an expired one, or one already revoked on chain.
// Needs DATABASE_URL; no chain (the on-chain round trip is revoke-onchain-testnet.test.ts).
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { createDb, grants, users, wallets } from "@kawase/db";

import { WalletService } from "../src/wallet/service";
import { noChains } from "./helpers";

const url = process.env.DATABASE_URL;
const DAY_MS = 86_400_000;
const hex = (bytes: number) => `0x${randomBytes(bytes).toString("hex")}`;

test("revoke-all covers every signed, unexpired grant not revoked on chain, whatever its status", { skip: !url }, async () => {
  const { db, pool } = createDb(url!, { poolSize: 2 });
  const [user] = await db.insert(users).values({ isAnonymous: false, email: `revoke-all-${randomUUID()}@example.test`, activeNetwork: "mainnet" }).returning();
  after(async () => {
    await db.delete(users).where(eq(users.id, user!.id));
    await pool.end();
  });
  const [wallet] = await db.insert(wallets).values({ userId: user!.id, role: "user", status: "active", address: hex(20), custody: "turnkey" } as never).returning();
  const grant = async (name: string, values: Partial<typeof grants.$inferInsert> & { signed?: boolean; expired?: boolean }) => {
    const { signed = true, expired = false, ...rest } = values;
    const [row] = await db
      .insert(grants)
      .values({
        userId: user!.id,
        network: "mainnet",
        kind: "allowance",
        delegatorWalletId: wallet!.id,
        delegateAddress: hex(20),
        delegation: { signature: signed ? hex(65) : "0x" },
        delegationHash: hex(32),
        receipt: { name },
        periodAmount: 0n,
        periodSeconds: 0,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + (expired ? -DAY_MS : 90 * DAY_MS)),
        status: "active",
        ...rest,
      })
      .returning({ id: grants.id });
    return { name, id: row!.id };
  };
  const covered = [
    await grant("the everyday allowance", {}),
    await grant("an allowance a raise set aside", { status: "superseded" }),
    await grant("a widened automation's old grant", { kind: "automation", status: "superseded" }),
    await grant("protection left after a manual close", { kind: "margin_protection", receipt: { purpose: "approveRouter", positionId: randomUUID() } }),
    await grant("protection turned off in the database only", { kind: "margin_protection", status: "revoked" }),
    await grant("a marketplace grant superseded", { kind: "marketplace", status: "superseded" }),
  ];
  const left = [
    await grant("waiting for its signature", { status: "pending", signed: false }),
    await grant("expired", { expired: true }),
    await grant("revoked on chain", { status: "revoked", revokeTxAttemptId: randomUUID() }),
    await grant("on the other network", { network: "testnet" }),
  ];
  const ids = new Set(await new WalletService(db, noChains).unrevokedGrantIds(user!.id, "mainnet"));
  for (const entry of covered) assert.ok(ids.has(entry.id), `revoke-all covers ${entry.name}`);
  for (const entry of left) assert.ok(!ids.has(entry.id), `revoke-all leaves out ${entry.name}`);
  // Narrowed the way a raise asks: one kind (and token), any status.
  const allowances = new Set(await new WalletService(db, noChains).unrevokedGrantIds(user!.id, "mainnet", { kind: "allowance" }));
  assert.deepEqual([...allowances].sort(), [covered[0]!.id, covered[1]!.id].sort());
});
