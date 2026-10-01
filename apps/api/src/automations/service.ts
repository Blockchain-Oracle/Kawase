// Automations (Stage 8; MASTER-PLAN "Automations + delegated authority"): "every Tuesday send $1 to Alex", run by
// Kawase without asking again, bounded on chain by the automation's own grant.
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
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { getAddress, hashTypedData, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import { MS_PER_SECOND } from "@kawase/config";
import type { AutomationInput, AutomationRunView, AutomationView, TransactionRequestResponse } from "@kawase/api-client";
import {
  automationRuns,
  automations,
  grants,
  intents,
  txAttempts,
  type AutomationAction,
  type AutomationSchedule,
  type Db,
} from "@kawase/db";
import { buildAutomationGrant, describeGrant, grantTypedData, isWalletSetUp, withSignature } from "@kawase/integrations-delegation";
import { isValidTimeZone, nextRuns, schedulePeriodSeconds } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";
import { evaluateAutomation, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
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

type StoredDraft = { results: PolicyResult[]; blocking: PolicyResult | null };

export class AutomationService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly sends: SendService,
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
  private schedule(user: SessionUser, input: AutomationInput): { schedule: AutomationSchedule; valid: boolean } {
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
      .where(eq(automationRuns.automationId, row.id))
      .orderBy(desc(automationRuns.scheduledFor))
      .limit(RUNS_SHOWN);
    const stored = row.action;
    const report = row.report as StoredDraft | null;
    const live = row.status === "draft" || row.status === "active";
    const upcoming = live ? (row.status === "active" && row.nextRunAt ? [row.nextRunAt, ...nextRuns(row.schedule, row.nextRunAt, NEXT_RUNS_SHOWN - 1)] : nextRuns(row.schedule, new Date(), NEXT_RUNS_SHOWN)) : [];
    return {
      id: row.id,
      network: row.network,
      status: row.status,
      kind: row.kind,
      schedule: row.schedule,
      action: {
        recipientWords: stored.recipientWords,
        recipientAddress: stored.recipientAddress || null,
        recipientName: stored.recipientName,
        asset: stored.asset,
        amount: stored.amount,
        note: stored.note,
      },
      nextRuns: upcoming.map((date) => date.toISOString()),
      maxPerPeriod: stored.amount,
      periodSeconds: schedulePeriodSeconds(row.schedule),
      endsAt: row.endsAt.toISOString(),
      grant: grant ? { id: grant.id, status: grant.status, expiresAt: grant.expiresAt.toISOString() } : null,
      runs: runs.map(({ run, txHash }): AutomationRunView => ({
        id: run.id,
        scheduledFor: run.scheduledFor.toISOString(),
        status: run.status,
        reason: run.reason,
        reasonParams: run.reasonParams ?? null,
        tx: txHash && explorer ? { hash: txHash, explorerUrl: `${explorer}/tx/${txHash}` } : null,
      })),
      results: report?.results ?? [],
      blocking: row.status === "draft" ? (report?.blocking ?? null) : null,
      createdAt: row.createdAt.toISOString(),
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

  /** The grant to sign: `token.transfer(recipient, …)` only, at most `amount` per period, until the automation ends. */
  async grantRequest(user: SessionUser, id: string) {
    const row = await this.own(user.id, id);
    if (row.status !== "draft") throw problem(HTTP.conflict, "intent_final");
    if ((row.report as StoredDraft | null)?.blocking) throw problem(HTTP.unprocessable, "intent_blocked");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { client, network: context, ops } = this.clients(row.network);
    if (!isWalletSetUp(await client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const action = row.action as AutomationAction;
    const token = action.asset === "USDC" ? context.addresses.usdc : context.addresses.eurc;
    const periodSeconds = schedulePeriodSeconds(row.schedule);
    const startsAt = nowSeconds();
    const expiresAt = Math.floor(row.endsAt.getTime() / MS_PER_SECOND);
    const grant = buildAutomationGrant({
      network: context,
      wallet: wallet.address as Address,
      redeemer: ops.address,
      token,
      amountPerPeriod: BigInt(action.amount),
      periodSeconds,
      startsAt,
      expiresAt,
      salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`,
      recipient: action.recipientAddress as Address,
    });
    const typedData = grantTypedData(context, grant);
    const receipt = describeGrant(context, grant);
    const [inserted] = await this.db
      .insert(grants)
      .values({
        userId: user.id,
        network: row.network,
        kind: "automation",
        automationId: row.id,
        delegatorWalletId: wallet.id,
        delegateAddress: ops.address,
        delegation: jsonSafe(grant),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: BigInt(action.amount),
        periodSeconds,
        recipientAddress: action.recipientAddress,
        startsAt: new Date(startsAt * MS_PER_SECOND),
        expiresAt: new Date(expiresAt * MS_PER_SECOND),
        status: "pending",
      })
      .returning({ id: grants.id });
    return { grantId: inserted!.id, typedData: jsonSafe(typedData), receipt: jsonSafe(receipt) };
  }

  /** The wallet signed the grant: check the signature, then the automation is on and its first run is scheduled. */
  async activate(user: SessionUser, id: string, input: { grantId: string; signature: Hex }) {
    const row = await this.own(user.id, id);
    if (row.status !== "draft") return this.view(row);
    const [pending] = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.id, input.grantId), eq(grants.userId, user.id), eq(grants.automationId, id)));
    if (!pending || pending.status !== "pending") throw problem(HTTP.unprocessable, "grant_not_pending");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context } = this.clients(row.network);
    const signed = withSignature(pending.delegation as never, input.signature);
    const typedData = grantTypedData(context, signed) as TypedDataDefinition;
    const valid = await verifyTypedData({ address: wallet.address as Address, ...typedData, signature: input.signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
    const [first] = nextRuns(row.schedule, new Date(), 1);
    await this.db.transaction(async (tx) => {
      await tx.update(grants).set({ status: "active", delegation: jsonSafe(signed) }).where(eq(grants.id, pending.id));
      await tx.update(automations).set({ status: "active", grantId: pending.id, nextRunAt: first ?? null }).where(eq(automations.id, id));
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
    const revoke = row.grantId ? ((await this.wallets.revokeGrantRequest(user.id, row.grantId)) as TransactionRequestResponse | null) : null;
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

  private async skipRun(row: AutomationRow, runId: string, reason: string, params?: Record<string, string>) {
    await this.db.update(automationRuns).set({ status: "skipped", reason, reasonParams: params ?? null }).where(eq(automationRuns.id, runId));
    const action = row.action as AutomationAction;
    await this.inbox.add(this.db, {
      userId: row.userId,
      network: row.network,
      kind: "automation_skipped",
      params: { amount: action.amount, asset: action.asset, to: action.recipientAddress, ...(action.recipientName ? { name: action.recipientName } : {}), reason, ...(params ?? {}) },
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
