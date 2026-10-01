// Who a send goes to, from the person's own words (K2: the model passes the words, code resolves them). An address
// may only come from the person's book, a Kawase @handle, or an address the person typed or pasted themselves. A
// bare name never resolves to a stranger's public handle: an exact handle match is offered as a suggestion only.
import { and, eq, sql } from "drizzle-orm";
import { getAddress, isAddress } from "viem";

import { LOOKALIKE_PREFIX_CHARS, LOOKALIKE_SUFFIX_CHARS } from "@kawase/config";
import type { AddressSource, RecipientMatch, SendRecipientView } from "@kawase/api-client";
import { contactAddressTrust, intentDrafts, intents, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";
import type { RecipientFacts } from "@kawase/policy";

import { addressForHandle, type ContactService } from "../contacts/service";

const HEX_PREFIX = 2;
const SEARCH_LIMIT = 8;

export type Resolution = {
  facts: RecipientFacts;
  view: SendRecipientView | null;
  suggestions: RecipientMatch[];
};

type BookEntry = Awaited<ReturnType<ContactService["addressBook"]>>[number];

const body = (address: string) => address.slice(HEX_PREFIX).toLowerCase();
const looksAlike = (a: string, b: string) =>
  body(a) !== body(b) &&
  body(a).slice(0, LOOKALIKE_PREFIX_CHARS) === body(b).slice(0, LOOKALIKE_PREFIX_CHARS) &&
  body(a).slice(-LOOKALIKE_SUFFIX_CHARS) === body(b).slice(-LOOKALIKE_SUFFIX_CHARS);

export class Recipients {
  constructor(
    private readonly db: Db,
    private readonly contacts: ContactService,
  ) {}

  /** A completed send to this exact address on this network exists. */
  async paidBefore(userId: string, network: NetworkId, address: string) {
    const [row] = await this.db
      .select({ one: sql`1` })
      .from(intents)
      .innerJoin(
        intentDrafts,
        and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)),
      )
      .where(
        and(
          eq(intents.userId, userId),
          eq(intents.network, network),
          eq(intents.state, "completed"),
          sql`lower(${intentDrafts.payload}->'draft'->>'to') = ${address.toLowerCase()}`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async verifiedMethod(addressId: string, network: NetworkId) {
    const [row] = await this.db
      .select({ method: contactAddressTrust.verifiedMethod })
      .from(contactAddressTrust)
      .where(and(eq(contactAddressTrust.contactAddressId, addressId), eq(contactAddressTrust.network, network)));
    return row?.method ?? null;
  }

  private async fromContact(
    entries: BookEntry[],
    contactId: string,
    userId: string,
    network: NetworkId,
    book: BookEntry[],
  ): Promise<Resolution> {
    const own = entries.filter((entry) => entry.contactId === contactId);
    const active = own.find((entry) => entry.status === "active" && entry.isPreferred);
    const pending = own.find((entry) => entry.status === "pending_cooldown");
    const target = active ?? pending;
    const first = own[0]!;
    if (!target) return { facts: { status: "unknown", query: first.name }, view: null, suggestions: [] };
    const address = getAddress(target.address);
    const paidBefore = await this.paidBefore(userId, network, address);
    const lookalike = book.find((entry) => entry.contactId !== contactId && looksAlike(entry.address, address));
    return {
      facts: {
        status: "resolved",
        address,
        via: "contact",
        name: first.name,
        holdUntil: pending?.activatesAt?.toISOString(),
        paidBefore,
        lookalikeOf: lookalike?.name,
      },
      view: {
        via: "contact",
        address,
        name: first.name,
        handle: first.handle,
        contactId,
        source: target.source as AddressSource,
        verifiedMethod: await this.verifiedMethod(target.addressId, network),
        paidBefore,
      },
      suggestions: [],
    };
  }

  async resolve(user: { id: string; walletAddress: string | undefined }, network: NetworkId, input: string | null | undefined): Promise<Resolution> {
    const text = (input ?? "").trim();
    if (!text) return { facts: { status: "missing" }, view: null, suggestions: [] };
    const self = user.walletAddress?.toLowerCase();
    const book = await this.contacts.addressBook(user.id);

    // A pasted or typed address.
    if (/^0x/i.test(text)) {
      if (!isAddress(text, { strict: false })) return { facts: { status: "invalid", query: text }, view: null, suggestions: [] };
      const address = getAddress(text);
      if (address.toLowerCase() === self) return { facts: { status: "self" }, view: null, suggestions: [] };
      const saved = book.find((entry) => entry.status === "active" && entry.address.toLowerCase() === address.toLowerCase());
      if (saved) return this.fromContact(book, saved.contactId, user.id, network, book);
      const paidBefore = await this.paidBefore(user.id, network, address);
      const lookalike = book.find((entry) => looksAlike(entry.address, address));
      return {
        facts: { status: "resolved", address, via: "address", paidBefore, lookalikeOf: lookalike?.name },
        view: { via: "address", address, name: null, handle: null, contactId: null, source: null, verifiedMethod: null, paidBefore },
        suggestions: [],
      };
    }

    // An @handle: a Kawase user's own wallet.
    if (text.startsWith("@")) {
      const saved = book.find((entry) => entry.handle && `@${entry.handle}`.toLowerCase() === text.toLowerCase());
      if (saved) return this.fromContact(book, saved.contactId, user.id, network, book);
      const found = await addressForHandle(this.db, text);
      if (!found) return { facts: { status: "unknown", query: text }, view: null, suggestions: [] };
      if (!found.address) return { facts: { status: "no_wallet", handle: found.handle }, view: null, suggestions: [] };
      if (found.address.toLowerCase() === self) return { facts: { status: "self" }, view: null, suggestions: [] };
      const paidBefore = await this.paidBefore(user.id, network, found.address);
      return {
        facts: { status: "resolved", address: found.address, via: "handle", name: `@${found.handle}`, paidBefore },
        view: {
          via: "handle",
          address: found.address,
          name: null,
          handle: found.handle,
          contactId: null,
          source: "handle",
          verifiedMethod: null,
          paidBefore,
        },
        suggestions: [],
      };
    }

    // A name: the person's own book only, by name or alias.
    const lower = text.toLowerCase();
    const named = [
      ...new Set(
        book
          .filter((entry) => entry.name.toLowerCase() === lower || entry.aliases.some((alias) => alias.toLowerCase() === lower))
          .map((entry) => entry.contactId),
      ),
    ];
    if (named.length === 1) return this.fromContact(book, named[0]!, user.id, network, book);
    if (named.length > 1)
      return { facts: { status: "ambiguous", query: text, count: named.length }, view: null, suggestions: [] };
    const handle = await addressForHandle(this.db, text);
    const suggestions: RecipientMatch[] =
      handle?.address && handle.address.toLowerCase() !== self
        ? [{ kind: "handle", handle: handle.handle, address: handle.address }]
        : [];
    return { facts: { status: "unknown", query: text }, view: null, suggestions };
  }

  /** The send screen's search: contacts by name, alias or handle, then Kawase handles by prefix. */
  async search(userId: string, query: string): Promise<RecipientMatch[]> {
    const text = query.trim().replace(/^@/, "").toLowerCase();
    const book = await this.contacts.addressBook(userId);
    const byContact = new Map<string, RecipientMatch>();
    for (const entry of book) {
      if (byContact.has(entry.contactId)) continue;
      const hit =
        !text ||
        entry.name.toLowerCase().includes(text) ||
        entry.aliases.some((alias) => alias.toLowerCase().includes(text)) ||
        entry.handle?.toLowerCase().startsWith(text) ||
        entry.address.toLowerCase().startsWith(text);
      if (!hit) continue;
      const own = book.filter((row) => row.contactId === entry.contactId);
      const active = own.find((row) => row.status === "active" && row.isPreferred);
      const onHold = own.some((row) => row.status === "pending_cooldown");
      byContact.set(entry.contactId, {
        kind: "contact",
        contactId: entry.contactId,
        name: entry.name,
        handle: entry.handle,
        address: active?.address ?? null,
        onHold,
      });
    }
    const matches = [...byContact.values()].slice(0, SEARCH_LIMIT);
    if (text.length > 0) {
      const handle = await addressForHandle(this.db, text);
      if (handle?.address && handle.userId !== userId && !matches.some((match) => match.kind === "contact" && match.handle?.toLowerCase() === handle.handle.toLowerCase()))
        matches.push({ kind: "handle", handle: handle.handle, address: handle.address });
    }
    return matches;
  }
}
