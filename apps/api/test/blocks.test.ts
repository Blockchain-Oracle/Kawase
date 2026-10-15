// Block (Counterparts "Block"): a Kawase user, a contact or an address the person blocked is marked on every resolve,
// so the send rules (and so the agent and automations) refuse to pay them; their asks and reminders never reach the
// person's inbox, earlier ones are hidden, and they are never told. Unblock undoes it. Database only.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";

import type { BlockView, Contact, InboxItem, RequestReminder } from "@kawase/api-client";
import { REQUEST_NUDGE_AFTER_S, REQUEST_TTL_S, MS_PER_SECOND } from "@kawase/config";
import { inboxItems, paymentRequests, users, wallets } from "@kawase/db";

import { ContactService } from "../src/contacts/service";
import { InboxService } from "../src/inbox/service";
import { RequestService } from "../src/requests/service";
import { Recipients } from "../src/send/recipients";
import { deleteUser, jsonRequest, noChains, privyPerson, testApp } from "./helpers";

const person = privyPerson();
const { app, db, close } = testApp();
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

const randomAddress = () => `0x${randomBytes(20).toString("hex")}`;

async function account(handle: string, address?: string) {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false, email: `${handle}@example.test`, handle }).where(eq(users.id, user.id));
  if (address) await db.insert(wallets).values({ userId: user.id, role: "user", custody: "privy", address });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, body === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, body, token));
  return { id: user.id, call };
}

test("a blocked Kawase user, contact or address is refused as a recipient everywhere, until unblocked", async () => {
  const tag = randomUUID().slice(0, 6);
  const mallory = randomAddress();
  const me = await account(`me_${tag}`, randomAddress());
  await account(`mal_${tag}`, mallory);
  const recipients = new Recipients(db, new ContactService(db));
  const blocked = async (words: string) => {
    const found = await recipients.resolve({ id: me.id, walletAddress: undefined }, "testnet", words);
    return found.facts.status === "resolved" ? Boolean(found.facts.blocked) : `not resolved: ${found.facts.status}`;
  };

  assert.equal(await blocked(`@mal_${tag}`), false);
  const listed = (await (await me.call("POST", "/blocks", { handle: `@mal_${tag}` })).json()) as { blocks: BlockView[] };
  assert.deepEqual(listed.blocks.map((entry) => [entry.label, entry.handle]), [[`@mal_${tag}`, `mal_${tag}`]]);
  assert.equal(await blocked(`@mal_${tag}`), true, "by handle");
  assert.equal(await blocked(mallory), true, "their wallet address follows their account");

  // A contact without a Kawase account: its address is blocked, and the contact says so.
  const bola = randomAddress();
  const created = (await (await me.call("POST", "/contacts", { displayName: `Bola ${tag}`, address: bola, source: "pasted" })).json()) as { contact: Contact };
  assert.equal(created.contact.blocked, false);
  await me.call("POST", "/blocks", { contactId: created.contact.id });
  assert.equal(await blocked(`Bola ${tag}`), true, "by contact name");
  assert.equal(((await (await me.call("GET", `/contacts/${created.contact.id}`)).json()) as { contact: Contact }).contact.blocked, true);

  await me.call("POST", "/blocks/remove", { handle: `mal_${tag}` });
  await me.call("POST", "/blocks/remove", { contactId: created.contact.id });
  assert.equal(await blocked(`@mal_${tag}`), false);
  assert.equal(await blocked(`Bola ${tag}`), false);
  assert.deepEqual(((await (await me.call("GET", "/blocks")).json()) as { blocks: BlockView[] }).blocks, []);
  assert.equal((await me.call("POST", "/blocks", { handle: `me_${tag}` })).status, 422, "not yourself");
  assert.equal((await me.call("POST", "/blocks", { handle: "x", address: bola })).status, 400, "exactly one target");
});

test("asks, reminders and Kawase's own nudges from someone blocked never reach the person, and they are not told", async () => {
  const tag = randomUUID().slice(0, 6);
  const malloryWallet = randomAddress();
  const me = await account(`me_${tag}`, randomAddress());
  const mallory = await account(`mal_${tag}`, malloryWallet);
  const service = new RequestService(db, noChains, {} as never, new InboxService(db, noChains), "https://app.getkawase.xyz");
  const ask = async (createdAt = new Date()) =>
    (
      await db
        .insert(paymentRequests)
        .values({ userId: mallory.id, payerUserId: me.id, token: randomBytes(12).toString("base64url"), network: "testnet", asset: "USDC", amount: 19_000_000n, payTo: malloryWallet, createdAt, expiresAt: new Date(Date.now() + REQUEST_TTL_S * MS_PER_SECOND) })
        .returning()
    )[0]!;

  // An ask that arrived before the block, then the block: it disappears from the inbox.
  const before = await ask();
  await service.remind(mallory.id, before.id);
  const inbox = async () => ((await (await me.call("GET", "/inbox")).json()) as { items: InboxItem[]; unread: number });
  assert.equal((await inbox()).items.filter((item) => item.requestId === before.id).length, 1);
  await me.call("POST", "/blocks", { handle: `mal_${tag}` });
  assert.equal((await inbox()).items.filter((item) => item.requestId === before.id).length, 0, "earlier asks are hidden");

  // New reminders and nudges never arrive, and to Mallory it reads as reminded.
  const later = await ask(new Date(Date.now() - REQUEST_NUDGE_AFTER_S * MS_PER_SECOND - 60_000));
  const answer = (await (await mallory.call("POST", `/requests/${later.id}/remind`)).json()) as { reminded: RequestReminder };
  assert.equal(answer.reminded, "in_app", "a block is never revealed");
  await service.remindDue(new Date());
  assert.equal((await db.select().from(inboxItems).where(and(eq(inboxItems.userId, me.id), eq(inboxItems.requestId, later.id)))).length, 0);

  // Unblocked: the next reminder arrives.
  await me.call("POST", "/blocks/remove", { handle: `mal_${tag}` });
  const fresh = await ask();
  assert.equal(((await (await mallory.call("POST", `/requests/${fresh.id}/remind`)).json()) as { reminded: RequestReminder }).reminded, "in_app");
  assert.equal((await inbox()).items.filter((item) => item.requestId === fresh.id).length, 1);
});
