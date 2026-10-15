// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { users } from "@kawase/db";

import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const person = privyPerson("amina@example.test");
const { app, db, close } = testApp();
// Rows left behind by an earlier interrupted run.
await db.delete(users).where(eq(users.email, "amina@example.test"));
const device = { platform: "ios", installationId: "test-phone-0001", appVersion: "0.1.0", locale: "ar" };
const created: string[] = [];
after(async () => {
  for (const id of created) await deleteUser(db, id);
  await close();
});

test("a guest gets a session and can read /me", async () => {
  const response = await app.request("/auth/guest", jsonRequest("POST", { device, locale: "ar" }));
  assert.equal(response.status, 201);
  const { token, user } = (await response.json()) as {
    token: string;
    user: { id: string; isGuest: boolean; locale: string };
  };
  created.push(user.id);
  assert.equal(user.isGuest, true);
  assert.equal(user.locale, "ar");
  const me = await app.request("/me", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.deepEqual(((await me.json()) as { availableNetworks: string[] }).availableNetworks, ["testnet"]);
});

test("without a session, /me is a problem+json 401", async () => {
  const response = await app.request("/me");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("content-type"), "application/problem+json");
  const body = (await response.json()) as { type: string; requestId: string };
  assert.match(body.type, /unauthenticated$/);
  assert.ok(body.requestId);
});

test("a Privy sign-in upgrades the guest in place, and a second guest is merged into the account", async () => {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device }));
  const { token: guestToken, user: guestUser } = (await guest.json()) as { token: string; user: { id: string } };

  const signIn = await privySignIn(app, person, device, guestToken);
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as {
    token: string;
    user: { id: string; isGuest: boolean; email: string };
  };
  created.push(user.id);
  assert.equal(user.id, guestUser.id, "the guest row became the account");
  assert.equal(user.isGuest, false);
  assert.equal(user.email, "amina@example.test");
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  assert.equal(row?.identitySubject, person.did);
  assert.equal(
    (await app.request("/me", { headers: { authorization: `Bearer ${guestToken}` } })).status,
    401,
    "the guest session is revoked",
  );
  assert.equal((await app.request("/me", { headers: { authorization: `Bearer ${token}` } })).status, 200);

  // A new guest on another device signs in to the same Privy account: the guest is merged and deleted.
  const secondGuest = await app.request(
    "/auth/guest",
    jsonRequest("POST", { device: { ...device, installationId: "test-laptop-0002", platform: "web" } }),
  );
  const { token: secondToken, user: secondUser } = (await secondGuest.json()) as {
    token: string;
    user: { id: string };
  };
  const signIn2 = await privySignIn(app, person, { ...device, installationId: "test-laptop-0002", platform: "web" }, secondToken);
  await expectStatus(signIn2, 201, "second sign-in");
  const merged = (await signIn2.json()) as { user: { id: string } };
  assert.equal(merged.user.id, user.id);
  assert.equal(
    (await db.select().from(users).where(eq(users.id, secondUser.id))).length,
    0,
    "the merged guest is gone",
  );
});

test("another Privy identity with the same verified email cannot take the account or move its guest data", async () => {
  const [original] = await db.select().from(users).where(eq(users.identitySubject, person.did));
  assert.ok(original);
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device }));
  const { token: guestToken, user: guestUser } = (await guest.json()) as { token: string; user: { id: string } };
  created.push(guestUser.id);
  const response = await privySignIn(app, privyPerson("amina@example.test"), device, guestToken);
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as { type: string }).type, /account_recovery_required$/);
  const [unchanged] = await db.select().from(users).where(eq(users.id, original.id));
  assert.equal(unchanged?.identitySubject, person.did);
  assert.equal((await app.request("/me", { headers: { authorization: `Bearer ${guestToken}` } })).status, 200);
});

test("mainnet needs the consent and a live mainnet; settings and idempotent consents work", async () => {
  const signIn = await privySignIn(app, person, device);
  const { token } = (await signIn.json()) as { token: string };

  const noMainnet = await app.request("/me/network", jsonRequest("PUT", { network: "mainnet" }, token));
  assert.equal(noMainnet.status, 422, "mainnet is not available on this api");

  const consent = { kind: "mainnet_real_money", version: "1", locale: "en" };
  const first = await app.request("/me/consents", {
    ...jsonRequest("POST", consent, token),
    headers: {
      ...(jsonRequest("POST", consent, token).headers as Record<string, string>),
      "idempotency-key": "consent-1",
    },
  });
  assert.equal(first.status, 201);
  const replay = await app.request("/me/consents", {
    ...jsonRequest("POST", consent, token),
    headers: {
      ...(jsonRequest("POST", consent, token).headers as Record<string, string>),
      "idempotency-key": "consent-1",
    },
  });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get("idempotent-replayed"), "true");
  const mismatch = await app.request("/me/consents", {
    ...jsonRequest("POST", { ...consent, kind: "terms" }, token),
    headers: {
      ...(jsonRequest("POST", consent, token).headers as Record<string, string>),
      "idempotency-key": "consent-1",
    },
  });
  assert.equal(mismatch.status, 422);

  const settings = await app.request("/me", jsonRequest("PATCH", { locale: "ur", theme: "dark" }, token));
  assert.equal(settings.status, 200);
  const { user } = (await settings.json()) as { user: { locale: string; theme: string } };
  assert.equal(user.locale, "ur");
  assert.equal(user.theme, "dark");
  const invalid = await app.request("/me", jsonRequest("PATCH", { locale: "xx" }, token));
  assert.equal(invalid.status, 400);

  const capabilities = await app.request("/capabilities");
  assert.equal(capabilities.status, 200);
  const view = (await capabilities.json()) as {
    capabilities: {
      faucet: { testnet: { state: string }; mainnet: { state: string } };
      send: { testnet: { state: string } };
      swap: { testnet: { state: string } };
      bridge: { testnet: { state: string } };
      yield: { testnet: { state: string } };
      marketplace: { mainnet: { state: string } };
    };
  };
  assert.equal(view.capabilities.faucet.testnet.state, "available", "the faucet shipped (Circle's testnet drip)");
  assert.equal(view.capabilities.send.testnet.state, "available", "send shipped in Stage 5");
  assert.equal(view.capabilities.swap.testnet.state, "available", "swap shipped in Stage 6a");
  assert.equal(view.capabilities.bridge.testnet.state, "available", "bridge shipped in Stage 6b");
  assert.equal(view.capabilities.yield.testnet.state, "available", "earn shipped in Stage 6c");
  assert.equal(view.capabilities.marketplace.mainnet.state, "unavailable", "mainnet is not live on this api");
});
