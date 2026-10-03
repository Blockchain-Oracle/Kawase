// M9: what the per-recipient weekly cap counts — sends reserved or made to that one address in the last seven days, in
// the ledger's units, by the address each send's current draft pays. Needs DATABASE_URL; no chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { createDb, intentDrafts, intents, spendLedger, users } from "@kawase/db";

import { spentTo } from "../src/send/facts";
import "./helpers";

const url = process.env.DATABASE_URL;
const DAY_MS = 86_400_000;
const MUM = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

test("the per-recipient cap counts this week's sends to that address only", { skip: !url }, async () => {
  const { db, pool } = createDb(url!, { poolSize: 2 });
  const [user] = await db.insert(users).values({ isAnonymous: false, email: `spent-to-${randomUUID()}@example.test`, activeNetwork: "mainnet" }).returning();
  after(async () => {
    await db.delete(users).where(eq(users.id, user!.id));
    await pool.end();
  });
  const send = async (to: string, amount: bigint, state: "reserved" | "committed" | "released", daysAgo = 0) => {
    const [intent] = await db
      .insert(intents)
      .values({ userId: user!.id, network: "mainnet", kind: "send", originSurface: "chat", request: {}, currentDraftVersion: 1, expiresAt: new Date(Date.now() + DAY_MS) })
      .returning({ id: intents.id });
    await db.insert(intentDrafts).values({ intentId: intent!.id, version: 1, payload: { draft: { to: to.toUpperCase().replace("0X", "0x") } }, policyReport: {}, createdBy: "agent" });
    await db.insert(spendLedger).values({ userId: user!.id, network: "mainnet", intentId: intent!.id, category: "send", asset: "USDC", amount, state, createdAt: new Date(Date.now() - daysAgo * DAY_MS) });
    return intent!.id;
  };
  const now = await send(MUM, 50_000_000n, "committed");
  await send(MUM, 30_000_000n, "reserved", 3);
  await send(MUM, 70_000_000n, "released"); // never went
  await send(MUM, 90_000_000n, "committed", 8); // more than a week ago
  await send(BOB, 40_000_000n, "committed"); // someone else
  assert.equal(await spentTo(db, user!.id, "mainnet", "USDC", MUM, undefined), 80_000_000n);
  assert.equal(await spentTo(db, user!.id, "mainnet", "USDC", MUM.toUpperCase().replace("0X", "0x"), undefined), 80_000_000n, "an address in any case is the same address");
  assert.equal(await spentTo(db, user!.id, "mainnet", "USDC", MUM, now), 30_000_000n, "a send being re-checked does not count itself");
  assert.equal(await spentTo(db, user!.id, "mainnet", "EURC", MUM, undefined), 0n);
  assert.equal(await spentTo(db, user!.id, "mainnet", "USDC", BOB, undefined), 40_000_000n);
});
