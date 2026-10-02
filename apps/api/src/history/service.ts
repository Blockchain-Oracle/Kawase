// Looking back (cards/automate-safety.md "Look back"; surfaces.md Activity "row → receipt → why"):
//  - why: the decision record behind one transaction — what was asked and where (or which automation ran), every check
//    and its outcome, the route chosen and the others compared, the approval and how it was given, what was sent and by
//    whom, what it was matched to (a request, an invoice), and the audit rows on it;
//  - export: one month as CSV or beancount, from the chain's own history plus off-chain service payments;
//  - report: a week in numbers (received, sent, swaps, bridges, earn, services, automations, invoices).
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { Address } from "viem";

import type { ReportView, WhyKind, WhyView } from "@kawase/api-client";
import {
  agentWalletMoves,
  approvals,
  auditLog,
  automationRuns,
  automations,
  chainEvents,
  intentDrafts,
  intents,
  invoices,
  marketplacePurchases,
  payoutBatches,
  txAttempts,
  type Db,
} from "@kawase/db";
import { amount as toAmount, canonicalAmount, type AssetId } from "@kawase/money";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import type { ContactService } from "../contacts/service";
import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import { fetchActivityRange, type ActivityItem } from "../wallet/activity";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

const MS_PER_DAY = 86_400_000;
const ZERO = 0n;
const DATE_CHARS = 10;
const AUDIT_ROWS = 20;
/** Kawase's own wallets and known counterparties, as an accountant reads them. */
const LABEL_NAMES: Record<NonNullable<ActivityItem["counterpartyLabel"]>, string> = {
  circle_faucet: "Circle faucet",
  kawase_agent: "Kawase",
  kawase_relayer: "Kawase relayer",
  self: "Own wallet",
  swap: "Swap",
  bridge: "Bridge",
  earn: "Earn vault",
};

type PolicyResult = { code: string; kind: string };
type PolicyReport = { results?: PolicyResult[]; blocking?: PolicyResult | null; route?: string | null };
type Quote = { provider?: string; amountOut?: string; id?: string };

const iso = (date: Date) => date.toISOString();
const add = (bucket: Record<string, bigint>, asset: string, value: bigint) => {
  bucket[asset] = (bucket[asset] ?? ZERO) + value;
};
const strings = (bucket: Record<string, bigint>) => Object.fromEntries(Object.entries(bucket).map(([asset, value]) => [asset, value.toString()]));
const decimal = (asset: string, baseUnits: string) => canonicalAmount(toAmount(asset as AssetId, BigInt(baseUnits))).split(" ")[0]!;

