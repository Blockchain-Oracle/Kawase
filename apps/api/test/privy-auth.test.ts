// Privy sign-in (D41) against the local database, with tokens minted in Privy's exact format by the test helpers (ES256,
// issuer privy.io, audience the app id, `sid`/`sub`; the identity token's `linked_accounts` claim as Privy encodes it)
// and verified by @privy-io/node, so no live Privy session is needed. Also: signing a device out refuses its Privy
// session, and the web's emailed approval code. Run: pnpm --filter @kawase/api exec tsx --test test/privy-auth.test.ts
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { users, wallets } from "@kawase/db";

import type { Email } from "../src/notify/email";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, privyTokens, testApp, type PrivyPerson } from "./helpers";

const otherKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const tokens = (person: PrivyPerson) => privyTokens(person);
/** The emails the api sent (approval codes), instead of Resend. */
const sent: Email[] = [];
const email = { send: async (message: Email) => (sent.push(message), { id: randomUUID() }) };

const { app, db, close } = testApp(undefined, undefined, undefined, undefined, undefined, undefined, { deviceProofRequired: true, email: email as never });
const EMAIL = "privy-amina@example.test";
await db.delete(users).where(eq(users.email, EMAIL));
const device = (id: string) => ({ platform: "web", installationId: `privy-test-${id}`, appVersion: "0.2.0", locale: "en" });
const created: string[] = [];
after(async () => {
  for (const id of created) await deleteUser(db, id);
  await close();
});

const wallet = privateKeyToAccount(generatePrivateKey());

test("a Privy sign-in upgrades the guest and registers the embedded wallet from the identity token", async () => {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: device("a") }));
  await expectStatus(guest, 201);
  const { token: guestToken, user: guestUser } = (await guest.json()) as { token: string; user: { id: string } };
  created.push(guestUser.id);
  const person = privyPerson(EMAIL, wallet.address);
  const response = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("a") }, guestToken));
  await expectStatus(response, 201);
  const body = (await response.json()) as { token: string; user: { id: string; email: string; isGuest: boolean }; wallet: { address: string } };
  assert.equal(body.user.id, guestUser.id);
  assert.equal(body.user.email, EMAIL);
  assert.equal(body.user.isGuest, false);
  assert.equal(body.wallet.address.toLowerCase(), wallet.address.toLowerCase());
  const [row] = await db.select().from(users).where(eq(users.id, guestUser.id));
  assert.equal(row?.identityProvider, "privy");
  assert.equal(row?.identitySubject, person.did);
  const [registered] = await db.select().from(wallets).where(and(eq(wallets.userId, guestUser.id), eq(wallets.status, "active")));
  assert.equal(registered?.custody, "privy");
  // Signing in again with the same identity lands on the same account.
  const again = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("b") }));
  await expectStatus(again, 201);
  assert.equal(((await again.json()) as { user: { id: string } }).user.id, guestUser.id);
});

test("tokens that do not verify, or that name two different people, are refused", async () => {
  const person = privyPerson("nobody@example.test");
  const forged = await app.request("/auth/privy", jsonRequest("POST", { ...privyTokens(person, { key: otherKeys.privateKey }), device: device("c") }));
  await expectStatus(forged, 401);
  const mixed = { accessToken: tokens(person).accessToken, identityToken: tokens(privyPerson("nobody@example.test")).identityToken };
  const response = await app.request("/auth/privy", jsonRequest("POST", { ...mixed, device: device("c") }));
  await expectStatus(response, 401);
  const garbage = await app.request("/auth/privy", jsonRequest("POST", { accessToken: "not-a-jwt", device: device("c") }));
  await expectStatus(garbage, 400);
});

