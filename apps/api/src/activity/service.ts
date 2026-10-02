// Activity everywhere (cards/automate-safety.md "Look back"; surfaces.md Activity; R7 "each outcome writes one row with
// a why"). The chain's transfers of every token (Alchemy) are grouped per transaction and named by what Kawase knows
// of them — its own send, swap, bridge, earn or margin intent; an automation's run; a payment request it matched;
// Circle's faucet — and joined by Kawase's outcomes that are not (or not yet) on chain: payments still being checked,
// automation runs skipped, failed, practised or waiting for the person, and practice sends. One row per outcome,
// newest first; a row with a transaction has the decision record behind it (/history/why), a run without one has its
// own (whyRun).
import { and, desc, eq, gt, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Address } from "viem";

import type { FeedItem, FeedKind, FeedPage, FeedToken, WhyStep, WhyView } from "@kawase/api-client";
import { attentionItems, auditLog, automationRuns, automations, chainEvents, intentDrafts, intents, practiceRuns, txAttempts, walletTokens, withdrawals, type Db, type DcaAction, type PayrollAction, type RuleAction } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkContext, NetworkId } from "@kawase/networks";

import type { ContactService } from "../contacts/service";
import { CIRCLE_FAUCET_SENDERS } from "../faucet/circle-faucet";
import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import { fetchActivity } from "../wallet/activity";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { withdrawalView } from "../withdraw/withdrawals";
import { chainTransfers, type ChainTransfer } from "./alchemy";

/** 30 days. */
const LOOK_BACK_MS = 2_592_000_000;
/** 7 days. */
const CHECKING_MS = 604_800_000;
const ROWS = 150;
const AUDIT_ROWS = 20;
const USDC_DECIMALS = 6;
/** Runs that did nothing worth a row. */
const QUIET = ["NOTHING_TO_MOVE"];
const IN_FLIGHT = ["approved", "executing", "unknown_outcome"] as const;

type IntentFacts = { id: string; kind: string; origin: string; state: string; payload: Record<string, unknown> | null; automationId: string | null; runId: string | null };

