// Sends of any asset on Arc (R1), from the person's words to a confirmed transfer (ARCHITECTURE §3–§5).
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
  formatUnits,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  stringToHex,
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
  type Db,
  intentDrafts,
  intents,
  invoices,
  newId,
  practiceRuns,
  spendLedger,
  users,
  withOutbox,
  txAttempts,
} from "@kawase/db";
import { allowanceAvailable, encodeRedeemTransfer } from "@kawase/integrations-delegation";
import {
  DRAFTABLE_STATES,
  loadSendDraft,
  memoHash,
  memoIdFor,
  memoReference,
  type SendMemo,
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
import { tokenLookup } from "../tokens/lookup";
import type { AssetService } from "../tokens/service";
import { activeAllowance, fitsLimits, gatherFacts, type Executor, type StoredRequest, type TokenLookup } from "./facts";
import { authorizationFor, relayAuthorization, serializableTypedData, signedBySender, type StoredAuthorization } from "./relayed";
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
  /** The token's symbol ("USDC", "cirBTC"). */
  asset: string | null;
  /** The token itself, for any asset (R1): address and decimals for the words and the marks. */
  token?: { address: string; symbol: string; decimals: number } | null;
  /** What the spend counts as against the limits (USDC/EURC in their units, other tokens in dollars). */
  ledger?: { asset: string; amount: string | null } | null;
  /** The on-chain reference this version writes (Arc Memo), when it has one. */
  memo?: SendMemo | null;
  amount: string | null;
  note: string | null;
  fee: { payer: "kawase" | "wallet" | "relayer"; estimate: string | null };
  allowance: { active: boolean; available: string; perPeriod: string | null };
  suggestions: RecipientMatch[];
  /** The wallet cannot pay the fee: the person signs an EIP-3009 authorization and the relayer sends it (relayed.ts). */
  gasless?: boolean | undefined;
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
  // The brake: over half the balance to someone new is never sent without the person.
  "BRAKE_HALF_BALANCE",
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
  /** Told when a person's own send completes (round-up rules listen; wired by the app). */
  private sentListener: ((sent: { userId: string; network: NetworkId; asset: AssetId; amount: bigint; intentId: string; surface: string }) => Promise<void>) | undefined;

  onSent(listener: NonNullable<SendService["sentListener"]>) {
    this.sentListener = listener;
  }

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
    private readonly assets?: AssetService,
  ) {}

  /** Any token on the network, by a verified symbol or its address, with its price (the asset registry). */
  private get lookup(): TokenLookup {
    return tokenLookup(this.chains, this.assets);
  }

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
      // USDC/EURC by name; any other token by its address, in its own decimals (R1).
      const stableAsk = asked.asset === "USDC" || asked.asset === "EURC";
      // An invoice's request is paid with the invoice's own on-chain reference (Arc Memo), so the business's books
      // match it by memoId too, in any token and for part payments (B2's invoice watcher).
      const [invoice] = await this.db.select({ memoId: invoices.memoId, number: invoices.number }).from(invoices).where(eq(invoices.requestId, asked.id)).limit(1);
      stored = {
        recipient: payable.handle ? `@${payable.handle}` : asked.payTo,
        amount: stableAsk ? canonicalAmount(amount(asked.asset as AssetId, asked.amount)).replace(/ [A-Z]+$/, "") : formatUnits(asked.amount, asked.assetDecimals ?? 0),
        asset: asked.asset,
        note: stored.note,
        memo: invoice ? invoice.number : (stored.memo ?? null),
        memoId: invoice ? invoice.memoId.toLowerCase() : (stored.memoId ?? null),
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
      lookup: this.lookup,
    });
    const evaluation = evaluateSend(gathered.facts);
    // What the chain says about the address joins the card's recipient (R6): a Kawase user's @handle, a contract.
    const inspection = gathered.inspection;
    if (resolution.view && inspection) {
      resolution.view = {
        ...resolution.view,
        contract: inspection.contract,
        handle: resolution.view.handle ?? inspection.kawaseHandle,
      };
    }
    return { walletAddress, resolution, gathered, evaluation };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const { walletAddress, resolution, gathered, evaluation } = await this.resolveAndEvaluate(user, intent, request);
    const { facts } = gathered;
    const amount = facts.amount.status === "ok" ? facts.amount.baseUnits : undefined;
    const asset = evaluation.asset;
    const token = gathered.token;
    const network = this.clients(intent.network).network;

    let draft: SendDraft | null = null;
    let feeEstimate: bigint | null = null;
    const gasless = evaluation.route === "wallet_signature" && evaluation.results.some((entry) => entry.code === "GAS_RELAYED");
    if (walletAddress && asset && token && amount !== undefined && amount > ZERO && resolution.facts.status === "resolved") {
      const route = evaluation.route ?? "wallet_signature";
      let maxFee = ZERO;
      if (route === "wallet_signature") {
        const fee = await this.estimateTransferFee(intent.network, walletAddress, token.address, resolution.facts.address as Address, amount, memoOf(request));
        maxFee = fee * MAX_FEE_DRAFT_MULTIPLIER;
        feeEstimate = feeInUsdc(fee);
      }
      draft = {
        chainId: network.chainId,
        from: walletAddress,
        to: resolution.facts.address as Address,
        asset: token.address,
        amount,
        memoHash: memoHash(request.note),
        maxFee,
        reference: memoReference(memoOf(request)),
      };
    }

    const payload: DraftPayload = {
      draft: draft ? storeSendDraft(draft) : null,
      recipient: resolution.view,
      asset: asset ?? null,
      token: token ? { address: token.address, symbol: token.symbol, decimals: token.decimals } : null,
      memo: memoOf(request),
      ledger: gathered.ledger ? { asset: gathered.ledger.asset, amount: gathered.ledger.amount?.toString() ?? null } : null,
      amount: amount?.toString() ?? null,
      note: request.note,
      fee: { payer: evaluation.route === "allowance" ? "kawase" : gasless ? "relayer" : "wallet", estimate: feeEstimate?.toString() ?? null },
      gasless,
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

  private async estimateTransferFee(network: NetworkId, from: Address, token: Address, to: Address, amount: bigint, memo: SendMemo | null = null) {
    const { client, network: context } = this.clients(network);
    const call = sendCall(context, { asset: token, to, amount }, memo);
    const [gas, fees] = await Promise.all([
      client.estimateGas({ account: from, to: call.to, data: call.data }).catch(() => (memo ? FALLBACK_TRANSFER_GAS * MEMO_GAS_FACTOR : FALLBACK_TRANSFER_GAS)),
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
              token: payload.token ?? null,
              memo: payload.memo ?? null,
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
        return { kind: "sign" as const, ...(await this.walletApproval(tx, user, intent, draft, draftHash, input, fresh.gasless)) };
      }
      const { ledger } = fresh;
      if (ledger.amount !== null && !(await fitsLimits(tx, user.id, intent.network, ledger.asset, ledger.amount, intentId))) return { kind: "changed" as const };

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
      if (ledger.amount !== null) await tx.insert(spendLedger).values({ userId: user.id, network: intent.network, intentId, category: "send", asset: ledger.asset, amount: ledger.amount });
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
      return "authorization" in outcome
        ? { status: "sign_typed", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, typedData: serializableTypedData(outcome.authorization) }
        : { status: "sign", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, transaction: outcome.transaction };

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
    // Nothing left this period: this period's run already went. Some left, but less than this run: over the grant,
    // which waits for the person (Needs you) instead of squeezing through.
    if (room === ZERO) return { status: "skipped", reason: "AUTOMATION_PERIOD_USED" };
    if (room < input.amount) return { status: "skipped", reason: "OVER_GRANT", params: { room: room.toString(), asset: input.asset } };

    const token = assetAddress(context.network, input.asset);
    const draft: SendDraft = { chainId: context.network.chainId, from: walletAddress, to: input.to, asset: token, amount: input.amount, memoHash: memoHash(input.note), maxFee: ZERO, reference: memoReference(null) };
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
    return {
      kind: "ok" as const,
      draft,
      route: evaluation.route,
      draftHash: current.draftHash as Hex,
      practice: gathered.practice,
      ledger: ledgerOf(current.payload as DraftPayload, this.clients(intent.network).network, draft),
      gasless: Boolean((current.payload as DraftPayload).gasless),
    };
  }

  /** Above the allowance: the exact transfer for the wallet to sign. Reuses a still-valid request for this version. */
  private async walletApproval(
    tx: Tx,
    user: SessionUser,
    intent: IntentRow,
    draft: SendDraft,
    draftHash: Hex,
    input: { surface: "app" | "chat" | "voice"; deviceId?: string | undefined },
    gasless = false,
  ): Promise<{ approvalId: string; transaction: UnsignedTransaction } | { approvalId: string; authorization: StoredAuthorization }> {
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
    if (existing && existing.expiresAt.getTime() > Date.now() && existing.unsignedTransaction) {
      const stored = existing.unsignedTransaction as unknown as UnsignedTransaction | StoredAuthorization;
      if ("kind" in stored && stored.kind === "authorization") {
        if (gasless) return { approvalId: existing.id, authorization: stored };
      } else if (!gasless) return { approvalId: existing.id, transaction: stored as UnsignedTransaction };
    }
    if (existing) await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, existing.id));

    const { client, network: context } = this.clients(intent.network);
    const memo = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined)?.memo ?? null;
    if (memoReference(memo) !== draft.reference) throw problem(HTTP.conflict, "intent_stale", "the reference changed; review again");

    // Gas-free only without a memo: a Memo call must come from the wallet itself (EOA), so the relayer cannot carry it.
    if (gasless && !memo) {
      // Exactly this transfer, valid until the approval expires, one fresh nonce: the relayer can do nothing else with it.
      const authorization = await authorizationFor(this.clients(intent.network), draft, APPROVAL_TTL_S);
      const id = newId();
      await tx.insert(approvals).values({
        id,
        intentId: intent.id,
        draftVersion: intent.currentDraftVersion,
        draftHash,
        userId: user.id,
        network: intent.network,
        route: "wallet_signature",
        unsignedTransaction: authorization as unknown as Record<string, unknown>,
        signerAddress: draft.from,
        deviceId: input.deviceId ?? null,
        status: "pending_signature",
        decidedViaSurface: input.surface,
        expiresAt: later(APPROVAL_TTL_S),
      });
      return { approvalId: id, authorization };
    }

    const { to: target, data } = sendCall(context, draft, memo);
    const [nonce, fees, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      client.estimateFeesPerGas(),
      client.estimateGas({ account: draft.from, to: target, data }).catch(() => (memo ? FALLBACK_TRANSFER_GAS * MEMO_GAS_FACTOR : FALLBACK_TRANSFER_GAS)),
    ]);
    const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
    const maxFeePerGas = fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * maxFeePerGas > draft.maxFee) throw problem(HTTP.conflict, "intent_stale", "the network fee rose; review again");
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: draft.chainId,
      nonce,
      to: target,
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
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex; kind?: "transaction" | "typed" | undefined }): Promise<SendApproveResponse> {
    if (input.kind === "typed") return this.submitAuthorization(user, intentId, { approvalId: input.approvalId, signature: input.signedTransaction });
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
      // The exact call this version names: the transfer itself, or the transfer inside Memo with its reference.
      const memo = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined)?.memo ?? null;
      const expected = sendCall(context.network, draft, memoReference(memo) === draft.reference ? memo : null);
      const matches =
        memoReference(memo) === draft.reference &&
        signer?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.chainId === draft.chainId &&
        parsed.to?.toLowerCase() === expected.to.toLowerCase() &&
        parsed.data === expected.data &&
        (parsed.value ?? ZERO) === ZERO &&
        parsed.nonce === unsigned.nonce &&
        (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
      if (!matches) {
        this.log.warn({ intentId, approvalId: approval.id }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      const { ledger } = fresh;
      if (ledger.amount !== null && !(await fitsLimits(tx, user.id, intent.network, ledger.asset, ledger.amount, intentId))) return { kind: "changed" as const };
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      if (ledger.amount !== null) await tx.insert(spendLedger).values({ userId: user.id, network: intent.network, intentId, category: "send", asset: ledger.asset, amount: ledger.amount });
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

  /**
   * A gas-free send's signature (EIP-3009): it must be the sender's over exactly the stored message, and the message
   * exactly the draft (from, to, token, amount). Then it is reserved and recorded like a wallet send, and the relayer
   * sends it, paying the fee. A refusal before broadcast means nothing moved.
   */
  private async submitAuthorization(user: SessionUser, intentId: string, input: { approvalId: string; signature: Hex }): Promise<SendApproveResponse> {
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
      const stored = approval.unsignedTransaction as unknown as StoredAuthorization | null;
      const matches =
        stored?.kind === "authorization" &&
        stored.message.from.toLowerCase() === draft.from.toLowerCase() &&
        stored.message.to.toLowerCase() === draft.to.toLowerCase() &&
        stored.domain.verifyingContract.toLowerCase() === draft.asset.toLowerCase() &&
        BigInt(stored.message.value) === draft.amount &&
        stored.domain.chainId === draft.chainId &&
        (await signedBySender(stored, input.signature));
      if (!matches || !stored) {
        this.log.warn({ intentId, approvalId: approval.id }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      const { ledger } = fresh;
      if (ledger.amount !== null && !(await fitsLimits(tx, user.id, intent.network, ledger.asset, ledger.amount, intentId))) return { kind: "changed" as const };
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      if (ledger.amount !== null) await tx.insert(spendLedger).values({ userId: user.id, network: intent.network, intentId, category: "send", asset: ledger.asset, amount: ledger.amount });
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: context.network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "send_relayed",
          provider: "relayer",
          idempotencyKey: randomUUID(),
          fromAddress: context.relayerAddress,
          toAddress: draft.asset,
          status: "prepared",
          receipt: { authorization: { nonce: stored.message.nonce, validBefore: stored.message.validBefore } },
        })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "relay" as const, attemptId: attempt!.id, stored };
    });

    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (prepared.kind === "changed") return this.redraft(user, intentId);

    try {
      const hash = await relayAuthorization(context, prepared.stored, input.signature);
      await this.db.update(txAttempts).set({ status: "submitted", txHash: hash }).where(eq(txAttempts.id, prepared.attemptId));
    } catch (error) {
      // The relayer could not send it (no gas, the node refused): nothing left the wallet, and the signature expires.
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn({ intentId, message: message.slice(0, NOTE_MAX) }, "relay failed");
      await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, NOTE_MAX));
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
    return { kind: "ok" as const, draft, ledger: ledgerOf(current.payload as DraftPayload, this.clients(intent.network).network, draft) };
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
    const done = await withOutbox<{ completed: true } | undefined>(this.db, async (tx) => {
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
        params: { amount: draft.amount.toString(), ...tokenParams((await this.currentDraft(intent))?.payload as DraftPayload | undefined, this.clients(intent.network).network, draft), to: draft.to },
        intentId: intent.id,
        txHash: receipt.transactionHash,
        dedupeKey: `send_completed:${intent.id}`,
      });
      return {
        result: { completed: true },
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
    // Round-ups and the like listen for the person's own completed sends of USDC and EURC (they count in those
    // units); a failure there never touches the send.
    const network = this.clients(intent.network).network;
    const stable = [network.addresses.usdc, network.addresses.eurc].some((address) => address.toLowerCase() === draft.asset.toLowerCase());
    if (done?.completed && this.sentListener && stable)
      await this.sentListener({ userId: intent.userId, network: intent.network, asset: assetOf(this.clients(intent.network).network, draft.asset), amount: draft.amount, intentId: intent.id, surface: intent.originSurface }).catch((error: unknown) =>
        this.log.warn({ err: error, intentId: intent.id }, "after-send listener failed"),
      );
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
  const memo = pick("memo");
  return {
    recipient: pick("recipient")?.trim() || null,
    amount: pick("amount")?.trim() || null,
    asset: pick("asset"),
    note: note ? note.trim().slice(0, NOTE_MAX) || null : null,
    memo: memo?.trim() || null,
    memoId: pick("memoId")?.toLowerCase() ?? null,
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

/** The spend a version counts against the limits; older drafts (USDC/EURC only) count the asset itself. */
function ledgerOf(payload: DraftPayload | undefined, network: NetworkContext, draft: SendDraft): { asset: string; amount: bigint | null } {
  if (payload?.ledger) return { asset: payload.ledger.asset, amount: payload.ledger.amount === null ? null : BigInt(payload.ledger.amount) };
  return { asset: assetOf(network, draft.asset), amount: draft.amount };
}

/** The asset of an inbox item: its symbol, with decimals when it is not USDC or EURC. */
function tokenParams(payload: DraftPayload | undefined, network: NetworkContext, draft: SendDraft): Record<string, string> {
  const token = payload?.token;
  if (!token || token.symbol === "USDC" || token.symbol === "EURC") return { asset: assetOf(network, draft.asset) };
  return { asset: token.symbol, decimals: String(token.decimals) };
}

/** The name a run's recipient shows under, for its practice record. */
function resolutionName(resolution: { view: SendRecipientView | null }): string {
  return resolution.view?.name ?? (resolution.view?.handle ? `@${resolution.view.handle}` : "");
}

const MEMO_ABI = parseAbi(["function memo(address target, bytes data, bytes32 memoId, bytes memoData)"]);
/** A memo call runs the transfer through CallFrom and logs the reference: more gas than a bare transfer. */
const MEMO_GAS_FACTOR = 3n;

/** The reference a request asks to write on chain, or none. */
function memoOf(request: StoredRequest): SendMemo | null {
  const text = request.memo?.trim() ?? "";
  if (!text && !request.memoId) return null;
  return { memoId: (request.memoId ?? memoIdFor(text)) as Hex, memoData: text };
}

/**
 * The call the wallet sends: the ERC-20 transfer, or — with a reference — Arc's Memo contract forwarding that same
 * transfer from the wallet (CallFrom) and logging the memoId and text with it.
 */
function sendCall(network: NetworkContext, draft: { asset: Address; to: Address; amount: bigint }, memo: SendMemo | null): { to: Address; data: Hex } {
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [draft.to, draft.amount] });
  if (!memo) return { to: draft.asset, data: transfer };
  return {
    to: network.addresses.memo as Address,
    data: encodeFunctionData({ abi: MEMO_ABI, functionName: "memo", args: [draft.asset, transfer, memo.memoId, stringToHex(memo.memoData)] }),
  };
}
