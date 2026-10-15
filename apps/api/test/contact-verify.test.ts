// Verify a contact (capability matrix, Counterparts "Verify"): the person marks the current address as checked — their
// QR scanned, in person or on a call — per network, and can take it back; it shows on the address's trust and in the
// address history. Database only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";

import type { Contact } from "@kawase/api-client";
import { contactAddressEvents, users } from "@kawase/db";

import { deleteUser, jsonRequest, testApp } from "./helpers";

const { app, db, close } = testApp();
const ids: string[] = [];
after(async () => {
  for (const id of ids) await deleteUser(db, id);
  await close();
});

test("a contact's current address is verified per network by the person and can be cleared; any other method is refused", async () => {
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  ids.push(user.id);
  await db.update(users).set({ isAnonymous: false, email: `verify-${randomUUID().slice(0, 8)}@example.test` }).where(eq(users.id, user.id));
  const call = async (method: string, path: string, body?: unknown) => app.request(path, jsonRequest(method, body ?? {}, token));

  const created = (await (await call("POST", "/contacts", { displayName: "Amina", address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", source: "pasted" })).json()) as { contact: Contact };
  const id = created.contact.id;
  const verify = async (method: string | null) => (await (await call("POST", `/contacts/${id}/verify`, { method })).json()) as { contact: Contact };
  const trust = (contact: Contact) => contact.addresses.find((entry) => entry.status === "active")?.trust.testnet?.verifiedMethod ?? null;

  assert.equal(trust((await verify("qr")).contact), "qr");
  assert.equal(trust((await verify("in_person")).contact), "in_person");
  assert.equal(trust((await verify(null)).contact), null);
  assert.equal((await call("POST", `/contacts/${id}/verify`, { method: "the seller said so" })).status, 400);
  const events = await db.select({ kind: contactAddressEvents.kind }).from(contactAddressEvents).where(and(eq(contactAddressEvents.contactId, id), eq(contactAddressEvents.userId, user.id)));
  assert.deepEqual(events.map((event) => event.kind).filter((kind) => kind.endsWith("verified")), ["verified", "verified", "unverified"]);
});
