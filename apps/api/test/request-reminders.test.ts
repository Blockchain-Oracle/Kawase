// Request reminders (surfaces.md Request, "reminders"): the requester's Remind tells someone asked in Kawase again, at
// most once a day per request, and hands a link-only request back to be shared; Kawase reminds an asked payer itself
// once after a few unpaid days and once on the request's last day; a split reminds everyone still open. Database only:
// the requests are written directly, no chain.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";

import type { InboxItem, PaymentRequest, RequestReminder, SplitReminders } from "@kawase/api-client";
import { REQUEST_NUDGE_AFTER_S, REQUEST_TTL_S, MS_PER_SECOND } from "@kawase/config";
import { inboxItems, paymentRequests, splitShares, splits, users } from "@kawase/db";

import { buildIntelligence } from "../src/agent/intelligence";
import { InboxService } from "../src/inbox/service";
import { renderNotification } from "../src/notify/render";
import { RequestService } from "../src/requests/service";
import { deleteUser, jsonRequest, noChains, testApp } from "./helpers";

const { app, db, close } = testApp();
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

const DAY_MS = 86_400_000;
const PAY_TO = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

async function account(handle: string) {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false, email: `${handle}@example.test`, handle }).where(eq(users.id, user.id));
  const call = (method: string, path: string, body?: unknown) => app.request(path, body === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, body, token));
  return { id: user.id, call };
}

async function request(userId: string, payerUserId: string | null, extra: Partial<typeof paymentRequests.$inferInsert> = {}) {
  const [row] = await db
    .insert(paymentRequests)
    .values({ userId, payerUserId, token: randomBytes(12).toString("base64url"), network: "testnet", asset: "USDC", amount: 12_000_000n, note: "dinner", payTo: PAY_TO, expiresAt: new Date(Date.now() + REQUEST_TTL_S * MS_PER_SECOND), ...extra })
    .returning();
  return row!;
}

const reminders = (payerId: string, requestId: string) =>
  db.select().from(inboxItems).where(and(eq(inboxItems.userId, payerId), eq(inboxItems.requestId, requestId)));

test("Remind: in Kawase once a day for someone asked there, the link again otherwise; only the requester, only while open", async () => {
  const tag = randomUUID().slice(0, 6);
  const requester = await account(`rq_${tag}`);
  const payer = await account(`py_${tag}`);
  const asked = await request(requester.id, payer.id);

  const remind = async (who: typeof requester, id: string) => who.call("POST", `/requests/${id}/remind`);
  const first = (await (await remind(requester, asked.id)).json()) as { request: PaymentRequest; reminded: RequestReminder };
  assert.equal(first.reminded, "in_app");
  assert.equal(first.request.payer?.handle, `py_${tag}`);
  assert.equal(((await (await remind(requester, asked.id)).json()) as { reminded: RequestReminder }).reminded, "already_today");
  const items = await reminders(payer.id, asked.id);
  assert.equal(items.length, 1, "one reminder today");
  assert.equal(items[0]!.kind, "request_received");
  assert.equal((items[0]!.params as Record<string, string>).reminder, "1");

  // The payer's inbox row and push say it is a reminder, with who asks and how much.
  const listed = ((await (await payer.call("GET", "/inbox")).json()) as { items: InboxItem[] }).items.find((item) => item.requestId === asked.id)!;
  const words = renderNotification({ kind: listed.kind, network: listed.network, params: listed.params, requestId: listed.requestId }, "en");
  // (No wallet row here, so the requester is named by the short address the money goes to.)
  assert.match(words.title, /^Testnet · Reminder: 0x8ba1…BA72 asked you for 12\.00 USDC$/);
  assert.equal(words.path, `/r/${asked.token}`);

  const linkOnly = await request(requester.id, null);
  assert.equal(((await (await remind(requester, linkOnly.id)).json()) as { reminded: RequestReminder }).reminded, "link");
  assert.equal((await remind(payer, asked.id)).status, 404, "only the requester can remind");
  const closed = await request(requester.id, payer.id, { status: "canceled" });
  assert.equal((await remind(requester, closed.id)).status, 409);
});

