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
