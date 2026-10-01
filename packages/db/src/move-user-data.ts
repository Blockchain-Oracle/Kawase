// When a guest signs in and the account already exists, everything the guest did moves to the account in one
// transaction (spike 10's rule, on Kawase's own tables). `USER_OWNED_TABLES` must name every table with a
// `user_id` column; a test checks it against the database.
import { aliasedTable, and, eq, exists, getTableColumns, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { Db } from "./client";
import { threadMessages, threads } from "./schema/chat";
import { consents, devices, sessions, users } from "./schema/identity";
import { apiIdempotency, auditLog, outbox } from "./schema/system";
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
