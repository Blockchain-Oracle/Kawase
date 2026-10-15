// "The contact's address changed → paused until reviewed" (cards/automate-safety.md): changing a contact's address
// pauses every active automation that pays their old address, records a run that says why and puts it in the inbox;
// an automation paying someone else carries on. Needs DATABASE_URL; no chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { automationRuns, automations, inboxItems } from "@kawase/db";

import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const url = process.env.DATABASE_URL;
const DAY_MS = 86_400_000;

test("a contact's new address pauses the automations paying the old one", { skip: !url }, async () => {
  const testId = randomUUID();
  const person = privyPerson(`change-${testId}@example.test`);
  const { app, db, close } = testApp();
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "address-change-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;

  const mum = privateKeyToAccount(generatePrivateKey()).address;
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  const created = await app.request("/contacts", jsonRequest("POST", { displayName: "Mum", address: mum, source: "pasted" }, token));
  await expectStatus(created, 201, "contact");
  const { contact } = (await created.json()) as { contact: { id: string } };
  const automation = async (to: string) => {
    const [row] = await db
      .insert(automations)
      .values({
        userId,
        network: "testnet",
        kind: "scheduled_send",
        status: "active",
        schedule: { every: "week", weekday: 5, time: "09:00", timezone: "UTC" },
        action: { recipientWords: to, recipientAddress: to, recipientName: null, asset: "USDC", amount: "1000000", note: null },
        nextRunAt: new Date(Date.now() + DAY_MS),
        endsAt: new Date(Date.now() + 365 * DAY_MS),
      } as never)
      .returning({ id: automations.id });
    return row!.id;
  };
  const toMum = await automation(mum);
  const toBob = await automation(bob);

  const changed = await app.request(`/contacts/${contact.id}/address`, jsonRequest("POST", { address: privateKeyToAccount(generatePrivateKey()).address, source: "pasted" }, token));
  await expectStatus(changed, 200, "change address");

  const status = async (id: string) => (await db.select({ status: automations.status }).from(automations).where(eq(automations.id, id)))[0]!.status;
  assert.equal(await status(toMum), "paused", "the automation paying Mum's old address waits for review");
  assert.equal(await status(toBob), "active", "one paying someone else carries on");
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.automationId, toMum));
  assert.equal(run?.status, "skipped");
  assert.equal(run?.reason, "CONTACT_ADDRESS_CHANGED");
  assert.deepEqual(run?.reasonParams, { name: "Mum" });
  const items = await db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId), eq(inboxItems.kind, "automation_skipped")));
  assert.equal(items.length, 1);
  assert.equal((items[0]!.params as { reason?: string }).reason, "CONTACT_ADDRESS_CHANGED");
});