test("an account keeps its wallet: tokens naming another one sign in but register nothing; an email is not taken over", async () => {
  const first = privateKeyToAccount(generatePrivateKey()).address;
  const person = privyPerson(`keep-${randomUUID()}@example.test`, first);
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("d") }));
  await expectStatus(signIn, 201);
  const { user } = (await signIn.json()) as { user: { id: string } };
  created.push(user.id);
  const second = privateKeyToAccount(generatePrivateKey()).address;
  const again = await app.request("/auth/privy", jsonRequest("POST", { ...tokens({ ...person, wallet: second }), device: device("d") }));
  await expectStatus(again, 201);
  assert.equal(((await again.json()) as { wallet: unknown }).wallet ?? null, null);
  const rows = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  assert.deepEqual(rows.map((row) => `${row.custody}:${row.status}:${row.address.toLowerCase()}`), [`privy:active:${first.toLowerCase()}`]);
  // A second Privy identity claiming the same email does not take the account over.
  const intruder = privyPerson(person.email);
  const refused = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(intruder), device: device("e") }));
  await expectStatus(refused, 409);
});

test("a device signed out from another one cannot come back on its old Privy session; a fresh sign-in can", async () => {
  const person = privyPerson(`out-${randomUUID()}@example.test`, privateKeyToAccount(generatePrivateKey()).address);
  const phone = await privySignIn(app, person, device("out-phone"));
  await expectStatus(phone, 201);
  const { token: phoneToken, user } = (await phone.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  await expectStatus(await privySignIn(app, person, device("out-laptop")), 201);
  const listed = (await (await app.request("/account/devices", { headers: { authorization: `Bearer ${phoneToken}` } })).json()) as {
    devices: { id: string; current: boolean }[];
  };
  const laptop = listed.devices.find((entry) => !entry.current)!;
  await expectStatus(await app.request(`/account/devices/${laptop.id}/sign-out`, { method: "POST", headers: { authorization: `Bearer ${phoneToken}` } }), 200);
  const back = await privySignIn(app, person, device("out-laptop"));
  await expectStatus(back, 401);
  assert.match(((await back.json()) as { type: string }).type, /session_signed_out$/);
  // Signed in afresh (a new Privy session), the laptop is let in again.
  await expectStatus(await privySignIn(app, { ...person, session: randomUUID() }, device("out-laptop")), 201);
});

test("the web's approval code: emailed to the account, wrong codes spend tries, the right one works once", async () => {
  const person = privyPerson(`code-${randomUUID()}@example.test`);
  const signIn = await privySignIn(app, person, device("code"));
  await expectStatus(signIn, 201);
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  const auth = { authorization: `Bearer ${token}` };
  const before = sent.length;
  const asked = await app.request("/account/approval-code", { method: "POST", headers: auth });
  await expectStatus(asked, 200);
  assert.match(((await asked.json()) as { sentTo: string }).sentTo, /^co•••@example\.test$/);
  const message = sent.at(-1)!;
  assert.equal(sent.length, before + 1);
  assert.equal(message.to, person.email);
  const code = /\b(\d{6})\b/.exec(message.text)![1]!;
  await expectStatus(await app.request("/account/approval-code", { method: "POST", headers: auth }), 429, "a second code at once");
  const wrong = code === "000000" ? "111111" : "000000";
  await expectStatus(await app.request("/account/approval-code/verify", jsonRequest("POST", { code: wrong }, token)), 400, "wrong code");
  const right = await app.request("/account/approval-code/verify", jsonRequest("POST", { code }, token));
  await expectStatus(right, 200, "right code");
  assert.deepEqual(await right.json(), { approved: true });
  await expectStatus(await app.request("/account/approval-code/verify", jsonRequest("POST", { code }, token)), 400, "used once");
});

test("a wallet created after sign-in is registered from fresh tokens for the same identity only", async () => {
  const person = privyPerson(`late-${randomUUID()}@example.test`);
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("f") }));
  await expectStatus(signIn, 201);
  const { token, user, wallet: none } = (await signIn.json()) as { token: string; user: { id: string }; wallet: null };
  created.push(user.id);
  assert.equal(none, null);
  const late = privateKeyToAccount(generatePrivateKey()).address;
  const other = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens(privyPerson(undefined, late)), token));
  await expectStatus(other, 403);
  const missing = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens(person), token));
  await expectStatus(missing, 422);
  const linked = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens({ ...person, wallet: late }), token));
  await expectStatus(linked, 201);
  assert.equal(((await linked.json()) as { wallet: { address: string } }).wallet.address.toLowerCase(), late.toLowerCase());
});

