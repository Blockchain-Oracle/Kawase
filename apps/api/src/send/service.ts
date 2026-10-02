// Sends, from the person's words to a confirmed transfer (ARCHITECTURE §3–§5).
//
// Drafting: resolve the recipient, gather fresh facts, run the policy, and store an immutable draft version with
// its EIP-712 hash. Approving: lock the intent and the person's (user, network) spend, re-run everything on fresh
// facts, reserve the spend, persist the attempt with its idempotency key, and only then move money, either by
// the agent's ops wallet redeeming the person's signed allowance (no prompt) or by a transaction the person's own
// wallet signs (Face ID), which is checked field by field against the draft before it is broadcast. Tracking:
// money counts as sent only when the receipt's Transfer log equals the draft; an outcome nobody can confirm stays
// "checking" and is looked at again, never re-sent.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import {
  APPROVAL_TTL_S,
  GAS_ESTIMATE_HEADROOM_PERCENT,
  INTENT_TTL_S,
  MAX_FEE_DRAFT_MULTIPLIER,
  MIN_MAX_FEE_PER_GAS_GWEI,
  MS_PER_SECOND,
  SEND_UNKNOWN_AFTER_S,
} from "@kawase/config";
import type {
  RecipientMatch,
  SendApproveResponse,
  SendIntent,
  SendOutcome,
  SendRecipientView,
  SendRequest,
  UnsignedTransaction,
} from "@kawase/api-client";
import {
  approvals,
  intentDrafts,
  intents,
  newId,
  practiceRuns,
  spendLedger,
  txAttempts,
  users,
  withOutbox,
  type Db,
} from "@kawase/db";
import { allowanceAvailable, encodeRedeemTransfer } from "@kawase/integrations-delegation";
import {
  DRAFTABLE_STATES,
  loadSendDraft,
  memoHash,
  sendDraftHash,
  storeSendDraft,
  type IntentState,
  type SendDraft,
  type StoredSendDraft,
} from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { amount, canonicalAmount, decimalsOf, rescale, USDC_NATIVE_DECIMALS, type AssetId } from "@kawase/money";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import { evaluateSend, type PolicyResult, type SendEvaluation, type SendRoute } from "@kawase/policy";

import type { ContactService } from "../contacts/service";
import { HTTP, problem } from "../http/problem";
import { intentExists } from "../intents/chain";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { activeAllowance, fitsLimits, gatherFacts, type Executor, type StoredRequest } from "./facts";
import { grantFor } from "../safety/allowances";
import { recordPractice, simulateCall } from "../safety/practice";
import type { OpsExecutor } from "./ops";
import type { InboxService } from "../inbox/service";
import type { RequestService } from "../requests/service";
import type { Recipients } from "./recipients";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

/** What a draft version stores besides the hashed money fields. */
type DraftPayload = {
  draft: StoredSendDraft | null;
  recipient: SendRecipientView | null;
  asset: AssetId | null;
  amount: string | null;
  note: string | null;
  fee: { payer: "kawase" | "wallet"; estimate: string | null };
  allowance: { active: boolean; available: string; perPeriod: string | null };
  suggestions: RecipientMatch[];
};
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null; route: SendRoute | null };

const ZERO = 0n;
const ONE = 1n;
/** What stops an automation's run (the rest are notes for a person looking at a card). */
const AUTOMATION_STOPS: ReadonlySet<string> = new Set([
  "NOT_AVAILABLE_YET",
  "PAUSED_ALL",
  "OVER_PER_TX_LIMIT",
  "OVER_DAILY_LIMIT",
  "OVER_WEEKLY_LIMIT",
  "ADDRESS_CHANGE_HOLD",
  "RECIPIENT_BLOCKED",
  "LOOKALIKE_ADDRESS",
  "INSUFFICIENT_BALANCE",
  "WALLET_NOT_READY",
  "WALLET_NOT_SET_UP",
  // Unattended runs never pay a new address above its cooldown cap, nor anyone off the allowlist when it is on.
  "NEW_RECIPIENT_COOLDOWN",
  "NOT_ON_ALLOWLIST",
]);
const GWEI = 1_000_000_000n;
const PERCENT = 100n;
/** A USDC transfer's gas when an estimate is not possible (e.g. the balance is short). */
const FALLBACK_TRANSFER_GAS = 100_000n;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 45;
const NOTE_MAX = 140;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;

/** The state an intent rests in after drafting, from the check that blocks it. */
function restingState(evaluation: SendEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error") return "rejected";
  return "input_required";
}