test("Kawase reminds an asked payer once after a few unpaid days and once on the last day, never twice", async () => {
  const tag = randomUUID().slice(0, 6);
  const requester = await account(`rq_${tag}`);
  const payer = await account(`py_${tag}`);
  const now = new Date();
  const fresh = await request(requester.id, payer.id);
  const waiting = await request(requester.id, payer.id, { createdAt: new Date(now.getTime() - REQUEST_NUDGE_AFTER_S * MS_PER_SECOND - DAY_MS) });
  const lastDay = await request(requester.id, payer.id, { createdAt: new Date(now.getTime() - 29 * DAY_MS), expiresAt: new Date(now.getTime() + DAY_MS / 2) });
  const unasked = await request(requester.id, null, { createdAt: new Date(now.getTime() - 10 * DAY_MS) });

  const service = new RequestService(db, noChains, {} as never, new InboxService(db, noChains), "https://app.getkawase.xyz");
  await service.remindDue(now);
  await service.remindDue(now);
  const keys = async (id: string) => (await reminders(payer.id, id)).map((item) => item.dedupeKey);
  assert.deepEqual(await keys(fresh.id), [], "too soon");
  assert.deepEqual(await keys(waiting.id), [`request_reminder:${waiting.id}:nudge`]);
  assert.deepEqual(await keys(lastDay.id), [`request_reminder:${lastDay.id}:last_day`]);
  assert.equal((await db.select().from(inboxItems).where(eq(inboxItems.requestId, unasked.id))).length, 0, "a link-only request has no one to tell");
});

test("a split's Remind tells those asked in Kawase and hands back the other open links", async () => {
  const tag = randomUUID().slice(0, 6);
  const requester = await account(`rq_${tag}`);
  const payer = await account(`py_${tag}`);
  const inApp = await request(requester.id, payer.id);
  const byLink = await request(requester.id, null);
  const paid = await request(requester.id, null, { status: "paid", paidAt: new Date() });
  const [split] = await db.insert(splits).values({ userId: requester.id, network: "testnet", title: "Dinner", asset: "USDC", total: 36_000_000n, myShare: null }).returning();
  await db.insert(splitShares).values([inApp, byLink, paid].map((row, seq) => ({ splitId: split!.id, userId: requester.id, seq, name: ["Kemi", "Bola", "Ade"][seq]!, handle: seq === 0 ? `py_${tag}` : null, amount: 12_000_000n, requestId: row.id })));

  const answer = (await (await requester.call("POST", `/splits/${split!.id}/remind`)).json()) as { reminded: SplitReminders };
  assert.equal(answer.reminded.inApp, 1);
  assert.deepEqual(answer.reminded.links.map((entry) => [entry.name, entry.amount]), [["Bola", "12000000"]]);
  assert.match(answer.reminded.links[0]!.link, new RegExp(`/r/${byLink.token}$`));
  const again = (await (await requester.call("POST", `/splits/${split!.id}/remind`)).json()) as { reminded: SplitReminders };
  assert.equal(again.reminded.alreadyToday, 1);
});

test("remind_payment finds the request by who or what it was for, asks which when several match", async () => {
  const tag = randomUUID().slice(0, 6);
  const requester = await account(`rq_${tag}`);
  const payer = await account(`py_${tag}`);
  const taxi = await request(requester.id, payer.id, { note: "taxi home" });
  const lunch = await request(requester.id, payer.id, { note: "lunch" });
  const [split] = await db.insert(splits).values({ userId: requester.id, network: "testnet", title: "Dinner at Ola's", asset: "USDC", total: 24_000_000n, myShare: 12_000_000n }).returning();
  const bolaShare = await request(requester.id, null);
  await db.insert(splitShares).values({ splitId: split!.id, userId: requester.id, seq: 0, name: "Bola", handle: null, amount: 12_000_000n, requestId: bolaShare.id });

  const [row] = await db.select().from(users).where(eq(users.id, requester.id));
  const requests = new RequestService(db, noChains, {} as never, new InboxService(db, noChains), "https://app.getkawase.xyz");
  const intelligence = buildIntelligence({ db, user: { ...row!, activeNetwork: "testnet" } as never, threadId: randomUUID(), log: { warn: () => undefined, info: () => undefined } as never, requests } as never);

  const several = await intelligence.remindPayment({ who: `@py_${tag}` });
  assert.equal(several.status, "choose");
  assert.deepEqual(several.status === "choose" ? several.requests.map((entry) => [entry.note, entry.amount]).sort() : [], [["lunch", "12 USDC"], ["taxi home", "12 USDC"]]);
  const one = await intelligence.remindPayment({ who: `py_${tag}`, about: "the taxi" });
  assert.equal(one.status === "reminded" && one.request.id, taxi.id);
  assert.equal(one.status === "reminded" && one.reminded, "in_app");
  const picked = await intelligence.remindPayment({ requestId: lunch.id });
  assert.equal(picked.status === "reminded" && picked.who, `@py_${tag}`);
  const bola = await intelligence.remindPayment({ who: "bola" });
  assert.deepEqual(bola.status === "reminded" ? [bola.request.id, bola.reminded, bola.who] : [], [bolaShare.id, "link", "Bola"]);
  const dinner = await intelligence.remindPayment({ about: "dinner" });
  assert.equal(dinner.status === "reminded" && dinner.request.id, bolaShare.id, "a split's title counts as what it was for");
  assert.equal((await intelligence.remindPayment({ who: "nobody" })).status, "not_found");
});
