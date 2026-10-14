// Privy sign-in (D41) against the local database, with tokens minted in Privy's exact format (ES256, issuer privy.io,
// audience the app id, `sid`/`sub`; the identity token's `linked_accounts` claim as Privy encodes it) and verified by
// @privy-io/node, so no live Privy session is needed. Run: pnpm --filter @kawase/api exec tsx --test test/privy-auth.test.ts
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { grants, userWalletSetup, users, wallets } from "@kawase/db";

import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, testApp } from "./helpers";

const APP_ID = "kawase-privy-test";
const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const otherKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
// Read by the AuthService the app builds (WALLET_PROVIDER=privy turns Privy sign-in on).
process.env.WALLET_PROVIDER = "privy";
process.env.PRIVY_APP_ID = APP_ID;
process.env.PRIVY_VERIFICATION_KEY = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
delete process.env.PRIVY_APP_SECRET;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function jwt(payload: Record<string, unknown>, key: KeyObject = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ iss: "privy.io", aud: APP_ID, iat: now, exp: now + 3600, ...payload })}`;
  const signature = sign("sha256", Buffer.from(body), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${body}.${signature}`;
}

type Person = { did: string; email?: string; wallet?: string };
const tokens = (person: Person, key?: KeyObject) => ({
  accessToken: jwt({ sub: person.did, sid: `session-${person.did}` }, key),
  identityToken: jwt(
    {
      sub: person.did,
      cr: "1791000000",
      linked_accounts: JSON.stringify([
        ...(person.email ? [{ type: "email", address: person.email, lv: 1791000000 }] : []),
        ...(person.wallet
          ? [{ type: "wallet", wallet_client_type: "privy", id: `wallet-${person.did}`, address: person.wallet, chain_type: "ethereum", lv: 1791000000 }]
          : []),
      ]),
    },
    key,
  ),
});

const { app, db, close } = testApp(fakeTurnkey({}), undefined, undefined, undefined, undefined, undefined, undefined, { deviceProofRequired: true });
const EMAIL = "privy-amina@example.test";
const OLD_EMAIL = "turnkey-era@example.test";
await db.delete(users).where(eq(users.email, EMAIL));
await db.delete(users).where(eq(users.email, OLD_EMAIL));
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
  const person = { did: `did:privy:${randomUUID()}`, email: EMAIL, wallet: wallet.address };
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
  const person = { did: `did:privy:${randomUUID()}`, email: "nobody@example.test" };
  const forged = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person, otherKeys.privateKey), device: device("c") }));
  await expectStatus(forged, 401);
  const mixed = { accessToken: tokens(person).accessToken, identityToken: tokens({ ...person, did: `did:privy:${randomUUID()}` }).identityToken };
  const response = await app.request("/auth/privy", jsonRequest("POST", { ...mixed, device: device("c") }));
  await expectStatus(response, 401);
  const garbage = await app.request("/auth/privy", jsonRequest("POST", { accessToken: "not-a-jwt", device: device("c") }));
  await expectStatus(garbage, 400);
});

test("a Turnkey-era account is matched by the verified email: its wallet is retired, its grants stop, setup is asked again", async () => {
  const [old] = await db
    .insert(users)
    .values({ email: OLD_EMAIL, isAnonymous: false, turnkeySubOrganizationId: randomUUID(), identityProvider: "turnkey" })
    .returning();
  created.push(old!.id);
  const oldAddress = privateKeyToAccount(generatePrivateKey()).address;
  const [oldWallet] = await db.insert(wallets).values({ userId: old!.id, role: "user", custody: "turnkey", address: oldAddress }).returning();
  await db.insert(userWalletSetup).values({ userId: old!.id, network: "testnet", delegatorImpl: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B" });
  const [grant] = await db
    .insert(grants)
    .values({
      userId: old!.id,
      network: "testnet",
      kind: "allowance",
      delegatorWalletId: oldWallet!.id,
      delegateAddress: oldAddress,
      delegation: {},
      delegationHash: `0x${createHash("sha256").update(randomUUID()).digest("hex")}`,
      receipt: {},
      periodAmount: 1n,
      periodSeconds: 86400,
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: "active",
    })
    .returning();

  const newWallet = privateKeyToAccount(generatePrivateKey()).address;
  const person = { did: `did:privy:${randomUUID()}`, email: OLD_EMAIL.toUpperCase(), wallet: newWallet };
  const response = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("d") }));
  await expectStatus(response, 201);
  const body = (await response.json()) as { user: { id: string }; wallet: { address: string } };
  assert.equal(body.user.id, old!.id);
  assert.equal(body.wallet.address.toLowerCase(), newWallet.toLowerCase());
  const rows = await db.select().from(wallets).where(eq(wallets.userId, old!.id));
  assert.deepEqual(rows.map((row) => `${row.custody}:${row.status}`).sort(), ["privy:active", "turnkey:retired"]);
  const [after] = await db.select().from(grants).where(eq(grants.id, grant!.id));
  assert.equal(after?.status, "superseded");
  assert.equal((await db.select().from(userWalletSetup).where(eq(userWalletSetup.userId, old!.id))).length, 0);
  const [linked] = await db.select().from(users).where(eq(users.id, old!.id));
  assert.equal(linked?.identityProvider, "privy");

  // A second Privy identity claiming the same email does not take the account over.
  const intruder = { did: `did:privy:${randomUUID()}`, email: OLD_EMAIL };
  const refused = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(intruder), device: device("e") }));
  await expectStatus(refused, 409);
});

test("a wallet created after sign-in is registered from fresh tokens for the same identity only", async () => {
  const person: Person = { did: `did:privy:${randomUUID()}`, email: `late-${randomUUID()}@example.test` };
  const signIn = await app.request("/auth/privy", jsonRequest("POST", { ...tokens(person), device: device("f") }));
  await expectStatus(signIn, 201);
  const { token, user, wallet: none } = (await signIn.json()) as { token: string; user: { id: string }; wallet: null };
  created.push(user.id);
  assert.equal(none, null);
  const late = privateKeyToAccount(generatePrivateKey()).address;
  const other = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens({ did: `did:privy:${randomUUID()}`, wallet: late }), token));
  await expectStatus(other, 403);
  const missing = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens(person), token));
  await expectStatus(missing, 422);
  const linked = await app.request("/auth/privy/wallet", jsonRequest("POST", tokens({ ...person, wallet: late }), token));
  await expectStatus(linked, 201);
  assert.equal(((await linked.json()) as { wallet: { address: string } }).wallet.address.toLowerCase(), late.toLowerCase());
});

test("M12 with Privy: the registered wallet signs the request; a missing, foreign or replayed proof is refused", async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const person = { did: `did:privy:${randomUUID()}`, email: `proof-${randomUUID()}@example.test`, wallet: signer.address };
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
  const person: Person = { did: `did:privy:${randomUUID()}`, email: `before-${randomUUID()}@example.test` };
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
  const person: Person = { did: `did:privy:${randomUUID()}`, email: `race-${randomUUID()}@example.test`, wallet: privateKeyToAccount(generatePrivateKey()).address };
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
  const person: Person = { did: `did:privy:${randomUUID()}`, email: `race-wallet-${randomUUID()}@example.test` };
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
