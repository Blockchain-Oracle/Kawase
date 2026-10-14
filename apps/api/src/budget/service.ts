// The weekly budget (D38): one Face ID signs $/week, $/action, categories and venues; inside it Kawase acts with no
// prompt. The server keeps the signed record and the weekly spend ledger; the phone keeps its own ledger and checks
// the signature itself (apps/mobile/src/budget/guard.ts), so the server can neither raise a budget nor hide spend.
//
// What the server enforces here: a silent action only exists while there is an unpaused budget whose category and
// venue allow it, the action fits the per-action cap, and this week's ledger plus the action fits the weekly cap.
// The week is the ISO week, Monday 00:00 UTC. A ledger row counts while its intent is alive (not failed, canceled or
// expired), so a reverted swap gives its room back without anyone settling it here.
import { and, desc, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";

import type { RevokeRequest } from "@kawase/api-client";
import { intents, type Db } from "@kawase/db";
import { encodeIncrementNonce } from "@kawase/integrations-delegation";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";
import { BUDGET_CATEGORIES, budgetTypedData, isSaneBudget, verifyBudget, type BudgetCategory, type BudgetPolicy } from "@kawase/wallet";

import { HTTP, ProblemError, problem } from "../http/problem";
import { safetySettingsOf } from "../safety/settings";
import type { Tx } from "../intents/chain";
import { REVOKE_KIND, relayerReady } from "../send/relayed";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { budgetSpend, budgets } from "./schema";

type BudgetRow = typeof budgets.$inferSelect;
type Executor = Db | Tx;

const MS_PER_DAY = 86_400_000;
const MS_PER_SECOND = 1000;
const DAYS_PER_WEEK = 7;
/** getUTCDay() is 0 on Sunday; the ISO week starts on Monday. */
const MONDAY = 1;
const SUNDAY_OFFSET = 6;
const ZERO = 0n;
/** Intent states whose spend no longer counts: nothing left the wallet under them. */
const RELEASED_STATES = ["failed", "canceled", "expired", "rejected"] as const;
/** Gas for the wallet's own `incrementNonce` (a self-batch of one call) when the relayer cannot carry it. */
const KILL_SWITCH_GAS = 150_000n;

/** Monday 00:00 UTC of the week `at` falls in. */
export function weekStart(at: Date): Date {
  const day = at.getUTCDay();
  const back = day === 0 ? SUNDAY_OFFSET : day - MONDAY;
  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  return new Date(midnight - back * MS_PER_DAY);
}

export const weekEnd = (at: Date) => new Date(weekStart(at).getTime() + DAYS_PER_WEEK * MS_PER_DAY);

/** A silent action the agent wants to take, in the budget's terms. */
export type BudgetAction = { category: BudgetCategory; venue: string; amountUsd: bigint };

/** Why an action is not silent: the phone and the agent turn each into the fix ("Set a budget", "Raise the limit"…). */
export type BudgetRefusal = "no_budget" | "paused" | "guard" | "practice" | "category_off" | "venue_off" | "over_action_cap" | "over_week";

export type BudgetView = {
  network: NetworkId;
  policy: { wallet: string; chainId: number; weeklyCap: string; perActionCap: string; categories: BudgetCategory[]; venues: string[]; issuedAt: number; version: number };
  signature: string;
  paused: boolean;
  spentThisWeek: string;
  leftThisWeek: string;
  weekStartsAt: string;
  weekEndsAt: string;
};

export type LedgerRow = { id: string; intentId: string | null; category: string; venue: string; amountUsd: string; createdAt: string; counts: boolean };

const policyOf = (row: BudgetRow): BudgetPolicy => ({
  wallet: row.wallet as Address,
  chainId: row.chainId,
  weeklyCap: row.weeklyCap,
  perActionCap: row.perActionCap,
  categories: row.categories as BudgetCategory[],
  venues: row.venues,
  issuedAt: row.issuedAt,
  version: row.version,
});

/** A budget as the api hands it out: strings for the amounts, typed data the phone can verify. */
export type ProposedPolicy = { weeklyCap: string; perActionCap: string; categories: string[]; venues: string[] };

export class BudgetService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly log: Logger,
  ) {}

  private chainId(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients.network.chainId;
  }

  private async wallet(userId: string): Promise<Address> {
    const wallet = (await this.wallets.userWallet(userId))?.address as Address | undefined;
    if (!wallet) throw problem(HTTP.conflict, "wallet_not_registered");
    return wallet;
  }

  async active(executor: Executor, userId: string, network: NetworkId): Promise<BudgetRow | undefined> {
    const [row] = await executor
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.network, network), isNull(budgets.endedAt)));
    return row;
  }

  /** This week's spend that still counts: rows whose intent is alive (or that have none, like an x402 payment). */
  async spentThisWeek(executor: Executor, userId: string, network: NetworkId, now = new Date()): Promise<bigint> {
    const [row] = await executor
      .select({ total: sql<string>`coalesce(sum(${budgetSpend.amountUsd}), 0)` })
      .from(budgetSpend)
      .leftJoin(intents, eq(intents.id, budgetSpend.intentId))
      .where(
        and(
          eq(budgetSpend.userId, userId),
          eq(budgetSpend.network, network),
          gte(budgetSpend.createdAt, weekStart(now)),
          or(isNull(budgetSpend.intentId), notInArray(intents.state, [...RELEASED_STATES])),
        ),
      );
    return BigInt(row?.total ?? "0");
  }

  /** The budget, what is spent this week and what is left, or null when the person has none on this network. */
  async current(user: SessionUser, network: NetworkId = user.activeNetwork): Promise<BudgetView | null> {
    const row = await this.active(this.db, user.id, network);
    if (!row) return null;
    const now = new Date();
    const spent = await this.spentThisWeek(this.db, user.id, network, now);
    const left = row.weeklyCap > spent ? row.weeklyCap - spent : ZERO;
    return {
      network,
      policy: { ...policyOf(row), weeklyCap: row.weeklyCap.toString(), perActionCap: row.perActionCap.toString() },
      signature: row.signature,
      paused: row.paused,
      spentThisWeek: spent.toString(),
      leftThisWeek: left.toString(),
      weekStartsAt: weekStart(now).toISOString(),
      weekEndsAt: weekEnd(now).toISOString(),
    };
  }

  /**
   * The typed data the wallet signs for a new budget: the person's numbers, their wallet, the next version. The phone
   * builds the same thing itself and compares before it signs (raising a limit is the phone's Face ID, lowering is not).
   */
  async proposal(user: SessionUser, input: ProposedPolicy, network: NetworkId = user.activeNetwork) {
    const wallet = await this.wallet(user.id);
    const [latest] = await this.db
      .select({ version: budgets.version })
      .from(budgets)
      .where(and(eq(budgets.userId, user.id), eq(budgets.network, network)))
      .orderBy(desc(budgets.version))
      .limit(1);
    const policy: BudgetPolicy = {
      wallet,
      chainId: this.chainId(network),
      weeklyCap: BigInt(input.weeklyCap),
      perActionCap: BigInt(input.perActionCap),
      categories: [...new Set(input.categories)] as BudgetCategory[],
      venues: [...new Set(input.venues.map((venue) => venue.toLowerCase()))],
      issuedAt: Math.floor(Date.now() / MS_PER_SECOND),
      version: (latest?.version ?? 0) + 1,
    };
    if (!isSaneBudget(policy)) throw problem(HTTP.badRequest, "validation", "a budget needs a per-action cap above zero and within the week, and known categories");
    return { policy: serializePolicy(policy), typedData: serializeTyped(budgetTypedData(policy)) };
  }

  /** The wallet signed a budget: it must be this person's wallet and these exact terms. It replaces the one before. */
  async save(user: SessionUser, input: { policy: ReturnType<typeof serializePolicy>; signature: Hex }, network: NetworkId = user.activeNetwork) {
    const wallet = await this.wallet(user.id);
    const policy = parsePolicy(input.policy);
    if (policy.wallet.toLowerCase() !== wallet.toLowerCase() || policy.chainId !== this.chainId(network)) throw problem(HTTP.unprocessable, "signature_mismatch", "a budget for another wallet or network");
    if (!(await verifyBudget(policy, input.signature))) throw problem(HTTP.unprocessable, "signature_mismatch", "the budget's signature does not match its terms");
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget:${user.id}:${network}`}, 0))`);
      const current = await this.active(tx, user.id, network);
      if (current && current.version >= policy.version) throw problem(HTTP.conflict, "intent_stale", "a newer budget is already signed");
      if (current) await tx.update(budgets).set({ endedAt: new Date() }).where(eq(budgets.id, current.id));
      await tx.insert(budgets).values({
        userId: user.id,
        network,
        chainId: policy.chainId,
        wallet: policy.wallet.toLowerCase(),
        weeklyCap: policy.weeklyCap,
        perActionCap: policy.perActionCap,
        categories: policy.categories,
        venues: policy.venues,
        issuedAt: policy.issuedAt,
        version: policy.version,
        signature: input.signature,
        // A new budget keeps a pause the person set: only they lift it.
        paused: current?.paused ?? false,
      });
    });
    this.log.info({ userId: user.id, network, version: policy.version }, "budget signed");
    return this.current(user, network);
  }

  /** Pause or resume silent actions. Pausing never asks; resuming only lets the agent act inside what was signed. */
  async setPaused(user: SessionUser, paused: boolean, network: NetworkId = user.activeNetwork) {
    const row = await this.active(this.db, user.id, network);
    if (!row) throw problem(HTTP.notFound, "not_found", "no budget on this network");
    await this.db.update(budgets).set({ paused }).where(eq(budgets.id, row.id));
    return this.current(user, network);
  }

  /** End the budget: nothing is silent after this (the on-chain kill-switch is the phone's `incrementNonce`). */
  async end(user: SessionUser, network: NetworkId = user.activeNetwork) {
    await this.db
      .update(budgets)
      .set({ endedAt: new Date() })
      .where(and(eq(budgets.userId, user.id), eq(budgets.network, network), isNull(budgets.endedAt)));
    return null;
  }

  /**
   * The kill-switch (D38): `NonceEnforcer.incrementNonce(DelegationManager)` from the wallet, which ends every grant and
   * leaf it signed at the current nonce at once. Kawase stops acting silently first (the budget is paused, which never
   * asks); then the wallet signs it with no Face ID (the phone's checkRevoke accepts exactly this call, nothing else).
   * The relayer carries it when it can, so a wallet with no USDC can still pull the switch; otherwise the wallet sends
   * it itself. The app posts the signature to /budget/kill-switch/submit.
   */
  async killSwitch(user: SessionUser, network: NetworkId = user.activeNetwork): Promise<RevokeRequest> {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    await this.db
      .update(budgets)
      .set({ paused: true })
      .where(and(eq(budgets.userId, user.id), eq(budgets.network, network), isNull(budgets.endedAt)));
    const call = encodeIncrementNonce(clients.network);
    const relayed = (await relayerReady(clients))
      ? await this.wallets.relayedBatchRequest(user.id, network, REVOKE_KIND, [call]).catch((error: unknown) => {
          if (error instanceof ProblemError) return undefined;
          throw error;
        })
      : undefined;
    this.log.info({ userId: user.id, network, relayed: Boolean(relayed) }, "budget kill-switch requested");
    return relayed ?? ((await this.wallets.selfBatchRequest(user.id, network, REVOKE_KIND, [call], KILL_SWITCH_GAS)) as RevokeRequest);
  }

  /** The wallet signed the kill-switch: the relayer redeems its one-time delegation, or the signed transaction goes out. */
  async submitKillSwitch(user: SessionUser, input: { requestId: string; relayed: boolean; signed: Hex }) {
    return input.relayed ? this.wallets.submitRelayedBatch(user.id, input.requestId, input.signed) : this.wallets.submitSigned(user.id, input.requestId, input.signed);
  }

  /** Would this action be silent right now? */
  async allows(executor: Executor, userId: string, network: NetworkId, action: BudgetAction): Promise<{ ok: true; budget: BudgetRow; left: bigint } | { ok: false; reason: BudgetRefusal }> {
    // The safety settings are read on the pool: they read in parallel, which a transaction's one connection cannot.
    const row = await this.active(executor, userId, network);
    const settings = await safetySettingsOf(this.db, userId, network);
    if (!row) return { ok: false, reason: "no_budget" };
    // Pause-all stops everything the agent does alone; careful ("guard") mode is a $0 budget; practice runs the ordinary path,
    // which dry-runs instead of sending.
    if (row.paused || settings.pausedAt) return { ok: false, reason: "paused" };
    if (settings.riskMode === "careful") return { ok: false, reason: "guard" };
    if (settings.practice) return { ok: false, reason: "practice" };
    if (!row.categories.includes(action.category)) return { ok: false, reason: "category_off" };
    if (!row.venues.includes(action.venue.toLowerCase())) return { ok: false, reason: "venue_off" };
    if (action.amountUsd > row.perActionCap) return { ok: false, reason: "over_action_cap" };
    const spent = await this.spentThisWeek(executor, userId, network);
    if (spent + action.amountUsd > row.weeklyCap) return { ok: false, reason: "over_week" };
    return { ok: true, budget: row, left: row.weeklyCap - spent - action.amountUsd };
  }

  /**
   * Records a silent action against this week, inside the caller's transaction and under the person's budget lock, after
   * checking it still fits: two silent actions can never both squeeze into the last of the week.
   */
  async reserve(tx: Tx, userId: string, network: NetworkId, action: BudgetAction & { intentId: string | null }) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget:${userId}:${network}`}, 0))`);
    const fits = await this.allows(tx, userId, network, action);
    if (!fits.ok) return fits;
    await tx
      .insert(budgetSpend)
      .values({ userId, network, budgetId: fits.budget.id, intentId: action.intentId, category: action.category, venue: action.venue.toLowerCase(), amountUsd: action.amountUsd })
      .onConflictDoNothing();
    return fits;
  }

  /** This week's ledger, newest first, with whether each row still counts. */
  async ledger(user: SessionUser, network: NetworkId = user.activeNetwork): Promise<LedgerRow[]> {
    const rows = await this.db
      .select({ spend: budgetSpend, state: intents.state })
      .from(budgetSpend)
      .leftJoin(intents, eq(intents.id, budgetSpend.intentId))
      .where(and(eq(budgetSpend.userId, user.id), eq(budgetSpend.network, network), gte(budgetSpend.createdAt, weekStart(new Date()))))
      .orderBy(desc(budgetSpend.createdAt));
    return rows.map(({ spend, state }) => ({
      id: spend.id,
      intentId: spend.intentId,
      category: spend.category,
      venue: spend.venue,
      amountUsd: spend.amountUsd.toString(),
      createdAt: spend.createdAt.toISOString(),
      counts: !state || !(RELEASED_STATES as readonly string[]).includes(state),
    }));
  }

  /** For the agent's prompt (packages/agent prompt-budget.ts): the budget in plain numbers, or null. */
  async summary(user: SessionUser, network: NetworkId = user.activeNetwork) {
    const view = await this.current(user, network);
    if (!view) return null;
    return {
      network,
      weeklyCapUsd: view.policy.weeklyCap,
      perActionCapUsd: view.policy.perActionCap,
      spentThisWeekUsd: view.spentThisWeek,
      categories: view.policy.categories,
      venues: view.policy.venues,
      paused: view.paused,
    };
  }

  /** Ids of intents a list of rows reserved (for the activity feed's "inside budget · no Face ID" chip). */
  async silentIntents(userId: string, intentIds: readonly string[]): Promise<Set<string>> {
    if (intentIds.length === 0) return new Set();
    const rows = await this.db
      .select({ intentId: budgetSpend.intentId })
      .from(budgetSpend)
      .where(and(eq(budgetSpend.userId, userId), inArray(budgetSpend.intentId, [...intentIds])));
    return new Set(rows.map((row) => row.intentId).filter((value): value is string => Boolean(value)));
  }
}

export const KNOWN_CATEGORIES = BUDGET_CATEGORIES;

export function serializePolicy(policy: BudgetPolicy) {
  return { ...policy, weeklyCap: policy.weeklyCap.toString(), perActionCap: policy.perActionCap.toString() };
}

export function parsePolicy(input: ReturnType<typeof serializePolicy>): BudgetPolicy {
  return { ...input, wallet: input.wallet as Address, weeklyCap: BigInt(input.weeklyCap), perActionCap: BigInt(input.perActionCap) };
}

/** Typed data as JSON (bigints as strings), the way the app's signer takes it. */
export function serializeTyped<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, entry) => (typeof entry === "bigint" ? entry.toString() : entry))) as T;
}
