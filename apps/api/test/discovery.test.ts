// Finding who in my phone is on Kawase (I7): only exact email hashes match, only accounts with a handle that let
// themselves be found, never the asker; turning it off hides the account.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { users } from "@kawase/db";

import { deleteUser, fakeTurnkey, jsonRequest, testApp } from "./helpers";

const { app, db, close } = testApp(fakeTurnkey({}));
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

const sha = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

async function account(email: string, handle: string | null) {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false, email, handle }).where(eq(users.id, user.id));
  return (method: string, path: string, body?: unknown) => app.request(path, body === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, body, token));
}

test("contacts discovery matches exact email hashes of findable accounts only", async () => {
  const tag = randomUUID().slice(0, 8);
  const me = await account(`me-${tag}@example.test`, `me_${tag}`);
  const amina = await account(`Amina-${tag}@Example.test`, `amina_${tag}`);
  await account(`nohandle-${tag}@example.test`, null);
  const hidden = await account(`hidden-${tag}@example.test`, `hidden_${tag}`);
  await hidden("PUT", "/contacts-discovery/me", { discoverable: false });

  const ask = async () =>
    ((await (
      await me("POST", "/contacts-discovery/match", {
        contacts: [
          { ref: "a", emailHashes: [sha(`amina-${tag}@example.test`)] },
          { ref: "b", emailHashes: [sha(`nohandle-${tag}@example.test`)] },
          { ref: "c", emailHashes: [sha(`hidden-${tag}@example.test`)] },
          { ref: "d", emailHashes: [sha(`me-${tag}@example.test`)] },
          { ref: "e", emailHashes: [sha(`stranger-${tag}@example.test`)] },
        ],
      })
    ).json()) as { matches: { ref: string; handle: string }[] }).matches;

  assert.deepEqual(await ask(), [{ ref: "a", handle: `amina_${tag}` }], "Amina only: case-insensitive email, a handle, findable, not me");
  await amina("PUT", "/contacts-discovery/me", { discoverable: false });
  assert.deepEqual(await ask(), [], "turning it off hides her");
  assert.equal(((await (await amina("GET", "/contacts-discovery/me")).json()) as { discoverable: boolean }).discoverable, false);
});

test("M11: one check carries one address book at most, and a day's checks stop at the quota with a clear refusal", async () => {
  const tag = randomUUID().slice(0, 8);
  const me = await account(`bulk-${tag}@example.test`, `bulk_${tag}`);
  const book = (from: number, count: number) => ({
    contacts: Array.from({ length: count / 2 }, (_, index) => ({ ref: `r${from + index}`, emailHashes: [sha(`a${from + index}-${tag}@example.test`), sha(`b${from + index}-${tag}@example.test`)] })),
  });

  // 400 people with three emails each: within the contact limit, over one check's 1,000 fingerprints.
  const crowded = Array.from({ length: 400 }, (_, index) => ({ ref: `c${index}`, emailHashes: [1, 2, 3].map((n) => sha(`c${index}-${n}-${tag}@example.test`)) }));
  const tooBig = await me("POST", "/contacts-discovery/match", { contacts: crowded });
  assert.equal(tooBig.status, 422);
  assert.match(((await tooBig.json()) as { type: string }).type, /discovery_batch_too_large$/);

  for (const from of [0, 1000, 2000]) assert.equal((await me("POST", "/contacts-discovery/match", book(from, 1000))).status, 200, `batch from ${from}`);
  const over = await me("POST", "/contacts-discovery/match", { contacts: [{ ref: "one", emailHashes: [sha(`one-${tag}@example.test`)] }] });
  assert.equal(over.status, 429);
  const body = (await over.json()) as { type: string; limit: number; used: number; retryAfterSeconds: number };
  assert.match(body.type, /discovery_quota$/);
  assert.equal(body.limit, 3000);
  assert.equal(body.used, 3000);
  assert.ok(body.retryAfterSeconds > 0 && body.retryAfterSeconds <= 86_400);
  // An empty check costs nothing and still answers.
  assert.equal((await me("POST", "/contacts-discovery/match", { contacts: [] })).status, 200);
});

test("M11: two checks sent together cannot both fit under what is left of the quota", async () => {
  const tag = randomUUID().slice(0, 8);
  const me = await account(`race-${tag}@example.test`, `race_${tag}`);
  const batch = (prefix: string, count: number) => ({ contacts: Array.from({ length: count }, (_, index) => ({ ref: `${prefix}${index}`, emailHashes: [sha(`${prefix}${index}-${tag}@example.test`)] })) });
  for (const prefix of ["a", "b", "c", "d", "e"]) assert.equal((await me("POST", "/contacts-discovery/match", batch(prefix, 500))).status, 200);
  const statuses = (await Promise.all([me("POST", "/contacts-discovery/match", batch("x", 400)), me("POST", "/contacts-discovery/match", batch("y", 400))])).map((response) => response.status);
  assert.deepEqual(statuses.sort(), [200, 429]);
});
