// The person's address book (I1–I7). A contact holds versioned addresses: a new or changed address waits out a
// cooldown before money can go to it (I4, "vendor master change control"), and trust is kept per network, because
// paying someone on testnet says nothing about mainnet. Notes are the person's own words and are treated as
// untrusted text whenever the agent reads them.
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const contactKindEnum = pgEnum("contact_kind", ["person", "business"]);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text().notNull(),
    /** Other names the person uses for them ("mum", "landlord"). */
    aliases: text().array().notNull().default(sql`'{}'::text[]`),
    /** Set when the contact is a Kawase user reached by @handle (kept as typed, without the @). */
    handle: text(),
    kind: contactKindEnum().notNull().default("person"),
    /** A vendor label for business use (R): "supplier", "contractor"… */
    label: text(),
    notes: text(),
    deletedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contacts_user_name_idx")
      .on(table.userId, sql`lower(${table.displayName})`)
      .where(sql`${table.deletedAt} is null`),
    index("contacts_user_idx").on(table.userId),
  ],
);

/** How the address reached the book; shown as the trust chip ("from their @handle", "scanned"). */
export const addressSourceEnum = pgEnum("address_source", ["typed", "pasted", "scanned", "handle", "received", "agent"]);
export const contactAddressStatusEnum = pgEnum("contact_address_status", [
  "pending_cooldown",
  "active",
  "retired",
  "blocked",
]);

export const contactAddresses = pgTable(
  "contact_addresses",
  {
    id: id(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "arc": one address works on Arc and Arc Testnet. Other chains arrive with crosschain send (C6). */
    chainKey: text().notNull().default("arc"),
    address: text().notNull(),
    version: integer().notNull().default(1),
    isPreferred: boolean().notNull().default(true),
    source: addressSourceEnum().notNull(),
    sourceDetail: text(),
    status: contactAddressStatusEnum().notNull().default("active"),
    /** The address this one replaces (a change), so the history reads as a chain. */
    supersedesId: uuid(),
    /** When a pending address becomes payable. */
    activatesAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contact_addresses_contact_address_idx").on(
      table.contactId,
      table.chainKey,
      sql`lower(${table.address})`,
    ),
    index("contact_addresses_user_address_idx").on(table.userId, sql`lower(${table.address})`),
  ],
);

/** What the person knows about one address on one network. */
export const contactAddressTrust = pgTable(
  "contact_address_trust",
  {
    contactAddressId: uuid()
      .notNull()
      .references(() => contactAddresses.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    firstPaidAt: timestampTz(),
    lastPaidAt: timestampTz(),
    paymentCount: integer().notNull().default(0),
    /** Out-of-band confirmation ("they showed me their QR", "confirmed by phone"); required before unattended use. */
    verifiedAt: timestampTz(),
    verifiedMethod: text(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.contactAddressId, table.network] })],
);

/** Append-only history of a contact's addresses: added, change requested, activated, cancelled, retired. */
export const contactAddressEvents = pgTable(
  "contact_address_events",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    oldAddressId: uuid(),
    newAddressId: uuid(),
    /** user or agent */
    requestedBy: text().notNull(),
    cooldownEndsAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [index("contact_address_events_contact_idx").on(table.contactId, table.createdAt)],
);
