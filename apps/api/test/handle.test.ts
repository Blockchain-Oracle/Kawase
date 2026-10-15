// The optional @handle: rules, uniqueness without regard to case, and the live availability check.
// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { inArray } from "drizzle-orm";

import { handleHolds, users } from "@kawase/db";

import { deleteUser, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const people = ["kenji", "fatima"].map((name) => {
  const email = `${name}-handle@example.test`;
  return { ...privyPerson(email), name, email };
});
const { app, db, close } = testApp();
await db.delete(users).where(
  inArray(
    users.email,
    people.map((p) => p.email),
  ),
);
const created: string[] = [];
after(async () => {
  for (const id of created) await deleteUser(db, id);
  await close();
});

async function signIn(person: (typeof people)[number]) {
  const device = { platform: "ios", installationId: `handle-test-${person.name}`, appVersion: "0.1.0", locale: "en" };
  const response = await privySignIn(app, person, device);
  assert.equal(response.status, 201);
  const { token, user } = (await response.json()) as { token: string; user: { id: string; handle: string | null } };
  created.push(user.id);
  return { token, user };
}

const availability = async (token: string, handle: string) =>
  (await (
    await app.request(`/me/handle/availability?handle=${encodeURIComponent(handle)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json()) as { handle: string; available: boolean; reason?: string };

const setHandle = (token: string, handle: string | null) => app.request("/me", jsonRequest("PATCH", { handle }, token));

test("a handle follows the rules, is unique without regard to case, and can be changed or cleared", async () => {
  const kenji = await signIn(people[0]!);
  const fatima = await signIn(people[1]!);
  assert.equal(kenji.user.handle, null);
  const name = `kenji_${randomUUID().slice(0, 8)}`;

  assert.deepEqual(await availability(kenji.token, "ab"), { handle: "ab", available: false, reason: "too_short" });
  assert.equal((await availability(kenji.token, "has space")).reason, "invalid");
  assert.equal((await availability(kenji.token, "@Kawase")).reason, "reserved");
  assert.deepEqual(await availability(kenji.token, `@${name.toUpperCase()}`), { handle: name, available: true });

  const invalid = await setHandle(kenji.token, "no!");
  assert.equal(invalid.status, 422);
  assert.match(((await invalid.json()) as { type: string }).type, /handle_invalid$/);
  const reserved = await setHandle(kenji.token, "support");
  assert.match(((await reserved.json()) as { type: string }).type, /handle_reserved$/);

  const saved = await setHandle(kenji.token, `@${name.toUpperCase()}`);
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { user: { handle: string } }).user.handle, name, "stored lowercase, without @");

  // The owner still sees it as available (it is theirs); anyone else sees it taken, whatever the case.
  assert.equal((await availability(kenji.token, name)).available, true);
  assert.equal((await availability(fatima.token, name.toUpperCase())).reason, "taken");
  const taken = await setHandle(fatima.token, name.toUpperCase());
  assert.equal(taken.status, 409);
  assert.match(((await taken.json()) as { type: string }).type, /handle_taken$/);

  // Cleared (or renamed away from), it is held: no one else can take it and be paid in Kenji's place, but he may
  // take it back (security review 2026-10-03, low).
  const cleared = await setHandle(kenji.token, null);
  assert.equal(((await cleared.json()) as { user: { handle: string | null } }).user.handle, null);
  assert.equal((await availability(fatima.token, name)).reason, "taken");
  assert.equal((await setHandle(fatima.token, name)).status, 409, "held after it was given up");
  assert.equal((await setHandle(kenji.token, name)).status, 200, "the person who gave it up takes it back");
  const renamed = `${name}_2`;
  assert.equal((await setHandle(kenji.token, renamed)).status, 200);
  assert.equal((await setHandle(fatima.token, name)).status, 409, "held after a rename too");
  await db.delete(handleHolds).where(inArray(handleHolds.handle, [name, renamed]));
  assert.equal((await setHandle(fatima.token, name)).status, 200, "free once the hold is over");
});

test("a guest cannot take a handle", async () => {
  const guest = await app.request(
    "/auth/guest",
    jsonRequest("POST", { device: { platform: "ios", installationId: "handle-test-guest", appVersion: "0.1.0" } }),
  );
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  created.push(user.id);
  assert.equal((await setHandle(token, "some_guest")).status, 403);
});
