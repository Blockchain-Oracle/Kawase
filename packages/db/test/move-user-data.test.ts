// Runs against the local database: pnpm --filter @kawase/db test
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

import { consents, devices, limits, moveUserData, tablesWithUserId, USER_OWNED_TABLES, users } from "../src/index";
import { testDb } from "./helpers";

const { db, close } = testDb();
after(close);

test("every table with a user_id column is in the move list", async () => {
  const inDatabase = await tablesWithUserId(db);
  const listed = Object.keys(USER_OWNED_TABLES).sort();
  assert.deepEqual(inDatabase, listed);
});

test("a guest's data moves to the account; colliding rows keep the account's version", async () => {
  const [guest] = await db.insert(users).values({ isAnonymous: true }).returning();
  const [account] = await db
    .insert(users)
    .values({ isAnonymous: false, email: `move-${guest!.id}@example.test` })
    .returning();
  await db.insert(devices).values([
    { userId: guest!.id, platform: "ios", installationId: "shared-phone", appVersion: "guest" },
    { userId: guest!.id, platform: "web", installationId: "guest-laptop" },
    { userId: account!.id, platform: "ios", installationId: "shared-phone", appVersion: "account" },
  ]);
  await db.insert(consents).values([
    { userId: guest!.id, kind: "terms", version: "1", locale: "ar" },
    { userId: account!.id, kind: "terms", version: "1", locale: "en" },
  ]);
  await db.insert(limits).values({ userId: guest!.id, network: "testnet", kind: "daily", value: 5n });

  await db.transaction((tx) => moveUserData(tx, guest!.id, account!.id));

  const movedDevices = await db.select().from(devices).where(eq(devices.userId, account!.id));
  assert.deepEqual(movedDevices.map((d) => [d.installationId, d.appVersion]).sort(), [
    ["guest-laptop", null],
    ["shared-phone", "account"],
  ]);
  const movedConsents = await db.select().from(consents).where(eq(consents.userId, account!.id));
  assert.deepEqual(
    movedConsents.map((c) => c.locale),
    ["en"],
  );
  const movedLimits = await db.select().from(limits).where(eq(limits.userId, account!.id));
  assert.equal(movedLimits[0]?.value, 5n);
  assert.equal((await db.select().from(users).where(eq(users.id, guest!.id))).length, 0);

  await db.delete(users).where(eq(users.id, account!.id));
});