export class ActivityFeedService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly contacts: ContactService,
    private readonly log: Logger,
    private readonly alchemyApiKey: string | undefined,
  ) {}

  private context(network: NetworkId): NetworkContext {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients.network;
  }

  async list(user: SessionUser, network: NetworkId): Promise<FeedPage> {
    const context = this.context(network);
    const clients = this.chains.get(network)!;
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const explorer = context.viemChain.blockExplorers?.default.url ?? null;
    const txUrl = (hash: string) => (explorer ? `${explorer}/tx/${hash}` : null);

    // The chain: every token through Alchemy, else the explorer's USDC/EURC page.
    let transfers: ChainTransfer[] = [];
    let more = false;
    let source: FeedPage["source"] = "alchemy";
    if (wallet && this.alchemyApiKey) {
      try {
        ({ transfers, more } = await chainTransfers(network, this.alchemyApiKey, wallet, context.addresses.usdc));
      } catch (error) {
        this.log.warn({ err: error }, "alchemy transfers failed; using the explorer");
        source = "explorer";
      }
    } else source = "explorer";
    if (wallet && source === "explorer") {
      const page = await fetchActivity(context, wallet, { agent: clients.ops.address, relayer: clients.relayerAddress }).catch(() => ({ items: [], more: false }));
      more = page.more;
      transfers = page.items.flatMap((item) => {
        const leg = (asset: "USDC" | "EURC", amount: string, direction: "in" | "out"): ChainTransfer => ({
          id: `${item.id}:${direction}`,
          txHash: item.txHash,
          direction,
          token: asset === "USDC" ? context.addresses.usdc : context.addresses.eurc,
          symbol: asset,
          decimals: USDC_DECIMALS,
          amount: BigInt(amount),
          counterparty: item.counterparty as Address,
          at: item.at,
        });
        return item.swap ? [leg(item.asset, item.amount, "in"), leg(item.swap.asset, item.swap.amount, "out")] : [leg(item.asset, item.amount, item.direction)];
      });
    }

    // Tokens the person hid (spam, lookalikes, their own choice) stay out of the feed, as on Home.
    const hidden = new Set(
      (await this.db.select({ token: walletTokens.tokenAddress }).from(walletTokens).where(and(eq(walletTokens.userId, user.id), eq(walletTokens.network, network), eq(walletTokens.visibility, "hidden")))).map((row) => row.token.toLowerCase()),
    );
    transfers = transfers.filter((entry) => !hidden.has(entry.token.toLowerCase()) && entry.symbol.trim().length > 0);

    const hashes = [...new Set(transfers.map((entry) => entry.txHash.toLowerCase()))];
    const [own, matched, names] = await Promise.all([this.intentsByTx(user.id, hashes), this.requestsByTx(user.id, hashes), this.contactNames(user.id)]);
    const ownWallets = { agent: clients.ops.address.toLowerCase(), relayer: clients.relayerAddress.toLowerCase(), self: wallet?.toLowerCase() };
    const label = (counterparty: string, inbound: boolean): FeedItem["counterpartyLabel"] => {
      const lower = counterparty.toLowerCase();
      if (lower === ownWallets.self) return "self";
      if (lower === ownWallets.agent) return "kawase_agent";
      if (lower === ownWallets.relayer) return "kawase_relayer";
      if (inbound && CIRCLE_FAUCET_SENDERS[network]?.has(lower)) return "circle_faucet";
      return null;
    };
    const base = (id: string, at: string): FeedItem => ({
      id,
      network,
      kind: "other",
      direction: "none",
      status: "confirmed",
      at,
      token: null,
      amount: null,
      other: null,
      counterparty: null,
      counterpartyLabel: null,
      contactName: null,
      txHash: null,
      explorerUrl: null,
      intentId: null,
      fromAutomation: false,
      automationId: null,
      runId: null,
      needsYouId: null,
      reason: null,
      reasonParams: null,
      bridge: null,
      earn: null,
    });
    const tokenOf = (entry: ChainTransfer): FeedToken => ({ address: entry.token, symbol: entry.symbol, decimals: entry.decimals });

    // One row per transaction: its legs, named by Kawase's own record of it.
    const items: FeedItem[] = [];
    const byTx = new Map<string, ChainTransfer[]>();
    for (const entry of transfers) byTx.set(entry.txHash.toLowerCase(), [...(byTx.get(entry.txHash.toLowerCase()) ?? []), entry]);
    for (const [hash, legs] of byTx) {
      const intent = own.get(hash);
      const into = legs.filter((leg) => leg.direction === "in");
      const out = legs.filter((leg) => leg.direction === "out");
      const main = into[0] ?? out[0]!;
      const row = base(`tx:${hash}`, main.at);
      row.txHash = main.txHash;
      row.explorerUrl = txUrl(main.txHash);
      row.status = "confirmed";
      if (intent) {
        row.intentId = intent.id;
        row.fromAutomation = intent.origin === "automation";
        row.automationId = intent.automationId;
        row.runId = intent.runId;
      }
      const swapShape = into.length === 1 && out.length === 1 && into[0]!.token !== out[0]!.token;
      if (intent?.kind === "swap" || (swapShape && !intent)) {
        row.kind = "swap";
        row.direction = "in";
        if (into[0]) {
          row.token = tokenOf(into[0]);
          row.amount = into[0].amount.toString();
        }
        if (out[0]) row.other = { token: tokenOf(out[0]), amount: out[0].amount.toString() };
      } else if (intent?.kind === "margin") {
        row.kind = "margin";
        row.direction = out[0] ? "out" : "in";
        row.token = tokenOf(main);
        row.amount = main.amount.toString();
      } else if (intent?.kind === "bridge") {
        const leg = out[0] ?? main;
        row.kind = "bridge";
        row.direction = "out";
        row.token = tokenOf(leg);
        row.amount = leg.amount.toString();
        const chainId = (intent.payload?.view as { chainId?: number } | undefined)?.chainId;
        row.bridge = chainId ? { chainId } : null;
      } else if (intent?.kind === "earn") {
        const view = intent.payload?.view as { action?: "deposit" | "withdraw"; vault?: { name?: string } } | undefined;
        const leg = view?.action === "withdraw" ? (into[0] ?? main) : (out[0] ?? main);
        row.kind = "earn";
        row.direction = view?.action === "withdraw" ? "in" : "out";
        row.token = tokenOf(leg);
        row.amount = leg.amount.toString();
        row.earn = view?.action && view.vault?.name ? { action: view.action, vault: view.vault.name } : null;
      } else {
        row.direction = main.direction;
        row.token = tokenOf(main);
        row.amount = main.amount.toString();
        row.counterparty = main.counterparty;
        row.counterpartyLabel = label(main.counterparty, main.direction === "in");
        row.contactName = names.get(main.counterparty.toLowerCase()) ?? null;
        row.kind =
          row.fromAutomation && main.direction === "out"
            ? "automation"
            : main.direction === "out"
              ? "send"
              : matched.has(hash)
                ? "request_paid"
                : row.counterpartyLabel === "circle_faucet"
                  ? "faucet"
                  : "receive";
      }
      items.push(row);
    }

    // Kawase's outcomes that are not (or not yet) on chain.
    const since = new Date(Date.now() - LOOK_BACK_MS);
    const [checking, runs, practice, waiting] = await Promise.all([
      this.db
        .select({ intent: intents, payload: intentDrafts.payload, txHash: txAttempts.txHash })
        .from(intents)
        .leftJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
        .leftJoin(txAttempts, eq(txAttempts.intentId, intents.id))
        .where(and(eq(intents.userId, user.id), eq(intents.network, network), inArray(intents.state, [...IN_FLIGHT]), gt(intents.createdAt, new Date(Date.now() - CHECKING_MS)))),
      this.db
        .select({ run: automationRuns, automation: automations })
        .from(automationRuns)
        .innerJoin(automations, eq(automations.id, automationRuns.automationId))
        .where(and(eq(automationRuns.userId, user.id), eq(automations.network, network), inArray(automationRuns.status, ["skipped", "failed", "practiced", "needs_you"]), gt(automationRuns.scheduledFor, since), or(isNull(automationRuns.reason), notInArray(automationRuns.reason, QUIET))))
        .orderBy(desc(automationRuns.scheduledFor))
        .limit(ROWS),
      this.db.select().from(practiceRuns).where(and(eq(practiceRuns.userId, user.id), eq(practiceRuns.network, network), eq(practiceRuns.kind, "send"), gt(practiceRuns.createdAt, since))),
      this.db.select().from(attentionItems).where(and(eq(attentionItems.userId, user.id), eq(attentionItems.network, network), eq(attentionItems.status, "pending"), isNull(attentionItems.runId))),
    ]);
    const seenTx = new Set(hashes);
    for (const { intent, payload, txHash } of checking) {
      if (txHash && seenTx.has(txHash.toLowerCase())) continue;
      const row = base(`intent:${intent.id}`, intent.updatedAt.toISOString());
      const send = payload as { asset?: string; amount?: string; recipient?: { name?: string | null; address?: string } | null } | null;
      row.kind = intent.kind === "send" ? (intent.originSurface === "automation" ? "automation" : "send") : (intent.kind as FeedKind);
      row.direction = "out";
      row.status = "checking";
      row.intentId = intent.id;
      row.fromAutomation = intent.originSurface === "automation";
      row.txHash = txHash ?? null;
      row.explorerUrl = txHash ? txUrl(txHash) : null;
      if (intent.kind === "send" && send?.asset && send.amount) {
        row.token = { address: send.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, symbol: send.asset, decimals: USDC_DECIMALS };
        row.amount = send.amount;
        row.counterparty = send.recipient?.address ?? null;
        row.contactName = send.recipient?.name ?? null;
      }
      items.push(row);
    }
    for (const { run, automation } of runs) {
      const row = base(`run:${run.id}`, (run.updatedAt ?? run.scheduledFor).toISOString());
      row.kind = "automation";
      row.direction = "out";
      row.fromAutomation = true;
      row.automationId = automation.id;
      row.runId = run.id;
      row.status = run.status === "needs_you" ? "waiting" : run.status === "practiced" ? "practiced" : run.status === "failed" ? "failed" : "skipped";
      row.reason = run.reason;
      row.reasonParams = run.reasonParams ?? null;
      Object.assign(row, this.runMoney(automation, run.trigger ?? null, context));
      items.push(row);
    }
    if (runs.some(({ run }) => run.status === "needs_you")) {
      const ids = runs.filter(({ run }) => run.status === "needs_you").map(({ run }) => run.id);
      const linked = await this.db.select({ id: attentionItems.id, runId: attentionItems.runId }).from(attentionItems).where(inArray(attentionItems.runId, ids));
      for (const row of items) if (row.runId) row.needsYouId = linked.find((entry) => entry.runId === row.runId)?.id ?? row.needsYouId;
    }
    for (const entry of practice) {
      const row = base(`practice:${entry.id}`, entry.createdAt.toISOString());
      row.kind = "practice";
      row.direction = "out";
      row.status = "practiced";
      row.intentId = entry.intentId;
      const asset = entry.summary.asset;
      if (asset === "USDC" || asset === "EURC") row.token = { address: asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, symbol: asset, decimals: USDC_DECIMALS };
      row.amount = entry.summary.amount ?? null;
      row.counterparty = entry.summary.to ?? null;
      row.contactName = entry.summary.name || null;
      row.reason = entry.result.ok ? null : "PRACTICE_RUN_REFUSED";
      row.reasonParams = entry.result.error ? { error: entry.result.error } : null;
      items.push(row);
    }
    for (const item of waiting) {
      const row = base(`needs-you:${item.id}`, item.createdAt.toISOString());
      row.kind = "automation";
      row.direction = "out";
      row.status = "waiting";
      row.fromAutomation = true;
      row.automationId = item.automationId;
      row.needsYouId = item.id;
      row.reason = item.reason;
      row.reasonParams = item.reasonParams ?? null;
      const request = item.request;
      if (request.type === "send") {
        row.token = { address: request.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc, symbol: request.asset, decimals: USDC_DECIMALS };
        row.amount = request.amount;
        row.counterparty = request.recipientAddress;
        row.contactName = request.name;
      }
      items.push(row);
    }

    // A withdrawal is one row ("Withdrawn to Kraken"): its steps' rows fold into it and open from it.
    const moves = await this.db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, user.id), eq(withdrawals.network, network), gt(withdrawals.createdAt, since)))
      .orderBy(desc(withdrawals.createdAt));
    for (const run of moves) {
      if (run.status === "canceled" && run.steps.every((step) => !step.intentId)) continue;
      const stepIntents = new Set(run.steps.map((step) => step.intentId).filter((value): value is string => Boolean(value)));
      const folded = items.filter((row) => row.intentId && stepIntents.has(row.intentId));
      for (const row of folded) items.splice(items.indexOf(row), 1);
      const row = base(`withdrawal:${run.id}`, (folded[0]?.at ?? run.updatedAt.toISOString()) > run.updatedAt.toISOString() ? folded[0]!.at : run.updatedAt.toISOString());
      row.kind = "withdraw";
      row.direction = "out";
      row.status = run.status === "done" ? "confirmed" : run.status === "stopped" ? "failed" : run.status === "canceled" ? "skipped" : run.steps.some((step) => step.arriving || step.state === "active") ? "checking" : "waiting";
      const first = run.steps[0];
      if (first && run.steps.length === 1) {
        row.token = { address: first.token.address, symbol: first.token.symbol, decimals: first.token.decimals };
        row.amount = first.moved ?? first.amount;
      }
      row.counterparty = run.destination.address;
      row.contactName = run.destination.label ?? run.destination.exchange?.name ?? null;
      row.withdrawal = withdrawalView(run);
      items.push(row);
    }

    items.sort((a, b) => b.at.localeCompare(a.at));
    const [pending] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attentionItems)
      .where(and(eq(attentionItems.userId, user.id), eq(attentionItems.network, network), eq(attentionItems.status, "pending")));
    return { network, items: items.slice(0, ROWS), needsYou: pending?.count ?? 0, more, source };
  }

  /** What an automation run's row shows of its money: the amount and token it would or did move, and to whom. */
  private runMoney(automation: typeof automations.$inferSelect, trigger: Record<string, string> | null, context: NetworkContext): Partial<FeedItem> {
    const usdc = { address: context.addresses.usdc, symbol: "USDC", decimals: USDC_DECIMALS };
    const stable = (asset: string) => (asset === "EURC" ? { address: context.addresses.eurc, symbol: "EURC", decimals: USDC_DECIMALS } : usdc);
    if (automation.kind === "scheduled_send") {
      const action = automation.action as { amount: string; asset: string; recipientAddress: string; recipientName: string | null };
      return { token: stable(action.asset), amount: action.amount, counterparty: action.recipientAddress, contactName: action.recipientName };
    }
    if (automation.kind === "payroll") {
      const action = automation.action as PayrollAction;
      const total = action.lines.filter((line) => line.asset === "USDC").reduce((sum, line) => sum + BigInt(line.amount), BigInt(0));
      return { token: usdc, amount: total.toString(), contactName: action.lines.map((line) => line.recipientName ?? line.recipientWords).join(", ") };
    }
    if (automation.kind === "dca") {
      const action = automation.action as DcaAction;
      return { token: { address: action.tokenIn, symbol: action.symbolIn, decimals: action.decimalsIn }, amount: action.amount, other: { token: { address: action.tokenOut, symbol: action.symbolOut, decimals: action.decimalsOut }, amount: trigger?.quotedOut ?? "0" } };
    }
    if (automation.kind === "rule") {
      const step = (automation.action as RuleAction).step;
      return { token: step.type === "send" ? stable(step.asset) : usdc, amount: trigger?.amount ?? null, contactName: step.type === "send" ? (step.recipientName ?? step.recipientWords) : null };
    }
    return { token: usdc, amount: trigger?.amount ?? null };
  }

  /** The person's own transactions → what each was (the intent behind it, and the automation run that made it). */
  private async intentsByTx(userId: string, hashes: string[]): Promise<Map<string, IntentFacts>> {
    const out = new Map<string, IntentFacts>();
    if (hashes.length === 0) return out;
    const rows = await this.db
      .select({ txHash: txAttempts.txHash, id: intents.id, kind: intents.kind, origin: intents.originSurface, state: intents.state, payload: intentDrafts.payload })
      .from(txAttempts)
      .innerJoin(intents, eq(intents.id, txAttempts.intentId))
      .leftJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
      .where(and(eq(txAttempts.userId, userId), inArray(sql`lower(${txAttempts.txHash})`, hashes)));
    const runs = rows.length
      ? await this.db.select({ id: automationRuns.id, automationId: automationRuns.automationId, intentId: automationRuns.intentId }).from(automationRuns).where(inArray(automationRuns.intentId, rows.map((row) => row.id)))
      : [];
    for (const row of rows) {
      if (!row.txHash) continue;
      const run = runs.find((entry) => entry.intentId === row.id);
      out.set(row.txHash.toLowerCase(), { id: row.id, kind: row.kind, origin: row.origin, state: row.state, payload: row.payload ?? null, automationId: run?.automationId ?? null, runId: run?.id ?? null });
    }
    return out;
  }

  /** Incoming transactions Kawase matched to one of the person's payment requests. */
  private async requestsByTx(userId: string, hashes: string[]) {
    if (hashes.length === 0) return new Set<string>();
    const rows = await this.db
      .select({ txHash: chainEvents.txHash })
      .from(chainEvents)
      .where(and(eq(chainEvents.userId, userId), inArray(sql`lower(${chainEvents.txHash})`, hashes), sql`${chainEvents.matchedRequestId} is not null`));
    return new Set(rows.map((row) => row.txHash.toLowerCase()));
  }

  private async contactNames(userId: string) {
    const book = await this.contacts.addressBook(userId);
    const names = new Map<string, string>();
    for (const entry of [...book].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))) if (!names.has(entry.address.toLowerCase())) names.set(entry.address.toLowerCase(), entry.name);
    return names;
  }

  /**
   * Why an automation run went the way it did, without a transaction: which automation and what triggered it, the
   * check that stopped it (or that it was practice, or waits for the person), how the person answered, and every
   * recorded step on it.
   */
  async whyRun(user: SessionUser, runId: string): Promise<WhyView> {
    const [found] = await this.db
      .select({ run: automationRuns, automation: automations })
      .from(automationRuns)
      .innerJoin(automations, eq(automations.id, automationRuns.automationId))
      .where(and(eq(automationRuns.id, runId), eq(automationRuns.userId, user.id)));
    if (!found) throw problem(HTTP.notFound, "not_found", "no such run");
    const { run, automation } = found;
    const [attempt] = run.intentId ? await this.db.select({ txHash: txAttempts.txHash }).from(txAttempts).where(eq(txAttempts.intentId, run.intentId)).limit(1) : [];
    const [item] = await this.db.select().from(attentionItems).where(eq(attentionItems.runId, runId));
    const audits = await this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.userId, user.id), or(eq(auditLog.subjectId, runId), eq(auditLog.subjectId, automation.id), ...(item ? [eq(auditLog.subjectId, item.id)] : []))))
      .orderBy(desc(auditLog.createdAt))
      .limit(AUDIT_ROWS);
    const at = run.scheduledFor.toISOString();
    const steps: WhyStep[] = [
      { step: "automation", at, automationId: automation.id, kind: automation.kind, schedule: automation.kind === "rule" ? null : automation.schedule.every, trigger: run.trigger ?? null },
      {
        step: "checked",
        at: run.updatedAt.toISOString(),
        clear: run.status === "succeeded" || run.status === "practiced",
        warnings: [],
        open: run.status === "needs_you" && run.reason ? [run.reason] : [],
        blocking: run.status === "skipped" || run.status === "failed" ? run.reason : null,
      },
    ];
    if (item?.decidedAt && item.status !== "pending") steps.push({ step: "approved", at: item.decidedAt.toISOString(), route: item.status === "approved" ? "wallet_signature" : item.status, via: item.decidedVia === "push" || item.decidedVia === "web" ? "app" : (item.decidedVia as "app" | "chat") ?? "app" });
    if (attempt?.txHash) steps.push({ step: "sent", at: run.updatedAt.toISOString(), by: "circle_dcw", txHash: attempt.txHash, status: run.status === "succeeded" ? "confirmed" : run.status === "failed" ? "failed" : "pending" });
    for (const entry of [...audits].reverse()) steps.push({ step: "audit", at: entry.createdAt.toISOString(), action: entry.action, decision: entry.decision });
    const explorer = this.chains.get(automation.network)?.network.viemChain.blockExplorers?.default.url;
    return {
      network: automation.network,
      txHash: attempt?.txHash ?? "",
      kind: "automation",
      facts: { automationKind: automation.kind, status: run.status, reason: run.reason, practice: run.status === "practiced" ? 1 : 0 },
      steps,
      explorerUrl: attempt?.txHash && explorer ? `${explorer}/tx/${attempt.txHash}` : null,
    };
  }
}

