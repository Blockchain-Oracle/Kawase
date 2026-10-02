// A withdrawal kept on the server (money-out.md "What if: a partial route failure → the tracker shows which leg,
// with Finish it"; G7). Starting one turns the reviewed plan into its steps, in order:
//   1. every conversion (asset → USDC on Arc), what it delivers joining the USDC that leaves;
//   2. every asset going as itself (a transfer on Arc);
//   3. one move of all the USDC: a transfer on Arc, or one bridge to the other chain (one fee instead of several).
// Each step is an intent of its own engine (swap, send with R6, cross-chain), created when its turn comes with the
// amount known by then, and signed by the person's wallet in the app. The record follows the intents, so after the
// app closes, "Finish it" asks for the next step: the same intent while it still stands, a fresh one if it lapsed.
// When the last step lands the destination is saved to My places.
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { formatUnits } from "viem";

import type { PolicyResultView, WithdrawalNextView, WithdrawalStepView, WithdrawalView, WithdrawPlanInput, WithdrawPlanView } from "@kawase/api-client";
import { withdrawals, type Db, type WithdrawalStep } from "@kawase/db";
import { MS_PER_SECOND, SECONDS_PER_DAY, WITHDRAW_OPEN_DAYS } from "@kawase/config";
import { DRAFTABLE_STATES } from "@kawase/intents";

import type { CrossChainService } from "../crosschain/service";
import { HTTP, problem } from "../http/problem";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { SessionUser } from "../types";
import type { WithdrawService } from "./service";

type Row = typeof withdrawals.$inferSelect;
type Services = { sends: SendService; swaps: SwapService; crosschain: CrossChainService };

const ZERO = 0n;
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
    if (index < 0) return { withdrawal: withdrawalView(row), step: null, intent: null };
    const step = row.steps[index]!;
    const { sends, swaps, crosschain } = this.engines();
    const kindOf = step.kind === "bridge" ? ("crosschain" as const) : step.kind;

    // A step on its way is followed, never re-sent (R7).
    if (step.state === "active" && step.intentId) {
      const current = step.kind === "swap" ? await swaps.get(user.id, step.intentId) : step.kind === "send" ? await sends.get(user.id, step.intentId) : await crosschain.get(user.id, step.intentId);
      const standing = DRAFTABLE_STATES.has(current.state) || MOVING.has(current.state);
      if (standing) return { withdrawal: withdrawalView(row), step: stepView(step), intent: { kind: kindOf, id: current.id, version: current.version, blocking: current.blocking } };
    }
    if (step.state === "failed" && step.failure === "checking") return { withdrawal: withdrawalView(row), step: stepView(step), intent: null };

    const destination = row.destination;
    const amount = step.amount === null ? this.pool(row.steps) : BigInt(step.amount);
    if (amount <= ZERO) throw problem(HTTP.unprocessable, "intent_blocked", "nothing to move");
    const decimal = formatUnits(amount, step.token.decimals);
    const origin = { surface: "app" as const };
    let intent: { id: string; version: number; blocking: PolicyResultView | null };
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
    return { withdrawal: withdrawalView(row), step: stepView(row.steps[index]!), intent: { kind: kindOf, id: intent.id, version: intent.version, blocking: intent.blocking } };
  }
}

