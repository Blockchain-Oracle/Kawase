// Push tokens (security review 2026-10-03, low): registering a token never takes it from another person's signed-in
// phone. A token moves only from this person's own other device, the same installation, or a phone no one is signed
// in on any more; signing out lets it go. Runs against the local database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { devices } from "@kawase/db";

import { deleteUser, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const people = ["ada", "bo"].map((name) => ({ name, ...privyPerson(`${name}-${randomUUID()}@example.test`) }));
const { app, db, close } = testApp();
const created: string[] = [];
after(async () => {
  for (const id of created) await deleteUser(db, id);
  await close();
});

async function signIn(person: (typeof people)[number], installationId: string) {
  const response = await privySignIn(app, person, { platform: "ios", installationId });
  assert.equal(response.status, 201);
  const { token, user } = (await response.json()) as { token: string; user: { id: string } };
  if (!created.includes(user.id)) created.push(user.id);
  return { token, userId: user.id };
}

const register = (token: string, pushToken: string | null) => app.request("/notifications/push-token", jsonRequest("PUT", { token: pushToken }, token));
const holder = async (pushToken: string) => (await db.select({ userId: devices.userId, installationId: devices.installationId }).from(devices).where(eq(devices.expoPushToken, pushToken)))[0];

test("a push token is never taken from another person's signed-in phone", async () => {
  const pushToken = `ExponentPushToken[${randomUUID().replace(/-/g, "").slice(0, 22)}]`;
  const adaPhone = `push-ada-${randomUUID()}`;
  const ada = await signIn(people[0]!, adaPhone);
  const bo = await signIn(people[1]!, `push-bo-${randomUUID()}`);
  assert.equal((await register(ada.token, pushToken)).status, 204);

  // Bo presents Ada's token from another phone: refused, and Ada keeps her notifications.
  assert.equal((await register(bo.token, pushToken)).status, 409);
  assert.equal((await holder(pushToken))?.userId, ada.userId);

  // On Ada's own phone, Bo signing in takes it (the same installation is the same phone).
  const boOnAdaPhone = await signIn(people[1]!, adaPhone);
  assert.equal((await register(boOnAdaPhone.token, pushToken)).status, 204);
  assert.equal((await holder(pushToken))?.userId, bo.userId);

  // Ada takes it back on her phone; once she signs out, the token is let go and anyone may register it.
  assert.equal((await register(ada.token, pushToken)).status, 204);
  assert.equal((await app.request("/auth/sign-out", { method: "POST", headers: { authorization: `Bearer ${ada.token}` } })).status, 204);
  assert.equal(await holder(pushToken), undefined, "signing out lets the token go");
  assert.equal((await register(bo.token, pushToken)).status, 204);
});
