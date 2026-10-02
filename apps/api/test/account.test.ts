// Settings → Account through the api (cards/access.md): two devices signed in to one account, each remembered with the
// Turnkey session key that proved it; signing one out from the other revokes its session at once and hands back that
// key (for the app to delete at Turnkey); deleting the account needs the @handle typed, deletes the account, holds the
// handle for 30 days against anyone else, and leaves an audit row in an unbroken hash chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { desc, eq } from "drizzle-orm";

import { auditLog, handleHolds } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { AuditWriter } from "../src/audit/writer";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const AUDIT_ROWS_CHECKED = 50;

test("devices, signing one out, and deleting the account with the handle held", async () => {
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const phone = turnkeyStyleKeyPair();
  const laptop = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey({
    [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "owner", email: `acct-${SUB_ORG}@example.test`, sessionPublicKeys: [phone.publicKeyHex, laptop.publicKeyHex] },
  });
  const { app, db, close } = testApp(turnkey);
  const handle = `del${SUB_ORG.slice(0, 8)}`;
  let userId = "";
  let otherUserId = "";
  after(async () => {
    await db.delete(handleHolds).where(eq(handleHolds.handle, handle));
    if (userId) await deleteUser(db, userId).catch(() => undefined);
    if (otherUserId) await deleteUser(db, otherUserId).catch(() => undefined);
    await close();
  });

  const signIn = async (key: typeof phone, installationId: string) => {
    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
    const response = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId } }));
    await expectStatus(response, 201, "sign-in");
    return ((await response.json()) as { token: string }).token;
  };
  const phoneToken = await signIn(phone, "acct-phone-0001");
  const laptopToken = await signIn(laptop, "acct-laptop-0001");
  const as = (token: string) => (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const fromPhone = as(phoneToken);
  const fromLaptop = as(laptopToken);
  userId = ((await (await fromPhone("GET", "/me")).json()) as { user: { id: string } }).user.id;

  // 1. Both devices, each with the Turnkey key that proved its sign-in; the phone is "this device".
  await expectStatus(await fromPhone("PATCH", "/account/devices/current", { name: "Test iPhone", appVersion: "1.0.0" }), 204, "name");
  const { devices } = (await (await fromPhone("GET", "/account/devices")).json()) as { devices: { id: string; name: string | null; current: boolean; signedIn: boolean; turnkeyPublicKey: string | null }[] };
  assert.equal(devices.length, 2);
  const mine = devices.find((device) => device.current)!;
  const other = devices.find((device) => !device.current)!;
  assert.equal(mine.name, "Test iPhone");
  assert.equal(mine.turnkeyPublicKey, phone.publicKeyHex);
  assert.equal(other.turnkeyPublicKey, laptop.publicKeyHex);

  // 2. Sign the laptop out from the phone: its session dies at once; its Turnkey key comes back to delete.
  const out = (await (await fromPhone("POST", `/account/devices/${other.id}/sign-out`)).json()) as { turnkeyPublicKey: string };
  assert.equal(out.turnkeyPublicKey, laptop.publicKeyHex);
  assert.equal((await fromLaptop("GET", "/me")).status, 401, "the laptop's session is revoked");
  assert.equal((await fromPhone("GET", "/me")).status, 200, "the phone stays signed in");

  // 3. Delete: the handle must be typed; then the account is gone and the handle is held.
  await expectStatus(await fromPhone("PATCH", "/me", { handle }), 200, "handle");
  assert.equal((await fromPhone("POST", "/account/delete", { confirm: "@someone-else" })).status, 422);
  const deleted = (await (await fromPhone("POST", "/account/delete", { confirm: `@${handle}` })).json()) as { deleted: boolean; handleHeldDays: number };
  assert.deepEqual(deleted, { deleted: true, handleHeldDays: 30 });
  assert.equal((await fromPhone("GET", "/me")).status, 401, "every session went with the account");
  userId = "";

  // 4. Someone else cannot take the held handle.
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { platform: "ios", installationId: "acct-other-0001" } }));
  const guestToken = ((await guest.json()) as { token: string }).token;
  const otherSub = randomUUID();
  const otherUser = randomUUID();
  const otherKey = turnkeyStyleKeyPair();
  const turnkey2 = fakeTurnkey({ [`${otherSub}/${otherUser}`]: { userId: otherUser, userName: "next", email: `next-${otherSub}@example.test`, sessionPublicKeys: [otherKey.publicKeyHex] } });
  const second = testApp(turnkey2);
  try {
    const nonce = ((await (await second.app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: otherSub, activityId: nonce });
    const response = await second.app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, otherKey) }, turnkeyUserId: otherUser, device: { platform: "ios", installationId: "acct-next-0001" } }, guestToken));
    const { token } = (await response.json()) as { token: string };
    otherUserId = ((await (await second.app.request("/me", { headers: { authorization: `Bearer ${token}` } })).json()) as { user: { id: string } }).user.id;
    const taken = await second.app.request("/me", jsonRequest("PATCH", { handle }, token));
    assert.equal(taken.status, 409, await taken.clone().text());
  } finally {
    await second.close();
  }

  // 5. The deletion is in the audit log, and the chain verifies.
  const [last] = await db.select().from(auditLog).where(eq(auditLog.action, "account.deleted")).orderBy(desc(auditLog.createdAt)).limit(1);
  assert.ok(last, "an audit row for the deletion");
  assert.equal(last.userId, null);
  assert.equal(await new AuditWriter(db, createLogger({ service: "audit-test", level: "silent" })).verify(AUDIT_ROWS_CHECKED), true);
});
