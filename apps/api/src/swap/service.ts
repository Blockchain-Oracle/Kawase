// Swaps between the person's currencies (Stage 6; ARCHITECTURE §8 `propose_swap`), built like sends (§3–§5).
//
// Drafting: complete the pair from what was said, read balances, get a fresh App Kit quote and Circle's market
// prices, run the policy, and store an immutable version whose EIP-712 hash covers what moves money (exactly
// `amountIn` out, at least `minOut` back). Approving: quote again on fresh facts; if the route can no longer
// guarantee the version's `minOut`, a new version shows the new numbers. Otherwise App Kit builds the calls with
// `minOut` as its on-chain stop limit, Kawase checks them (only the App Kit adapter, an approval of exactly the
// amount, no native value) and wraps them into one transaction the wallet sends to itself, so approve + swap is
// one Face ID and all-or-nothing. Tracking: done only when the receipt shows exactly `amountIn` leaving and at
// least `minOut` arriving.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  keccak256,
  parseTransaction,
  parseUnits,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import {
  APPROVAL_TTL_S,
  DEFAULT_LIMITS,
  GAS_ESTIMATE_HEADROOM_PERCENT,
  GAS_FLOAT_USDC_BASE_UNITS,
  INTENT_TTL_S,
  MAX_FEE_DRAFT_MULTIPLIER,
  MS_PER_SECOND,
  SEND_UNKNOWN_AFTER_S,
  SWAP_BATCH_GAS_ESTIMATE,
  SWAP_PROVIDER_LABEL,
  SWAP_ROUTE_SLIPPAGE_DIVISOR,
} from "@kawase/config";
import type { SwapApproveResponse, SwapDraftView, SwapIntent, SwapRequest, UnsignedTransaction } from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import { checkSwapCalls, type SwapCall } from "@kawase/integrations-app-kit";
import { encodeSelfBatch, isWalletSetUp } from "@kawase/integrations-delegation";
import {
  DRAFTABLE_STATES,
  loadSwapDraft,
  storeSwapDraft,
  swapDraftHash,
  type IntentState,
  type StoredSwapDraft,
  type SwapDraft,
} from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale, type AssetId } from "@kawase/money";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import { completePair, evaluateSwap, type PolicyResult, type SwapEvaluation, type SwapQuoteFacts } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import { parseRequestAmount } from "../send/facts";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { SwapEngine } from "./engine";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

type StoredSwapRequest = { tokenIn: AssetId | null; tokenOut: AssetId | null; amount: string | null };
type DraftPayload = { draft: StoredSwapDraft | null; view: SwapDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };

const ASSETS: readonly AssetId[] = ["USDC", "EURC"];
const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const BPS = 10_000;
const RATE_DIGITS = 6;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 45;
const ERROR_MAX = 140;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

const tokenAddress = (network: NetworkContext, asset: AssetId): Address => (asset === "USDC" ? network.addresses.usdc : network.addresses.eurc);
const assetOf = (network: NetworkContext, token: Address): AssetId =>
  token.toLowerCase() === network.addresses.eurc.toLowerCase() ? "EURC" : "USDC";

