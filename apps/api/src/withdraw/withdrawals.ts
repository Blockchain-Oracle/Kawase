// A withdrawal kept on the server (money-out.md "What if: a partial route failure → the tracker shows which leg,
// with Finish it"; G7). Starting one turns the reviewed plan into its steps, in order:
//   1. every conversion (asset → USDC on Arc), what it delivers joining the USDC that leaves;
//   2. every asset going as itself (a transfer on Arc);
//   3. one move of all the USDC: a transfer on Arc, or one bridge to the other chain (one fee instead of several).
// Each step is an intent of its own engine (swap, send with R6, cross-chain), created when its turn comes with the
// amount known by then, and signed by the person's wallet in the app. The record follows the intents, so after the
// app closes, "Finish it" asks for the next step: the same intent while it still stands, a fresh one if it lapsed.
// When the last step lands the destination is saved to My places.
//
// One batch where it can be (money-out.md "How": one batch, swaps + transfers/burns): when every step still to go is
// signed by the wallet on Arc — conversions, transfers, and the burn that starts a bridge — they become one EIP-7702
// self-call, so the person signs once and the chain takes all of it or none. The step that spends what a conversion
// delivers is drafted with that conversion's guaranteed minimum as a credit (intents/bundle.ts). Only what cannot
// share a transaction stays a tracker step: the delivery on the other chain, followed after the burn.
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { formatUnits, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex } from "viem";

import type { PolicyResultView, UnsignedTransaction, WithdrawalBatchResponse, WithdrawalNextView, WithdrawalStepView, WithdrawalView, WithdrawPlanInput, WithdrawPlanView } from "@kawase/api-client";
import { approvals, txAttempts, withdrawals, type Db, type WithdrawalStep } from "@kawase/db";
import { APPROVAL_TTL_S, GAS_ESTIMATE_HEADROOM_PERCENT, MS_PER_SECOND, SECONDS_PER_DAY, WITHDRAW_OPEN_DAYS } from "@kawase/config";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { DRAFTABLE_STATES } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { hasBrake } from "@kawase/policy";

import type { CrossChainService } from "../crosschain/service";
import type { InboxService } from "../inbox/service";
import { HTTP, problem } from "../http/problem";
import { failBundled, offerBundled, recordBundled, type BundleEngine, type BundlePart } from "../intents/bundle";
import { refusedBeforeSending, walletGasPrice } from "../intents/chain";
import { requireBrakeOverride } from "../safety/brake";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WithdrawService } from "./service";

type Row = typeof withdrawals.$inferSelect;
type Services = { sends: SendService; swaps: SwapService; crosschain: CrossChainService };

const ZERO = 0n;
const PERCENT = 100n;
/** A batch is two or more steps; one step goes as itself. */
const MIN_BATCH = 2;
/** When the node cannot estimate the batch: room for a conversion, a transfer and a burn. */
const BATCH_GAS_FALLBACK = 900_000n;
/** A part drafted for the allowance carries no fee of its own; inside a batch the wallet pays for its transfer. */
const TRANSFER_GAS_ALLOWANCE = 120_000n;
const FEE_ALLOWANCE_MULTIPLIER = 2n;
const ERROR_MAX = 140;
const FOLLOW_POLL_MS = 3_000;
const FOLLOW_POLLS = 120;
/** An unfinished withdrawal is offered to finish for a week. */
const OPEN_WITHIN_MS = WITHDRAW_OPEN_DAYS * SECONDS_PER_DAY * MS_PER_SECOND;
const MOVING = new Set(["approved", "executing", "unknown_outcome"]);
const FAILED = new Set(["failed", "rejected", "canceled", "expired"]);

const isCanonicalUsdc = (leg: WithdrawPlanView["legs"][number]) => leg.token.symbol === "USDC" && leg.token.status === "canonical";

