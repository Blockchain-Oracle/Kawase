// The address book (I1–I7). Addresses are versioned: a contact's first address is payable at once, a changed one
// waits out a cooldown during which the contact is frozen (I4), and every change is written to an append-only
// history. A contact can be a Kawase user reached by @handle; the address is taken from their wallet at that moment
// and kept, so a later change of their handle never redirects money.
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getAddress, isAddress, type Address } from "viem";

import { CONTACT_ADDRESS_CHANGE_COOLDOWN_S, MS_PER_SECOND } from "@kawase/config";
import type { AddressSource, Contact, ContactInput } from "@kawase/api-client";
import {
  contactAddressEvents,
  contactAddresses,
  contactAddressTrust,
  contacts,
  users,
  wallets,
  type Db,
} from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";

const ARC = "arc";
const HANDLE_PREFIX = "@";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export type ContactRow = typeof contacts.$inferSelect;
export type ContactAddressRow = typeof contactAddresses.$inferSelect;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** A Kawase user's wallet address by @handle, or undefined (no such handle, or no wallet yet). */
export async function addressForHandle(db: Executor, handle: string) {
  const bare = handle.replace(/^@/, "").toLowerCase();
  const [row] = await db
    .select({ userId: users.id, handle: users.handle, address: wallets.address })
    .from(users)
    .leftJoin(wallets, and(eq(wallets.userId, users.id), eq(wallets.role, "user"), eq(wallets.status, "active")))
    .where(sql`lower(${users.handle}) = ${bare}`);
  if (!row?.handle) return undefined;
  return { userId: row.userId, handle: row.handle, address: row.address ? getAddress(row.address) : undefined };
}

export class ContactService {
  constructor(private readonly db: Db) {}

