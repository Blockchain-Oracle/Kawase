// Invoices (cards/agent-business.md, X14): line items in USDC or EURC, a due date, and an on-chain reference — a
// bytes32 memoId for Arc's Memo contract, opaque (memo data is public, so no names or amounts go on chain). Each invoice
// is paid through its payment request's link (`/r/<token>`): from Kawase (the send carries the request), or from any
// browser wallet, which calls `Memo.memo(token, transfer(payTo, amount), memoId, "INV-0001")` so the payment names its
// invoice. The watcher reads Memo events for open invoices' ids, takes the token transfers to the business in the same
// transaction from the memo's sender, and records them: partial and over-payment show as such. A plain transfer of the
// exact total still matches through the request (the existing watcher).
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { encodeFunctionData, erc20Abi, getAddress, keccak256, parseAbi, parseEventLogs, stringToHex, type Address, type Hex } from "viem";

import type { BusinessProfile, BusinessProfileInput, InvoiceInput, InvoicePublicView, InvoiceView } from "@kawase/api-client";
import {
  INVOICE_DUE_DAYS_DEFAULT,
  INVOICE_NUMBER_DIGITS,
  INVOICE_NUMBER_PREFIX,
  MEMO_SCAN_BLOCKS,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
} from "@kawase/config";
import { businessProfiles, invoices, paymentRequests, users, type Db, type InvoiceLine, type InvoicePayment } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { amount as toAmount, canonicalAmount, formatAmount, parseAmount, type AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import type { AuditWriter } from "../audit/writer";
import { HTTP, problem } from "../http/problem";
import type { RequestService } from "../requests/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";

const MEMO_ABI = parseAbi([
  "function memo(address target, bytes data, bytes32 memoId, bytes memoData)",
  "event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)",
]);
const ZERO = 0n;
const ONE_BLOCK = 1n;
const DISPLAY_LOCALE = "en";

type InvoiceRow = typeof invoices.$inferSelect;

/** The memoId: opaque, derived from the invoice id only. */
export const invoiceMemoId = (invoiceId: string): Hex => keccak256(stringToHex(`kawase:invoice:${invoiceId}`));

const lineTotal = (line: InvoiceLine) => BigInt(line.unitAmount) * BigInt(line.quantity);

export class InvoiceService {
  /** Per network: the last block the Memo watcher has read. */
  private readonly cursor = new Map<NetworkId, bigint>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly requests: RequestService,
    private readonly audit: AuditWriter,
    private readonly log: Logger,
    private readonly webUrl: string,
  ) {}

  // ── Profile ────────────────────────────────────────────────────────────────────────────────────────────────────

  async profile(userId: string): Promise<BusinessProfile | null> {
    const [row] = await this.db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
    return row ? { name: row.name, address: row.address, taxId: row.taxId, email: row.email } : null;
  }

  async saveProfile(user: SessionUser, input: BusinessProfileInput): Promise<BusinessProfile> {
    const values = { name: input.name.trim(), address: input.address?.trim() || null, taxId: input.taxId?.trim() || null, email: input.email?.trim() || null };
    await this.db.insert(businessProfiles).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: businessProfiles.userId, set: values });
    await this.audit.write({ userId: user.id, actor: "user", action: "business.profile_saved" });
    return values;
  }

  // ── Invoices ───────────────────────────────────────────────────────────────────────────────────────────────────

  private async nextNumber(userId: string): Promise<string> {
    const [row] = await this.db.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.userId, userId));
    return `${INVOICE_NUMBER_PREFIX}${String(Number(row?.count ?? 0) + 1).padStart(INVOICE_NUMBER_DIGITS, "0")}`;
  }

  private view(row: InvoiceRow, request: { token: string } | undefined): InvoiceView {
    const remaining = row.total > row.paidAmount ? row.total - row.paidAmount : ZERO;
    return {
      id: row.id,
      network: row.network,
      number: row.number,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      asset: row.asset as "USDC" | "EURC",
      lines: row.lineItems,
      total: row.total.toString(),
      paid: row.paidAmount.toString(),
      remaining: remaining.toString(),
      dueAt: row.dueAt.toISOString(),
      overdue: row.status !== "paid" && row.status !== "canceled" && row.dueAt.getTime() < Date.now(),
      status: row.status,
      memoId: row.memoId,
      payments: row.payments,
      note: row.note,
      link: request ? `${this.webUrl}/r/${request.token}` : null,
      token: request?.token ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async requestOf(row: InvoiceRow) {
    if (!row.requestId) return undefined;
    const [request] = await this.db.select().from(paymentRequests).where(eq(paymentRequests.id, row.requestId));
    return request;
  }

  async create(user: SessionUser, input: InvoiceInput): Promise<InvoiceView> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to invoice");
    const lines: InvoiceLine[] = input.lines.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      unitAmount: parseAmount(line.unitPrice, input.asset, DISPLAY_LOCALE).baseUnits.toString(),
    }));
    const total = lines.reduce((sum, line) => sum + lineTotal(line), ZERO);
    if (total <= ZERO) throw problem(HTTP.unprocessable, "validation", "the invoice total must be above zero");
    const id = randomUUID();
    const number = await this.nextNumber(user.id);
    // The request carries the payment link and the Kawase pay flow; its note is what the payer sees.
    const request = await this.requests.create(user, {
      // Canonical digits ("500.25"), without the symbol it ends with.
      amount: canonicalAmount(toAmount(input.asset, total)).split(" ")[0]!,
      asset: input.asset,
      note: `${number}${input.lines[0] ? ` · ${input.lines[0].description}` : ""}`,
    });
    const dueAt = input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + (input.dueInDays ?? INVOICE_DUE_DAYS_DEFAULT) * SECONDS_PER_DAY * MS_PER_SECOND);
    const [row] = await this.db
      .insert(invoices)
      .values({
        id,
        userId: user.id,
        network: user.activeNetwork,
        number,
        requestId: request.id,
        clientName: input.clientName.trim(),
        clientEmail: input.clientEmail?.trim() || null,
        asset: input.asset,
        lineItems: lines,
        total,
        dueAt,
        memoId: invoiceMemoId(id),
        note: input.note?.trim() || null,
      })
      .returning();
    await this.audit.write({ userId: user.id, actor: "user", action: "invoice.created", subjectType: "invoice", subjectId: id, network: user.activeNetwork, checks: { total: total.toString(), asset: input.asset } });
    return this.view(row!, request);
  }

  async list(user: SessionUser): Promise<InvoiceView[]> {
    const rows = await this.db
      .select({ invoice: invoices, token: paymentRequests.token })
      .from(invoices)
      .leftJoin(paymentRequests, eq(paymentRequests.id, invoices.requestId))
      .where(and(eq(invoices.userId, user.id), eq(invoices.network, user.activeNetwork)))
      .orderBy(desc(invoices.createdAt));
    return rows.map(({ invoice, token }) => this.view(invoice, token ? { token } : undefined));
  }

  async get(user: SessionUser, id: string): Promise<InvoiceView> {
    const [row] = await this.db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    const synced = await this.syncFromRequest(row);
    return this.view(synced, await this.requestOf(synced));
  }

  async cancel(user: SessionUser, id: string): Promise<InvoiceView> {
    const [row] = await this.db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    if (row.status === "paid" || row.status === "canceled") return this.view(row, await this.requestOf(row));
    if (row.requestId) await this.requests.cancel(user.id, row.requestId).catch(() => undefined);
    const [updated] = await this.db.update(invoices).set({ status: "canceled" }).where(eq(invoices.id, id)).returning();
    await this.audit.write({ userId: user.id, actor: "user", action: "invoice.canceled", subjectType: "invoice", subjectId: id });
    return this.view(updated!, await this.requestOf(updated!));
  }

  /** What the client sees on the link (no account needed), and the call a browser wallet sends to pay with the reference. */
  async publicView(token: string): Promise<InvoicePublicView> {
    const [found] = await this.db
      .select({ invoice: invoices, request: paymentRequests, handle: users.handle })
      .from(invoices)
      .innerJoin(paymentRequests, eq(paymentRequests.id, invoices.requestId))
      .innerJoin(users, eq(users.id, invoices.userId))
      .where(eq(paymentRequests.token, token));
    if (!found) throw problem(HTTP.notFound, "not_found");
    const invoice = await this.syncFromRequest(found.invoice);
    const profile = await this.profile(invoice.userId);
    const clients = this.chains.get(invoice.network);
    const token20 = clients ? (invoice.asset === "EURC" ? clients.network.addresses.eurc : clients.network.addresses.usdc) : undefined;
    const remaining = invoice.total > invoice.paidAmount ? invoice.total - invoice.paidAmount : ZERO;
    const payTo = getAddress(found.request.payTo);
    const pay =
      clients && token20 && remaining > ZERO && invoice.status !== "canceled"
        ? {
            chainId: clients.network.chainId,
            to: clients.network.addresses.memo as Address,
            data: encodeFunctionData({
              abi: MEMO_ABI,
              functionName: "memo",
              args: [token20, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [payTo, remaining] }), invoice.memoId as Hex, stringToHex(invoice.number)],
            }),
          }
        : null;
    return {
      number: invoice.number,
      network: invoice.network,
      business: profile ?? { name: found.handle ? `@${found.handle}` : "Kawase", address: null, taxId: null, email: null },
      clientName: invoice.clientName,
      asset: invoice.asset as "USDC" | "EURC",
      lines: invoice.lineItems,
      total: invoice.total.toString(),
      paid: invoice.paidAmount.toString(),
      remaining: remaining.toString(),
      dueAt: invoice.dueAt.toISOString(),
      status: invoice.status,
      memoId: invoice.memoId,
      payTo,
      pay,
      note: invoice.note,
    };
  }

  /** A printable invoice (the share sheet turns it into a PDF on the phone; a browser prints it). */
  async document(token: string): Promise<string> {
    const view = await this.publicView(token);
    const money = (baseUnits: string) => formatAmount(toAmount(view.asset as AssetId, BigInt(baseUnits)), DISPLAY_LOCALE, { fractionDigits: 2 });
    const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
    const day = (iso: string) => new Date(iso).toISOString().slice(0, "YYYY-MM-DD".length);
    const rows = view.lines
      .map((line) => `<tr><td>${escape(line.description)}</td><td class="n">${line.quantity}</td><td class="n">${money(line.unitAmount)}</td><td class="n">${money((BigInt(line.unitAmount) * BigInt(line.quantity)).toString())}</td></tr>`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(view.number)} · ${escape(view.business.name)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B0C10;margin:40px;max-width:760px}h1{font-size:28px;margin:0}.muted{color:#6b6f76}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.total{font-size:20px;font-weight:700}.ref{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all}</style></head>
<body><h1>${escape(view.business.name)}</h1>
<p class="muted">${[view.business.address, view.business.taxId ? `Tax ID ${view.business.taxId}` : null, view.business.email].filter(Boolean).map((part) => escape(part!)).join(" · ")}</p>
<h2>Invoice ${escape(view.number)}</h2>
<p>Billed to <strong>${escape(view.clientName)}</strong><br><span class="muted">Due ${day(view.dueAt)} · ${view.network === "testnet" ? "Arc Testnet (test money)" : "Arc"}</span></p>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<p class="n total">Total ${money(view.total)} ${view.asset}</p>
${BigInt(view.paid) > ZERO ? `<p class="n">Paid ${money(view.paid)} ${view.asset} · Due ${money(view.remaining)} ${view.asset}</p>` : ""}
${view.note ? `<p>${escape(view.note)}</p>` : ""}
<p class="muted">Pay to ${view.payTo} on ${view.network === "testnet" ? "Arc Testnet" : "Arc"} in ${view.asset}, or open ${escape(`${this.webUrl}/r/${token}`)}.</p>
<p class="ref muted">On-chain reference (Arc Memo id): ${view.memoId}</p></body></html>`;
  }

  // ── Matching ───────────────────────────────────────────────────────────────────────────────────────────────────

  private status(total: bigint, paid: bigint, current: InvoiceRow["status"]): InvoiceRow["status"] {
    if (current === "canceled") return current;
    if (paid >= total) return "paid";
    return paid > ZERO ? "partially_paid" : "open";
  }

  private async record(row: InvoiceRow, payment: InvoicePayment): Promise<InvoiceRow> {
    if (row.payments.some((existing) => existing.txHash.toLowerCase() === payment.txHash.toLowerCase())) return row;
    const paid = row.paidAmount + BigInt(payment.amount);
    const status = this.status(row.total, paid, row.status);
    const [updated] = await this.db
      .update(invoices)
      .set({ paidAmount: paid, payments: [...row.payments, payment], status })
      .where(eq(invoices.id, row.id))
      .returning();
    if (status === "paid" && row.status !== "paid") {
      await this.audit.write({ userId: row.userId, actor: "system", action: "invoice.paid", subjectType: "invoice", subjectId: row.id, network: row.network, checks: { via: payment.via, txHash: payment.txHash } });
    }
    return updated!;
  }

  /** The request was paid (a Kawase send, or a plain transfer of the exact total): the invoice follows. */
  private async syncFromRequest(row: InvoiceRow): Promise<InvoiceRow> {
    const request = await this.requestOf(row);
    if (!request || request.status !== "paid" || !request.paidTxHash) return row;
    return this.record(row, { txHash: request.paidTxHash, from: request.paidByAddress ?? "", amount: request.amount.toString(), at: (request.paidAt ?? new Date()).toISOString(), via: "request" });
  }

  /** Reads Memo events since the last look and records the payments that name an open invoice. */
  async scan(network: NetworkId): Promise<number> {
    const clients = this.chains.get(network);
    if (!clients) return 0;
    const open = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.network, network), inArray(invoices.status, ["open", "partially_paid"])));
    const latest = await clients.client.getBlockNumber();
    const from = this.cursor.get(network) ?? latest - BigInt(MEMO_SCAN_BLOCKS);
    if (open.length === 0 || from > latest) {
      this.cursor.set(network, latest + ONE_BLOCK);
      return 0;
    }
    const byMemo = new Map(open.map((row) => [row.memoId.toLowerCase(), row]));
    const logs = await clients.client.getLogs({
      address: clients.network.addresses.memo as Address,
      event: MEMO_ABI[1],
      args: { memoId: open.map((row) => row.memoId as Hex) },
      fromBlock: from < ZERO ? ZERO : from,
      toBlock: latest,
    });
    let recorded = 0;
    for (const log of logs) {
      const invoice = byMemo.get((log.args.memoId ?? "").toLowerCase());
      if (!invoice || !log.transactionHash || !log.args.sender) continue;
      const request = await this.requestOf(invoice);
      if (!request) continue;
      const token = (invoice.asset === "EURC" ? clients.network.addresses.eurc : clients.network.addresses.usdc).toLowerCase();
      const receipt = await clients.client.getTransactionReceipt({ hash: log.transactionHash });
      const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter(
        (entry) =>
          entry.address.toLowerCase() === token &&
          entry.args.from.toLowerCase() === log.args.sender!.toLowerCase() &&
          entry.args.to.toLowerCase() === request.payTo.toLowerCase(),
      );
      const amount = transfers.reduce((sum, entry) => sum + entry.args.value, ZERO);
      if (amount === ZERO) continue;
      const updated = await this.record(invoice, { txHash: log.transactionHash, from: getAddress(log.args.sender), amount: amount.toString(), at: new Date().toISOString(), via: "memo" });
      byMemo.set(invoice.memoId.toLowerCase(), updated);
      // Paid in full by its reference: the link closes too.
      if (updated.status === "paid" && request.status === "open") {
        await this.requests.markPaid(this.db, request.id, { txHash: log.transactionHash, from: getAddress(log.args.sender) }).catch(() => undefined);
      }
      recorded++;
    }
    this.cursor.set(network, latest + ONE_BLOCK);
    return recorded;
  }

  start(intervalMs: number) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const network of this.chains.available) {
        this.scan(network).catch((error: unknown) => this.log.warn({ err: error, network }, "memo scan failed"));
      }
    }, intervalMs);
    this.timer.unref();
  }
}
