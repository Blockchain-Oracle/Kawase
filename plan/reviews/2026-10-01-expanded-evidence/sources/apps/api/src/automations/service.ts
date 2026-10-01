// Automations (Stage 8; MASTER-PLAN "Automations + delegated authority"): "every Tuesday send $1 to Alex", run by
// Kawase without asking again, bounded on chain by the automation's own grant.
//
// Auto-save (8b) is the second kind: "keep $20 ready, the rest earns". Its grants (three, signed with one Face ID)
// only let Kawase move USDC between the wallet and the wallet's own position in one vault. It is checked on its
// schedule and whenever money arrives (the incoming watcher pulls the next check forward): above what it keeps, the
// rest goes into savings; below it (when topping up is on), savings refill the wallet. Moves are earn intents sent by
// the ops wallet and settled by the earn witness.
//
// Drafting: who (resolved by the send rules: a contact, an @handle, or an address the person typed), how much, and
// when (every day / week on a weekday / month on a day, at a local time in the person's zone — 09:00 and their own
// zone when not said: inferred, never asked); the next three runs and the most that can ever leave per period.
// Turning on: the grant — a delegation from the person's wallet to Kawase's ops wallet that can only call
// `token.transfer(recipient, …)`, at most `amount` per period, until it ends — is built here, in code (K2), and
// signed by the wallet with Face ID. Running: the runner below claims each due occurrence once (a unique row per
// automation and time), checks the send rules again on fresh facts, and has the ops wallet redeem that grant; a
// run that cannot go is skipped with its reason and the person is told. Pausing stops runs at once; cancelling
// stops them and hands the wallet the revoke transaction for the grant.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getAddress, hashTypedData, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import { AUTO_SAVE_DEFAULT_KEEP, AUTO_SAVE_MIN_MOVE, GAS_FLOAT_USDC_BASE_UNITS, MS_PER_SECOND } from "@kawase/config";
import type {
  AutoSaveInput,
  AutoSaveView,
  AutomationGrantRequest,
  AutomationInput,
  AutomationRunView,
  AutomationView,
  TransactionRequestResponse,
} from "@kawase/api-client";
import {
  automationRuns,
  automations,
  grants,
  intents,
  txAttempts,
  users,
  type AutoSaveAction,
  type AutomationAction,
  type AutomationMove,
  type AutomationSchedule,
  type Db,
} from "@kawase/db";
import {
  SAVE_PURPOSES,
  buildAutomationGrant,
  buildSaveGrants,
  describeGrant,
  grantTypedData,
  isWalletSetUp,
  withSignature,
  type SaveGrants,
  type SavePurpose,
} from "@kawase/integrations-delegation";
import { isValidTimeZone, nextRuns, schedulePeriodSeconds } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";
import { evaluateAutoSave, evaluateAutomation, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { usdcUnits, type EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { jsonSafe } from "../intents/chain";
import { parseRequestAmount, userLimits } from "../send/facts";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type AutomationRow = typeof automations.$inferSelect;
type GrantRow = typeof grants.$inferSelect;
type ScheduleInput = Pick<AutomationInput, "every" | "weekday" | "monthday" | "time" | "timezone">;

const DEFAULT_TIME = "09:00";
/** "HH:MM". */
const TIME_CHARS = 5;
const NEXT_RUNS_SHOWN = 3;
const RUNS_SHOWN = 10;
/** An automation (and its grant) lasts a year unless it is ended sooner. */
const LIFETIME_DAYS = 365;
const SECONDS_PER_DAY = 86_400;
const SALT_BYTES = 32;
const ZERO = 0n;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_WEEKDAY = 6;
const MAX_MONTHDAY = 28;

const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Auto-save's runs that found nothing to move: kept (each check is claimed once) but not shown. */
const NOTHING_TO_MOVE = "NOTHING_TO_MOVE";
/** Reasons a run stops without telling the person (they chose it, or there was nothing to do). */
const QUIET_REASONS = new Set([NOTHING_TO_MOVE, "PAUSED_ALL"]);

/**
 * What an Auto-save check does now: above what it keeps (never less than the gas float the wallet needs for its own
 * transactions), the rest goes into savings; below it, with topping up on, savings refill it as far as they can.
 * Moves under the minimum are not worth a transaction.
 */
export function planSave(facts: { balance: bigint; withdrawable: bigint; keep: bigint; topUp: boolean }): AutomationMove | null {
  const floor = facts.keep > GAS_FLOAT_USDC_BASE_UNITS ? facts.keep : GAS_FLOAT_USDC_BASE_UNITS;
  if (facts.balance >= floor + AUTO_SAVE_MIN_MOVE) return { direction: "in", amount: (facts.balance - floor).toString() };
  if (facts.topUp && facts.balance + AUTO_SAVE_MIN_MOVE <= facts.keep) {
    const want = facts.keep - facts.balance;
    const amount = want < facts.withdrawable ? want : facts.withdrawable;
    if (amount >= AUTO_SAVE_MIN_MOVE) return { direction: "out", amount: amount.toString() };
  }
  return null;
}

type StoredDraft = { results: PolicyResult[]; blocking: PolicyResult | null };

export class AutomationService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly sends: SendService,
    private readonly earn: EarnService,
    private readonly inbox: InboxService,
    private readonly log: Logger,
  ) {}

  private clients(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  /** The schedule as asked, completed: 09:00 and the person's own zone when not said; this weekday / day when missing. */
  private schedule(user: SessionUser, input: ScheduleInput): { schedule: AutomationSchedule; valid: boolean } {
    const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : isValidTimeZone(user.timezone) ? user.timezone : "UTC";
    const time = input.time && TIME_PATTERN.test(input.time) ? input.time.padStart(TIME_CHARS, "0") : DEFAULT_TIME;
    const today = new Date();
    const schedule: AutomationSchedule = {
      every: input.every,
      time,
      timezone,
      ...(input.every === "week" ? { weekday: input.weekday ?? today.getUTCDay() } : {}),
      ...(input.every === "month" ? { monthday: input.monthday ?? Math.min(today.getUTCDate(), MAX_MONTHDAY) } : {}),
    };
    const valid =
      (input.timezone === undefined || isValidTimeZone(input.timezone)) &&
      (schedule.weekday === undefined || (schedule.weekday >= 0 && schedule.weekday <= MAX_WEEKDAY)) &&
      (schedule.monthday === undefined || (schedule.monthday >= 1 && schedule.monthday <= MAX_MONTHDAY));
    return { schedule, valid };
  }

  async create(user: SessionUser, input: AutomationInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const asset: AssetId = input.asset ?? "USDC";
    const { schedule, valid } = this.schedule(user, input);
    const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, input.recipient);
    const amount = parseRequestAmount(input.amount, asset);
    const view = await capabilityView(this.db, this.chains.available);
    const { client, network: context } = this.clients(network);
    let setUp = false;
    let balance = ZERO;
    if (wallet) {
      const token = asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
      const [code, held] = await Promise.all([
        client.getCode({ address: wallet }),
        client.readContract({ address: token, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
      ]);
      setUp = isWalletSetUp(code);
      balance = held;
    }
    const limits = await userLimits(this.db, user.id, network);
    const evaluation = evaluateAutomation({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), setUp, balance },
      recipient: resolution.facts,
      amount,
      asset,
      schedule: { valid },
      limits: { perTx: limits.perTx },
    });
    const resolved = resolution.facts.status === "resolved" ? resolution.facts : undefined;
    const action: AutomationAction = {
      recipientWords: input.recipient,
      recipientAddress: resolved ? getAddress(resolved.address) : "",
      recipientName: resolved?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : null),
      asset,
      amount: amount.status === "ok" ? amount.baseUnits.toString() : "0",
      note: input.note?.trim() || null,
    };
    const [row] = await this.db
      .insert(automations)
      .values({
        userId: user.id,
        network,
        kind: "scheduled_send",
        status: "draft",
        threadId: origin.threadId ?? null,
        schedule,
        action,
        report: { results: evaluation.results, blocking: evaluation.blocking ?? null },
        endsAt: new Date(Date.now() + LIFETIME_DAYS * SECONDS_PER_DAY * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  /**
   * Auto-save's draft. Inferred, never asked: what to keep (Kawase's default when not said), the vault (the one the
   * person already saves in, else the best active one), checking every day at 09:00 in their zone and whenever money
   * arrives, and topping up on. The card shows each, and what a check right now would move.
   */
  async createAutoSave(user: SessionUser, input: AutoSaveInput, origin: { threadId?: string | undefined } = {}): Promise<AutomationView> {
    const network = user.activeNetwork;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { schedule, valid } = this.schedule(user, { every: input.every ?? "day", time: input.time, timezone: input.timezone });
    const keep = input.keep?.trim() ? parseRequestAmount(input.keep, "USDC") : ({ status: "ok", baseUnits: AUTO_SAVE_DEFAULT_KEEP } as const);
    const view = await capabilityView(this.db, this.chains.available);
    const { client } = this.clients(network);
    const { vaults, positions } = await this.earn.holdingsOn(network, wallet);
    const named = input.vault ? vaults.find((entry) => same(entry.address, input.vault!)) : undefined;
    const held = [...positions].sort((a, b) => (b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0))[0]?.vault;
    const vault = named ?? held ?? vaults.find((entry) => entry.status === "active");
    const existing = await this.db
      .select({ id: automations.id })
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, network), eq(automations.kind, "auto_save"), inArray(automations.status, ["active", "paused"])));
    const setUp = wallet ? isWalletSetUp(await client.getCode({ address: wallet })) : false;
    const evaluation = evaluateAutoSave({
      network,
      capability: { here: view.automations[network].state, other: view.automations[other].state },
      signedIn: !user.isAnonymous,
      wallet: { registered: Boolean(wallet), setUp },
      vault: vault
        ? { status: "found", active: vault.status !== "paused" && vault.status !== "deprecated", lowLiquidity: vault.status === "low_liquidity", warnings: vault.warnings }
        : { status: "missing" },
      keep,
      schedule: { valid },
      existing: existing.length > 0,
    });
    const action: AutoSaveAction = {
      vault: vault ? getAddress(vault.address) : "",
      vaultName: vault?.name ?? "",
      keep: keep.status === "ok" ? keep.baseUnits.toString() : AUTO_SAVE_DEFAULT_KEEP.toString(),
      topUp: input.topUp ?? true,
    };
    const [row] = await this.db
      .insert(automations)
      .values({
        userId: user.id,
        network,
        kind: "auto_save",
        status: "draft",
        threadId: origin.threadId ?? null,
        schedule,
        action,
        report: { results: evaluation.results, blocking: evaluation.blocking ?? null },
        endsAt: new Date(Date.now() + LIFETIME_DAYS * SECONDS_PER_DAY * MS_PER_SECOND),
      })
      .returning();
    return this.view(row!);
  }

  /**
   * The wallet's USDC, what it holds in the vault, what can come back now, and what a check would move. What can come
   * back is the position capped by the liquidity App Kit reports: the vault's own `maxWithdraw` is not reliable on
   * testnet's mock vaults (it reads 0 while withdrawals work), and the earn draft's floors still guard each move.
   */
  private async saveFacts(network: NetworkId, wallet: Address, action: AutoSaveAction) {
    const { client, network: context } = this.clients(network);
    const [balance, { vaults, positions }] = await Promise.all([
      client.readContract({ address: context.addresses.usdc, abi: ERC20_BALANCE, functionName: "balanceOf", args: [wallet] }),
      this.earn.holdingsOn(network, wallet),
    ]);
    const vault = vaults.find((entry) => same(entry.address, action.vault));
    const saved = positions.find((entry) => same(entry.vault.address, action.vault))?.assets ?? ZERO;
    const liquidity = vault ? usdcUnits(vault.available) : ZERO;
    const withdrawable = saved < liquidity ? saved : liquidity;
    const plan = planSave({ balance, withdrawable, keep: BigInt(action.keep), topUp: action.topUp });
    return { vault, balance, saved, withdrawable, plan };
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async own(userId: string, id: string): Promise<AutomationRow> {
    const [row] = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such automation");
    return row;
  }

  async view(row: AutomationRow): Promise<AutomationView> {
    const explorer = this.chains.get(row.network)?.network.viemChain.blockExplorers?.default.url;
    const [grant] = row.grantId ? await this.db.select().from(grants).where(eq(grants.id, row.grantId)) : [];
    const runs = await this.db
      .select({ run: automationRuns, txHash: txAttempts.txHash })
      .from(automationRuns)
      .leftJoin(txAttempts, eq(txAttempts.intentId, automationRuns.intentId))
      .where(and(eq(automationRuns.automationId, row.id), or(isNull(automationRuns.reason), ne(automationRuns.reason, NOTHING_TO_MOVE))))
      .orderBy(desc(automationRuns.scheduledFor))
      .limit(RUNS_SHOWN);
    const report = row.report as StoredDraft | null;
    const live = row.status === "draft" || row.status === "active";
    const upcoming = live ? (row.status === "active" && row.nextRunAt ? [row.nextRunAt, ...nextRuns(row.schedule, row.nextRunAt, NEXT_RUNS_SHOWN - 1)] : nextRuns(row.schedule, new Date(), NEXT_RUNS_SHOWN)) : [];
    const send = row.kind === "scheduled_send" ? (row.action as AutomationAction) : null;
    return {
      id: row.id,
      network: row.network,
      status: row.status,
      kind: row.kind,
      schedule: row.schedule,
      save: row.kind === "auto_save" ? await this.saveView(row) : null,
      action: send
        ? {
            recipientWords: send.recipientWords,
            recipientAddress: send.recipientAddress || null,
            recipientName: send.recipientName,
            asset: send.asset,
            amount: send.amount,
            note: send.note,
          }
        : null,
      nextRuns: upcoming.map((date) => date.toISOString()),
      maxPerPeriod: send?.amount ?? "0",
      periodSeconds: schedulePeriodSeconds(row.schedule),
      endsAt: row.endsAt.toISOString(),
      grant: grant ? { id: grant.id, status: grant.status, expiresAt: grant.expiresAt.toISOString() } : null,
      runs: runs.map(({ run, txHash }): AutomationRunView => ({
        id: run.id,
        scheduledFor: run.scheduledFor.toISOString(),
        status: run.status,
        reason: run.reason,
        reasonParams: run.reasonParams ?? null,
        move: run.move ?? null,
        tx: txHash && explorer ? { hash: txHash, explorerUrl: `${explorer}/tx/${txHash}` } : null,
      })),
      results: report?.results ?? [],
      blocking: row.status === "draft" ? (report?.blocking ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async saveView(row: AutomationRow): Promise<AutoSaveView> {
    const action = row.action as AutoSaveAction;
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    const facts = wallet && action.vault ? await this.saveFacts(row.network, wallet, action).catch(() => undefined) : undefined;
    const ended = row.status === "canceled" || row.status === "ended";
    return {
      vault: action.vault,
      vaultName: facts?.vault?.name ?? action.vaultName,
      protocol: facts?.vault?.protocol ?? "morpho",
      apy: facts?.vault?.apy ?? 0,
      keep: action.keep,
      topUp: action.topUp,
      saved: (facts?.saved ?? ZERO).toString(),
      now: ended ? null : (facts?.plan ?? null),
    };
  }

  async get(userId: string, id: string) {
    return this.view(await this.own(userId, id));
  }

  async list(user: SessionUser) {
    const rows = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, user.activeNetwork), inArray(automations.status, ["active", "paused", "draft"])))
      .orderBy(desc(automations.createdAt));
    // Drafts nobody turned on stay out of the list after a day; they live on in the chat card.
    const fresh = rows.filter((row) => row.status !== "draft" || row.createdAt.getTime() > Date.now() - SECONDS_PER_DAY * MS_PER_SECOND);
    return Promise.all(fresh.map((row) => this.view(row)));
  }

  // ── Turning on ──────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The grants to sign. A scheduled send: one — `token.transfer(recipient, …)` only, at most `amount` per period,
   * until the automation ends. Auto-save: three — approve the vault, deposit for the wallet, withdraw to the wallet —
   * so Kawase can only move USDC between the wallet and its own position. One Face ID signs them all.
   */
  async grantRequest(user: SessionUser, id: string): Promise<AutomationGrantRequest> {
    const row = await this.own(user.id, id);
    if (row.status !== "draft") throw problem(HTTP.conflict, "intent_final");
    if ((row.report as StoredDraft | null)?.blocking) throw problem(HTTP.unprocessable, "intent_blocked");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { client, network: context, ops } = this.clients(row.network);
    if (!isWalletSetUp(await client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const startsAt = nowSeconds();
    const expiresAt = Math.floor(row.endsAt.getTime() / MS_PER_SECOND);
    const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
    const base = {
      userId: user.id,
      network: row.network,
      kind: "automation" as const,
      automationId: row.id,
      delegatorWalletId: wallet.id,
      delegateAddress: ops.address,
      startsAt: new Date(startsAt * MS_PER_SECOND),
      expiresAt: new Date(expiresAt * MS_PER_SECOND),
      status: "pending" as const,
    };

    if (row.kind === "auto_save") {
      const action = row.action as AutoSaveAction;
      const built = buildSaveGrants({
        network: context,
        wallet: wallet.address as Address,
        redeemer: ops.address,
        usdc: context.addresses.usdc,
        vault: action.vault as Address,
        expiresAt,
        salts: { approve: salt(), deposit: salt(), withdraw: salt() },
      });
      const out: AutomationGrantRequest = { grants: [], receipts: [] };
      for (const purpose of SAVE_PURPOSES) {
        const typedData = grantTypedData(context, built[purpose]);
        const receipt = { purpose, ...describeGrant(context, built[purpose]) };
        const [inserted] = await this.db
          .insert(grants)
          .values({ ...base, delegation: jsonSafe(built[purpose]), delegationHash: hashTypedData(typedData), receipt: jsonSafe(receipt), periodAmount: ZERO, periodSeconds: 0, recipientAddress: wallet.address })
          .returning({ id: grants.id });
        out.grants.push({ grantId: inserted!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      }
      return out;
    }

    const action = row.action as AutomationAction;
    const token = action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
    const periodSeconds = schedulePeriodSeconds(row.schedule);
    const grant = buildAutomationGrant({
      network: context,
      wallet: wallet.address as Address,
      redeemer: ops.address,
      token,
      amountPerPeriod: BigInt(action.amount),
      periodSeconds,
      startsAt,
      expiresAt,
      salt: salt(),
      recipient: action.recipientAddress as Address,
    });
    const typedData = grantTypedData(context, grant);
    const receipt = describeGrant(context, grant);
    const [inserted] = await this.db
      .insert(grants)
      .values({
        ...base,
        delegation: jsonSafe(grant),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: BigInt(action.amount),
        periodSeconds,
        recipientAddress: action.recipientAddress,
      })
      .returning({ id: grants.id });
    return { grants: [{ grantId: inserted!.id, typedData: jsonSafe(typedData) }], receipts: [jsonSafe(receipt)] };
  }

  /**
   * The wallet signed the grants: every signature is checked against the wallet, then the automation is on. A
   * scheduled send's first run is its next occurrence; Auto-save checks at once (saving what is above its line now).
   */
  async activate(user: SessionUser, id: string, input: { signatures: { grantId: string; signature: Hex }[] }) {
    const row = await this.own(user.id, id);
    if (row.status !== "draft") return this.view(row);
    const ids = input.signatures.map((entry) => entry.grantId);
    const pending = ids.length
      ? await this.db
          .select()
          .from(grants)
          .where(and(inArray(grants.id, ids), eq(grants.userId, user.id), eq(grants.automationId, id), eq(grants.status, "pending")))
      : [];
    const needed = row.kind === "auto_save" ? SAVE_PURPOSES.length : 1;
    const purposes = new Set(pending.map((grant) => (grant.receipt as { purpose?: string }).purpose));
    if (pending.length !== needed || new Set(ids).size !== needed || (row.kind === "auto_save" && purposes.size !== needed)) throw problem(HTTP.unprocessable, "grant_not_pending");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context } = this.clients(row.network);
    const signed: { grant: GrantRow; delegation: ReturnType<typeof withSignature> }[] = [];
    for (const grant of pending) {
      const signature = input.signatures.find((entry) => entry.grantId === grant.id)!.signature;
      const delegation = withSignature(grant.delegation as never, signature);
      const typedData = grantTypedData(context, delegation) as TypedDataDefinition;
      const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature }).catch(() => false);
      if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
      signed.push({ grant, delegation });
    }
    const primary = row.kind === "auto_save" ? signed.find((entry) => (entry.grant.receipt as { purpose?: string }).purpose === "deposit")! : signed[0]!;
    const first = row.kind === "auto_save" ? new Date() : nextRuns(row.schedule, new Date(), 1)[0];
    await this.db.transaction(async (tx) => {
      for (const entry of signed) await tx.update(grants).set({ status: "active", delegation: jsonSafe(entry.delegation) }).where(eq(grants.id, entry.grant.id));
      await tx.update(automations).set({ status: "active", grantId: primary.grant.id, nextRunAt: first ?? null }).where(eq(automations.id, id));
    });
    return this.get(user.id, id);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────────────────────────────────────

  async pause(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "active") await this.db.update(automations).set({ status: "paused" }).where(eq(automations.id, id));
    return this.get(user.id, id);
  }

  /** Back on: the next run is the next occurrence from now (a missed one is not made up). */
  async resume(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "paused") {
      const [next] = nextRuns(row.schedule, new Date(), 1);
      await this.db.update(automations).set({ status: "active", nextRunAt: next ?? null }).where(eq(automations.id, id));
    }
    return this.get(user.id, id);
  }

  /** Skip the next run: it is recorded as skipped on purpose, and the one after becomes next. */
  async skip(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status === "active" && row.nextRunAt) {
      await this.db
        .insert(automationRuns)
        .values({ automationId: id, userId: user.id, scheduledFor: row.nextRunAt, status: "skipped", reason: "SKIPPED_BY_YOU" })
        .onConflictDoNothing();
      const [next] = nextRuns(row.schedule, row.nextRunAt, 1);
      await this.db.update(automations).set({ nextRunAt: next ?? null }).where(eq(automations.id, id));
    }
    return this.get(user.id, id);
  }

  /** Stops it at once (nothing runs again); the grant is revoked on chain by the wallet signing the returned call. */
  async cancel(user: SessionUser, id: string): Promise<{ automation: AutomationView; revoke: TransactionRequestResponse | null }> {
    const row = await this.own(user.id, id);
    if (row.status !== "canceled" && row.status !== "ended") await this.db.update(automations).set({ status: "canceled", nextRunAt: null }).where(eq(automations.id, id));
    const active = await this.db
      .select({ id: grants.id })
      .from(grants)
      .where(and(eq(grants.automationId, id), eq(grants.userId, user.id), eq(grants.status, "active")));
    const revoke = (await this.wallets.revokeGrantsRequest(user.id, active.map((grant) => grant.id))) as TransactionRequestResponse | null;
    return { automation: await this.get(user.id, id), revoke };
  }

  // ── Running ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** One pass: settle runs in flight, then claim and run every due occurrence once. */
  async tick() {
    await this.settleRuns();
    const due = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.status, "active"), lte(automations.nextRunAt, new Date()), inArray(automations.network, this.chains.available)))
      .orderBy(asc(automations.nextRunAt));
    for (const row of due) await this.runOnce(row).catch((error: unknown) => this.log.warn({ err: error, automationId: row.id }, "automation run failed"));
  }

  private async runOnce(row: AutomationRow) {
    // Auto-save moves one thing at a time: while a move is in flight, the check waits (it stays due).
    if (row.kind === "auto_save") {
      const [open] = await this.db
        .select({ id: automationRuns.id })
        .from(automationRuns)
        .where(and(eq(automationRuns.automationId, row.id), eq(automationRuns.status, "executing")))
        .limit(1);
      if (open) return;
    }
    const scheduledFor = row.nextRunAt!;
    const period = schedulePeriodSeconds(row.schedule) * MS_PER_SECOND;
    const [next] = nextRuns(row.schedule, scheduledFor, 1);
    const nextRunAt = next && next.getTime() <= row.endsAt.getTime() ? next : null;
    // Claim the occurrence: the unique (automation, time) row means a second runner, or a retry, finds it taken.
    const [claimed] = await this.db
      .insert(automationRuns)
      .values({ automationId: row.id, userId: row.userId, scheduledFor, status: "executing" })
      .onConflictDoNothing()
      .returning({ id: automationRuns.id });
    await this.db
      .update(automations)
      .set({ nextRunAt, lastRunAt: scheduledFor, ...(nextRunAt ? {} : { status: "ended" as const }) })
      .where(eq(automations.id, row.id));
    if (!claimed) return;

    if (row.kind === "auto_save") return this.runSave(row, claimed.id);
    // Missed (the runner was down for longer than a period): not made up later, said plainly.
    if (scheduledFor.getTime() < Date.now() - period) return this.skipRun(row, claimed.id, "MISSED_RUN");
    const [grant] = row.grantId ? await this.db.select().from(grants).where(eq(grants.id, row.grantId)) : [];
    if (!grant || grant.status !== "active") return this.skipRun(row, claimed.id, "GRANT_INACTIVE");
    const action = row.action as AutomationAction;
    const outcome = await this.sends.runAutomation({
      userId: row.userId,
      network: row.network,
      grant: { id: grant.id, delegation: grant.delegation },
      to: action.recipientAddress as Address,
      asset: action.asset,
      amount: BigInt(action.amount),
      note: action.note,
    });
    if (outcome.status === "skipped") return this.skipRun(row, claimed.id, outcome.reason, outcome.params);
    await this.db.update(automationRuns).set({ intentId: outcome.intentId }).where(eq(automationRuns.id, claimed.id));
    await this.db.update(automations).set({ runsDone: row.runsDone + 1 }).where(eq(automations.id, row.id));
  }

  /** One Auto-save check: look at the balance afresh and move the difference, if it is worth a move. */
  private async runSave(row: AutomationRow, runId: string) {
    const action = row.action as AutoSaveAction;
    const [owner] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, row.userId));
    if (owner?.pausedAllAt) return this.skipRun(row, runId, "PAUSED_ALL");
    const wallet = (await this.wallets.userWallet(row.userId))?.address as Address | undefined;
    if (!wallet) return this.skipRun(row, runId, "WALLET_NOT_READY");
    const held = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.automationId, row.id), eq(grants.status, "active")));
    const byPurpose = new Map(held.map((grant) => [(grant.receipt as { purpose?: SavePurpose }).purpose, grant.delegation]));
    if (!SAVE_PURPOSES.every((purpose) => byPurpose.has(purpose))) return this.skipRun(row, runId, "GRANT_INACTIVE");
    const { plan } = await this.saveFacts(row.network, wallet, action);
    if (!plan) return this.skipRun(row, runId, NOTHING_TO_MOVE);
    const outcome = await this.earn.runSave({
      userId: row.userId,
      network: row.network,
      grants: Object.fromEntries(SAVE_PURPOSES.map((purpose) => [purpose, byPurpose.get(purpose)])) as unknown as SaveGrants,
      vault: action.vault as Address,
      direction: plan.direction,
      amount: BigInt(plan.amount),
    });
    if (outcome.status === "skipped") return this.skipRun(row, runId, outcome.reason, undefined, plan);
    await this.db.update(automationRuns).set({ intentId: outcome.intentId, move: plan }).where(eq(automationRuns.id, runId));
    await this.db.update(automations).set({ runsDone: row.runsDone + 1 }).where(eq(automations.id, row.id));
  }

  private async skipRun(row: AutomationRow, runId: string, reason: string, params?: Record<string, string>, move?: AutomationMove) {
    await this.db.update(automationRuns).set({ status: "skipped", reason, reasonParams: params ?? null, move: move ?? null }).where(eq(automationRuns.id, runId));
    if (row.kind === "auto_save" && QUIET_REASONS.has(reason)) return;
    const shown =
      row.kind === "auto_save"
        ? { amount: move?.amount ?? "0", asset: "USDC", to: (row.action as AutoSaveAction).vault, name: (row.action as AutoSaveAction).vaultName }
        : (() => {
            const action = row.action as AutomationAction;
            return { amount: action.amount, asset: action.asset, to: action.recipientAddress, ...(action.recipientName ? { name: action.recipientName } : {}) };
          })();
    await this.inbox.add(this.db, {
      userId: row.userId,
      network: row.network,
      kind: "automation_skipped",
      params: { ...shown, reason, ...(params ?? {}) },
      dedupeKey: `automation_skipped:${runId}`,
    });
    this.log.info({ automationId: row.id, runId, reason }, "automation run skipped");
  }

  /** Runs whose send has finished take its outcome. */
  private async settleRuns() {
    const open = await this.db
      .select({ run: automationRuns, state: intents.state })
      .from(automationRuns)
      .innerJoin(intents, eq(intents.id, automationRuns.intentId))
      .where(eq(automationRuns.status, "executing"));
    for (const { run, state } of open) {
      if (state === "completed") await this.db.update(automationRuns).set({ status: "succeeded" }).where(eq(automationRuns.id, run.id));
      else if (state === "failed") await this.db.update(automationRuns).set({ status: "failed", reason: "SEND_FAILED" }).where(eq(automationRuns.id, run.id));
    }
  }

  start(intervalMs: number) {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void this.tick()
        .catch((error: unknown) => this.log.warn({ err: error }, "automation tick failed"))
        .finally(() => {
          running = false;
        });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

const ERC20_BALANCE = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;


