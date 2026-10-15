// `/i/<id>` for every kind (plan §A.4.11, "uniform continuation for every action"): a move across chains and an Aave
// action open their own live cards (they used to fall through to the margin screen), a withdrawal resumes on Withdraw
// and a paid service call opens the agent wallet. Someone else's id is not found. Database only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import type { IntentLookup } from "@kawase/api-client";
import { intents, marketplacePurchases, users, withdrawals } from "@kawase/db";

import { deleteUser, jsonRequest, testApp } from "./helpers";

const { app, db, close } = testApp();
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

async function account() {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false, email: `links-${randomUUID().slice(0, 8)}@example.test` }).where(eq(users.id, user.id));
  return { id: user.id, open: (id: string) => app.request(`/intents/${id}`, { headers: { authorization: `Bearer ${token}` } }) };
}

test("/i/<id> resolves a cross-chain move, an Aave action, a withdrawal and a paid service call to their own place", async () => {
  const me = await account();
  const stranger = await account();
  const later = new Date(Date.now() + 3_600_000);
  const intent = async (kind: "crosschain" | "lend") =>
    (await db.insert(intents).values({ userId: me.id, network: "testnet", kind, originSurface: "chat", state: "canceled", request: {}, expiresAt: later }).returning())[0]!;
  const move = await intent("crosschain");
  const aave = await intent("lend");
  const [withdrawal] = await db.insert(withdrawals).values({ userId: me.id, network: "testnet", destination: {} as never, steps: [] }).returning();
  const [purchase] = await db
    .insert(marketplacePurchases)
    .values({ userId: me.id, network: "testnet", url: "https://seller.example/news", requestHash: "h", providerName: "newsbot", category: "SEARCH", amount: 10_000n, status: "paid" })
    .returning();

  const read = async (id: string) => (await (await me.open(id)).json()) as IntentLookup;
  const crosschain = await read(move.id);
  assert.equal(crosschain.kind, "crosschain");
  assert.equal(crosschain.kind === "crosschain" && crosschain.intent.id, move.id);
  const lend = await read(aave.id);
  assert.equal(lend.kind, "lend");
  assert.equal(lend.kind === "lend" && lend.intent.id, aave.id);
  assert.deepEqual(await read(withdrawal!.id), { kind: "withdrawal", network: "testnet", threadId: null, withdrawalId: withdrawal!.id });
  assert.deepEqual(await read(purchase!.id), { kind: "purchase", network: "testnet", threadId: null, purchaseId: purchase!.id });
  for (const id of [move.id, withdrawal!.id, purchase!.id]) assert.equal((await stranger.open(id)).status, 404);
});
