// The person's own safety settings on one network, read fresh for every check: pause, the risk dial, practice, the
// per-payment cap (with a temporary raise), the new-recipient cooldown, and the allowlist. Absent rows mean the
// network's defaults (@kawase/config DEFAULT_LIMITS).
import { and, eq, isNotNull, min, sql } from "drizzle-orm";

import { DEFAULT_LIMITS } from "@kawase/config";
import { contactAddresses, contactAddressTrust, contacts, intentDrafts, intents, limits, safetySettings, users, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";
import type { RiskMode } from "@kawase/policy";

type Executor = Pick<Db, "select">;

export type SafetySettings = {
  pausedAt: Date | null;
  riskMode: RiskMode;
  practice: boolean;
  allowlistOnly: boolean;
  perPayment: { value: bigint; default: bigint; temp: { value: bigint; until: Date } | null };
  cooldown: { seconds: number; cap: bigint };
};

export async function safetySettingsOf(db: Executor, userId: string, network: NetworkId): Promise<SafetySettings> {
  const defaults = DEFAULT_LIMITS[network];
  const [[person], rows, [settings]] = await Promise.all([
    db.select({ pausedAllAt: users.pausedAllAt, riskMode: users.riskMode, practiceMode: users.practiceMode }).from(users).where(eq(users.id, userId)),
    db.select().from(limits).where(and(eq(limits.userId, userId), eq(limits.network, network))),
    db.select().from(safetySettings).where(and(eq(safetySettings.userId, userId), eq(safetySettings.network, network))),
  ]);
  const row = (kind: (typeof rows)[number]["kind"]) => rows.find((entry) => entry.kind === kind);
  const perTx = row("per_tx");
  const now = Date.now();
  const temp = perTx?.tempValue !== null && perTx?.tempValue !== undefined && perTx.tempUntil && perTx.tempUntil.getTime() > now ? { value: perTx.tempValue, until: perTx.tempUntil } : null;
  return {
    pausedAt: person?.pausedAllAt ?? null,
    riskMode: person?.riskMode ?? "balanced",
    practice: person?.practiceMode ?? false,
    allowlistOnly: settings?.allowlistOnly ?? false,
    perPayment: { value: perTx?.value ?? defaults.perTransaction, default: defaults.perTransaction, temp },
    cooldown: {
      seconds: Number(row("new_recipient_cooldown_s")?.value ?? BigInt(defaults.newRecipientCooldownS)),
      cap: row("new_recipient_cap")?.value ?? defaults.newRecipientMaxDuringCooldown,
    },
  };
}

/**
 * What the person knows about one address on one network: when it was first known (saved as a contact, or first
 * paid — the cooldown runs from the earlier), and whether it is on their allowlist.
 */
export async function recipientTrust(db: Executor, userId: string, network: NetworkId, address: string) {
  const lower = address.toLowerCase();
  const [[saved], [paid], [listed]] = await Promise.all([
    db
      .select({ at: min(contactAddresses.createdAt) })
      .from(contactAddresses)
      .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
      .where(and(eq(contactAddresses.userId, userId), sql`lower(${contactAddresses.address}) = ${lower}`, sql`${contacts.deletedAt} is null`)),
    db
      .select({ at: min(intents.createdAt) })
      .from(intents)
      .innerJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
      .where(and(eq(intents.userId, userId), eq(intents.network, network), eq(intents.state, "completed"), sql`lower(${intentDrafts.payload}->'draft'->>'to') = ${lower}`)),
    db
      .select({ at: contactAddressTrust.allowlistedAt })
      .from(contactAddressTrust)
      .innerJoin(contactAddresses, eq(contactAddresses.id, contactAddressTrust.contactAddressId))
      .where(
        and(
          eq(contactAddressTrust.userId, userId),
          eq(contactAddressTrust.network, network),
          isNotNull(contactAddressTrust.allowlistedAt),
          eq(contactAddresses.status, "active"),
          sql`lower(${contactAddresses.address}) = ${lower}`,
        ),
      )
      .limit(1),
  ]);
  const times = [saved?.at, paid?.at].filter((at): at is Date => at instanceof Date).map((at) => at.getTime());
  return { knownSince: times.length > 0 ? new Date(Math.min(...times)).toISOString() : undefined, allowlisted: Boolean(listed) };
}

/** The contacts on the allowlist on one network (their active address), for the screen and the change classifier. */
export async function allowlistEntries(db: Executor, userId: string, network: NetworkId) {
  const rows = await db
    .select({ contactId: contacts.id, name: contacts.displayName, address: contactAddresses.address })
    .from(contactAddressTrust)
    .innerJoin(contactAddresses, eq(contactAddresses.id, contactAddressTrust.contactAddressId))
    .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
    .where(
      and(
        eq(contactAddressTrust.userId, userId),
        eq(contactAddressTrust.network, network),
        isNotNull(contactAddressTrust.allowlistedAt),
        eq(contactAddresses.status, "active"),
        sql`${contacts.deletedAt} is null`,
      ),
    );
  const seen = new Map<string, { contactId: string; name: string; address: string }>();
  for (const row of rows) if (!seen.has(row.contactId)) seen.set(row.contactId, row);
  return [...seen.values()];
}
