// Practice mode never approves a swap, bridge, savings move or margin order for real: the api refuses before anything
// is signed (sends and automations are dry-run in their own pipelines). And the risk dial and practice no longer change
// through PATCH /me — only through /safety, where loosening needs the wallet's signature.
// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { users } from "@kawase/db";

import { deleteUser, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const subOrg = randomUUID();
const turnkeyUser = randomUUID();
const key = turnkeyStyleKeyPair();
const turnkey = fakeTurnkey({ [`${subOrg}/${turnkeyUser}`]: { userId: turnkeyUser, userName: "practice", email: `practice-${subOrg}@example.test`, sessionPublicKeys: [key.publicKeyHex] } });
const { app, db, close } = testApp(turnkey);
let userId = "";
after(async () => {
  if (userId) await deleteUser(db, userId);
  await close();
});

test("practice mode refuses real swaps, bridges, savings moves and margin orders", async () => {
  const { nonce } = (await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string };
  const body = JSON.stringify({ organizationId: subOrg, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: turnkeyUser, device: { platform: "ios", installationId: "practice-guard-0001" } }));
  assert.equal(signIn.status, 201);
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;

  // PATCH /me no longer takes the dial or practice (a loosening would skip the wallet's yes).
  const patched = await app.request("/me", jsonRequest("PATCH", { riskMode: "autonomous", practiceMode: false }, token));
  const after = (await patched.json()) as { user?: { riskMode: string } };
  assert.notEqual(after.user?.riskMode, "autonomous");

  await db.update(users).set({ practiceMode: true }).where(eq(users.id, user.id));
  const id = randomUUID();
  for (const path of [`/swaps/${id}/approve`, `/bridges/${id}/signature`, `/earn/intents/${id}/approve`, `/margin/orders/${id}/approve`]) {
    const response = await app.request(path, jsonRequest("POST", { version: 1 }, token));
    assert.equal(response.status, 409, path);
    assert.match(((await response.json()) as { type: string }).type, /practice_mode/, path);
  }
  // Off again: the same calls reach their routes (which then say the intent does not exist).
  await db.update(users).set({ practiceMode: false }).where(eq(users.id, user.id));
  const real = await app.request(`/swaps/${id}/approve`, jsonRequest("POST", { version: 1 }, token));
  assert.notEqual(real.status, 409);
});