test("M12 with Privy: the registered wallet signs the request; a missing, foreign or replayed proof is refused", async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const person = privyPerson(`proof-${randomUUID()}@example.test`, signer.address);
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("g") }));
  await expectStatus(signIn, 201);
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  const body = JSON.stringify({ confirm: "not the confirmation" });
  const activity = `kawase:${Date.now()}:${createHash("sha256").update(`POST /account/delete\n${body}`).digest("hex")}`;
  const send = (headers: Record<string, string>) =>
    app.request("/account/delete", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers }, body });

  await expectStatus(await send({}), 403, "no proof");
  const foreign = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: activity });
  await expectStatus(await send({ "x-kawase-proof-activity": activity, "x-kawase-proof-signature": foreign }), 401, "another key");
  const signature = await signer.signMessage({ message: activity });
  const proven = await send({ "x-kawase-proof-activity": activity, "x-kawase-proof-signature": signature });
  // Past the proof gate: the handler itself refuses the wrong confirmation text.
  assert.ok(![401, 403].includes(proven.status), `proof should hold, got ${proven.status}: ${await proven.clone().text()}`);
  await expectStatus(await send({ "x-kawase-proof-activity": activity, "x-kawase-proof-signature": signature }), 401, "replayed");
});

test("an email changed at Privy is followed, unless another account holds it", async () => {
  const person = privyPerson(`before-${randomUUID()}@example.test`);
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("h") }));
  await expectStatus(signIn, 201);
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  const changed = `after-${randomUUID()}@example.test`;
  const synced = await app.request("/auth/privy/sync", jsonRequest("POST", tokens({ ...person, email: changed }), token));
  await expectStatus(synced, 200);
  assert.equal(((await synced.json()) as { email: string }).email, changed);
  const taken = await app.request("/auth/privy/sync", jsonRequest("POST", tokens({ ...person, email: EMAIL }), token));
  await expectStatus(taken, 409);
});

test("two first sign-ins for the same Privy user at once make one account: each answers 201 or 409, never 500", async () => {
  const person = privyPerson(`race-${randomUUID()}@example.test`, privateKeyToAccount(generatePrivateKey()).address);
  const attempts = await Promise.all(
    ["race-1", "race-2", "race-3"].map((id) => app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device(id) }))),
  );
  const statuses = attempts.map((response) => response.status);
  assert.ok(statuses.every((status) => status === 201 || status === 409), `statuses ${statuses.join(",")}`);
  assert.ok(statuses.includes(201), "one sign-in wins");
  const rows = await db.select().from(users).where(and(eq(users.identityProvider, "privy"), eq(users.identitySubject, person.did)));
  assert.equal(rows.length, 1);
  created.push(rows[0]!.id);
  const active = await db.select().from(wallets).where(and(eq(wallets.userId, rows[0]!.id), eq(wallets.status, "active")));
  assert.equal(active.length, 1, "one wallet registered");
});

test("two registrations of the same new wallet at once keep one wallet and never answer 500", async () => {
  const person = privyPerson(`race-wallet-${randomUUID()}@example.test`);
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("race-w") }));
  await expectStatus(signIn, 201);
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  const late = privateKeyToAccount(generatePrivateKey()).address;
  const attempts = await Promise.all(
    [1, 2, 3].map(() => app.request("/auth/privy/wallet", jsonRequest("POST", tokens({ ...person, wallet: late }), token))),
  );
  const statuses = attempts.map((response) => response.status);
  assert.ok(statuses.every((status) => status === 201 || status === 409), `statuses ${statuses.join(",")}`);
  assert.ok(statuses.includes(201));
  const active = await db.select().from(wallets).where(and(eq(wallets.userId, user.id), eq(wallets.status, "active")));
  assert.equal(active.length, 1);
});
