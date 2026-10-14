// Who a send goes to, from the person's own words (K2: the model passes the words, code resolves them). An address
// may only come from the person's book, a Kawase @handle, or an address the person typed or pasted themselves. A
// bare name never resolves to a stranger's public handle: an exact handle match is offered as a suggestion only.
import { and, eq, sql } from "drizzle-orm";
import { erc20Abi, getAddress, isAddress, parseAbi, type Address, type PublicClient } from "viem";

import { LOOKALIKE_PREFIX_CHARS, LOOKALIKE_SUFFIX_CHARS } from "@kawase/config";
import type { AddressSource, ContactChain, RecipientMatch, SendRecipientView } from "@kawase/api-client";
import { contactAddressTrust, intentDrafts, intents, users, wallets, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";
import type { RecipientFacts } from "@kawase/policy";

import { blockedRecipient } from "../contacts/blocks";
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

/** What an address is on chain, for the recipient check every payment runs (R6). */
export type RecipientInspection = {
  /** null: a plain account (or one with EIP-7702 code, which is still the person's own account). */
  contract: "token" | "smart_wallet" | "contract" | null;
  /** The token's issuer has blocked the address (USDC/EURC `isBlacklisted`, verified on Arc 2026-10-02). */
  issuerBlocked: boolean;
  /** The address is a Kawase user's wallet: their @handle. */
  kawaseHandle: string | null;
};

const BLOCKLIST_ABI = parseAbi(["function isBlacklisted(address account) view returns (bool)"]);
/** ERC-4337 accounts name their EntryPoint; Safes have owners and a threshold. Either is a smart wallet. */
const SMART_WALLET_ABI = parseAbi(["function entryPoint() view returns (address)", "function getThreshold() view returns (uint256)"]);
/** An EIP-7702 account's code is this designator followed by the delegate's address. */
const DELEGATION_DESIGNATOR = "0xef0100";
const READS_PER_ADDRESS = 4;

export async function inspectRecipient(db: Db, client: PublicClient, address: Address, stableToken?: Address): Promise<RecipientInspection> {
  const [code, blocked, owner] = await Promise.all([
    client.getCode({ address }).catch(() => undefined),
    stableToken ? client.readContract({ address: stableToken, abi: BLOCKLIST_ABI, functionName: "isBlacklisted", args: [address] }).catch(() => false) : Promise.resolve(false),
    db
      .select({ handle: users.handle })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(and(eq(wallets.role, "user"), sql`lower(${wallets.address}) = ${address.toLowerCase()}`))
      .limit(1),
  ]);
  let contract: RecipientInspection["contract"] = null;
  if (code && code !== "0x" && !code.toLowerCase().startsWith(DELEGATION_DESIGNATOR)) {
    const reads = await client
      .multicall({
        contracts: [
          { address, abi: erc20Abi, functionName: "totalSupply" },
          { address, abi: erc20Abi, functionName: "decimals" },
          { address, abi: SMART_WALLET_ABI, functionName: "entryPoint" },
          { address, abi: SMART_WALLET_ABI, functionName: "getThreshold" },
        ],
        allowFailure: true,
      })
      .catch(() => Array.from({ length: READS_PER_ADDRESS }, () => ({ status: "failure" as const })));
    const [totalSupply, decimals, entryPoint, threshold] = reads.map((read) => read.status === "success");
    contract = totalSupply && decimals ? "token" : entryPoint || threshold ? "smart_wallet" : "contract";
  }
  return { contract, issuerBlocked: blocked === true, kawaseHandle: owner[0]?.handle ?? null };
}

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

  /**
   * Who `input` is: a contact, an @handle or an address, with the facts the send rules read. Someone the person blocked
   * comes back marked, so every rule that reads `blocked` refuses them (sends, automations, the agent).
   */
  async resolve(user: { id: string; walletAddress: string | undefined }, network: NetworkId, input: string | null | undefined, chain: ContactChain = "arc"): Promise<Resolution> {
    const found = await this.find(user, network, input, chain);
    return found.facts.status === "resolved" && (await blockedRecipient(this.db, user.id, found.facts.address)) ? { ...found, facts: { ...found.facts, blocked: true } } : found;
  }

  /**
   * `chain`: where the money goes. On another chain a contact's address there wins (with its own hold); a contact
   * without one keeps their Arc address, as before (a Kawase user's address is the same on every EVM chain).
   */
  private async find(user: { id: string; walletAddress: string | undefined }, network: NetworkId, input: string | null | undefined, chain: ContactChain): Promise<Resolution> {
    const text = (input ?? "").trim();
    if (!text) return { facts: { status: "missing" }, view: null, suggestions: [] };
    const self = user.walletAddress?.toLowerCase();
    const arc = await this.contacts.addressBook(user.id);
    const there = chain === "arc" ? [] : await this.contacts.addressBook(user.id, chain);
    const book = [...there, ...arc.filter((entry) => !there.some((onChain) => onChain.contactId === entry.contactId))];

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