/** 18-decimal native fee → USDC base units (6), rounded up so the estimate never understates. */
const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(scaled, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

export class SendService {
  private readonly tracking = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly contacts: ContactService,
    private readonly recipients: Recipients,
    private readonly ops: OpsExecutor,
    private readonly log: Logger,
    private readonly requests: RequestService,
    private readonly inbox: InboxService,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: SendRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    let stored = normaliseRequest({}, request);
    let paymentRequestId: string | null = null;
    // Paying a request: who, which asset and how much come from the request itself, not from the link's words.
    if (request.requestToken) {
      const payable = await this.requests.payable(request.requestToken);
      if (!payable) throw problem(HTTP.unprocessable, "request_unavailable");
      const asked = payable.request;
      stored = {
        recipient: payable.handle ? `@${payable.handle}` : asked.payTo,
        amount: canonicalAmount(amount(asked.asset as AssetId, asked.amount)).replace(/ [A-Z]+$/, ""),
        asset: asked.asset as AssetId,
        note: stored.note,
      };
      paymentRequestId = asked.id;
    }
    const [row] = await this.db
      .insert(intents)
      .values({
        userId: user.id,
        threadId: origin.threadId ?? null,
        network: user.activeNetwork,
        kind: "send",
        originSurface: origin.surface,
        state: "submitted",
        request: stored,
        paymentRequestId,
        expiresAt: later(INTENT_TTL_S),
      })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  /** A fix arrived or the person edited a field: the same intent, a new draft version. */
  async revise(user: SessionUser, intentId: string, patch: SendRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    // A send that pays a request keeps the request's recipient, asset and amount; only the private note can change.
    const stored = normaliseRequest(intent.request as StoredRequest, intent.paymentRequestId ? { note: patch.note } : patch);
    await this.db
      .update(intents)
      .set({ request: stored, expiresAt: later(INTENT_TTL_S) })
      .where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  private async resolveAndEvaluate(user: SessionUser, intent: IntentRow, request: StoredRequest) {
    const wallet = await this.wallets.userWallet(user.id);
    const walletAddress = wallet?.address as Address | undefined;
    const resolution = await this.recipients.resolve({ id: user.id, walletAddress }, intent.network, request.recipient);
    const gathered = await gatherFacts({
      db: this.db,
      chains: this.chains,
      userId: user.id,
      signedIn: !user.isAnonymous,
      pausedAll: false,
      network: intent.network,
      wallet: walletAddress,
      request,
      resolution,
      exceptIntentId: intent.id,
    });
    const evaluation = evaluateSend(gathered.facts);
    return { walletAddress, resolution, gathered, evaluation };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const { walletAddress, resolution, gathered, evaluation } = await this.resolveAndEvaluate(user, intent, request);
    const { facts } = gathered;
    const amount = facts.amount.status === "ok" ? facts.amount.baseUnits : undefined;
    const asset = evaluation.asset;
    const network = this.clients(intent.network).network;

    let draft: SendDraft | null = null;
    let feeEstimate: bigint | null = null;
    if (walletAddress && asset && amount !== undefined && amount > ZERO && resolution.facts.status === "resolved") {
      const route = evaluation.route ?? "wallet_signature";
      let maxFee = ZERO;
      if (route === "wallet_signature") {
        const fee = await this.estimateTransferFee(intent.network, walletAddress, assetAddress(network, asset), resolution.facts.address as Address, amount);
        maxFee = fee * MAX_FEE_DRAFT_MULTIPLIER;
        feeEstimate = feeInUsdc(fee);
      }
      draft = {
        chainId: network.chainId,
        from: walletAddress,
        to: resolution.facts.address as Address,
        asset: assetAddress(network, asset),
        amount,
        memoHash: memoHash(request.note),
        maxFee,
      };
    }

    const payload: DraftPayload = {
      draft: draft ? storeSendDraft(draft) : null,
      recipient: resolution.view,
      asset: asset ?? null,
      amount: amount?.toString() ?? null,
      note: request.note,
      fee: { payer: evaluation.route === "allowance" ? "kawase" : "wallet", estimate: feeEstimate?.toString() ?? null },
      allowance: {
        active: facts.allowance.active,
        available: facts.allowance.available.toString(),
        perPeriod: gathered.allowance?.perPeriod.toString() ?? null,
      },
      suggestions: resolution.suggestions,
    };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null, route: evaluation.route ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = restingState(evaluation);

    await this.db.transaction(async (tx) => {
      await tx
        .update(intentDrafts)
        .set({ voidedAt: new Date(), voidReason: "superseded" })
        .where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? sendDraftHash(draft) : null,
        policyReport: report as unknown as Record<string, unknown>,
        route: report.route,
        createdBy,
      });
      await tx.update(intents).set({ state, currentDraftVersion: version }).where(eq(intents.id, intent.id));
    });
    return this.view(user.id, intent.id);
  }

  private async estimateTransferFee(network: NetworkId, from: Address, token: Address, to: Address, amount: bigint) {
    const { client } = this.clients(network);
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    const [gas, fees] = await Promise.all([
      client.estimateGas({ account: from, to: token, data }).catch(() => FALLBACK_TRANSFER_GAS),
      client.estimateFeesPerGas(),
    ]);
    const maxFeePerGas = fees.maxFeePerGas > MIN_MAX_FEE_PER_GAS_GWEI * GWEI ? fees.maxFeePerGas : MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
    return ((gas * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async ownIntent(userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await this.db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "send")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such send");
    return intent;
  }

  private async currentDraft(intent: IntentRow): Promise<DraftRow | undefined> {
    const [row] = await this.db
      .select()
      .from(intentDrafts)
      .where(and(eq(intentDrafts.intentId, intent.id), eq(intentDrafts.version, intent.currentDraftVersion)));
    return row;
  }

  private async latestAttempt(intentId: string): Promise<AttemptRow | undefined> {
    const [row] = await this.db
      .select()
      .from(txAttempts)
      .where(eq(txAttempts.intentId, intentId))
      .orderBy(desc(txAttempts.attemptNo))
      .limit(1);
    return row;
  }

  /** The intent as the app and the agent see it. Expired drafts are closed, and a send in flight is looked at. */
  async get(userId: string, intentId: string): Promise<SendIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<SendIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt, [practiced]] = await Promise.all([
      this.currentDraft(intent),
      this.latestAttempt(intentId),
      this.db.select({ result: practiceRuns.result }).from(practiceRuns).where(eq(practiceRuns.intentId, intentId)),
    ]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null, route: null }) as PolicyReport;
    const network = this.chains.get(intent.network)?.network;
    const explorer = network?.viemChain.blockExplorers?.default.url;
    const request = intent.request as StoredRequest;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: practiced ? "practiced" : outcomeOf(intent.state, attempt),
      practice: practiced ? { ok: practiced.result.ok, error: practiced.result.error } : null,
      version: intent.currentDraftVersion,
      request: { recipient: request.recipient, amount: request.amount, asset: request.asset, note: request.note },
      draft:
        payload.draft && payload.recipient && payload.asset && payload.amount
          ? {
              recipient: payload.recipient,
              asset: payload.asset,
              amount: payload.amount,
              note: payload.note ?? null,
              fee: payload.fee ?? { payer: "wallet", estimate: null },
            }
          : null,
      results: report.results,
      blocking: report.blocking,
      route: report.route,
      allowance: payload.allowance ?? { active: false, available: "0", perPeriod: null },
      suggestions: payload.suggestions ?? [],
      tx: attempt?.txHash && explorer ? { hash: attempt.txHash, explorerUrl: `${explorer}/tx/${attempt.txHash}` } : null,
      createdAt: intent.createdAt.toISOString(),
      completedAt: intent.completedAt?.toISOString() ?? null,
      expiresAt: intent.expiresAt.toISOString(),
    };
  }

  async cancel(userId: string, intentId: string) {
    const intent = await this.ownIntent(userId, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    await this.db.update(intents).set({ state: "canceled" }).where(eq(intents.id, intentId));
    await this.db
      .update(approvals)
      .set({ status: "rejected" })
      .where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
    return this.view(userId, intentId);
  }

  // ── Approving ───────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The person said yes to one version. Everything is checked again on fresh facts first (chain reads, the
   * recipient), then, under the intent's row lock and the person's (user, network) lock, only what a concurrent
   * approval could change: the state, the version and the limits, all on the locked connection. Duplicate taps
   * wait on the row lock and then find the intent already executing, so they never send twice.
   */
  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice"; deviceId?: string | undefined }): Promise<SendApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const fresh = await this.recheck(user, before);
    if (fresh.kind === "changed") return this.redraft(user, intentId);
    const { draft, route, draftHash } = fresh;
    const context = this.clients(before.network);
    // Practice mode: the exact transaction is dry-run on the chain and recorded as "would have"; nothing is sent.
    if (fresh.practice) return this.practice(user, before, draft, route);
    // The grant this payment goes under: the token's everyday allowance, or its temporary raise.
    const room = route === "allowance" ? await activeAllowance(this.db, this.chains, user.id, before.network, draft.asset) : undefined;
    const allowance = room ? grantFor(room, draft.amount) : undefined;
    if (route === "allowance" && !allowance) return this.redraft(user, intentId);

    const outcome = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return { kind: "final" as const };
      if (intent.expiresAt.getTime() < Date.now()) {
        await tx.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
        return { kind: "final" as const };
      }
      if (route === "wallet_signature") {
        return { kind: "sign" as const, ...(await this.walletApproval(tx, user, intent, draft, draftHash, input)) };
      }
      const asset = assetOf(context.network, draft.asset);
      if (!(await fitsLimits(tx, user.id, intent.network, asset, draft.amount, intentId))) return { kind: "changed" as const };

      // Inside the allowance: reserve, record the attempt with its key, then let the ops wallet redeem.
      const call = encodeRedeemTransfer(context.network, allowance!.delegation as never, {
        token: draft.asset,
        to: draft.to,
        amount: draft.amount,
      });
      await tx.insert(approvals).values({
        intentId,
        draftVersion: intent.currentDraftVersion,
        draftHash,
        userId: user.id,
        network: intent.network,
        route,
        signerAddress: draft.from,
        deviceId: input.deviceId ?? null,
        status: "approved",
        decidedViaSurface: input.surface,
        expiresAt: later(APPROVAL_TTL_S),
      });
      await tx.insert(spendLedger).values({ userId: user.id, network: intent.network, intentId, category: "send", asset, amount: draft.amount });
      await tx.insert(txAttempts).values({
        userId: user.id,
        intentId,
        network: intent.network,
        chainId: context.network.chainId,
        attemptNo: (await nextAttemptNo(tx, intentId)),
        kind: "send_allowance",
        provider: "circle_dcw",
        idempotencyKey: randomUUID(),
        fromAddress: context.ops.address,
        toAddress: call.to,
        status: "prepared",
        receipt: { prepared: { to: call.to, data: call.data, grantId: allowance!.id } },
      });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "executing" as const };
    });

    if (outcome.kind === "changed") return this.redraft(user, intentId);
    if (outcome.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (outcome.kind === "sign")
      return { status: "sign", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, transaction: outcome.transaction };

    await this.submitToOps(intentId);
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  /**
   * Practice: the same checks passed, so the exact call is run as an `eth_call` from the exact sender — the ops wallet
   * redeeming the allowance, or the person's own wallet — and the answer is kept as this send's "would have". The
   * intent closes without anything sent (no attempt, no spend, no Face ID).
   */
  private async practice(user: SessionUser, intent: IntentRow, draft: SendDraft, route: SendRoute): Promise<SendApproveResponse> {
    const { client, ops, network } = this.clients(intent.network);
    const room = route === "allowance" ? await activeAllowance(this.db, this.chains, user.id, intent.network, draft.asset) : undefined;
    const grant = room ? grantFor(room, draft.amount) : undefined;
    const call = grant
      ? { from: ops.address, ...encodeRedeemTransfer(network, grant.delegation as never, { token: draft.asset, to: draft.to, amount: draft.amount }) }
      : { from: draft.from, to: draft.asset, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [draft.to, draft.amount] }) };
    const result = await simulateCall(client, call);
    const current = await this.currentDraft(intent);
    const payload = (current?.payload ?? {}) as Partial<DraftPayload>;
    await this.db.transaction(async (tx) => {
      const locked = await this.lockIntent(tx, user.id, intent.id);
      if (locked.state !== "ready_for_approval") return;
      await recordPractice(tx, {
        userId: user.id,
        network: intent.network,
        kind: "send",
        intentId: intent.id,
        summary: {
          amount: draft.amount.toString(),
          asset: payload.asset ?? "",
          to: draft.to,
          name: payload.recipient?.name ?? (payload.recipient?.handle ? `@${payload.recipient.handle}` : ""),
          route: grant ? "allowance" : "wallet_signature",
        },
        result,
      });
      await tx.update(intents).set({ state: "canceled" }).where(eq(intents.id, intent.id));
    });
    this.log.info({ intentId: intent.id, ok: result.ok, route }, "practice send");
    return { status: "final", intent: await this.view(user.id, intent.id) };
  }

  // ── Automations (Stage 8) ───────────────────────────────────────────────────────────────────────────────────

  /**
   * One automation run: the send rules on fresh facts for the automation's own recipient (paused, limits, a held or
   * blocked address, the balance), then the room the automation's grant has left this period, read from the chain.
   * If nothing stops it, the ops wallet redeems that grant — pinned to this recipient and capped per period on chain
   * — through the same attempt, tracking and receipt witness as any send. A run that cannot go says why.
   */
  async runAutomation(input: {
    userId: string;
    network: NetworkId;
    /** The run's own id for this send, fixed when the occurrence was claimed: a retry resumes it, never repeats it. */
    intentId: string;
    grant: { id: string; delegation: Record<string, unknown> };
    to: Address;
    asset: AssetId;
    amount: bigint;
    note: string | null;
  }): Promise<{ status: "executing"; intentId: string; resumed: boolean } | { status: "skipped"; reason: string; params?: Record<string, string> }> {
    // Already created by an earlier attempt at this run: its tracking carries it on.
    if (await intentExists(this.db, input.intentId)) return { status: "executing", intentId: input.intentId, resumed: true };
    const context = this.clients(input.network);
    const wallet = await this.wallets.userWallet(input.userId);
    if (!wallet) return { status: "skipped", reason: "WALLET_NOT_READY" };
    const walletAddress = wallet.address as Address;
    const [owner] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, input.userId));
    // Pause all stops every automation at once (cards/automate-safety.md); the person resumes it.
    if (owner?.pausedAllAt) return { status: "skipped", reason: "PAUSED_ALL" };
    const request: StoredRequest = {
      recipient: input.to,
      amount: canonicalAmount(amount(input.asset, input.amount)).replace(/ [A-Z]+$/, ""),
      asset: input.asset,
      note: input.note,
    };
    const resolution = await this.recipients.resolve({ id: input.userId, walletAddress }, input.network, input.to);
    const gathered = await gatherFacts({
      db: this.db,
      chains: this.chains,
      userId: input.userId,
      signedIn: true,
      pausedAll: Boolean(owner?.pausedAllAt),
      network: input.network,
      wallet: walletAddress,
      request,
      resolution,
    });
    const evaluation = evaluateSend(gathered.facts);
    const stop = evaluation.results.find((entry) => AUTOMATION_STOPS.has(entry.code));
    if (stop) return { status: "skipped", reason: stop.code, ...(stop.params ? { params: stop.params } : {}) };
    // Practice mode: the run's exact redeem is dry-run and recorded; nothing is sent (cards/automate-safety.md).
    if (gathered.practice) {
      const practiceCall = encodeRedeemTransfer(context.network, input.grant.delegation as never, { token: assetAddress(context.network, input.asset), to: input.to, amount: input.amount });
      const result = await simulateCall(context.client, { from: context.ops.address, ...practiceCall });
      await recordPractice(this.db, {
        userId: input.userId,
        network: input.network,
        kind: "automation_run",
        summary: { amount: input.amount.toString(), asset: input.asset, to: input.to, name: resolutionName(resolution) },
        result,
      });
      return { status: "skipped", reason: result.ok ? "PRACTICE_RUN" : "PRACTICE_RUN_REFUSED" };
    }
    if (resolution.facts.status !== "resolved" || resolution.facts.address.toLowerCase() !== input.to.toLowerCase())
      return { status: "skipped", reason: "RECIPIENT_INVALID", params: { query: input.to } };
    const room = await allowanceAvailable(context.client, context.network, input.grant.delegation as never)
      .then((result) => result.available)
      .catch(() => ZERO);
    if (room < input.amount) return { status: "skipped", reason: "AUTOMATION_PERIOD_USED" };

    const token = assetAddress(context.network, input.asset);
    const draft: SendDraft = { chainId: context.network.chainId, from: walletAddress, to: input.to, asset: token, amount: input.amount, memoHash: memoHash(input.note), maxFee: ZERO };
    const draftHash = sendDraftHash(draft);
    const payload: DraftPayload = {
      draft: storeSendDraft(draft),
      recipient: resolution.view,
      asset: input.asset,
      amount: input.amount.toString(),
      note: input.note,
      fee: { payer: "kawase", estimate: null },
      allowance: { active: false, available: room.toString(), perPeriod: null },
      suggestions: [],
    };
    const report: PolicyReport = { results: evaluation.results, blocking: null, route: null };
    const call = encodeRedeemTransfer(context.network, input.grant.delegation as never, { token, to: input.to, amount: input.amount });

    const created = await this.db.transaction(async (tx) => {
      // The same per-person lock as approvals, and the limits again under it, so a send at the same moment cannot
      // push both over.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.network}`}, 0))`);
      if (await intentExists(tx, input.intentId)) return "exists" as const;
      if (!(await fitsLimits(tx, input.userId, input.network, input.asset, input.amount, "00000000-0000-0000-0000-000000000000"))) return undefined;
      const [intent] = await tx
        .insert(intents)
        .values({
          id: input.intentId,
          userId: input.userId,
          network: input.network,
          kind: "send",
          originSurface: "automation",
          state: "executing",
          request,
          currentDraftVersion: 1,
          expiresAt: later(INTENT_TTL_S),
        })
        .returning({ id: intents.id });
      const id = intent!.id;
      await tx.insert(intentDrafts).values({
        intentId: id,
        version: 1,
        payload: payload as unknown as Record<string, unknown>,
        draftHash,
        policyReport: report as unknown as Record<string, unknown>,
        route: "automation",
        createdBy: "system",
      });
      await tx.insert(approvals).values({
        intentId: id,
        draftVersion: 1,
        draftHash,
        userId: input.userId,
        network: input.network,
        route: "automation",
        signerAddress: walletAddress,
        status: "approved",
        decidedViaSurface: "automation",
        expiresAt: later(APPROVAL_TTL_S),
      });
      await tx.insert(spendLedger).values({ userId: input.userId, network: input.network, intentId: id, category: "send", asset: input.asset, amount: input.amount });
      await tx.insert(txAttempts).values({
        userId: input.userId,
        intentId: id,
        network: input.network,
        chainId: context.network.chainId,
        attemptNo: 1,
        kind: "send_automation",
        provider: "circle_dcw",
        idempotencyKey: randomUUID(),
        fromAddress: context.ops.address,
        toAddress: call.to,
        status: "prepared",
        receipt: { prepared: { to: call.to, data: call.data, grantId: input.grant.id } },
      });
      return id;
    });
    if (created === "exists") return { status: "executing", intentId: input.intentId, resumed: true };
    if (!created) return { status: "skipped", reason: "OVER_DAILY_LIMIT" };
    await this.submitToOps(created);
    void this.follow(created);
    return { status: "executing", intentId: created, resumed: false };
  }

  /** Something changed since the person looked: a new version shows them what is true now. */
  private async redraft(user: SessionUser, intentId: string): Promise<SendApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
      .for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such send");
    // One approval at a time per person and network, so two sends cannot both fit under the same limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  /** Everything again on fresh facts. Any difference in who, what, how much or how makes a new version. */
  private async recheck(user: SessionUser, intent: IntentRow) {
    const current = await this.currentDraft(intent);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current || !stored || !current.draftHash) return { kind: "changed" as const };
    const { resolution, evaluation, gathered } = await this.resolveAndEvaluate(user, intent, intent.request as StoredRequest);
    const draft = loadSendDraft(stored);
    const sameRecipient = resolution.facts.status === "resolved" && resolution.facts.address.toLowerCase() === draft.to.toLowerCase();
    const report = current.policyReport as unknown as PolicyReport;
    if (evaluation.blocking || !evaluation.route || !sameRecipient || evaluation.route !== report.route) return { kind: "changed" as const };
    if (sendDraftHash(draft) !== current.draftHash) return { kind: "changed" as const };
    return { kind: "ok" as const, draft, route: evaluation.route, draftHash: current.draftHash as Hex, practice: gathered.practice };
  }

  /** Above the allowance: the exact transfer for the wallet to sign. Reuses a still-valid request for this version. */
  private async walletApproval(
    tx: Tx,
    user: SessionUser,
    intent: IntentRow,
    draft: SendDraft,
    draftHash: Hex,
    input: { surface: "app" | "chat" | "voice"; deviceId?: string | undefined },
  ): Promise<{ approvalId: string; transaction: UnsignedTransaction }> {
    const [existing] = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.intentId, intent.id),
          eq(approvals.draftVersion, intent.currentDraftVersion),
          eq(approvals.status, "pending_signature"),
        ),
      );
    if (existing && existing.expiresAt.getTime() > Date.now() && existing.unsignedTransaction)
      return { approvalId: existing.id, transaction: existing.unsignedTransaction as unknown as UnsignedTransaction };
    if (existing) await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, existing.id));

    const { client } = this.clients(intent.network);
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [draft.to, draft.amount] });
    const [nonce, fees, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      client.estimateFeesPerGas(),
      client.estimateGas({ account: draft.from, to: draft.asset, data }).catch(() => FALLBACK_TRANSFER_GAS),
    ]);
    const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
    const maxFeePerGas = fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * maxFeePerGas > draft.maxFee) throw problem(HTTP.conflict, "intent_stale", "the network fee rose; review again");
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: draft.chainId,
      nonce,
      to: draft.asset,
      data,
      value: "0",
      gas: gas.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: (fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : maxFeePerGas).toString(),
    };
    const id = newId();
    await tx.insert(approvals).values({
      id,
      intentId: intent.id,
      draftVersion: intent.currentDraftVersion,
      draftHash,
      userId: user.id,
      network: intent.network,
      route: "wallet_signature",
      unsignedTransaction: transaction as unknown as Record<string, unknown>,
      signerAddress: draft.from,
      deviceId: input.deviceId ?? null,
      status: "pending_signature",
      decidedViaSurface: input.surface,
      expiresAt: later(APPROVAL_TTL_S),
    });
    return { approvalId: id, transaction };
  }

  /** The wallet signed: check it against the request and the draft, reserve, record the hash, broadcast. */
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<SendApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const fresh = await this.recheckForSignature(user, before);
    if (fresh.kind === "changed") return this.redraft(user, intentId);
    const { draft } = fresh;
    const context = this.clients(before.network);

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion)
        throw problem(HTTP.conflict, "intent_stale");
      if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
      const unsigned = approval.unsignedTransaction as unknown as UnsignedTransaction;

      const parsed = parseTransaction(input.signedTransaction);
      const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
      const expectedData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [draft.to, draft.amount] });
      const matches =
        signer?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.chainId === draft.chainId &&
        parsed.to?.toLowerCase() === draft.asset.toLowerCase() &&
        parsed.data === expectedData &&
        (parsed.value ?? ZERO) === ZERO &&
        parsed.nonce === unsigned.nonce &&
        (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
      if (!matches) {
        this.log.warn({ intentId, approvalId: approval.id }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      const asset = assetOf(context.network, draft.asset);
      if (!(await fitsLimits(tx, user.id, intent.network, asset, draft.amount, intentId))) return { kind: "changed" as const };
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      await tx.insert(spendLedger).values({ userId: user.id, network: intent.network, intentId, category: "send", asset, amount: draft.amount });
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: context.network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "send_wallet",
          provider: "user_wallet",
          idempotencyKey: randomUUID(),
          fromAddress: draft.from,
          toAddress: draft.asset,
          nonce: unsigned.nonce,
          // The hash is known before broadcasting, so a lost answer can still be looked up.
          txHash: keccak256(input.signedTransaction),
          status: "prepared",
        })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "broadcast" as const, attemptId: attempt!.id, network: intent.network };
    });

    // The rejection is committed with the transaction above; only then is the mismatch reported.
    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (prepared.kind === "changed") return this.redraft(user, intentId);

    const { client } = this.clients(prepared.network);
    try {
      await client.sendRawTransaction({ serializedTransaction: input.signedTransaction });
      await this.db.update(txAttempts).set({ status: "submitted" }).where(eq(txAttempts.id, prepared.attemptId));
    } catch (error) {
      // The node said no before taking it (bad nonce, no funds for the fee): nothing left the wallet.
      const message = error instanceof Error ? error.message : String(error);
      const refused = /nonce too low|insufficient funds|intrinsic gas|replacement transaction|exceeds the configured cap/i.test(message);
      this.log.warn({ intentId, refused, message: message.slice(0, NOTE_MAX) }, "broadcast failed");
      if (refused) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, NOTE_MAX));
      else await this.db.update(txAttempts).set({ status: "submitted", errorCode: "broadcast_unclear" }).where(eq(txAttempts.id, prepared.attemptId));
    }
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  /** At signature time the route may have changed (the allowance grew); a signature is stronger, so only blockers matter. */
  private async recheckForSignature(user: SessionUser, intent: IntentRow) {
    const current = await this.currentDraft(intent);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current || !stored || !current.draftHash) return { kind: "changed" as const };
    const { resolution, evaluation } = await this.resolveAndEvaluate(user, intent, intent.request as StoredRequest);
    const draft = loadSendDraft(stored);
    const sameRecipient = resolution.facts.status === "resolved" && resolution.facts.address.toLowerCase() === draft.to.toLowerCase();
    if (evaluation.blocking || !sameRecipient || sendDraftHash(draft) !== current.draftHash) return { kind: "changed" as const };
    return { kind: "ok" as const, draft };
  }

  // ── Executing and tracking ──────────────────────────────────────────────────────────────────────────────────

  /** Sends the prepared redeem to Circle with its persisted key. Safe to repeat: Circle returns the same transaction. */
  private async submitToOps(intentId: string) {
    const attempt = await this.latestAttempt(intentId);
    if (!attempt || attempt.provider !== "circle_dcw" || attempt.providerRef) return;
    const prepared = (attempt.receipt as { prepared?: { to: Address; data: Hex } } | null)?.prepared;
    if (!prepared) return;
    const { ops } = this.clients(attempt.network);
    const intent = await this.db.select({ version: intents.currentDraftVersion }).from(intents).where(eq(intents.id, intentId));
    try {
      const sent = await this.ops.execute({
        network: attempt.network,
        walletId: ops.walletId,
        contract: prepared.to,
        callData: prepared.data,
        idempotencyKey: attempt.idempotencyKey,
        refId: `${intentId}:v${intent[0]?.version ?? 0}`,
      });
      await this.db.update(txAttempts).set({ providerRef: sent.id, status: "submitted" }).where(eq(txAttempts.id, attempt.id));
    } catch (error) {
      const e = error as { status?: number; code?: number; message?: string };
      const definitive = typeof e.status === "number" && e.status >= HTTP.badRequest && e.status < HTTP.internal && e.status !== HTTP.tooManyRequests;
      this.log.warn({ intentId, status: e.status, code: e.code, message: e.message }, "ops execute failed");
      if (definitive) await this.settleFailed(intentId, attempt.id, "not_sent", `circle ${e.code ?? e.status}`);
      else await this.db.update(txAttempts).set({ errorCode: "ops_unclear" }).where(eq(txAttempts.id, attempt.id));
    }
  }

  /** Watches one send for about a minute and a half after it starts; the sweeper takes over after that. */
  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      const settled = await this.track(intentId).catch((error: unknown) => {
        this.log.warn({ intentId, err: error }, "track failed");
        return false;
      });
      if (settled) return;
    }
  }

  /** Looks at one send in flight. Returns true once it has an outcome. */
  async track(intentId: string): Promise<boolean> {
    if (this.tracking.has(intentId)) return false;
    this.tracking.add(intentId);
    try {
      const [intent] = await this.db.select().from(intents).where(eq(intents.id, intentId));
      if (!intent || (intent.state !== "executing" && intent.state !== "unknown_outcome")) return true;
      const attempt = await this.latestAttempt(intentId);
      if (!attempt) return false;
      const { client } = this.clients(intent.network);
      await this.db.update(txAttempts).set({ lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));

      let hash = attempt.txHash as Hex | null;
      if (attempt.provider === "circle_dcw") {
        if (!attempt.providerRef) {
          await this.submitToOps(intentId);
          return false;
        }
        const transaction = await this.ops.get(intent.network, attempt.providerRef);
        if (transaction.txHash && !hash) {
          hash = transaction.txHash as Hex;
          await this.db.update(txAttempts).set({ txHash: hash, status: "pending_chain" }).where(eq(txAttempts.id, attempt.id));
        }
        if (transaction.state === "failed" && !hash) {
          await this.settleFailed(intentId, attempt.id, "not_sent", transaction.error ?? "failed");
          return true;
        }
        if (transaction.state === "pending") return this.maybeUnknown(intent, attempt);
      }
      if (!hash) return this.maybeUnknown(intent, attempt);
      const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
      if (!receipt) return this.maybeUnknown(intent, attempt);
      await this.settle(intent, attempt, receipt);
      return true;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  private async maybeUnknown(intent: IntentRow, attempt: AttemptRow) {
    if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
      await this.db
        .update(intents)
        .set({ state: "unknown_outcome" })
        .where(and(eq(intents.id, intent.id), eq(intents.state, "executing")));
      await this.db.update(txAttempts).set({ status: "unknown" }).where(eq(txAttempts.id, attempt.id));
    }
    return false;
  }

  /** A receipt exists: sent only if its Transfer log is exactly the draft (who, to whom, which token, how much). */
  private async settle(intent: IntentRow, attempt: AttemptRow, receipt: TransactionReceipt) {
    const draftRow = await this.currentDraft(intent);
    const stored = (draftRow?.payload as DraftPayload | undefined)?.draft;
    if (!stored) return;
    const draft = loadSendDraft(stored);
    const witnessed = receipt.status === "success" && transferMatches(receipt, draft);
    if (receipt.status === "success" && !witnessed) this.log.error({ intentId: intent.id, tx: receipt.transactionHash }, "security.receipt_mismatch");
    if (!witnessed) {
      await this.settleFailed(intent.id, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null, receipt);
      return;
    }
    const at = new Date();
    await withOutbox(this.db, async (tx) => {
      const [moved] = await tx
        .update(intents)
        .set({ state: "completed", completedAt: at })
        .where(and(eq(intents.id, intent.id), inArray(intents.state, ["executing", "unknown_outcome"])))
        .returning({ id: intents.id });
      if (!moved) return { result: undefined, events: [] };
      await tx
        .update(txAttempts)
        .set({ status: "confirmed", receipt: { ...((attempt.receipt as Record<string, unknown>) ?? {}), chain: jsonSafe(summary(receipt)) } })
        .where(eq(txAttempts.id, attempt.id));
      await tx.update(spendLedger).set({ state: "committed" }).where(eq(spendLedger.intentId, intent.id));
      await this.contacts.markPaid(tx, intent.userId, intent.network, draft.to, at);
      if (intent.paymentRequestId)
        await this.requests.markPaid(tx, intent.paymentRequestId, { txHash: receipt.transactionHash, from: draft.from, intentId: intent.id });
      await this.inbox.add(tx, {
        userId: intent.userId,
        network: intent.network,
        kind: "send_completed",
        params: { amount: draft.amount.toString(), asset: assetOf(this.clients(intent.network).network, draft.asset), to: draft.to },
        intentId: intent.id,
        txHash: receipt.transactionHash,
        dedupeKey: `send_completed:${intent.id}`,
      });
      return {
        result: undefined,
        events: [
          {
            aggregateType: "intent",
            aggregateId: intent.id,
            eventType: "send.completed",
            userId: intent.userId,
            network: intent.network,
            payload: { intentId: intent.id, txHash: receipt.transactionHash, to: draft.to, amount: draft.amount.toString(), asset: draft.asset },
            dedupeKey: `send.completed:${intent.id}`,
          },
        ],
      };
    });
  }

  private async settleFailed(intentId: string, attemptId: string, how: "not_sent" | "reverted" | "mismatch", error: string | null, receipt?: TransactionReceipt) {
    await this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(intents)
        .set({ state: "failed", completedAt: new Date() })
        .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome", "approved"])))
        .returning({ id: intents.id });
      if (!moved) return;
      await tx
        .update(txAttempts)
        .set({
          status: how === "not_sent" ? "not_sent" : "reverted",
          errorCode: how === "mismatch" ? "receipt_mismatch" : error,
          ...(receipt ? { receipt: jsonSafe(summary(receipt)) } : {}),
        })
        .where(eq(txAttempts.id, attemptId));
      await tx.update(spendLedger).set({ state: "released" }).where(eq(spendLedger.intentId, intentId));
    });
  }

  /** Every few seconds: close expired drafts and look again at sends whose outcome is not known yet. */
  startSweeper(intervalMs: number) {
    const run = async () => {
      await this.db
        .update(intents)
        .set({ state: "expired" })
        .where(and(inArray(intents.state, [...DRAFTABLE_STATES]), lt(intents.expiresAt, new Date())));
      const open = await this.db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.kind, "send"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "sweep track failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

async function nextAttemptNo(executor: Executor, intentId: string) {
  const [row] = await executor
    .select({ last: sql<number>`coalesce(max(${txAttempts.attemptNo}), 0)` })
    .from(txAttempts)
    .where(eq(txAttempts.intentId, intentId));
  return Number(row?.last ?? 0) + 1;
}

function normaliseRequest(base: Partial<StoredRequest>, patch: SendRequest): StoredRequest {
  const pick = <K extends keyof StoredRequest>(key: K): StoredRequest[K] =>
    (patch[key] !== undefined ? patch[key] : (base[key] ?? null)) as StoredRequest[K];
  const note = pick("note");
  return {
    recipient: pick("recipient")?.trim() || null,
    amount: pick("amount")?.trim() || null,
    asset: pick("asset"),
    note: note ? note.trim().slice(0, NOTE_MAX) || null : null,
  };
}

const assetAddress = (network: NetworkContext, asset: AssetId): Address =>
  asset === "USDC" ? network.addresses.usdc : network.addresses.eurc;

const assetOf = (network: NetworkContext, token: Address): AssetId =>
  token.toLowerCase() === network.addresses.eurc.toLowerCase() ? "EURC" : "USDC";

function transferMatches(receipt: TransactionReceipt, draft: SendDraft) {
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== draft.asset.toLowerCase()) return false;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      return (
        event.eventName === "Transfer" &&
        event.args.from.toLowerCase() === draft.from.toLowerCase() &&
        event.args.to.toLowerCase() === draft.to.toLowerCase() &&
        event.args.value === draft.amount
      );
    } catch {
      return false;
    }
  });
}

const summary = (receipt: TransactionReceipt) => ({
  transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber,
  status: receipt.status,
  gasUsed: receipt.gasUsed,
  effectiveGasPrice: receipt.effectiveGasPrice,
});

function outcomeOf(state: IntentState, attempt: AttemptRow | undefined): SendOutcome | null {
  switch (state) {
    case "completed":
      return "sent";
    case "failed":
      return attempt?.status === "reverted" ? "reverted" : "not_sent";
    case "unknown_outcome":
      return "checking";
    case "canceled":
      return "canceled";
    case "expired":
      return "expired";
    default:
      return null;
  }
}


/** The name a run's recipient shows under, for its practice record. */
function resolutionName(resolution: { view: SendRecipientView | null }): string {
  return resolution.view?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : "");
}
