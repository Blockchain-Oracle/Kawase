// M7: the money paths read the real pause state, not a hard-coded "not paused". The read is fresh (the database, not
// the session), and the moves that run without the person — an Auto-save move, a bridge rule — stop at the service
// itself while everything is paused, whoever asks. Needs DATABASE_URL; no chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import type { Address, Hex } from "viem";

import { createDb, users } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { BridgeService } from "../src/bridge/service";
import { noBridges } from "../src/bridge/engine";
import { EarnService } from "../src/earn/service";
import { noEarn } from "../src/earn/engine";
import { pausedAll } from "../src/safety/settings";
import { WalletService } from "../src/wallet/service";
import { noChains } from "./helpers";

const url = process.env.DATABASE_URL;

test("pause is read fresh, and unattended earn and bridge moves stop at the service while paused", { skip: !url }, async () => {
  const { db, pool } = createDb(url!, { poolSize: 2 });
  const log = createLogger({ service: "pause-reads-test", level: "silent" });
  const [user] = await db.insert(users).values({ isAnonymous: false, email: `pause-${randomUUID()}@example.test` }).returning();
  after(async () => {
    await db.delete(users).where(eq(users.id, user!.id));
    await pool.end();
  });
  const wallets = new WalletService(db, noChains);
  const earn = new EarnService(db, noChains, wallets, noEarn, log);
  const bridges = new BridgeService(db, noChains, wallets, noBridges, log);
  const unused = "0x0000000000000000000000000000000000000001" as Address;
  const grant = { delegate: unused, delegator: unused, authority: "0x" as Hex, caveats: [], salt: "0x" as Hex, signature: "0x" as Hex };
  const runSave = () => earn.runSave({ userId: user!.id, network: "testnet", intentId: randomUUID(), grants: { approve: grant, deposit: grant, withdraw: grant }, vault: unused, direction: "in", amount: 1n });
  const runBridge = () => bridges.runBridge({ userId: user!.id, network: "testnet", intentId: randomUUID(), grants: { allowance: grant, burn: grant }, destination: "base", amount: 1n });

  assert.equal(await pausedAll(db, user!.id), false);
  // Not paused: each move gets past the pause and stops at the next thing it lacks here (no ops wallet in this test).
  assert.deepEqual(await runSave(), { status: "skipped", reason: "NOT_AVAILABLE_YET" });
  assert.deepEqual(await runBridge(), { status: "skipped", reason: "NOT_AVAILABLE_YET" });

  // "Pause everything" (as Wallet & limits and the exit kit set it): the very next read sees it.
  await db.update(users).set({ pausedAllAt: new Date() }).where(eq(users.id, user!.id));
  assert.equal(await pausedAll(db, user!.id), true);
  assert.deepEqual(await runSave(), { status: "skipped", reason: "PAUSED_ALL" });
  assert.deepEqual(await runBridge(), { status: "skipped", reason: "PAUSED_ALL" });

  // Resumed: they go on again.
  await db.update(users).set({ pausedAllAt: null }).where(eq(users.id, user!.id));
  assert.deepEqual(await runSave(), { status: "skipped", reason: "NOT_AVAILABLE_YET" });
});
