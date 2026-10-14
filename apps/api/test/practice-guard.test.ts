// Practice mode never moves money for real: on the money routes only drafting, revising, cancelling, asking for what to
// sign and turning things off go through; every approve, signature, submit, batch, activation or top-up is refused
// before anything is signed (sends and automations are dry-run in their own pipelines). And the risk dial and practice no longer change
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

test("practice mode refuses every real money move, and lets drafting through", async () => {
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
  const refusedInPractice = [
    `/swaps/${id}/approve`,
    `/bridges/${id}/signature`,
    `/earn/intents/${id}/approve`,
    `/margin/orders/${id}/approve`,
    // What the old list missed (security review, Low): cross-chain, lend, the withdrawal batch, protection.
    `/crosschain/orders/${id}/approve`,
    `/crosschain/orders/${id}/signature`,
    `/lend/orders/${id}/approve`,
    `/lend/orders/${id}/signature`,
    `/withdrawals/${id}/batch`,
    `/withdrawals/${id}/batch/signature`,
    "/margin/protection/grant/activate",
    "/marketplace/agent-wallet/top-up",
    "/marketplace/agent-wallet/grant/submit",
    "/marketplace/agent-wallet/return",
    // A write nobody listed yet is refused too (the list names what is safe, not what is not).
    `/lend/orders/${id}/something-new`,
  ];
  for (const path of refusedInPractice) {
    const response = await app.request(path, jsonRequest("POST", { version: 1 }, token));
    assert.equal(response.status, 409, path);
    assert.match(((await response.json()) as { type: string }).type, /practice_mode/, path);
  }
  // Drafting, revising, cancelling, targets and turning protection off still reach their routes while practising.
  const reachable: [string, string][] = [
    ["POST", "/crosschain/orders"],
    ["POST", `/lend/orders/${id}/cancel`],
    ["PATCH", `/swaps/${id}`],
    ["POST", "/withdrawals/plan"],
    ["POST", `/withdrawals/${id}/next`],
    ["PUT", `/margin/positions/${id}/protection`],
    ["DELETE", "/margin/protection/grant"],
  ];
  for (const [method, path] of reachable) {
    const response = await app.request(path, jsonRequest(method, {}, token));
    const type = response.status === 409 ? ((await response.json()) as { type?: string }).type ?? "" : "";
    assert.doesNotMatch(type, /practice_mode/, `${method} ${path}`);
  }
  // Reads are never refused.
  assert.notEqual((await app.request("/withdrawals", { headers: { authorization: `Bearer ${token}` } })).status, 409);
  // Off again: the same calls reach their routes (which then say the intent does not exist).
  await db.update(users).set({ practiceMode: false }).where(eq(users.id, user.id));
  const real = await app.request(`/swaps/${id}/approve`, jsonRequest("POST", { version: 1 }, token));
  assert.notEqual(real.status, 409);
});
