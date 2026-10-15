// Settings → Account through the api (cards/access.md): two devices signed in to one account, each with its own Privy
// session; signing one out from the other revokes its Kawase session at once and refuses its Privy session from then on
// (it must sign in afresh); deleting the account needs the @handle typed, deletes the account, holds the handle for 30
// days against anyone else, and leaves an audit row in an unbroken hash chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { desc, eq } from "drizzle-orm";

import { auditLog, handleHolds } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { AuditWriter } from "../src/audit/writer";
import { renderNotification } from "../src/notify/render";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, privyTokens, testApp } from "./helpers";

const AUDIT_ROWS_CHECKED = 50;
const POLL_ATTEMPTS = 20;
const POLL_MS = 500;

test("devices, signing one out, and deleting the account with the handle held", async () => {
  const TEST_ID = randomUUID();
  const person = privyPerson(`acct-${TEST_ID}@example.test`);
  const { app, db, close } = testApp();
  const handle = `del${TEST_ID.slice(0, 8)}`;
  let userId = "";
  let otherUserId = "";
  after(async () => {
    await db.delete(handleHolds).where(eq(handleHolds.handle, handle));
    if (userId) await deleteUser(db, userId).catch(() => undefined);
    if (otherUserId) await deleteUser(db, otherUserId).catch(() => undefined);
    await close();
  });

  const signIn = async (installationId: string, ip?: string) => {
    const device = { platform: "ios", installationId };
    const response = ip
      ? await app.request("/auth/privy", { ...jsonRequest("POST", { ...privyTokens(person, { device: installationId }), device }), headers: { "content-type": "application/json", "x-forwarded-for": ip } })
      : await privySignIn(app, person, device);
    await expectStatus(response, 201, "sign-in");
    return ((await response.json()) as { token: string }).token;
  };
  const phoneToken = await signIn("acct-phone-0001");
  // A second device signs in from a public address (Google's resolver, as Traefik would forward it).
  const laptopToken = await signIn("acct-laptop-0001", "8.8.8.8");
  const as = (token: string) => (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const fromPhone = as(phoneToken);
  const fromLaptop = as(laptopToken);
  userId = ((await (await fromPhone("GET", "/me")).json()) as { user: { id: string } }).user.id;

  // 1. Both devices; the phone is "this device".
  await expectStatus(await fromPhone("PATCH", "/account/devices/current", { name: "Test iPhone", appVersion: "1.0.0" }), 204, "name");
  const { devices } = (await (await fromPhone("GET", "/account/devices")).json()) as { devices: { id: string; name: string | null; current: boolean; signedIn: boolean }[] };
  assert.equal(devices.length, 2);
  const mine = devices.find((device) => device.current)!;
  const other = devices.find((device) => !device.current)!;
  assert.equal(mine.name, "Test iPhone");
  assert.ok(devices.every((device) => device.signedIn), "both devices read as signed in");

  // The new device got a place from its address (DB-IP's free API), and the account a "new sign-in" notice.
  let located: { location: string | null } | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !located?.location; attempt++) {
    const list = (await (await fromPhone("GET", "/account/devices")).json()) as { devices: { id: string; location: string | null }[] };
    located = list.devices.find((device) => device.id === other.id);
    if (!located?.location) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  assert.match(located?.location ?? "", /United States/);
  const notices = async () => ((await (await fromPhone("GET", "/inbox")).json()) as { items: { kind: string; params: Record<string, string> }[] }).items;
  const signedIn = (await notices()).find((item) => item.kind === "device_signed_in");
  assert.ok(signedIn, "a new sign-in notice");
  assert.match(signedIn.params.location ?? "", /United States/);

  // 2. Sign the laptop out from the phone: its session dies at once, and its Privy session can't sign back in.
  const out = (await (await fromPhone("POST", `/account/devices/${other.id}/sign-out`)).json()) as { signedOut: boolean };
  assert.ok((await notices()).some((item) => item.kind === "device_signed_out"), "a signed-out notice");
  const rendered = renderNotification({ kind: "device_signed_in", network: "testnet", params: signedIn.params }, "en");
  assert.match(rendered.title, /^New sign-in on /);
  assert.equal(rendered.path, "/account/devices");
  assert.equal(out.signedOut, true);
  assert.equal((await fromLaptop("GET", "/me")).status, 401, "the laptop's session is revoked");
  assert.equal((await privySignIn(app, person, { platform: "ios", installationId: "acct-laptop-0001" })).status, 401, "its Privy session is refused");
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
  const next = privyPerson(`next-${randomUUID()}@example.test`);
  const second = testApp();
  try {
    const response = await privySignIn(second.app, next, { platform: "ios", installationId: "acct-next-0001" }, guestToken);
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