export class HistoryService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly contacts: ContactService,
    private readonly log?: Logger | undefined,
  ) {}

  // ── Why ────────────────────────────────────────────────────────────────────────────────────────────────────────

  async why(user: SessionUser, network: NetworkId, txHash: string): Promise<WhyView> {
    const hash = txHash.toLowerCase();
    const explorer = this.chains.get(network)?.network.viemChain.blockExplorers?.default.url;
    const view: WhyView = { network, txHash: hash, kind: "other", facts: {}, steps: [], explorerUrl: explorer ? `${explorer}/tx/${hash}` : null };

    const [attempt] = await this.db
      .select()
      .from(txAttempts)
      .where(and(eq(txAttempts.userId, user.id), sql`lower(${txAttempts.txHash}) = ${hash}`))
      .orderBy(desc(txAttempts.createdAt))
      .limit(1);

    if (attempt?.intentId) await this.fromIntent(view, user.id, attempt.intentId);
    if (attempt) view.steps.push({ step: "sent", at: iso(attempt.updatedAt), by: attempt.provider, txHash: hash, status: attempt.status });
    if (attempt && !attempt.intentId) view.facts.what = attempt.kind;

    // The other things a transaction can be: an agent wallet move, a payout, an invoice payment, money that came in.
    const [move] = await this.db
      .select()
      .from(agentWalletMoves)
      .where(and(eq(agentWalletMoves.userId, user.id), sql`${agentWalletMoves.txHashes} @> ${JSON.stringify([hash])}::jsonb`))
      .limit(1);
    if (move) {
      view.kind = "agent_wallet";
      view.facts = { move: move.kind, amount: move.amount.toString() };
      view.steps.push({ step: "asked", at: iso(move.createdAt), surface: "app", words: { move: move.kind } });
      view.steps.push({ step: "sent", at: iso(move.updatedAt), by: move.kind === "top_up" ? "ops_wallet_under_marketplace_grant" : "agent_wallet", txHash: hash, status: move.status });
    }
    const [payout] = await this.db
      .select()
      .from(payoutBatches)
      .where(and(eq(payoutBatches.userId, user.id), sql`lower(${payoutBatches.txHash}) = ${hash}`))
      .limit(1);
    if (payout) {
      view.kind = "payout";
      view.facts = { people: payout.lines.length, total: payout.total.toString(), asset: payout.asset, decimals: payout.decimals };
      view.steps.unshift({ step: "asked", at: iso(payout.createdAt), surface: "app", words: { payout: payout.lines.length } });
    }
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.userId, user.id), sql`exists (select 1 from jsonb_array_elements(${invoices.payments}) p where lower(p->>'txHash') = ${hash})`))
      .limit(1);
    if (invoice) {
      view.kind = "invoice";
      const payment = invoice.payments.find((entry) => entry.txHash.toLowerCase() === hash);
      view.facts = { invoice: invoice.number, client: invoice.clientName, amount: payment?.amount ?? null, asset: invoice.asset, decimals: invoice.decimals };
      view.steps.push({ step: "matched", at: payment?.at ?? iso(invoice.updatedAt), what: "invoice", reference: payment?.via === "memo" ? invoice.memoId : null });
    }
    const [incoming] = await this.db
      .select()
      .from(chainEvents)
      .where(and(eq(chainEvents.userId, user.id), sql`lower(${chainEvents.txHash}) = ${hash}`))
      .limit(1);
    if (incoming && view.kind === "other") {
      view.kind = "incoming";
      // `at`: when Kawase saw it arrive (the receipt's date; A5-2).
      view.facts = { from: incoming.fromAddress, amount: incoming.amount.toString(), asset: incoming.asset, at: iso(incoming.createdAt) };
      if (incoming.matchedRequestId) view.steps.push({ step: "matched", at: iso(incoming.createdAt), what: "request", reference: incoming.matchedRequestId });
    }

    // Audit rows on the intent (or the object), oldest first.
    const subjects = [attempt?.intentId, payout?.id, invoice?.id].filter((value): value is string => Boolean(value));
    if (subjects.length > 0) {
      const rows = await this.db
        .select({ action: auditLog.action, decision: auditLog.decision, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(eq(auditLog.userId, user.id), or(inArray(auditLog.subjectId, subjects), attempt?.intentId ? eq(auditLog.intentId, attempt.intentId) : sql`false`)))
        .orderBy(auditLog.createdAt)
        .limit(AUDIT_ROWS);
      for (const row of rows) view.steps.push({ step: "audit", at: iso(row.createdAt), action: row.action, decision: row.decision });
    }
    if (!attempt && !move && !payout && !invoice && !incoming) throw problem(HTTP.notFound, "not_found", "Kawase has no record of this transaction");
    view.steps.sort((a, b) => a.at.localeCompare(b.at));
    return view;
  }

  private async fromIntent(view: WhyView, userId: string, intentId: string) {
    const [intent] = await this.db.select().from(intents).where(and(eq(intents.id, intentId), eq(intents.userId, userId)));
    if (!intent) return;
    view.kind = intent.kind as WhyKind;
    const [draft] = await this.db
      .select()
      .from(intentDrafts)
      .where(and(eq(intentDrafts.intentId, intentId), eq(intentDrafts.version, intent.currentDraftVersion)));
    const [run] = await this.db.select().from(automationRuns).where(eq(automationRuns.intentId, intentId)).limit(1);
    if (run) {
      const [automation] = await this.db.select().from(automations).where(eq(automations.id, run.automationId));
      view.kind = "automation";
      view.steps.push({
        step: "automation",
        at: iso(run.createdAt),
        automationId: run.automationId,
        kind: automation?.kind ?? "scheduled_send",
        schedule: automation ? JSON.stringify(automation.schedule) : null,
        trigger: run.trigger ?? null,
      });
    } else {
      view.steps.push({ step: "asked", at: iso(intent.createdAt), surface: intent.originSurface, words: intent.request });
    }
    const report = (draft?.policyReport ?? {}) as PolicyReport;
    const results = report.results ?? [];
    // The policy engine records problems only: no results means every check passed.
    view.steps.push({
      step: "checked",
      at: iso(draft?.createdAt ?? intent.createdAt),
      clear: !report.blocking,
      warnings: results.filter((entry) => entry.kind === "warning").map((entry) => entry.code),
      open: results.filter((entry) => entry.kind !== "warning" && entry.code !== report.blocking?.code).map((entry) => entry.code),
      blocking: report.blocking?.code ?? null,
    });
    const payload = (draft?.payload ?? {}) as { quote?: Quote; quotes?: Quote[]; alternatives?: Quote[]; route?: { provider?: string } };
    const alternatives = (payload.alternatives ?? payload.quotes ?? []).map((quote) => ({ provider: quote.provider ?? quote.id ?? "?", ...(quote.amountOut ? { amountOut: quote.amountOut } : {}) }));
    view.steps.push({ step: "route", at: iso(draft?.createdAt ?? intent.createdAt), route: draft?.route ?? report.route ?? null, provider: payload.quote?.provider ?? payload.route?.provider ?? null, alternatives });
    const [approval] = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.intentId, intentId), inArray(approvals.status, ["approved", "consumed"])))
      .orderBy(desc(approvals.createdAt))
      .limit(1);
    if (approval) view.steps.push({ step: "approved", at: iso(approval.updatedAt), route: approval.route, via: approval.decidedViaSurface });
    view.facts.intent = intent.kind;
  }

  // ── Range: chain transfers plus off-chain service payments ────────────────────────────────────────────────────

  private async range(user: Pick<SessionUser, "id">, network: NetworkId, from: Date, to: Date) {
    const wallet = await this.wallets.userWallet(user.id);
    const clients = this.chains.get(network);
    if (!wallet || !clients) return { items: [] as ActivityItem[], complete: true, purchases: [] as (typeof marketplacePurchases.$inferSelect)[] };
    const [chain, purchases] = await Promise.all([
      // The explorer can be slow or down: the file and the report still come, marked incomplete, never a failure.
      fetchActivityRange(clients.network, wallet.address as Address, { agent: clients.ops.address, relayer: clients.relayerAddress }, { from, to }).catch((error: unknown) => {
        this.log?.warn({ err: error, network }, "explorer history unread; export marked incomplete");
        return { items: [] as ActivityItem[], complete: false };
      }),
      this.db
        .select()
        .from(marketplacePurchases)
        .where(
          and(
            eq(marketplacePurchases.userId, user.id),
            eq(marketplacePurchases.network, network),
            inArray(marketplacePurchases.status, ["paid", "failed_after_payment"]),
            gte(marketplacePurchases.createdAt, from),
            lt(marketplacePurchases.createdAt, to),
          ),
        ),
    ]);
    return { ...chain, purchases };
  }

  /** One calendar month (UTC), as CSV or beancount. */
  async export(user: Pick<SessionUser, "id">, network: NetworkId, month: string, format: "csv" | "beancount") {
    const from = new Date(`${month}-01T00:00:00.000Z`);
    if (Number.isNaN(from.getTime())) throw problem(HTTP.badRequest, "validation", "month is YYYY-MM");
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const [{ items, purchases, complete }, book] = await Promise.all([this.range(user, network, from, to), this.contacts.addressBook(user.id)]);
    // The person's own names on counterparties (the current address of a contact wins over older ones).
    const names = new Map<string, string>();
    for (const entry of [...book].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))) {
      if (!names.has(entry.address.toLowerCase())) names.set(entry.address.toLowerCase(), entry.name);
    }
    const rows = [
      ...items.map((item) => ({
        date: item.at,
        type: item.swap ? "swap" : item.bridge ? "bridge" : item.earn ? `earn_${item.earn.action}` : item.direction === "in" ? "received" : "sent",
        asset: item.asset,
        amount: item.direction === "in" ? item.amount : `-${item.amount}`,
        paidAsset: item.swap?.asset ?? null,
        paidAmount: item.swap ? `-${item.swap.amount}` : null,
        counterparty: item.counterparty as string,
        name: names.get(item.counterparty.toLowerCase()) ?? (item.counterpartyLabel ? LABEL_NAMES[item.counterpartyLabel] : ""),
        description: item.earn?.vault ?? "",
        txHash: item.txHash,
      })),
      ...purchases.map((purchase) => ({
        date: purchase.createdAt.toISOString(),
        type: "service",
        asset: "USDC",
        amount: `-${purchase.amount.toString()}`,
        paidAsset: null,
        paidAmount: null,
        counterparty: purchase.payTo ?? "",
        name: purchase.providerName,
        description: purchase.description ?? purchase.url,
        txHash: purchase.settlement ?? "",
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const signed = (asset: string, value: string) => (value.startsWith("-") ? `-${decimal(asset, value.slice(1))}` : decimal(asset, value));
    const networkName = network === "testnet" ? "ArcTestnet" : "Arc";
    if (format === "csv") {
      const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
      const header = "date,type,asset,amount,paid_asset,paid_amount,counterparty,counterparty_name,description,tx_hash,network";
      const lines = rows.map((row) =>
        [row.date, row.type, row.asset, signed(row.asset, row.amount), row.paidAsset ?? "", row.paidAsset && row.paidAmount ? signed(row.paidAsset, row.paidAmount) : "", row.counterparty, row.name, row.description, row.txHash, network].map(cell).join(","),
      );
      return { body: [header, ...lines].join("\n") + "\n", contentType: "text/csv; charset=utf-8", filename: `kawase-${network}-${month}.csv`, complete };
    }
    const account = (asset: string) => `Assets:Kawase:${networkName}:${asset}`;
    const quote = (text: string) => `"${text.replace(/"/g, "'")}"`;
    const opened = new Set<string>();
    const entries: string[] = [];
    for (const row of rows) {
      const day = row.date.slice(0, DATE_CHARS);
      const mine = account(row.asset);
      const other =
        row.type === "service"
          ? `Expenses:Services:${row.name.replace(/[^A-Za-z0-9]/g, "") || "X402"}`
          : row.type === "swap"
            ? account(row.paidAsset ?? row.asset)
            : row.type.startsWith("earn")
              ? `Assets:Kawase:${networkName}:Earn`
              : row.type === "bridge"
                ? "Assets:Bridged"
                : row.type === "received"
                  ? "Income:Received"
                  : "Expenses:Sent";
      opened.add(mine);
      opened.add(other);
      const amount = signed(row.asset, row.amount);
      const lines = [`${day} * ${quote(row.name || row.counterparty)} ${quote(`${row.type}${row.description ? `: ${row.description}` : ""}`)}`, `  tx: ${quote(row.txHash)}`];
      if (row.type === "swap" && row.paidAsset && row.paidAmount) {
        lines.push(`  ${mine}  ${amount} ${row.asset} @@ ${signed(row.paidAsset, row.paidAmount).replace("-", "")} ${row.paidAsset}`, `  ${other}  ${signed(row.paidAsset, row.paidAmount)} ${row.paidAsset}`);
      } else {
        lines.push(`  ${mine}  ${amount} ${row.asset}`, `  ${other}`);
      }
      entries.push(lines.join("\n"));
    }
    const head = [`option "title" "Kawase · ${networkName} · ${month}"`, `option "operating_currency" "USDC"`, ...[...opened].sort().map((name) => `${month}-01 open ${name}`)];
    return { body: `${head.join("\n")}\n\n${entries.join("\n\n")}\n`, contentType: "text/plain; charset=utf-8", filename: `kawase-${network}-${month}.beancount`, complete };
  }

  /** The last `days` days in numbers (the weekly report card). */
  async report(user: SessionUser, network: NetworkId, days: number): Promise<ReportView> {
    const to = new Date();
    const from = new Date(to.getTime() - days * MS_PER_DAY);
    const { items, purchases, complete } = await this.range(user, network, from, to);
    const received: Record<string, bigint> = {};
    const sent: Record<string, bigint> = {};
    const counts = { received: 0, sent: 0, swaps: 0, bridges: 0, earn: 0 };
    for (const item of items) {
      if (item.swap) counts.swaps++;
      else if (item.bridge) counts.bridges++;
      else if (item.earn) counts.earn++;
      else if (item.direction === "in") {
        counts.received++;
        add(received, item.asset, BigInt(item.amount));
      } else {
        counts.sent++;
        add(sent, item.asset, BigInt(item.amount));
      }
    }
    const [runs, paid] = await Promise.all([
      this.db
        .select({ status: automationRuns.status, count: sql<number>`count(*)` })
        .from(automationRuns)
        .innerJoin(automations, eq(automations.id, automationRuns.automationId))
        .where(and(eq(automationRuns.userId, user.id), eq(automations.network, network), gte(automationRuns.createdAt, from)))
        .groupBy(automationRuns.status),
      this.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.userId, user.id), eq(invoices.network, network), eq(invoices.status, "paid"), gte(invoices.updatedAt, from))),
    ]);
    const invoiceAmount: Record<string, bigint> = {};
    const decimals: Record<string, number> = {};
    for (const invoice of paid) {
      add(invoiceAmount, invoice.asset, invoice.total);
      if (invoice.asset !== "USDC" && invoice.asset !== "EURC") decimals[invoice.asset] = invoice.decimals;
    }
    return {
      network,
      from: iso(from),
      to: iso(to),
      received: strings(received),
      sent: strings(sent),
      counts,
      services: { spent: purchases.reduce((sum, purchase) => sum + purchase.amount, ZERO).toString(), purchases: purchases.length },
      automations: {
        ran: runs.filter((row) => row.status === "succeeded").reduce((sum, row) => sum + Number(row.count), 0),
        skipped: runs.filter((row) => row.status === "skipped").reduce((sum, row) => sum + Number(row.count), 0),
      },
      invoices: { paid: paid.length, amount: strings(invoiceAmount) },
      decimals,
      complete,
    };
  }
}
