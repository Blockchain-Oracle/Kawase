// Circle's onramp webhook names the key that signed it (X-Circle-Key-Id); a key we don't hold is fetched from Circle
// with the live API key. A made-up key id must not be a lever on that key: ids that aren't short and URL-safe are never
// looked up, new ids are looked up at most six a minute across everyone, an id Circle didn't know is not asked again,
// and a real key, once fetched, verifies without asking again. No database or network: fetch is stubbed.
// Run: tsx --test test/onramp-webhook-keys.test.ts
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, test } from "node:test";

import type { Db } from "@kawase/db";
import { createLogger } from "@kawase/log";

import type { OnrampEngine } from "../src/onramp/engine";
import { OnrampService } from "../src/onramp/service";
import type { Chains } from "../src/wallet/chain";
import type { WalletService } from "../src/wallet/service";

const LOOKUPS_PER_MINUTE = 6;
const HTTP_NOT_FOUND = 404;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function service() {
  const log = createLogger({ service: "onramp-webhook-test", level: "silent" });
  return new OnrampService({} as Db, { available: [], get: () => undefined } as unknown as Chains, {} as WalletService, {} as OnrampEngine, log, "test-circle-key");
}

/** fetch answers like Circle: the key for `known`, a 404 for anything else; every lookup is counted. */
function circle(known: Record<string, string>) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const id = decodeURIComponent(String(input).split("/").pop()!);
    asked.push(id);
    const publicKey = known[id];
    return new Response(JSON.stringify(publicKey ? { data: { publicKey } } : { code: HTTP_NOT_FOUND, message: "not found" }), { status: publicKey ? 200 : HTTP_NOT_FOUND });
  }) as typeof fetch;
  return asked;
}

test("unknown key ids are rate-limited and remembered; malformed ones are never looked up", async () => {
  const onramp = service();
  const asked = circle({});
  const body = JSON.stringify({ notificationType: "test" });
  for (let i = 0; i < LOOKUPS_PER_MINUTE * 2; i++) assert.equal(await onramp.webhook(body, "c2ln", randomUUID()), false);
  assert.equal(asked.length, LOOKUPS_PER_MINUTE, "at most six new ids a minute reach Circle");
  const first = asked[0]!;
  assert.equal(await onramp.webhook(body, "c2ln", first), false);
  assert.equal(await onramp.webhook(body, "c2ln", "../../wallets?x=1"), false);
  assert.equal(await onramp.webhook(body, "c2ln", "a".repeat(65)), false);
  assert.equal(asked.length, LOOKUPS_PER_MINUTE, "a forgotten id and malformed ids are not asked about");
});

test("a real key is fetched once and then verifies Circle's signatures without asking again", async () => {
  const onramp = service();
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const keyId = randomUUID();
  const asked = circle({ [keyId]: publicKey.export({ format: "der", type: "spki" }).toString("base64") });
  const body = JSON.stringify({ notificationType: "onramp.test", notification: {} });
  const signature = sign("sha256", Buffer.from(body), privateKey).toString("base64");
  assert.equal(await onramp.webhook(body, signature, keyId), true);
  assert.equal(await onramp.webhook(body, signature, keyId), true);
  assert.equal(await onramp.webhook(`${body} `, signature, keyId), false, "a changed body fails the signature");
  assert.deepEqual(asked, [keyId], "fetched once");
});
