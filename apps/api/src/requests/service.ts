// Payment requests (C3, F5/F41): the person asks for an exact amount and shares a link. Whoever opens it sees who
// asks, how much and on which network — no account needed — and can pay from Kawase (the send carries the request,
// so it must match it) or from any wallet. A request is marked paid by the Kawase send that paid it, or by the first
// incoming transfer of the same asset and exact amount to the requester after the request was made (the watcher).
// Any token can be asked for (R1): USDC and EURC by name, every other token by its address on the network.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getAddress, type Address } from "viem";

import { REQUEST_LAST_DAY_S, REQUEST_NOTE_MAX, REQUEST_NUDGE_AFTER_S, REQUEST_TOKEN_BYTES, REQUEST_TTL_S, MS_PER_SECOND } from "@kawase/config";
import type { PaymentRequest, PaymentRequestInput, PublicPaymentRequest, RequestReminder } from "@kawase/api-client";
import { contactAddresses, contacts, inboxItems, paymentRequests, users, wallets, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { blockedSender } from "../contacts/blocks";
import { addressForHandle } from "../contacts/service";
import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { parseTokenAmount, type Executor, type TokenLookup } from "../send/facts";
import type { Recipients } from "../send/recipients";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type RequestRow = typeof paymentRequests.$inferSelect;

const ZERO = 0n;
const STABLE_DECIMALS = 6;
/** "YYYY-MM-DD": the day a Remind counts against. */
const DATE_CHARS = 10;

export class RequestService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly inbox: InboxService,
    private readonly webUrl: string,
    private readonly lookup?: TokenLookup,
    private readonly recipients?: Recipients,
  ) {}

  /**
   * What a request is in: USDC/EURC by name (asked for by address they are still USDC/EURC, which the watcher matches
   * by name), any other token by its lower-case address with its symbol and decimals (R1).
   */
  async token(network: NetworkId, asset: string): Promise<{ stored: string; symbol: string | null; decimals: number }> {
    const upper = asset.trim().toUpperCase();
    const named = upper === "USDC" || upper === "EURC" ? upper : undefined;
    const found = named ? undefined : this.lookup ? await this.lookup(network, asset) : undefined;
    const context = this.chains.get(network)?.network;
    const byAddress = found && context ? (found.address.toLowerCase() === context.addresses.usdc.toLowerCase() ? "USDC" : found.address.toLowerCase() === context.addresses.eurc.toLowerCase() ? "EURC" : undefined) : undefined;
    const stable = named ?? byAddress;
    if (stable) return { stored: stable, symbol: null, decimals: STABLE_DECIMALS };
    if (!found) throw problem(HTTP.unprocessable, "validation", "no such token on this network");
    return { stored: found.address.toLowerCase(), symbol: found.symbol, decimals: found.decimals };
  }

  /**
   * The Kawase user to ask in the app, from the person's own words only (K2): an @handle, or one saved contact by its
   * exact name or alias whose @handle is known. A bare name is never matched to a stranger's handle; anything else is
   * a link only.
   */
  async kawasePayer(user: SessionUser, words: string | null | undefined): Promise<{ userId: string; handle: string } | undefined> {
    const text = words?.trim();
    if (!text || !this.recipients) return undefined;
    const wallet = await this.wallets.userWallet(user.id);
    const found = await this.recipients.resolve({ id: user.id, walletAddress: wallet?.address }, user.activeNetwork, text);
    const handle = found.facts.status === "resolved" ? found.view?.handle : undefined;
    if (!handle) return undefined;
    const person = await addressForHandle(this.db, handle);
    return person && person.userId !== user.id ? { userId: person.userId, handle: person.handle } : undefined;
  }

  /** How `viewerId` knows `address`: their own contact name, else its owner's Kawase @handle. */
  private async nameIn(viewerId: string, address: string): Promise<string | null> {
    const lower = address.toLowerCase();
    const [contact] = await this.db
      .select({ name: contacts.displayName })
      .from(contactAddresses)
      .innerJoin(contacts, eq(contacts.id, contactAddresses.contactId))
      .where(and(eq(contactAddresses.userId, viewerId), isNull(contacts.deletedAt), sql`lower(${contactAddresses.address}) = ${lower}`));
    if (contact) return contact.name;
    const [owner] = await this.db
      .select({ handle: users.handle })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(and(eq(wallets.role, "user"), sql`lower(${wallets.address}) = ${lower}`));
    return owner?.handle ? `@${owner.handle}` : null;
  }

  /**
   * Tells the payer in their inbox (and by push): "@x asked you for 12 USDC", opening the pay card. A reminder is the
   * same item marked as one ("Reminder: @x asked you…"), under its own dedupe key; false when that one was already told.
   */
  private async tellPayer(row: RequestRow, payerId: string, reminder?: string): Promise<boolean | "blocked"> {
    // Someone the payer blocked never reaches their inbox or push (asks, split shares, reminders); they are not told.
    if (await blockedSender(this.db, payerId, row.userId, row.payTo)) return "blocked";
    const symbol = this.tokenOf(row).symbol;
    const name = await this.nameIn(payerId, row.payTo);
    return this.inbox.add(this.db, {
      userId: payerId,
      network: row.network,
      kind: "request_received",
      params: {
        amount: row.amount.toString(),
        asset: symbol,
        ...(row.asset === "USDC" || row.asset === "EURC" ? {} : { decimals: String(row.assetDecimals ?? "") }),
        from: row.payTo,
        token: row.token,
        ...(name ? { name } : {}),
        ...(row.note ? { note: row.note } : {}),
        ...(reminder ? { reminder: "1" } : {}),
      },
      requestId: row.id,
      dedupeKey: reminder ? `request_reminder:${row.id}:${reminder}` : `request_received:${row.id}:${payerId}`,
    });
  }

  /** The token of a row: USDC/EURC by name, any other from its stored symbol and decimals. */
  private tokenOf(row: RequestRow) {
    const network = this.chains.get(row.network)?.network;
    if (row.asset === "USDC" || row.asset === "EURC")
      return { address: (row.asset === "USDC" ? network?.addresses.usdc : network?.addresses.eurc) ?? "", symbol: row.asset, decimals: STABLE_DECIMALS };
    return { address: getAddress(row.asset), symbol: row.assetSymbol ?? "?", decimals: row.assetDecimals ?? 0 };
  }

  private explorer(network: NetworkId) {
    return this.chains.get(network)?.network.viemChain.blockExplorers?.default.url;
  }

  /** How the requester knows the payer: their own contact name, else the payer's Kawase @handle. */
  private async payerName(row: RequestRow): Promise<string | null> {
    return row.paidByAddress ? this.nameIn(row.userId, row.paidByAddress) : null;
  }

  private async named(row: RequestRow): Promise<PaymentRequest> {
    const view = this.view(row);
    const [asked] = row.payerUserId ? await this.db.select({ handle: users.handle }).from(users).where(eq(users.id, row.payerUserId)) : [];
    const payer = asked?.handle ? { handle: asked.handle } : null;
    return view.paidBy ? { ...view, payer, paidBy: { ...view.paidBy, name: await this.payerName(row) } } : { ...view, payer };
  }

  view(row: RequestRow): PaymentRequest {
    const explorer = this.explorer(row.network);
    return {
      id: row.id,
      token: row.token,
      link: `${this.webUrl.replace(/\/$/, "")}/r/${row.token}`,
      network: row.network,
      asset: this.tokenOf(row).symbol,
      assetToken: this.tokenOf(row),
      amount: row.amount.toString(),
      note: row.note,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      paidTx: row.paidTxHash && explorer ? { hash: row.paidTxHash, explorerUrl: `${explorer}/tx/${row.paidTxHash}` } : null,
      paidBy: row.paidByAddress ? { address: row.paidByAddress, name: null } : null,
    };
  }

  /** Open requests past their time are closed whenever someone looks. */
  private async expireDue(userId?: string) {
    await this.db
      .update(paymentRequests)
      .set({ status: "expired" })
      .where(
        and(
          eq(paymentRequests.status, "open"),
          lt(paymentRequests.expiresAt, new Date()),
          ...(userId ? [eq(paymentRequests.userId, userId)] : []),
        ),
      );
  }

  async create(user: SessionUser, input: PaymentRequestInput): Promise<PaymentRequest> {
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const token = await this.token(user.activeNetwork, input.asset);
    const stable = token.symbol === null;
    const parsed = parseTokenAmount(input.amount, token.decimals);
    if (parsed.status !== "ok" || parsed.baseUnits <= ZERO) throw problem(HTTP.unprocessable, "validation", "the amount is not valid");
    const note = input.note?.trim().slice(0, REQUEST_NOTE_MAX) || null;
    const payer = await this.kawasePayer(user, input.payer);
    const [row] = await this.db
      .insert(paymentRequests)
      .values({
        userId: user.id,
        token: randomBytes(REQUEST_TOKEN_BYTES).toString("base64url"),
        network: user.activeNetwork,
        asset: token.stored,
        assetSymbol: stable ? null : token.symbol,
        assetDecimals: stable ? null : token.decimals,
        amount: parsed.baseUnits,
        note,
        payTo: getAddress(wallet.address),
        payerUserId: payer?.userId ?? null,
        expiresAt: new Date(Date.now() + REQUEST_TTL_S * MS_PER_SECOND),
      })
      .returning();
    if (payer) await this.tellPayer(row!, payer.userId);
    return { ...this.view(row!), payer: payer ? { handle: payer.handle } : null };
  }

  /**
   * Asks a Kawase user for an open request in the app as well (the share card's "Ask on Kawase"). Not someone the
   * person's words name exactly → 422 `recipient_unknown`, and the link is still theirs to share.
   */
  async ask(user: SessionUser, id: string, words: string) {
    const row = await this.own(user.id, id);
    if (row.status !== "open") throw problem(HTTP.conflict, "request_unavailable", "this request is no longer open");
    const payer = await this.kawasePayer(user, words);
    if (!payer) throw problem(HTTP.unprocessable, "recipient_unknown", "not someone on Kawase");
    const [updated] = await this.db.update(paymentRequests).set({ payerUserId: payer.userId }).where(eq(paymentRequests.id, id)).returning();
    await this.tellPayer(updated ?? row, payer.userId);
    return this.named(updated ?? row);
  }

  /**
   * The requester's Remind (surfaces.md Request, "reminders"): someone asked in the app gets "Reminder: @x asked you
   * for 12 USDC" in their inbox and by push, at most once a day per request; for a link only, the app shares the link
   * again with a reminder. A request no longer open → 409 `request_unavailable`.
   */
  async remind(userId: string, id: string): Promise<{ request: PaymentRequest; reminded: RequestReminder }> {
    const row = await this.own(userId, id);
    if (row.status !== "open") throw problem(HTTP.conflict, "request_unavailable", "this request is no longer open");
    const request = await this.named(row);
    if (!row.payerUserId) return { request, reminded: "link" };
    const told = await this.tellPayer(row, row.payerUserId, new Date().toISOString().slice(0, DATE_CHARS));
    // A block is never revealed to the one blocked: to them it reads as reminded.
    return { request, reminded: told === false ? "already_today" : "in_app" };
  }

  /**
   * Kawase's own reminders to someone asked in the app: once when a request is still unpaid REQUEST_NUDGE_AFTER_S after
   * it was made, and once on its last day. Each is told once (its dedupe key); returns how many went out.
   */
  async remindDue(now = new Date()): Promise<number> {
    const due = await this.db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.status, "open"), isNotNull(paymentRequests.payerUserId), gt(paymentRequests.expiresAt, now), lt(paymentRequests.createdAt, new Date(now.getTime() - REQUEST_NUDGE_AFTER_S * MS_PER_SECOND))));
    // What was already told, in one read, so a sweep does not redo every open request.
    const told = due.length
      ? new Set((await this.db.select({ key: inboxItems.dedupeKey }).from(inboxItems).where(inArray(inboxItems.requestId, due.map((row) => row.id)))).map((row) => row.key))
      : new Set<string>();
    let sent = 0;
    for (const row of due) {
      const stage = row.expiresAt.getTime() - now.getTime() <= REQUEST_LAST_DAY_S * MS_PER_SECOND ? "last_day" : "nudge";
      if (told.has(`request_reminder:${row.id}:${stage}`)) continue;
      if ((await this.tellPayer(row, row.payerUserId!, stage)) === true) sent++;
    }
    return sent;
  }

  start(intervalMs: number, log: Logger) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.remindDue().catch((error: unknown) => log.warn({ err: error }, "request reminders failed"));
    }, intervalMs);
    this.timer.unref();
  }

  async list(userId: string): Promise<PaymentRequest[]> {
    await this.expireDue(userId);
    const rows = await this.db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.userId, userId))
      .orderBy(desc(paymentRequests.createdAt));
    return Promise.all(rows.map((row) => this.named(row)));
  }

  private async own(userId: string, id: string) {
    await this.expireDue(userId);
    const [row] = await this.db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.id, id), eq(paymentRequests.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such request");
    return row;
  }

  async get(userId: string, id: string) {
    return this.named(await this.own(userId, id));
  }

  async cancel(userId: string, id: string) {
    const row = await this.own(userId, id);
    if (row.status !== "open") return this.view(row);
    const [updated] = await this.db
      .update(paymentRequests)
      .set({ status: "canceled" })
      .where(and(eq(paymentRequests.id, id), eq(paymentRequests.status, "open")))
      .returning();
    return this.view(updated ?? row);
  }

  /** The request as anyone with the link sees it. */
  async openPublic(token: string): Promise<PublicPaymentRequest> {
    await this.expireDue();
    const [row] = await this.db
      .select({ request: paymentRequests, handle: users.handle })
      .from(paymentRequests)
      .innerJoin(users, eq(users.id, paymentRequests.userId))
      .where(eq(paymentRequests.token, token));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such request");
    const request = row.request;
    return {
      token: request.token,
      network: request.network,
      asset: this.tokenOf(request).symbol,
      assetToken: this.tokenOf(request),
      amount: request.amount.toString(),
      note: request.note,
      status: request.status,
      expiresAt: request.expiresAt.toISOString(),
      requester: { handle: row.handle, address: request.payTo },
    };
  }

  /** For a send that pays a request: the open request behind a token, with its requester's handle. */
  async payable(token: string) {
    await this.expireDue();
    const [row] = await this.db
      .select({ request: paymentRequests, handle: users.handle })
      .from(paymentRequests)
      .innerJoin(users, eq(users.id, paymentRequests.userId))
      .where(and(eq(paymentRequests.token, token), eq(paymentRequests.status, "open"), gt(paymentRequests.expiresAt, new Date())));
    return row;
  }

  /** Marks one open request paid (once), and tells the requester in the inbox. */
  async markPaid(executor: Executor, requestId: string, paid: { txHash: string; from: Address; intentId?: string | null }) {
    const [row] = await executor
      .update(paymentRequests)
      .set({ status: "paid", paidAt: new Date(), paidTxHash: paid.txHash, paidByAddress: paid.from, paidIntentId: paid.intentId ?? null })
      .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.status, "open")))
      .returning();
    if (!row) return undefined;
    const name = await this.payerName(row);
    await this.inbox.add(executor, {
      userId: row.userId,
      network: row.network,
      kind: "request_paid",
      params: { amount: row.amount.toString(), asset: this.tokenOf(row).symbol, ...(row.asset === "USDC" || row.asset === "EURC" ? {} : { decimals: String(row.assetDecimals ?? "") }), from: paid.from, ...(name ? { name } : {}), ...(row.note ? { note: row.note } : {}) },
      requestId: row.id,
      txHash: paid.txHash,
      dedupeKey: `request_paid:${row.id}`,
    });
    return row;
  }

  /** An incoming transfer: the oldest open request it pays exactly, if any. */
  async matchIncoming(
    executor: Executor,
    transfer: { userId: string; network: NetworkId; asset: string; amount: bigint; txHash: string; from: Address },
  ) {
    const [request] = await executor
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.userId, transfer.userId),
          eq(paymentRequests.network, transfer.network),
          eq(paymentRequests.asset, transfer.asset),
          eq(paymentRequests.amount, transfer.amount),
          eq(paymentRequests.status, "open"),
          gt(paymentRequests.expiresAt, new Date()),
          sql`lower(${paymentRequests.payTo}) <> ${transfer.from.toLowerCase()}`,
        ),
      )
      .orderBy(asc(paymentRequests.createdAt))
      .limit(1);
    if (!request) return undefined;
    return this.markPaid(executor, request.id, { txHash: transfer.txHash, from: transfer.from });
  }
}
