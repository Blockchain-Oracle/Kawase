// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { users } from "@kawase/db";

import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const SUB_ORG = randomUUID();
const TURNKEY_USER = randomUUID();
const sessionKey = turnkeyStyleKeyPair();
const otherKey = turnkeyStyleKeyPair();
const turnkey = fakeTurnkey({
  [`${SUB_ORG}/${TURNKEY_USER}`]: {
    userId: TURNKEY_USER,
    userName: "amina",
    email: "amina@example.test",
    sessionPublicKeys: [sessionKey.publicKeyHex],
  },
});
const { app, db, close } = testApp(turnkey);
// Rows left behind by an earlier interrupted run.
await db.delete(users).where(eq(users.email, "amina@example.test"));
const device = { platform: "ios", installationId: "test-phone-0001", appVersion: "0.1.0", locale: "ar" };
const created: string[] = [];
after(async () => {
  for (const id of created) await deleteUser(db, id);
  await close();
});

async function proofFor(key = sessionKey) {
  const nonceResponse = await app.request("/auth/nonce", { method: "POST" });
  const { nonce } = (await nonceResponse.json()) as { nonce: string };
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  return { body, stamp: await stampBody(body, key), nonce };
}

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

test("a Turnkey proof upgrades the guest in place, and a second guest is merged into the account", async () => {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device }));
  const { token: guestToken, user: guestUser } = (await guest.json()) as { token: string; user: { id: string } };

  const proof = await proofFor();
  const signIn = await app.request(
    "/auth/turnkey",
    jsonRequest(
      "POST",
      { proof: { body: proof.body, stamp: proof.stamp }, turnkeyUserId: TURNKEY_USER, device },
      guestToken,
    ),
  );
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as {
    token: string;
    user: { id: string; isGuest: boolean; email: string; turnkeySubOrganizationId: string };
  };
  created.push(user.id);
  assert.equal(user.id, guestUser.id, "the guest row became the account");
  assert.equal(user.isGuest, false);
  assert.equal(user.email, "amina@example.test");
  assert.equal(user.turnkeySubOrganizationId, SUB_ORG);
  assert.equal(
    (await app.request("/me", { headers: { authorization: `Bearer ${guestToken}` } })).status,
    401,
    "the guest session is revoked",
  );
  assert.equal((await app.request("/me", { headers: { authorization: `Bearer ${token}` } })).status, 200);

  // A new guest on another device signs in to the same Turnkey account: the guest is merged and deleted.
  const secondGuest = await app.request(
    "/auth/guest",
    jsonRequest("POST", { device: { ...device, installationId: "test-laptop-0002", platform: "web" } }),
  );
  const { token: secondToken, user: secondUser } = (await secondGuest.json()) as {
    token: string;
    user: { id: string };
  };
  const proof2 = await proofFor();
  const signIn2 = await app.request(
    "/auth/turnkey",
    jsonRequest(
      "POST",
      {
        proof: { body: proof2.body, stamp: proof2.stamp },
        turnkeyUserId: TURNKEY_USER,
        device: { ...device, installationId: "test-laptop-0002", platform: "web" },
      },
      secondToken,
    ),
  );
  await expectStatus(signIn2, 201, "second sign-in");
  const merged = (await signIn2.json()) as { user: { id: string } };
  assert.equal(merged.user.id, user.id);
  assert.equal(
    (await db.select().from(users).where(eq(users.id, secondUser.id))).length,
    0,
    "the merged guest is gone",
  );
});

test("a used or unknown nonce, a wrong key, and an unknown user are refused", async () => {
  const proof = await proofFor();
  const first = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", { proof: { body: proof.body, stamp: proof.stamp }, turnkeyUserId: TURNKEY_USER, device }),
  );
  assert.equal(first.status, 201);
  const replay = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", { proof: { body: proof.body, stamp: proof.stamp }, turnkeyUserId: TURNKEY_USER, device }),
  );
  assert.equal(replay.status, 401);
  assert.match(((await replay.json()) as { type: string }).type, /nonce_invalid$/);

  const wrongKey = await proofFor(otherKey);
  const refused = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", { proof: { body: wrongKey.body, stamp: wrongKey.stamp }, turnkeyUserId: TURNKEY_USER, device }),
  );
  assert.equal(refused.status, 401);
  assert.match(((await refused.json()) as { type: string }).type, /session_key_unknown$/);

  const unknownUser = await proofFor();
  const missing = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", {
      proof: { body: unknownUser.body, stamp: unknownUser.stamp },
      turnkeyUserId: randomUUID(),
      device,
    }),
  );
  assert.equal(missing.status, 401);

  const tampered = await proofFor();
  const bad = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", {
      proof: { body: tampered.body.replace(tampered.nonce, "x"), stamp: tampered.stamp },
      turnkeyUserId: TURNKEY_USER,
      device,
    }),
  );
  assert.equal(bad.status, 401);
});

test("mainnet needs the consent and a live mainnet; settings and idempotent consents work", async () => {
  const proof = await proofFor();
  const signIn = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", { proof: { body: proof.body, stamp: proof.stamp }, turnkeyUserId: TURNKEY_USER, device }),
  );
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
      marketplace: { mainnet: { state: string } };
    };
  };
  assert.equal(view.capabilities.faucet.testnet.state, "available", "the faucet shipped (Circle's testnet drip)");
  assert.equal(view.capabilities.send.testnet.state, "available", "send shipped in Stage 5");
  assert.equal(view.capabilities.swap.testnet.state, "coming", "swap has not shipped yet");
  assert.equal(view.capabilities.marketplace.mainnet.state, "unavailable", "mainnet is not live on this api");
});