/** 18-decimal native fee → USDC base units, rounded up. */
const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(scaled, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

function restingState(evaluation: SwapEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

export class SwapService {
  private readonly tracking = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: SwapEngine,
    private readonly log: Logger,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: SwapRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise({}, request);
    const [row] = await this.db
      .insert(intents)
      .values({
        userId: user.id,
        threadId: origin.threadId ?? null,
        network: user.activeNetwork,
        kind: "swap",
        originSurface: origin.surface,
        state: "submitted",
        request: stored,
        expiresAt: later(INTENT_TTL_S),
      })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  /** A new amount or direction, or an empty patch to quote again: the same swap, a new version. */
  async revise(user: SessionUser, intentId: string, patch: SwapRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredSwapRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  /** Everything the policy needs, fresh: balances and the 7702 code from the chain, a quote, market prices. */
  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredSwapRequest) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const view = await capabilityView(this.db, this.chains.available);
    const pair = completePair(request.tokenIn ?? undefined, request.tokenOut ?? undefined, ASSETS);
    const amount = parseRequestAmount(request.amount, pair.tokenIn);

    let balances: Record<AssetId, bigint> = { USDC: ZERO, EURC: ZERO };
    let setUp = false;
    if (clients && wallet) {
      const balanceOf = (token: Address) => clients.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
      const [usdc, eurc, code] = await Promise.all([
        balanceOf(clients.network.addresses.usdc),
        balanceOf(clients.network.addresses.eurc),
        clients.client.getCode({ address: wallet }),
      ]);
      balances = { USDC: usdc, EURC: eurc };
      setUp = isWalletSetUp(code);
    }

    const limits = DEFAULT_LIMITS[network];
    const slippageBps = limits.maxSlippageStableBps;
    let quote: SwapQuoteFacts = { status: "not_requested" };
    let marketRate: number | undefined;
    let routeFees = ZERO;
    const canQuote =
      clients && wallet && pair.tokenIn && pair.tokenOut && pair.tokenIn !== pair.tokenOut && amount.status === "ok" && amount.baseUnits > ZERO;
    if (canQuote) {
      const tokenIn = tokenAddress(clients.network, pair.tokenIn!);
      const tokenOut = tokenAddress(clients.network, pair.tokenOut!);
      const amountIn = formatUnits(amount.baseUnits, decimalsOf(pair.tokenIn!));
      const [quoted, prices] = await Promise.all([
        this.engine
          .quote({ network: clients.network, client: clients.client, from: wallet, tokenIn, tokenOut, amountIn, slippageBps, decimalsOut: decimalsOf(pair.tokenOut!) })
          .catch((error: unknown) => {
            this.log.warn({ err: error, intentId: intent.id }, "swap quote failed");
            return undefined;
          }),
        this.engine.prices(clients.network, [tokenIn, tokenOut]).catch(() => new Map<string, number>()),
      ]);
      const priceIn = prices.get(tokenIn.toLowerCase());
      const priceOut = prices.get(tokenOut.toLowerCase());
      if (priceIn && priceOut) marketRate = priceIn / priceOut;
      if (quoted) {
        const marketOut = marketRate ? Number(amountIn) * marketRate : undefined;
        const estimated = Number(formatUnits(quoted.estimatedOut, decimalsOf(pair.tokenOut!)));
        const rateGapBps = marketOut ? Math.round(((marketOut - estimated) / marketOut) * BPS) : undefined;
        quote = { status: "ok", estimatedOut: quoted.estimatedOut, minOut: quoted.minOut, slippageBps, rateGapBps };
        routeFees = quoted.fees
          .filter((fee) => fee.type !== "gas" && fee.token === pair.tokenIn)
          .reduce((sum, fee) => sum + parseUnits(fee.amount, decimalsOf(pair.tokenIn!)), ZERO);
      } else quote = { status: "unavailable" };
    }

    const evaluation = evaluateSwap({
      network,
      capability: { here: view.swap[network].state, other: view.swap[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: false,
      wallet: { registered: Boolean(wallet), setUp, balances },
      tokenIn: pair.tokenIn,
      tokenOut: pair.tokenOut,
      amount,
      quote,
      thresholds: { gasFloat: GAS_FLOAT_USDC_BASE_UNITS, maxRateGapBps: limits.maxRateGapBps, warnRateGapBps: limits.warnRateGapBps },
    });
    return { wallet, evaluation, quote, marketRate, routeFees, amount };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredSwapRequest, createdBy: "user" | "agent" | "system") {
    const { wallet, evaluation, quote, marketRate, routeFees, amount } = await this.evaluate(user, intent, request);
    const { tokenIn, tokenOut } = evaluation;
    const clients = this.chains.get(intent.network);

    let draft: SwapDraft | null = null;
    let view: SwapDraftView | null = null;
    if (clients && wallet && tokenIn && tokenOut && quote.status === "ok" && amount.status === "ok") {
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const fee = ((SWAP_BATCH_GAS_ESTIMATE * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      draft = {
        chainId: clients.network.chainId,
        from: wallet,
        tokenIn: tokenAddress(clients.network, tokenIn),
        tokenOut: tokenAddress(clients.network, tokenOut),
        amountIn: amount.baseUnits,
        minOut: quote.minOut,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const inUnits = Number(formatUnits(amount.baseUnits, decimalsOf(tokenIn)));
      const outUnits = Number(formatUnits(quote.estimatedOut, decimalsOf(tokenOut)));
      view = {
        tokenIn,
        tokenOut,
        amountIn: amount.baseUnits.toString(),
        estimatedOut: quote.estimatedOut.toString(),
        minOut: quote.minOut.toString(),
        slippageBps: quote.slippageBps,
        rate: (outUnits / inUnits).toFixed(RATE_DIGITS),
        marketRate: marketRate ? marketRate.toFixed(RATE_DIGITS) : null,
        rateGapBps: quote.rateGapBps ?? null,
        fees: { route: routeFees.toString(), network: feeInUsdc(fee).toString() },
        provider: SWAP_PROVIDER_LABEL,
        quotedAt: new Date().toISOString(),
      };
    }

    const payload: DraftPayload = { draft: draft ? storeSwapDraft(draft) : null, view };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = draft || evaluation.blocking ? restingState(evaluation) : "input_required";
    await this.db.transaction(async (tx) => {
      await tx
        .update(intentDrafts)
        .set({ voidedAt: new Date(), voidReason: "superseded" })
        .where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? swapDraftHash(draft) : null,
        policyReport: report as unknown as Record<string, unknown>,
        route: draft && !evaluation.blocking ? "wallet_signature" : null,
        createdBy,
      });
      await tx.update(intents).set({ state, currentDraftVersion: version }).where(eq(intents.id, intent.id));
    });
    return this.view(user.id, intent.id);
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async ownIntent(userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await this.db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "swap")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such swap");
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
    const [row] = await this.db.select().from(txAttempts).where(eq(txAttempts.intentId, intentId)).orderBy(desc(txAttempts.attemptNo)).limit(1);
    return row;
  }

  async get(userId: string, intentId: string): Promise<SwapIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<SwapIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const explorer = this.chains.get(intent.network)?.network.viemChain.blockExplorers?.default.url;
    const request = intent.request as StoredSwapRequest;
    const received = (attempt?.receipt as { received?: string } | null)?.received ?? null;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      version: intent.currentDraftVersion,
      request: { tokenIn: request.tokenIn, tokenOut: request.tokenOut, amount: request.amount },
      draft: payload.view ?? null,
      results: report.results,
      blocking: report.blocking,
      received,
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
   * The person said yes to one version. Quote again and re-check first (outside any lock); if the route can no
   * longer guarantee this version's `minOut`, show a new version. Then have App Kit build the calls with that stop
   * limit, check them, and hand the wallet one transaction to itself.
   */
  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice"; deviceId?: string | undefined }): Promise<SwapApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };

    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return this.redraft(user, intentId);
    const draft = loadSwapDraft(stored);
    if (swapDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);
    // The version's stop limit stands as long as the route still expects to deliver it; when the price has moved
    // below it, the person sees a new version with the new numbers.
    const fresh = await this.evaluate(user, before, before.request as StoredSwapRequest);
    // No price for a moment is not a change: the person tries again, the version stands.
    if (fresh.quote.status === "unavailable") throw problem(HTTP.badGateway, "quote_unavailable");
    if (fresh.evaluation.blocking || fresh.quote.status !== "ok" || fresh.quote.estimatedOut < draft.minOut) return this.redraft(user, intentId);

    const { network, client } = this.clients(before.network);
    let calls: SwapCall[];
    try {
      calls = await this.engine.prepare({
        network,
        client,
        from: draft.from,
        tokenIn: draft.tokenIn,
        tokenOut: draft.tokenOut,
        amountIn: formatUnits(draft.amountIn, decimalsOf(assetOf(network, draft.tokenIn))),
        slippageBps: DEFAULT_LIMITS[before.network].maxSlippageStableBps / SWAP_ROUTE_SLIPPAGE_DIVISOR,
      });
    } catch (error) {
      // Not a new version: the price check above passed, so a new quote would most likely fail the same way.
      this.log.warn({ err: error, intentId }, "swap prepare failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }
    const check = checkSwapCalls(network, calls, draft);
    // The price moved enough that the calls no longer guarantee what the person was shown: a new version.
    if (!check.ok && check.reason === "below_minimum") return this.redraft(user, intentId);
    if (!check.ok) {
      this.log.error({ intentId, reason: check.reason }, "security.swap_calls_refused");
      throw problem(HTTP.badGateway, "quote_unavailable", "the swap route returned calls Kawase does not accept");
    }

    const data = encodeSelfBatch(calls);
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        this.log.warn({ err: error, intentId }, "swap gas estimate failed");
        return SWAP_BATCH_GAS_ESTIMATE;
      }),
    ]);
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: draft.chainId,
      nonce,
      to: draft.from,
      data,
      value: "0",
      gas: gas.toString(),
      maxFeePerGas: price.maxFeePerGas.toString(),
      maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString(),
    };

    const outcome = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return { kind: "final" as const };
      // One open request per version: an older one (older calls, an older nonce) is closed.
      await tx
        .update(approvals)
        .set({ status: "rejected" })
        .where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
      const id = newId();
      await tx.insert(approvals).values({
        id,
        intentId,
        draftVersion: intent.currentDraftVersion,
        draftHash: current.draftHash!,
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
      return { kind: "sign" as const, approvalId: id };
    });
    if (outcome.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    return { status: "sign", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, transaction };
  }

  private async redraft(user: SessionUser, intentId: string): Promise<SwapApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredSwapRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
      .for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such swap");
    // The same per-person lock as sends: one approval at a time on a network, so two cannot race for one nonce.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  /** The wallet signed: it must be the exact transaction handed out for this version, then it is broadcast. */
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<SwapApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadSwapDraft(stored);
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
      const matches =
        signer?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.chainId === draft.chainId &&
        parsed.to?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.data === unsigned.data &&
        (parsed.value ?? ZERO) === ZERO &&
        parsed.nonce === unsigned.nonce &&
        (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
      if (!matches) {
        this.log.warn({ intentId, approvalId: approval.id }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: context.network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "swap_wallet",
          provider: "user_wallet",
          idempotencyKey: randomUUID(),
          fromAddress: draft.from,
          toAddress: draft.from,
          nonce: unsigned.nonce,
          txHash: keccak256(input.signedTransaction),
          status: "prepared",
        })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "broadcast" as const, attemptId: attempt!.id };
    });

    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };

    try {
      await context.client.sendRawTransaction({ serializedTransaction: input.signedTransaction });
      await this.db.update(txAttempts).set({ status: "submitted" }).where(eq(txAttempts.id, prepared.attemptId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const refused = refusedBeforeSending(message);
      this.log.warn({ intentId, refused, message: message.slice(0, ERROR_MAX) }, "swap broadcast failed");
      if (refused) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, ERROR_MAX));
      else await this.db.update(txAttempts).set({ status: "submitted", errorCode: "broadcast_unclear" }).where(eq(txAttempts.id, prepared.attemptId));
    }
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  // ── Tracking ────────────────────────────────────────────────────────────────────────────────────────────────

  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      const settled = await this.track(intentId).catch((error: unknown) => {
        this.log.warn({ intentId, err: error }, "swap track failed");
        return false;
      });
      if (settled) return;
    }
  }

  async track(intentId: string): Promise<boolean> {
    if (this.tracking.has(intentId)) return false;
    this.tracking.add(intentId);
    try {
      const [intent] = await this.db.select().from(intents).where(eq(intents.id, intentId));
      if (!intent || (intent.state !== "executing" && intent.state !== "unknown_outcome")) return true;
      const attempt = await this.latestAttempt(intentId);
      if (!attempt?.txHash) return false;
      await this.db.update(txAttempts).set({ lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));
      const receipt = await this.clients(intent.network).client.getTransactionReceipt({ hash: attempt.txHash as Hex }).catch(() => undefined);
      if (!receipt) {
        if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
          await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
          await this.db.update(txAttempts).set({ status: "unknown" }).where(eq(txAttempts.id, attempt.id));
        }
        return false;
      }
      await this.settle(intent, attempt, receipt);
      return true;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  /** Done only when exactly `amountIn` left the wallet and at least `minOut` came back, in this receipt. */
  private async settle(intent: IntentRow, attempt: AttemptRow, receipt: TransactionReceipt) {
    const stored = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined)?.draft;
    if (!stored) return;
    const draft = loadSwapDraft(stored);
    const moved = swapWitness(receipt, draft);
    const witnessed = receipt.status === "success" && moved.out === draft.amountIn && moved.in >= draft.minOut;
    if (receipt.status === "success" && !witnessed) this.log.error({ intentId: intent.id, tx: receipt.transactionHash }, "security.receipt_mismatch");
    if (!witnessed) {
      await this.settleFailed(intent.id, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null, receipt);
      return;
    }
    await this.db.transaction(async (tx) => {
      const [done] = await tx
        .update(intents)
        .set({ state: "completed", completedAt: new Date() })
        .where(and(eq(intents.id, intent.id), inArray(intents.state, ["executing", "unknown_outcome"])))
        .returning({ id: intents.id });
      if (!done) return;
      await tx
        .update(txAttempts)
        .set({ status: "confirmed", receipt: { received: moved.in.toString(), chain: jsonSafe(receiptSummary(receipt)) } })
        .where(eq(txAttempts.id, attempt.id));
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
          ...(receipt ? { receipt: jsonSafe(receiptSummary(receipt)) } : {}),
        })
        .where(eq(txAttempts.id, attemptId));
    });
  }

  /** Every few seconds: look again at swaps whose outcome is not known yet (expiry is the send sweeper's). */
  startSweeper(intervalMs: number) {
    const run = async () => {
      const open = await this.db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.kind, "swap"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "swap sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "swap sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

function normalise(base: Partial<StoredSwapRequest>, patch: SwapRequest): StoredSwapRequest {
  const pick = <K extends keyof StoredSwapRequest>(key: K): StoredSwapRequest[K] =>
    (patch[key] !== undefined ? patch[key] : (base[key] ?? null)) as StoredSwapRequest[K];
  return { tokenIn: pick("tokenIn"), tokenOut: pick("tokenOut"), amount: pick("amount")?.trim() || null };
}

/** What the receipt's Transfer logs say moved: tokenIn out of the wallet, tokenOut into it. */
function swapWitness(receipt: TransactionReceipt, draft: SwapDraft) {
  let out = ZERO;
  let into = ZERO;
  for (const log of receipt.logs) {
    const token = log.address.toLowerCase();
    if (token !== draft.tokenIn.toLowerCase() && token !== draft.tokenOut.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName !== "Transfer") continue;
      const wallet = draft.from.toLowerCase();
      if (token === draft.tokenIn.toLowerCase() && event.args.from.toLowerCase() === wallet) out += event.args.value;
      if (token === draft.tokenOut.toLowerCase() && event.args.to.toLowerCase() === wallet) into += event.args.value;
    } catch {
      // Not an ERC-20 Transfer.
    }
  }
  return { out, in: into };
}

function outcomeOf(state: IntentState, attempt: AttemptRow | undefined) {
  switch (state) {
    case "completed":
      return "sent" as const;
    case "failed":
      return attempt?.status === "reverted" ? ("reverted" as const) : ("not_sent" as const);
    case "unknown_outcome":
      return "checking" as const;
    case "canceled":
      return "canceled" as const;
    case "expired":
      return "expired" as const;
    default:
      return null;
  }
}