  /** A pending address whose cooldown has passed becomes the contact's address; the old one is retired. */
  async promoteDue(userId: string) {
    const due = await this.db
      .select()
      .from(contactAddresses)
      .where(
        and(
          eq(contactAddresses.userId, userId),
          eq(contactAddresses.status, "pending_cooldown"),
          lte(contactAddresses.activatesAt, new Date()),
        ),
      );
    for (const pending of due) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(contactAddresses)
          .set({ status: "retired", isPreferred: false })
          .where(
            and(
              eq(contactAddresses.contactId, pending.contactId),
              eq(contactAddresses.status, "active"),
              eq(contactAddresses.chainKey, pending.chainKey),
            ),
          );
        await tx
          .update(contactAddresses)
          .set({ status: "active", isPreferred: true })
          .where(eq(contactAddresses.id, pending.id));
        await tx.insert(contactAddressEvents).values({
          userId,
          contactId: pending.contactId,
          kind: "activated",
          oldAddressId: pending.supersedesId,
          newAddressId: pending.id,
          requestedBy: "system",
        });
      });
    }
  }

  async list(userId: string): Promise<Contact[]> {
    await this.promoteDue(userId);
    const rows = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.userId, userId), isNull(contacts.deletedAt)))
      .orderBy(asc(sql`lower(${contacts.displayName})`));
    return this.withAddresses(rows);
  }

  async get(userId: string, id: string): Promise<Contact> {
    await this.promoteDue(userId);
    const [row] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId), isNull(contacts.deletedAt)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such contact");
    const [contact] = await this.withAddresses([row]);
    return contact!;
  }

  private async withAddresses(rows: ContactRow[]): Promise<Contact[]> {
    if (rows.length === 0) return [];
    const addresses = await this.db
      .select()
      .from(contactAddresses)
      .where(
        inArray(
          contactAddresses.contactId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(contactAddresses.version));
    const trust = addresses.length
      ? await this.db
          .select()
          .from(contactAddressTrust)
          .where(
            inArray(
              contactAddressTrust.contactAddressId,
              addresses.map((address) => address.id),
            ),
          )
      : [];
    return rows.map((row) => {
      const own = addresses.filter((address) => address.contactId === row.id);
      const active = own.find((address) => address.status === "active" && address.isPreferred);
      const pending = own.find((address) => address.status === "pending_cooldown");
      return {
        id: row.id,
        displayName: row.displayName,
        aliases: row.aliases,
        handle: row.handle,
        kind: row.kind,
        label: row.label,
        notes: row.notes,
        address: pending ? null : (active?.address ?? null),
        pendingChange: pending ? { address: pending.address, activatesAt: iso(pending.activatesAt)! } : null,
        addresses: own.map((address) => ({
          id: address.id,
          address: address.address,
          version: address.version,
          status: address.status,
          source: address.source,
          sourceDetail: address.sourceDetail,
          activatesAt: iso(address.activatesAt),
          createdAt: address.createdAt.toISOString(),
          trust: Object.fromEntries(
            trust
              .filter((entry) => entry.contactAddressId === address.id)
              .map((entry) => [
                entry.network,
                { paymentCount: entry.paymentCount, lastPaidAt: iso(entry.lastPaidAt), verifiedMethod: entry.verifiedMethod },
              ]),
          ),
        })),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Turns what the person typed (0x… or @handle) into an address and where it came from. */
  private async resolveInput(userId: string, input: string, source: AddressSource | undefined) {
    const text = input.trim();
    if (text.startsWith(HANDLE_PREFIX) || !text.startsWith("0x")) {
      const found = await addressForHandle(this.db, text);
      if (!found) throw problem(HTTP.unprocessable, "recipient_unknown", `no Kawase user ${text}`);
      if (!found.address) throw problem(HTTP.unprocessable, "recipient_no_wallet", `${text} has no wallet yet`);
      if (found.userId === userId) throw problem(HTTP.unprocessable, "recipient_is_self");
      return { address: found.address, source: "handle" as const, sourceDetail: `@${found.handle}`, handle: found.handle };
    }
    if (!isAddress(text, { strict: false })) throw problem(HTTP.unprocessable, "address_invalid");
    const address = getAddress(text);
    const [own] = await this.db
      .select({ address: wallets.address })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.role, "user")));
    if (own && own.address.toLowerCase() === address.toLowerCase())
      throw problem(HTTP.unprocessable, "recipient_is_self");
    return { address, source: source ?? ("typed" as const), sourceDetail: null, handle: null };
  }

  async create(userId: string, input: ContactInput, requestedBy: "user" | "agent" = "user"): Promise<Contact> {
    const name = input.displayName.trim();
    if (!name) throw problem(HTTP.unprocessable, "validation", "a name is needed");
    const resolved = await this.resolveInput(userId, input.address, input.source);
    const [taken] = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.userId, userId), isNull(contacts.deletedAt), sql`lower(${contacts.displayName}) = ${name.toLowerCase()}`),
      );
    if (taken) throw problem(HTTP.conflict, "contact_exists", `${name} is already in your contacts`, { contactId: taken.id });
    const id = await this.db.transaction(async (tx) => {
      const [contact] = await tx
        .insert(contacts)
        .values({
          userId,
          displayName: name,
          aliases: (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
          handle: resolved.handle,
          kind: input.kind ?? "person",
          label: input.label ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: contacts.id });
      const [address] = await tx
        .insert(contactAddresses)
        .values({
          contactId: contact!.id,
          userId,
          chainKey: ARC,
          address: resolved.address,
          source: resolved.source,
          sourceDetail: resolved.sourceDetail,
          status: "active",
        })
        .returning({ id: contactAddresses.id });
      await tx.insert(contactAddressEvents).values({
        userId,
        contactId: contact!.id,
        kind: "added",
        newAddressId: address!.id,
        requestedBy,
      });
      return contact!.id;
    });
    return this.get(userId, id);
  }

  async update(
    userId: string,
    id: string,
    patch: { [K in "displayName" | "aliases" | "notes" | "label" | "kind"]?: ContactInput[K] | undefined },
  ): Promise<Contact> {
    await this.get(userId, id);
    const set: Partial<typeof contacts.$inferInsert> = {};
    if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
    if (patch.aliases !== undefined) set.aliases = patch.aliases.map((alias) => alias.trim()).filter(Boolean);
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (Object.keys(set).length) await this.db.update(contacts).set(set).where(eq(contacts.id, id));
    return this.get(userId, id);
  }

  /** A new address for a contact: it waits out the cooldown, and the contact cannot be paid until then. */
  async changeAddress(userId: string, id: string, input: { address: string; source?: AddressSource | undefined }, requestedBy: "user" | "agent" = "user") {
    const contact = await this.get(userId, id);
    const resolved = await this.resolveInput(userId, input.address, input.source);
    const current = contact.addresses.find((address) => address.status === "active");
    if (current && current.address.toLowerCase() === resolved.address.toLowerCase() && !contact.pendingChange)
      throw problem(HTTP.unprocessable, "validation", "that is already the contact's address");
    const activatesAt = new Date(Date.now() + CONTACT_ADDRESS_CHANGE_COOLDOWN_S * MS_PER_SECOND);
    const nextVersion = Math.max(0, ...contact.addresses.map((address) => address.version)) + 1;
    await this.db.transaction(async (tx) => {
      await tx
        .update(contactAddresses)
        .set({ status: "retired", isPreferred: false })
        .where(and(eq(contactAddresses.contactId, id), eq(contactAddresses.status, "pending_cooldown")));
      const [existing] = await tx
        .select({ id: contactAddresses.id })
        .from(contactAddresses)
        .where(and(eq(contactAddresses.contactId, id), sql`lower(${contactAddresses.address}) = ${resolved.address.toLowerCase()}`));
      const values = {
        status: "pending_cooldown" as const,
        isPreferred: false,
        version: nextVersion,
        source: resolved.source,
        sourceDetail: resolved.sourceDetail,
        supersedesId: current?.id ?? null,
        activatesAt,
      };
      const newId = existing
        ? (await tx.update(contactAddresses).set(values).where(eq(contactAddresses.id, existing.id)).returning({ id: contactAddresses.id }))[0]!.id
        : (
            await tx
              .insert(contactAddresses)
              .values({ contactId: id, userId, chainKey: ARC, address: resolved.address, ...values })
              .returning({ id: contactAddresses.id })
          )[0]!.id;
      await tx.insert(contactAddressEvents).values({
        userId,
        contactId: id,
        kind: "change_requested",
        oldAddressId: current?.id ?? null,
        newAddressId: newId,
        requestedBy,
        cooldownEndsAt: activatesAt,
      });
    });
    return this.get(userId, id);
  }

  async cancelChange(userId: string, id: string) {
    const contact = await this.get(userId, id);
    if (!contact.pendingChange) return contact;
    await this.db.transaction(async (tx) => {
      const [retired] = await tx
        .update(contactAddresses)
        .set({ status: "retired" })
        .where(and(eq(contactAddresses.contactId, id), eq(contactAddresses.status, "pending_cooldown")))
        .returning({ id: contactAddresses.id });
      await tx.insert(contactAddressEvents).values({
        userId,
        contactId: id,
        kind: "change_cancelled",
        newAddressId: retired?.id ?? null,
        requestedBy: "user",
      });
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, id));
  }

  /** Every address in the person's book (live contacts only), for resolution and the lookalike check. */
  async addressBook(userId: string) {
    await this.promoteDue(userId);
    return this.db
      .select({
        contactId: contacts.id,
        name: contacts.displayName,
        aliases: contacts.aliases,
        handle: contacts.handle,
        addressId: contactAddresses.id,
        address: contactAddresses.address,
        status: contactAddresses.status,
        isPreferred: contactAddresses.isPreferred,
        source: contactAddresses.source,
        activatesAt: contactAddresses.activatesAt,
      })
      .from(contacts)
      .innerJoin(contactAddresses, eq(contactAddresses.contactId, contacts.id))
      .where(and(eq(contacts.userId, userId), isNull(contacts.deletedAt)));
  }

  /** After a confirmed send: the address now counts as paid on that network. */
  async markPaid(executor: Executor, userId: string, network: NetworkId, address: Address, at: Date) {
    const matches = await executor
      .select({ id: contactAddresses.id })
      .from(contactAddresses)
      .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
      .where(
        and(eq(contactAddresses.userId, userId), isNull(contacts.deletedAt), sql`lower(${contactAddresses.address}) = ${address.toLowerCase()}`),
      );
    for (const match of matches) {
      await executor
        .insert(contactAddressTrust)
        .values({ contactAddressId: match.id, userId, network, firstPaidAt: at, lastPaidAt: at, paymentCount: 1 })
        .onConflictDoUpdate({
          target: [contactAddressTrust.contactAddressId, contactAddressTrust.network],
          set: { lastPaidAt: at, paymentCount: sql`${contactAddressTrust.paymentCount} + 1` },
        });
    }
  }
}
