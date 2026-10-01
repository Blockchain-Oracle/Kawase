// Payment requests (C3, F5/F41): the person asks for an exact amount and shares a link. Whoever opens it sees who
// asks, how much and on which network — no account needed — and can pay from Kawase (the send carries the request,
// so it must match it) or from any wallet. A request is marked paid by the Kawase send that paid it, or by the first
// incoming transfer of the same asset and exact amount to the requester after the request was made (the watcher).
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getAddress, type Address } from "viem";

import { REQUEST_NOTE_MAX, REQUEST_TOKEN_BYTES, REQUEST_TTL_S, MS_PER_SECOND } from "@kawase/config";
import type { PaymentRequest, PaymentRequestInput, PublicPaymentRequest } from "@kawase/api-client";
import { paymentRequests, users, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { parseRequestAmount, type Executor } from "../send/facts";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type RequestRow = typeof paymentRequests.$inferSelect;

const ZERO = 0n;

export class RequestService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly inbox: InboxService,
    private readonly webUrl: string,
  ) {}

  private explorer(network: NetworkId) {
    return this.chains.get(network)?.network.viemChain.blockExplorers?.default.url;
  }

  view(row: RequestRow): PaymentRequest {
    const explorer = this.explorer(row.network);
    return {
      id: row.id,
      token: row.token,
      link: `${this.webUrl.replace(/\/$/, "")}/r/${row.token}`,
      network: row.network,
      asset: row.asset as PaymentRequest["asset"],
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
    const parsed = parseRequestAmount(input.amount, input.asset);
    if (parsed.status !== "ok" || parsed.baseUnits <= ZERO) throw problem(HTTP.unprocessable, "validation", "the amount is not valid");
    const note = input.note?.trim().slice(0, REQUEST_NOTE_MAX) || null;
    const [row] = await this.db
      .insert(paymentRequests)
      .values({
        userId: user.id,
        token: randomBytes(REQUEST_TOKEN_BYTES).toString("base64url"),
        network: user.activeNetwork,
        asset: input.asset,
        amount: parsed.baseUnits,
        note,
        payTo: getAddress(wallet.address),
        expiresAt: new Date(Date.now() + REQUEST_TTL_S * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  async list(userId: string): Promise<PaymentRequest[]> {
    await this.expireDue(userId);
    const rows = await this.db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.userId, userId))
      .orderBy(desc(paymentRequests.createdAt));
    return rows.map((row) => this.view(row));
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
    return this.view(await this.own(userId, id));
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
      asset: request.asset as PublicPaymentRequest["asset"],
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
    await this.inbox.add(executor, {
      userId: row.userId,
      network: row.network,
      kind: "request_paid",
      params: { amount: row.amount.toString(), asset: row.asset, from: paid.from, ...(row.note ? { note: row.note } : {}) },
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
