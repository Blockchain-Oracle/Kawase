// When a guest signs in and the account already exists, everything the guest did moves to the account in one
// transaction (spike 10's rule, on Kawase's own tables). `USER_OWNED_TABLES` must name every table with a
// `user_id` column; a test checks it against the database.
import { aliasedTable, and, eq, exists, getTableColumns, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { Db } from "./client";
import { threadMessages, threads, threadTurns } from "./schema/chat";
import { contactAddressEvents, contactAddresses, contactAddressTrust, contacts } from "./schema/contacts";
import { consents, devices, sessions, users } from "./schema/identity";
import { apiIdempotency, auditLog, outbox } from "./schema/system";
import { approvals, intents, spendLedger } from "./schema/intents";
import { chainEvents, inboxItems, paymentRequests } from "./schema/requests";
import { automationRuns, automations } from "./schema/automations";
import { notificationDeliveries } from "./schema/notifications";
import { faucetClaims, grants, limits, txAttempts, userWalletSetup, wallets } from "./schema/wallets";

type UserOwned = {
  table: PgTable;
  userId: PgColumn;
  /**
   * Columns that, with user_id, are unique per user. A guest row that would collide with a row the account
   * already has is dropped: the account's own row wins.
   */
  perUserKey?: string[];
};

export const USER_OWNED_TABLES: Record<string, UserOwned> = {
  devices: { table: devices, userId: devices.userId, perUserKey: ["installationId"] },
  sessions: { table: sessions, userId: sessions.userId },
  consents: { table: consents, userId: consents.userId, perUserKey: ["kind", "version"] },
  wallets: { table: wallets, userId: wallets.userId, perUserKey: ["role"] },
  user_wallet_setup: { table: userWalletSetup, userId: userWalletSetup.userId, perUserKey: ["network"] },
  grants: { table: grants, userId: grants.userId },
  tx_attempts: { table: txAttempts, userId: txAttempts.userId },
  limits: { table: limits, userId: limits.userId, perUserKey: ["network", "kind"] },
  audit_log: { table: auditLog, userId: auditLog.userId },
  api_idempotency: { table: apiIdempotency, userId: apiIdempotency.userId, perUserKey: ["key"] },
  outbox: { table: outbox, userId: outbox.userId },
  faucet_claims: { table: faucetClaims, userId: faucetClaims.userId },
  threads: { table: threads, userId: threads.userId },
  thread_messages: { table: threadMessages, userId: threadMessages.userId },
  thread_turns: { table: threadTurns, userId: threadTurns.userId },
  // Contacts keep their ids, so addresses, trust and events follow them; a guest contact whose name the account
  // already uses is dropped with its addresses (the account's own book wins).
  contacts: { table: contacts, userId: contacts.userId, perUserKey: ["displayName"] },
  contact_addresses: { table: contactAddresses, userId: contactAddresses.userId },
  contact_address_trust: { table: contactAddressTrust, userId: contactAddressTrust.userId },
  contact_address_events: { table: contactAddressEvents, userId: contactAddressEvents.userId },
  intents: { table: intents, userId: intents.userId },
  approvals: { table: approvals, userId: approvals.userId },
  spend_ledger: { table: spendLedger, userId: spendLedger.userId },
  payment_requests: { table: paymentRequests, userId: paymentRequests.userId },
  chain_events: { table: chainEvents, userId: chainEvents.userId },
  inbox_items: { table: inboxItems, userId: inboxItems.userId },
  automations: { table: automations, userId: automations.userId },
  automation_runs: { table: automationRuns, userId: automationRuns.userId },
  notification_deliveries: { table: notificationDeliveries, userId: notificationDeliveries.userId },
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Moves every user-owned row from `fromUserId` to `toUserId`, then deletes the `from` user. */
export async function moveUserData(tx: Tx, fromUserId: string, toUserId: string): Promise<void> {
  for (const { table, userId, perUserKey } of Object.values(USER_OWNED_TABLES)) {
    if (perUserKey) {
      const account = aliasedTable(table, "account");
      const accountColumns = getTableColumns(account);
      const columns = getTableColumns(table);
      const sameKey = perUserKey.map((key) => eq(accountColumns[key]!, columns[key]!));
      await tx.delete(table).where(
        and(
          eq(userId, fromUserId),
          exists(
            tx
              .select({ one: sql`1` })
              .from(account)
              .where(and(eq(accountColumns.userId!, toUserId), ...sameKey)),
          ),
        ),
      );
    }
    await tx
      .update(table)
      .set({ userId: toUserId } as never)
      .where(eq(userId, fromUserId));
  }
  await tx.delete(users).where(eq(users.id, fromUserId));
}

/** Names of tables in the database that have a `user_id` column (for the test that guards the list above). */
export async function tablesWithUserId(db: Db): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}