/** The steps for a reviewed plan: conversions, then assets as themselves, then one move of all the USDC. */
export function stepsFor(plan: WithdrawPlanView): WithdrawalStep[] {
  const steps: WithdrawalStep[] = [];
  const legs = plan.legs.filter((leg) => leg.status !== "blocked");
  const token = (leg: WithdrawPlanView["legs"][number]) => ({ address: leg.token.address, symbol: leg.token.symbol, decimals: leg.token.decimals });
  let usdc: WithdrawalStep["token"] | undefined;
  let direct = ZERO;
  for (const leg of legs) {
    if (leg.steps[0] === "swap") steps.push({ id: `swap:${leg.token.address.toLowerCase()}`, kind: "swap", token: token(leg), amount: leg.amount, intentId: null, state: "pending" });
    else if (isCanonicalUsdc(leg)) {
      usdc = token(leg);
      direct += BigInt(leg.amount);
    }
  }
  for (const leg of legs)
    if (leg.steps[0] !== "swap" && !isCanonicalUsdc(leg)) steps.push({ id: `send:${leg.token.address.toLowerCase()}`, kind: "send", token: token(leg), amount: leg.amount, intentId: null, state: "pending" });
  const converts = steps.some((step) => step.kind === "swap");
  if (direct > ZERO || converts) {
    const toArc = (plan.destination?.chain.key ?? "arc") === "arc";
    steps.push({
      id: "usdc",
      kind: toArc ? "send" : "bridge",
      token: usdc ?? { address: "USDC", symbol: "USDC", decimals: 6 },
      amount: converts ? null : direct.toString(),
      direct: direct.toString(),
      intentId: null,
      state: "pending",
    });
  }
  return steps;
}

function stepView(step: WithdrawalStep): WithdrawalStepView {
  return {
    id: step.id,
    kind: step.kind,
    token: step.token,
    amount: step.amount,
    state: step.state,
    arriving: Boolean(step.arriving),
    intentId: step.intentId,
    received: step.received ?? null,
    moved: step.moved ?? null,
    explorerUrl: step.explorerUrl ?? null,
    fillUrl: step.fillUrl ?? null,
    failure: step.failure ?? null,
    blocking: (step.blocking as PolicyResultView | null | undefined) ?? null,
    batched: Boolean(step.batched),
  };
}

