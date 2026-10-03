// A conversation can be renamed and deleted from the history sheet (capability matrix, Thread "rename, delete"):
// only the person's own, with a title of 1–60 characters. Database only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import type { ThreadSummary } from "@kawase/api-client";
import { threads, users } from "@kawase/db";

import { deleteUser, fakeTurnkey, jsonRequest, testApp } from "./helpers";

const { app, db, close } = testApp(fakeTurnkey({}));
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

async function account() {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false }).where(eq(users.id, user.id));
  return {
    id: user.id,
    call: (method: string, path: string, body?: unknown) =>
      app.request(path, body === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, body, token)),
  };
}

test("a conversation is renamed and deleted by its owner only", async () => {
  const me = await account();
  const stranger = await account();
  const [thread] = await db.insert(threads).values({ id: randomUUID(), userId: me.id, network: "testnet", title: "send 5 to @alex" }).returning();
  const rename = (who: typeof me, title: string) => who.call("PATCH", `/agent/threads/${thread!.id}`, { title });

  const renamed = (await (await rename(me, "  Rent with Bola  ")).json()) as { thread: ThreadSummary };
  assert.equal(renamed.thread.title, "Rent with Bola");
  assert.equal((await rename(me, "")).status, 400);
  assert.equal((await rename(me, "x".repeat(61))).status, 400);
  assert.equal((await rename(stranger, "mine now")).status, 404);
  const listed = ((await (await me.call("GET", "/agent/threads")).json()) as { threads: ThreadSummary[] }).threads;
  assert.equal(listed.find((entry) => entry.id === thread!.id)?.title, "Rent with Bola");

  assert.equal((await stranger.call("DELETE", `/agent/threads/${thread!.id}`)).status, 204, "someone else's delete touches nothing");
  assert.equal((await db.select().from(threads).where(eq(threads.id, thread!.id))).length, 1);
  assert.equal((await me.call("DELETE", `/agent/threads/${thread!.id}`)).status, 204);
  assert.equal((await db.select().from(threads).where(eq(threads.id, thread!.id))).length, 0);
});
