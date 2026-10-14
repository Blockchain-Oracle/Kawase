// The Privy verifier's key handling (D41), without a database: a key read from Privy's app config is re-read only when
// a signature fails (Privy rotated it), at most once a minute; expired tokens never cause a request; a key that cannot
// be loaded is an outage, not a bad token. Run: pnpm --filter @kawase/api exec tsx --test test/privy-verifier.test.ts
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { test } from "node:test";

import { createPrivyVerifier, PrivyTokenError } from "../src/auth/privy";

const APP_ID = "kawase-privy-verifier-test";
const pair = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function accessToken(key: KeyObject, lifetimeS = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ iss: "privy.io", aud: APP_ID, iat: now - 10, exp: now + lifetimeS, sid: "s", sub: "did:privy:x" })}`;
  return `${body}.${sign("sha256", Buffer.from(body), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

/** Serves the given keys in turn, as Privy's app config would; counts the reads. */
function configServer(keys: string[]) {
  let reads = 0;
  const fetch = (async () => {
    const key = keys[Math.min(reads, keys.length - 1)];
    reads += 1;
    return new Response(JSON.stringify({ verification_key: key }), { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, reads: () => reads };
}

test("an expired token fails as a bad token and does not re-read the key", async () => {
  const current = pair();
  const server = configServer([pem(current.publicKey)]);
  const verifier = createPrivyVerifier({ appId: APP_ID, fetch: server.fetch });
  await assert.rejects(verifier.verifyAccess(accessToken(current.privateKey, -60)), PrivyTokenError);
  await assert.rejects(verifier.verifyAccess(accessToken(current.privateKey, -60)), PrivyTokenError);
  assert.equal(server.reads(), 1);
});

test("a rotated key is re-read once, and bad signatures inside the cooldown do not re-read it", async () => {
  const old = pair();
  const rotated = pair();
  const stranger = pair();
  const server = configServer([pem(old.publicKey), pem(rotated.publicKey)]);
  let clock = 1_000_000;
  const verifier = createPrivyVerifier({ appId: APP_ID, fetch: server.fetch, now: () => clock });
  await verifier.verifyAccess(accessToken(old.privateKey));
  assert.equal(server.reads(), 1);
  // Privy rotated: the first token under the new key re-reads it and verifies.
  assert.deepEqual(await verifier.verifyAccess(accessToken(rotated.privateKey)), { userId: "did:privy:x", sessionId: "s" });
  assert.equal(server.reads(), 2);
  // A flood of tokens signed by someone else inside the minute: no further reads.
  clock += 1_000;
  await assert.rejects(verifier.verifyAccess(accessToken(stranger.privateKey)), PrivyTokenError);
  await assert.rejects(verifier.verifyAccess(accessToken(stranger.privateKey)), PrivyTokenError);
  assert.equal(server.reads(), 2);
});

test("a key that cannot be loaded is an outage, not a bad token", async () => {
  const fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof globalThis.fetch;
  const verifier = createPrivyVerifier({ appId: APP_ID, fetch });
  await assert.rejects(verifier.verifyAccess(accessToken(pair().privateKey)), (error: unknown) => !(error instanceof PrivyTokenError));
});