export function withdrawalView(row: Row): WithdrawalView {
  return {
    id: row.id,
    network: row.network,
    status: row.status,
    destination: row.destination,
    steps: row.steps.map(stepView),
    totalUsd: row.totalUsd === null ? null : Number(row.totalUsd),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export class WithdrawalService {
  private services: Services | undefined;

  constructor(
    private readonly db: Db,
    private readonly planner: WithdrawService,
    private readonly chains?: Chains,
    private readonly log?: Logger,
    /** Tells the person once the money arrived (push and email), with the last move's transaction. */
    private readonly inbox?: InboxService,
  ) {}

  /** The engines the steps run on (created after this service in the app). */
  bind(services: Services) {
    this.services = services;
  }

  private engines(): Services {
    if (!this.services) throw problem(HTTP.serviceUnavailable, "internal", "withdrawals are not wired");
    return this.services;
  }

  private async own(userId: string, id: string): Promise<Row> {
    const [row] = await this.db.select().from(withdrawals).where(and(eq(withdrawals.id, id), eq(withdrawals.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    return row;
  }

  async start(user: SessionUser, input: WithdrawPlanInput): Promise<WithdrawalView> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in first");
    const plan = await this.planner.plan(user, input);
    const destination = plan.destination;
    if (plan.blocking || !destination?.address) throw problem(HTTP.unprocessable, "intent_blocked", plan.blocking ?? "needs_address");
    if (plan.legs.length === 0 || plan.legs.some((leg) => leg.status === "blocked")) throw problem(HTTP.unprocessable, "intent_blocked", "a line cannot go as planned");
    const [row] = await this.db
      .insert(withdrawals)
      .values({
        userId: user.id,
        network: user.activeNetwork,
        destination: {
          kind: destination.kind,
          label: destination.label,
          brand: destination.brand,
          chain: destination.chain,
          address: destination.address,
          placeId: destination.placeId,
          exchange: destination.exchange ? { slug: destination.exchange.slug, name: destination.exchange.name, networkLabel: destination.exchange.networkLabel } : null,
        },
        steps: stepsFor(plan),
        totalUsd: plan.totalUsd === null ? null : String(plan.totalUsd),
      })
      .returning();
    return withdrawalView(row!);
  }

  async get(user: SessionUser, id: string): Promise<WithdrawalView> {
    return withdrawalView(await this.refresh(user, await this.own(user.id, id)));
  }

  async open(user: SessionUser): Promise<WithdrawalView[]> {
    const rows = await this.db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, user.id), eq(withdrawals.network, user.activeNetwork), inArray(withdrawals.status, ["running", "stopped"]), gt(withdrawals.createdAt, new Date(Date.now() - OPEN_WITHIN_MS))))
      .orderBy(desc(withdrawals.createdAt));
    return Promise.all(rows.map(async (row) => withdrawalView(await this.refresh(user, row))));
  }

  async cancel(user: SessionUser, id: string): Promise<WithdrawalView> {
    const row = await this.refresh(user, await this.own(user.id, id));
    if (row.steps.some((step) => step.state === "active" && step.arriving)) throw problem(HTTP.conflict, "conflict", "a step is on its way");
    const [next] = await this.db.update(withdrawals).set({ status: "canceled" }).where(eq(withdrawals.id, id)).returning();
    return withdrawalView(next!);
  }

  /** Where each step's intent is now: done (with what it moved and delivered), on its way, or stopped and why. */
  private async refresh(user: SessionUser, row: Row): Promise<Row> {
    if (row.status === "done" || row.status === "canceled") return row;
    const { sends, swaps, crosschain } = this.engines();
    const steps: WithdrawalStep[] = [];
    for (const step of row.steps) {
      if (!step.intentId || step.state === "done") {
        steps.push(step);
        continue;
      }
      try {
        if (step.kind === "swap") {
          const intent = await swaps.get(user.id, step.intentId);
          steps.push(
            intent.state === "completed"
              ? { ...step, state: "done", received: intent.received, moved: step.amount, explorerUrl: intent.tx?.explorerUrl ?? null, failure: null, blocking: null }
              : FAILED.has(intent.state)
                ? { ...step, state: "failed", failure: intent.outcome === "checking" ? "checking" : "not_sent", blocking: intent.blocking, explorerUrl: intent.tx?.explorerUrl ?? null }
                : { ...step, state: "active", blocking: intent.blocking },
          );
        } else if (step.kind === "send") {
          const intent = await sends.get(user.id, step.intentId);
          steps.push(
            intent.state === "completed"
              ? { ...step, state: "done", moved: intent.draft?.amount ?? step.amount, explorerUrl: intent.tx?.explorerUrl ?? null, failure: null, blocking: null }
              : FAILED.has(intent.state)
                ? { ...step, state: "failed", failure: intent.outcome === "checking" ? "checking" : "not_sent", blocking: intent.blocking, explorerUrl: intent.tx?.explorerUrl ?? null }
                : { ...step, state: "active", blocking: intent.blocking },
          );
        } else {
          const intent = await crosschain.get(user.id, step.intentId);
          const moved = intent.draft?.amount ?? step.amount;
          steps.push(
            intent.stage === "delivered"
              ? { ...step, state: "done", arriving: false, moved, received: intent.received, explorerUrl: intent.tx?.explorerUrl ?? null, fillUrl: intent.fillTx?.explorerUrl ?? null, failure: null, blocking: null }
              : intent.stage === "refunded" || intent.stage === "failed" || (FAILED.has(intent.state) && intent.stage === "draft")
                ? { ...step, state: "failed", arriving: false, failure: "not_sent", blocking: intent.blocking, explorerUrl: intent.tx?.explorerUrl ?? null }
                : { ...step, state: "active", arriving: intent.stage === "submitted" || intent.stage === "filling", moved, explorerUrl: intent.tx?.explorerUrl ?? null, blocking: intent.blocking },
          );
        }
      } catch {
        steps.push(step);
      }
    }
    const done = steps.every((step) => step.state === "done");
    const stopped = steps.some((step) => step.state === "failed");
    const status: Row["status"] = done ? "done" : stopped ? "stopped" : "running";
    if (JSON.stringify(steps) === JSON.stringify(row.steps) && status === row.status) return row;
    const [next] = await this.db
      .update(withdrawals)
      .set({ steps, status, ...(done ? { completedAt: new Date() } : {}) })
      .where(eq(withdrawals.id, row.id))
      .returning();
    // It worked: the destination is one of My places now, so the next withdrawal there is a tap.
    if (done) {
      const target = row.destination;
      // One notice for the whole withdrawal (its own send step tells nothing; send/service.ts): what arrived where,
      // with the last move's transaction for the receipt.
      const last = steps.at(-1);
      const hash = last?.explorerUrl?.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null;
      const name = target.exchange?.name ?? target.label ?? target.brand ?? "";
      await this.inbox
        ?.add(this.db, {
          userId: row.userId,
          network: row.network,
          kind: "send_completed",
          params: {
            amount: last?.received ?? last?.moved ?? last?.amount ?? "0",
            asset: last?.token.symbol ?? "USDC",
            ...(last ? { decimals: String(last.token.decimals) } : {}),
            to: target.address,
            name,
            withdrawal: row.id,
          },
          txHash: hash,
          dedupeKey: `withdrawal_completed:${row.id}`,
        })
        .catch((error: unknown) => this.log?.warn({ err: error, withdrawalId: row.id }, "withdrawal notice failed"));
      await this.planner.savePlace({ ...user, activeNetwork: row.network }, { kind: target.kind, brand: target.brand, chain: target.chain.key, address: target.address, label: target.label }).catch(() => undefined);
    }
    return next!;
  }

  /** The USDC the last move carries: its own lines plus what the finished conversions delivered. */
  private pool(steps: WithdrawalStep[]) {
    const last = steps.find((step) => step.id === "usdc");
    const converted = steps.filter((step) => step.kind === "swap" && step.state === "done").reduce((sum, step) => sum + BigInt(step.received ?? "0"), ZERO);
    return BigInt(last?.direct ?? "0") + converted;
  }

  /**
   * The next step to sign. A step whose intent still stands keeps it (the same intent after a restart); one that
   * lapsed, failed before sending or was never made gets a fresh intent, with the amount known now.
   */
  async next(user: SessionUser, id: string): Promise<WithdrawalNextView> {
    let row = await this.refresh(user, await this.own(user.id, id));
    if (row.status === "canceled") throw problem(HTTP.conflict, "intent_final");
    if (row.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const index = row.steps.findIndex((step) => step.state !== "done");
    if (index < 0) return { withdrawal: withdrawalView(row), step: null, intent: null, batch: null };
    const step = row.steps[index]!;
    const { sends, swaps, crosschain } = this.engines();
    // Everything left signed on Arc: one transaction (the app asks `batch` for it).
    if (await this.canBatch(user, row)) {
      const left = row.steps.filter((entry) => entry.state !== "done");
      return { withdrawal: withdrawalView(row), step: stepView(step), intent: null, batch: { steps: left.map((entry) => entry.id) } };
    }
    const kindOf = step.kind === "bridge" ? ("crosschain" as const) : step.kind;

    // A step on its way is followed, never re-sent (R7).
    if (step.state === "active" && step.intentId) {
      const current = step.kind === "swap" ? await swaps.get(user.id, step.intentId) : step.kind === "send" ? await sends.get(user.id, step.intentId) : await crosschain.get(user.id, step.intentId);
      const standing = DRAFTABLE_STATES.has(current.state) || MOVING.has(current.state);
      if (standing) return { withdrawal: withdrawalView(row), step: stepView(step), intent: { kind: kindOf, id: current.id, version: current.version, blocking: current.blocking, brake: hasBrake(current.results) }, batch: null };
    }
    if (step.state === "failed" && step.failure === "checking") return { withdrawal: withdrawalView(row), step: stepView(step), intent: null, batch: null };

    const destination = row.destination;
    const amount = step.amount === null ? this.pool(row.steps) : BigInt(step.amount);
    if (amount <= ZERO) throw problem(HTTP.unprocessable, "intent_blocked", "nothing to move");
    const decimal = formatUnits(amount, step.token.decimals);
    const origin = { surface: "app" as const };
    let intent: { id: string; version: number; blocking: PolicyResultView | null; results: PolicyResultView[] };
    if (step.kind === "swap") {
      let created = await swaps.create(user, { tokenIn: step.token.address, tokenOut: "USDC", amount: decimal }, origin);
      if (created.blocking?.code === "QUOTE_UNAVAILABLE") created = await swaps.revise(user, created.id, {});
      intent = created;
    } else if (step.kind === "send") {
      const asset = step.token.symbol === "USDC" && step.id === "usdc" ? "USDC" : step.token.address;
      intent = await sends.create(user, { recipient: destination.address, amount: decimal, asset }, origin);
    } else {
      let created = await crosschain.create(user, { direction: "out", asset: "USDC", amount: decimal, destination: destination.chain.key, recipient: destination.address }, origin);
      if (created.blocking?.code === "QUOTE_UNAVAILABLE") created = await crosschain.revise(user, created.id, {});
      intent = created;
    }
    const steps = row.steps.map((entry, at) =>
      at === index ? { ...entry, intentId: intent.id, state: "active" as const, failure: null, blocking: intent.blocking, moved: amount.toString() } : entry,
    );
    [row] = await this.db.update(withdrawals).set({ steps, status: "running" }).where(eq(withdrawals.id, row.id)).returning() as [Row];
    return { withdrawal: withdrawalView(row), step: stepView(row.steps[index]!), intent: { kind: kindOf, id: intent.id, version: intent.version, blocking: intent.blocking, brake: hasBrake(intent.results) }, batch: null };
  }

  // ── One batch ───────────────────────────────────────────────────────────────────────────────────────────────

  private engineOf(kind: WithdrawalStep["kind"]) {
    const { sends, swaps, crosschain } = this.engines();
    return (kind === "swap" ? swaps : kind === "send" ? sends : crosschain) as BundleEngine & { get(userId: string, id: string): Promise<{ state: string }>; cancel(userId: string, id: string): Promise<unknown> };
  }

  /**
   * Whether the steps still to go can be one transaction: two or more of them, at most one conversion (each receipt
   * witness then reads exactly its own conversion), none on its way or being checked, and none standing as a step of
   * its own (a lone step that was handed out is followed as itself).
   */
  private async canBatch(user: SessionUser, row: Row): Promise<boolean> {
    if (!this.chains) return false;
    const left = row.steps.filter((step) => step.state !== "done");
    if (left.length < MIN_BATCH || left.filter((step) => step.kind === "swap").length > 1) return false;
    for (const step of left) {
      if (!step.intentId) continue;
      if (step.state === "failed") {
        if (step.failure === "checking") return false;
        continue;
      }
      if (!step.batched || step.arriving) return false;
      const current = await this.engineOf(step.kind).get(user.id, step.intentId);
      if (!DRAFTABLE_STATES.has(current.state as never)) return false;
    }
    return true;
  }

  /**
   * Builds the batch: a fresh intent for every step still to go (an earlier batch's drafts are closed first, nothing
   * of them moved), each re-checked by its own engine, then one transaction of all their calls, simulated as a whole.
   */
  async batch(user: SessionUser, id: string, override: boolean): Promise<WithdrawalBatchResponse> {
    let row = await this.refresh(user, await this.own(user.id, id));
    if (row.status === "canceled" || row.status === "done") throw problem(HTTP.conflict, "intent_final");
    if (row.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (!(await this.canBatch(user, row))) return { status: "steps", withdrawal: withdrawalView(row) };
    const { sends, swaps, crosschain } = this.engines();
    const destination = row.destination;
    const origin = { surface: "app" as const };

    // An earlier batch's drafts close: the new one is drafted on fresh prices.
    for (const step of row.steps)
      if (step.batched && step.intentId && step.state === "active") await this.engineOf(step.kind).cancel(user.id, step.intentId).catch(() => undefined);

    type Made = { index: number; intent: { id: string; version: number; blocking: PolicyResultView | null; results: PolicyResultView[] } };
    const made: Made[] = [];
    let credit = ZERO;
    const order = row.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.state !== "done");
    // Conversions first: what they guarantee is what the last move may count on.
    for (const { step, index } of order.filter(({ step }) => step.kind === "swap")) {
      let created = await swaps.create(user, { tokenIn: step.token.address, tokenOut: "USDC", amount: formatUnits(BigInt(step.amount ?? "0"), step.token.decimals) }, origin);
      if (created.blocking?.code === "QUOTE_UNAVAILABLE") created = await swaps.revise(user, created.id, {});
      made.push({ index, intent: created });
      if (created.draft) credit += BigInt(created.draft.minOut);
    }
    for (const { step, index } of order.filter(({ step }) => step.kind !== "swap")) {
      if (step.id === "usdc") {
        const amount = formatUnits(this.pool(row.steps) + credit, step.token.decimals);
        if (step.kind === "send") made.push({ index, intent: await sends.create(user, { recipient: destination.address, amount, asset: "USDC" }, origin, { credit }) });
        else {
          let created = await crosschain.create(user, { direction: "out", asset: "USDC", amount, destination: destination.chain.key, recipient: destination.address }, origin, { credit });
          if (created.blocking?.code === "QUOTE_UNAVAILABLE") created = await crosschain.revise(user, created.id, {});
          made.push({ index, intent: created });
        }
      } else made.push({ index, intent: await sends.create(user, { recipient: destination.address, amount: formatUnits(BigInt(step.amount ?? "0"), step.token.decimals), asset: step.token.address }, origin) });
    }
    made.sort((a, b) => a.index - b.index);

    const save = async (parts: Map<number, BundlePart>) => {
      const steps = row.steps.map((entry, at) => {
        const mine = made.find((item) => item.index === at);
        if (!mine) return entry;
        const part = parts.get(at);
        return {
          ...entry,
          intentId: mine.intent.id,
          state: "active" as const,
          failure: null,
          blocking: mine.intent.blocking,
          batched: true,
          bundle: part
            ? { version: part.version, chainId: part.chainId, from: part.from, attemptKind: part.attemptKind, attemptTo: part.attemptTo, attemptReceipt: part.attemptReceipt, ledger: part.ledger ?? null }
            : null,
        };
      });
      [row] = (await this.db.update(withdrawals).set({ steps, status: "running" }).where(eq(withdrawals.id, row.id)).returning()) as [Row];
    };

    // A step that cannot go says why on its line; the rest wait with it (nothing is half sent).
    if (made.some((item) => item.intent.blocking)) {
      await save(new Map());
      return { status: "stopped", withdrawal: withdrawalView(row) };
    }
    // The brake (most of the balance to an address that is new) was on the review the person confirmed.
    for (const item of made) requireBrakeOverride(item.intent.results, override);

    const parts = new Map<number, BundlePart>();
    for (const item of made) {
      const part = await this.engineOf(row.steps[item.index]!.kind).bundlePart(user, item.intent.id);
      if (part === "changed" || part === "final") {
        await save(parts);
        return { status: part === "changed" ? "changed" : "stopped", withdrawal: withdrawalView(row) };
      }
      parts.set(item.index, part);
    }
    const ordered = made.map((item) => parts.get(item.index)!);
    const from = ordered[0]!.from;
    const client = this.chains!.get(row.network)?.client;
    if (!client) throw problem(HTTP.unprocessable, "network_unavailable");
    // Lower-case, as a parsed signed transaction reads it back.
    const data = encodeSelfBatch(ordered.flatMap((part) => part.calls)).toLowerCase() as Hex;
    try {
      await client.call({ account: from, to: from, data });
    } catch (error) {
      this.log?.warn({ err: error, withdrawalId: id }, "withdraw batch simulation reverted");
      await save(parts);
      throw problem(HTTP.badGateway, "simulation_failed");
    }
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: from, to: from, data }).catch(() => BATCH_GAS_FALLBACK),
    ]);
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    const cap = ordered.reduce((sum, part) => sum + (part.maxFee > ZERO ? part.maxFee : TRANSFER_GAS_ALLOWANCE * price.maxFeePerGas * FEE_ALLOWANCE_MULTIPLIER), ZERO);
    if (gas * price.maxFeePerGas > cap) {
      await save(parts);
      return { status: "changed", withdrawal: withdrawalView(row) };
    }
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: ordered[0]!.chainId,
      nonce,
      to: from,
      data,
      value: "0",
      gas: gas.toString(),
      maxFeePerGas: price.maxFeePerGas.toString(),
      maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString(),
    };
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_S * MS_PER_SECOND);
    const approvalIds = await this.db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const part of ordered) ids.push(await offerBundled(tx, { userId: user.id, network: row.network, part, transaction, expiresAt, surface: "app" }));
      return ids;
    });
    await save(parts);
    return { status: "sign", withdrawal: withdrawalView(row), approvalId: approvalIds[0]!, transaction };
  }

  /**
   * The wallet signed the batch: it must be exactly the transaction handed out (sender, chain, the self-call, data,
   * nonce, no more fee); then every step's intent records it, it is broadcast once, and each engine follows its own
   * part of the one receipt.
   */
  async batchSignature(user: SessionUser, id: string, input: { approvalId: string; signedTransaction: Hex }): Promise<WithdrawalBatchResponse> {
    const row = await this.refresh(user, await this.own(user.id, id));
    if (row.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const batched = row.steps.filter((step) => step.batched && step.state === "active" && step.intentId && step.bundle);
    if (batched.length < MIN_BATCH) throw problem(HTTP.conflict, "intent_stale");
    const [offered] = await this.db.select().from(approvals).where(eq(approvals.id, input.approvalId));
    if (!offered || offered.userId !== user.id || !batched.some((step) => step.intentId === offered.intentId)) throw problem(HTTP.conflict, "intent_stale");
    const unsigned = offered.unsignedTransaction as unknown as UnsignedTransaction;
    const from = batched[0]!.bundle!.from.toLowerCase();
    const parsed = parseTransaction(input.signedTransaction);
    const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
    const matches =
      signer?.toLowerCase() === from &&
      parsed.chainId === unsigned.chainId &&
      parsed.to?.toLowerCase() === from &&
      parsed.data?.toLowerCase() === unsigned.data.toLowerCase() &&
      (parsed.value ?? ZERO) === ZERO &&
      parsed.nonce === unsigned.nonce &&
      (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= BigInt(unsigned.gas) * BigInt(unsigned.maxFeePerGas);
    if (!matches) {
      this.log?.warn({ withdrawalId: id }, "security.draft_mismatch");
      throw problem(HTTP.unprocessable, "transaction_mismatch");
    }
    const txHash = keccak256(input.signedTransaction);
    const { sends } = this.engines();

    // Every part records the one transaction, or none does (a part that moved on refuses the whole batch).
    const recorded = await this.db.transaction(async (tx) => {
      const out: { intentId: string; attemptId: string }[] = [];
      for (const [at, step] of batched.entries()) {
        const bundle = step.bundle!;
        const [approval] = await tx
          .select()
          .from(approvals)
          .where(and(eq(approvals.intentId, step.intentId!), eq(approvals.status, "pending_signature")))
          .orderBy(desc(approvals.createdAt))
          .limit(1);
        if (!approval || (approval.unsignedTransaction as unknown as UnsignedTransaction | null)?.data?.toLowerCase() !== unsigned.data.toLowerCase()) throw problem(HTTP.conflict, "intent_stale");
        const part: BundlePart = {
          intentId: step.intentId!,
          version: bundle.version,
          draftHash: approval.draftHash as Hex,
          from: bundle.from as Address,
          chainId: bundle.chainId,
          calls: [],
          maxFee: ZERO,
          attemptKind: bundle.attemptKind,
          attemptTo: bundle.attemptTo as Address,
          attemptReceipt: bundle.attemptReceipt,
          ledger: bundle.ledger ?? null,
        };
        const attemptId = await recordBundled(tx, {
          userId: user.id,
          network: row.network,
          part,
          approvalId: approval.id,
          nonce: at === 0 ? unsigned.nonce : null,
          txHash,
          ...(bundle.ledger ? { fitsLimits: (inner) => sends.fitsLimitsFor(inner, user.id, row.network, bundle.ledger, step.intentId!) } : {}),
        });
        out.push({ intentId: step.intentId!, attemptId });
      }
      return out;
    });

    const client = this.chains!.get(row.network)!.client;
    try {
      await client.sendRawTransaction({ serializedTransaction: input.signedTransaction });
      await this.markSubmitted(recorded, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const refused = refusedBeforeSending(message);
      this.log?.warn({ withdrawalId: id, refused, message: message.slice(0, ERROR_MAX) }, "withdraw batch broadcast failed");
      if (refused) await failBundled(this.db, recorded, message.slice(0, ERROR_MAX));
      else await this.markSubmitted(recorded, "broadcast_unclear");
    }
    void this.followBatch(batched.map((step) => ({ kind: step.kind, intentId: step.intentId! })));
    return { status: "executing", withdrawal: withdrawalView(await this.refresh(user, await this.own(user.id, id))) };
  }

  private async markSubmitted(parts: { attemptId: string }[], errorCode: string | null) {
    await this.db
      .update(txAttempts)
      .set({ status: "submitted", ...(errorCode ? { errorCode } : {}) })
      .where(inArray(txAttempts.id, parts.map((part) => part.attemptId)));
  }

  /** Each engine settles its own part of the one receipt (its sweeper would too; this is sooner). */
  private async followBatch(parts: { kind: WithdrawalStep["kind"]; intentId: string }[]) {
    const open = new Set(parts.map((part) => part.intentId));
    for (let poll = 0; poll < FOLLOW_POLLS && open.size > 0; poll++) {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_POLL_MS));
      for (const part of parts) {
        if (!open.has(part.intentId)) continue;
        const settled = await this.engineOf(part.kind)
          .track(part.intentId)
          .catch(() => false);
        if (settled) open.delete(part.intentId);
      }
    }
  }
}

