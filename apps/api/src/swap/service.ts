// Swaps of any pair on Arc (R1, R3; ARCHITECTURE §8 `propose_swap`/`propose_trade`), built like sends (§3–§5).
//
// Drafting: resolve both tokens (a verified symbol or any address) and describe them from the asset registry,
// read balances, ask every venue (KyberSwap, Circle App Kit, LI.FI) for a fresh quote and take the most delivered,
// price it against the market (the price impact), apply the token rules (impersonators and honeypots are never
// bought; unverified tokens have a per-trade and per-day limit), run the policy, and store an immutable version
// whose EIP-712 hash covers what moves money (exactly `amountIn` out, at least `minOut` back). Approving: quote
// again; if the chosen venue can no longer guarantee the version's `minOut`, a new version shows the new numbers.
// Otherwise that venue builds the calls at half the shown slippage, Kawase checks them (the venue's own contract,
// an approval of exactly the amount, the wallet as the only recipient, the on-chain minimum, no native value) and
// wraps them into one transaction the wallet sends to itself, so approve + swap is one approval and
// all-or-nothing. Tracking: done only when the receipt shows exactly `amountIn` leaving and at least `minOut`
// arriving.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  BaseError,
  ExecutionRevertedError,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  isAddress,
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
  AGGREGATOR_BATCH_GAS_ESTIMATE,
  SEND_UNKNOWN_AFTER_S,
  SWAP_BATCH_GAS_ESTIMATE,
  SWAP_ROUTE_SLIPPAGE_DIVISOR,
  TOKEN_RULES,
} from "@kawase/config";
import type { SwapApproveResponse, SwapDraftView, SwapIntent, SwapRequest, SwapRouteView, TokenView, UnsignedTransaction } from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, withdrawals, type Db } from "@kawase/db";
import type { SwapCall } from "@kawase/integrations-app-kit";
import { LeafPlanRefused, buildSwapLeaves, encodeRedeemLeaves, encodeSelfBatch, isWalletSetUp, planSwapLeaves, readGrantNonce, type SwapLeafPlan } from "@kawase/integrations-delegation";
import { PERMIT2_ADDRESS } from "@kawase/wallet";
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
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import { CANONICAL_TOKENS, NETWORKS, normalizeSymbol, type NetworkContext, type NetworkId } from "@kawase/networks";
import { evaluateSwap, type PolicyResult, type SwapEvaluation, type SwapQuoteFacts, type TokenRuleFacts } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { simulate, type Simulation } from "../intents/simulate";
import { pausedAll } from "../safety/settings";
import type { BundlePart } from "../intents/bundle";
import { jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { tokenRulesOf } from "../tokens/rules";
import { chainNow, markLeafRequest, offerLeaves, storeLeafRequest, takeSignedLeaves, usdBaseUnits, type LeafBudget, type LeafResponse } from "../budget/leaf";
import { OpsAttempts } from "../intents/ops-attempts";
import type { OpsExecutor } from "../send/ops";
import type { SwapEngine } from "./engine";
import { createSwapVenues, isSwapVenue, SWAP_VENUE_NAMES, VenueRefused, type SwapVenue, type SwapVenues, type VenueFailure, type VenueQuote } from "./venues";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

/** As asked: "USDC"/"EURC" (older swaps), a verified symbol, or a lower-case token address; `venue` when the person picked one. */
type StoredSwapRequest = { tokenIn: string | null; tokenOut: string | null; amount: string | null; venue?: string | null };
type DraftPayload = { draft: StoredSwapDraft | null; view: SwapDraftView | null; venue?: SwapVenue };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };

const ZERO = 0n;
const ONE = 1n;
/** Arc USDC as the native coin has 18 decimals; its ERC-20 view has 6. */
const DECIMAL_BASE = 10n;
const NATIVE_USDC_EXTRA_DECIMALS = 12n;
const NATIVE_USDC_SCALE = DECIMAL_BASE ** NATIVE_USDC_EXTRA_DECIMALS;
const PERCENT = 100n;
const BPS = 10_000;
const RATE_DIGITS = 6;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 45;
const ERROR_MAX = 140;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

const DECIMAL = /^\d+(\.\d+)?$/;
const STABLE_KINDS = new Set(["dollar", "fiat"]);
const BLOCKING_STATES = ["executing", "completed", "unknown_outcome"] as const;
const MS_PER_DAY = 86_400_000;

/** A token as asked: an address, or a symbol on this network's verified list ("USDC", "EURC", "cirBTC"…). */
function resolveToken(network: NetworkContext, value: string | null): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (isAddress(text)) return text.toLowerCase();
  const symbol = normalizeSymbol(text);
  return CANONICAL_TOKENS[network.id].find((token) => normalizeSymbol(token.symbol) === symbol)?.address.toLowerCase();
}

/** "10.5" in a token's own decimals; more decimals than the token has is not an amount. */
function parseTokenAmount(text: string | null, decimals: number | undefined) {
  if (!text || !text.trim()) return { status: "missing" as const };
  const value = text.trim();
  if (!DECIMAL.test(value) || decimals === undefined || (value.split(".")[1]?.length ?? 0) > decimals) return { status: "invalid" as const };
  return { status: "ok" as const, baseUnits: parseUnits(value, decimals) };
}

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
  /** Tells the person a swap went through (push and its receipt by email); set after the inbox exists (app.ts). */
  private inbox?: InboxService;

  withInbox(inbox: InboxService) {
    this.inbox = inbox;
    return this;
  }
  private readonly venues: SwapVenues;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: SwapEngine,
    private readonly log: Logger,
    private readonly assets?: AssetService,
    /** Kawase's ops wallet (Circle), which redeems a swap's signed leaves inside the budget (D38). */
    private readonly ops?: OpsExecutor | undefined,
  ) {
    this.venues = createSwapVenues(engine);
    this.opsAttempts = ops ? new OpsAttempts(db, chains, ops, log, (intentId, attemptId, error) => this.settleFailed(intentId, attemptId, "not_sent", error)) : undefined;
  }

  private readonly opsAttempts: OpsAttempts | undefined;

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

  /** Everything the policy needs, fresh: both tokens, balances and the 7702 code, every venue's quote, prices, token rules. */
  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredSwapRequest, onlyVenue?: SwapVenue) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const view = await capabilityView(this.db, this.chains.available);
    const context = clients?.network;

    // The pair, completed from what was said: a buy pays with dollars, a sale is for dollars; on testnet, with
    // only USDC and EURC, naming one side names the other.
    let tokenIn = context ? resolveToken(context, request.tokenIn) : undefined;
    let tokenOut = context ? resolveToken(context, request.tokenOut) : undefined;
    if (context) {
      const usdc = context.addresses.usdc.toLowerCase();
      const pairOf = (side: string) => (side !== usdc ? usdc : network === "testnet" ? context.addresses.eurc.toLowerCase() : undefined);
      if (tokenOut && !tokenIn && !request.tokenIn) tokenIn = pairOf(tokenOut);
      if (tokenIn && !tokenOut && !request.tokenOut) tokenOut = pairOf(tokenIn);
    }
    const described = clients && this.assets ? await this.assets.directory.describe(network, clients.network.chainId, clients.client, [tokenIn, tokenOut].filter((token): token is string => Boolean(token))) : new Map<string, TokenView>();
    const viewIn = tokenIn ? described.get(tokenIn) : undefined;
    const viewOut = tokenOut ? described.get(tokenOut) : undefined;
    if (!viewIn) tokenIn = undefined;
    if (!viewOut) tokenOut = undefined;
    const amount = parseTokenAmount(request.amount, viewIn?.decimals);

    let balanceIn = ZERO;
    let usdcBalance = ZERO;
    let setUp = false;
    if (clients && wallet) {
      const balanceOf = (token: Address) => clients.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
      const [held, usdc, code] = await Promise.all([
        tokenIn ? balanceOf(tokenIn as Address) : Promise.resolve(ZERO),
        balanceOf(clients.network.addresses.usdc),
        clients.client.getCode({ address: wallet }),
      ]);
      balanceIn = held;
      usdcBalance = usdc;
      setUp = isWalletSetUp(code);
    }

    const limits = DEFAULT_LIMITS[network];
    const stablePair = Boolean(viewIn && viewOut && viewIn.status === "canonical" && viewOut.status === "canonical" && STABLE_KINDS.has(viewIn.kind) && STABLE_KINDS.has(viewOut.kind));
    const slippageBps = stablePair ? limits.maxSlippageStableBps : limits.maxSlippageOtherBps;
    let quote: SwapQuoteFacts = { status: "not_requested" };
    let marketRate: number | undefined;
    let valueUsd: number | null = null;
    let best: VenueQuote | undefined;
    let quotes: VenueQuote[] = [];
    let failures: VenueFailure[] = [];
    const canQuote = clients && wallet && viewIn && viewOut && tokenIn !== tokenOut && amount.status === "ok" && amount.baseUnits > ZERO;
    if (canQuote) {
      const [fanned, priced] = await Promise.all([
        this.venues.quoteAll({ network: clients.network, client: clients.client, from: wallet, tokenIn: viewIn.address as Address, tokenOut: viewOut.address as Address, amountIn: amount.baseUnits, decimalsIn: viewIn.decimals, decimalsOut: viewOut.decimals, slippageBps }, onlyVenue ? [onlyVenue] : undefined),
        this.assets ? this.assets.prices(network, [viewIn.address, viewOut.address]).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      quotes = fanned.quotes;
      failures = fanned.failures;
      // The venue the person picked, when it quoted; otherwise the most delivered.
      const picked = isSwapVenue(request.venue) ? quotes.find((entry) => entry.venue === request.venue) : undefined;
      best = picked ?? quotes[0];
      let priceIn = priced?.prices.get(viewIn.address.toLowerCase())?.priceUsd ?? null;
      let priceOut = priced?.prices.get(viewOut.address.toLowerCase())?.priceUsd ?? null;
      // Circle's own token rates when the market sources have no price (test networks, tokens they do not list).
      if (!priceIn || !priceOut) {
        const circle = await this.engine.prices(clients.network, [viewIn.address as Address, viewOut.address as Address]).catch(() => new Map<string, number>());
        priceIn ??= circle.get(viewIn.address.toLowerCase()) ?? null;
        priceOut ??= circle.get(viewOut.address.toLowerCase()) ?? null;
      }
      const inUnits = Number(formatUnits(amount.baseUnits, viewIn.decimals));
      if (priceIn) valueUsd = inUnits * priceIn;
      if (priceIn && priceOut) marketRate = priceIn / priceOut;
      if (best) {
        const outUnits = Number(formatUnits(best.estimatedOut, viewOut.decimals));
        // The price impact: what arrives against what leaves, both at market prices.
        const rateGapBps = priceIn && priceOut ? Math.round(((inUnits * priceIn - outUnits * priceOut) / (inUnits * priceIn)) * BPS) : undefined;
        quote = { status: "ok", estimatedOut: best.estimatedOut, minOut: best.minOut, slippageBps, rateGapBps };
      } else {
        this.log.warn({ intentId: intent.id, failures }, "no swap venue quoted");
        quote = { status: "unavailable" };
      }
    }

    // The token rules (D12) for what is bought: the person's own (Token rules screen), else the defaults.
    const rules = await tokenRulesOf(this.db, user.id, network);
    let tokenRules: TokenRuleFacts | undefined;
    if (viewOut && this.assets) {
      const safety = await this.assets.safety(network, viewOut).catch(() => undefined);
      const unverified = viewOut.status === "unverified" || viewOut.status === "lookalike";
      tokenRules = {
        safety: safety?.level ?? (viewOut.status === "impersonator" ? "block" : "ok"),
        reasons: safety?.reasons ?? [],
        unverified,
        tradeUsd: valueUsd,
        spentTodayUsd: unverified ? await this.unverifiedSpentToday(user.id, network, intent.id) : 0,
        perTradeUsd: rules.unverifiedPerTradeUsd,
        perDayUsd: rules.unverifiedPerDayUsd,
        access: rules.access,
      };
    }

    const evaluation = evaluateSwap({
      network,
      capability: { here: view.swap[network].state, other: view.swap[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: await pausedAll(this.db, user.id),
      wallet: { registered: Boolean(wallet), setUp, balanceIn, usdc: usdcBalance },
      tokenIn,
      tokenOut,
      symbolIn: viewIn?.symbol,
      decimalsIn: viewIn?.decimals,
      tokenInIsUsdc: Boolean(tokenIn && context && tokenIn === context.addresses.usdc.toLowerCase()),
      amount,
      quote,
      thresholds: stablePair
        ? { gasFloat: GAS_FLOAT_USDC_BASE_UNITS, maxRateGapBps: limits.maxRateGapBps, warnRateGapBps: limits.warnRateGapBps }
        : { gasFloat: GAS_FLOAT_USDC_BASE_UNITS, maxRateGapBps: rules.maxPriceImpactBps, warnRateGapBps: Math.min(TOKEN_RULES.warnPriceImpactBps, rules.maxPriceImpactBps) },
      tokenRules,
    });
    return { wallet, evaluation, quote, marketRate, amount, viewIn, viewOut, best, quotes, failures, valueUsd, unverifiedOut: tokenRules?.unverified ?? false };
  }

  /** US dollars bought today in tokens Kawase does not vouch for (the token rules' daily limit). */
  /** USD bought today in tokens Kawase does not vouch for (the token rules' daily cap), leaving out one intent. */
  async unverifiedSpentToday(userId: string, network: NetworkId, exclude: string): Promise<number> {
    const since = new Date(Date.now() - MS_PER_DAY);
    const rows = await this.db
      .select({ id: intents.id, payload: intentDrafts.payload })
      .from(intents)
      .innerJoin(intentDrafts, and(eq(intentDrafts.intentId, intents.id), eq(intentDrafts.version, intents.currentDraftVersion)))
      .where(and(eq(intents.userId, userId), eq(intents.network, network), eq(intents.kind, "swap"), inArray(intents.state, [...BLOCKING_STATES]), sql`${intents.createdAt} > ${since}`));
    return rows
      .filter((row) => row.id !== exclude)
      .map((row) => (row.payload as DraftPayload).view)
      .filter((draft) => draft?.unverifiedOut)
      .reduce((sum, draft) => sum + (draft?.valueUsd ?? 0), 0);
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredSwapRequest, createdBy: "user" | "agent" | "system") {
    const fresh = await this.evaluate(user, intent, request);
    const { wallet, evaluation, quote, marketRate, amount, viewIn, viewOut, best } = fresh;
    const clients = this.chains.get(intent.network);

    let draft: SwapDraft | null = null;
    let view: SwapDraftView | null = null;
    if (clients && wallet && viewIn && viewOut && best && quote.status === "ok" && amount.status === "ok") {
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const fee = ((gasEstimate(best.venue) * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      draft = {
        chainId: clients.network.chainId,
        from: wallet,
        tokenIn: viewIn.address as Address,
        tokenOut: viewOut.address as Address,
        amountIn: amount.baseUnits,
        minOut: quote.minOut,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const inUnits = Number(formatUnits(amount.baseUnits, viewIn.decimals));
      const outUnits = Number(formatUnits(quote.estimatedOut, viewOut.decimals));
      view = {
        tokenIn: viewIn.symbol,
        tokenOut: viewOut.symbol,
        amountIn: amount.baseUnits.toString(),
        estimatedOut: quote.estimatedOut.toString(),
        minOut: quote.minOut.toString(),
        slippageBps: quote.slippageBps,
        rate: (outUnits / inUnits).toPrecision(RATE_DIGITS),
        marketRate: marketRate ? marketRate.toPrecision(RATE_DIGITS) : null,
        rateGapBps: quote.rateGapBps ?? null,
        fees: { route: "0", network: feeInUsdc(fee).toString() },
        provider: SWAP_VENUE_NAMES[best.venue],
        quotedAt: new Date().toISOString(),
        tokens: { in: viewIn, out: viewOut },
        venue: best.venue,
        routes: routeViews(fresh.quotes, fresh.failures, best.venue),
        valueUsd: fresh.valueUsd,
        unverifiedOut: fresh.unverifiedOut,
      };
    }

    const payload: DraftPayload = { draft: draft ? storeSwapDraft(draft) : null, view, ...(best ? { venue: best.venue } : {}) };
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
      request: { tokenIn: request.tokenIn, tokenOut: request.tokenOut, amount: request.amount, ...(request.venue ? { venue: request.venue } : {}) },
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
    const fresh = await this.freshCalls(user, intentId, input.version);
    if (fresh.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (fresh.kind === "changed") return this.redraft(user, intentId);
    const { before, current, draft, calls, venue } = fresh;
    const { client } = this.clients(before.network);

    // Lower-case, as a parsed signed transaction reads it back (App Kit's calldata can carry upper-case hex).
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        // The node says these calls revert: never hand them out (10-25, two KyberSwap buys broadcast anyway and paid gas
        // for nothing). A node that only failed to answer keeps the venue's fixed estimate.
        if (executionReverted(error)) return "reverted" as const;
        this.log.warn({ err: error, intentId }, "swap gas estimate failed");
        return gasEstimate(venue);
      }),
    ]);
    if (estimate === "reverted") return this.routeFailed(user, intentId, venue, draft, "gas estimate reverted");
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

  /**
   * One version's part in a batch (intents/bundle.ts): the calls its approval would sign, re-checked the same way.
   * `changed` means the version was redrafted (the person reviews again); `final` means it can no longer go.
   */
  async bundlePart(user: SessionUser, intentId: string): Promise<BundlePart | "changed" | "final"> {
    const intent = await this.ownIntent(user.id, intentId);
    const fresh = await this.freshCalls(user, intentId, intent.currentDraftVersion);
    if (fresh.kind === "final") return "final";
    if (fresh.kind === "changed") {
      await this.redraft(user, intentId);
      return "changed";
    }
    const { before, current, draft, calls } = fresh;
    return {
      intentId,
      version: before.currentDraftVersion,
      draftHash: current.draftHash as Hex,
      from: draft.from,
      chainId: draft.chainId,
      calls: calls.map((call) => ({ to: call.to, data: call.data.toLowerCase() as Hex, value: call.value })),
      maxFee: draft.maxFee,
      attemptKind: "swap_wallet",
      attemptTo: draft.from,
    };
  }

  /**
   * The calls one version would sign, built on fresh facts (the same re-check an approval makes): the venue the
   * person saw recommended, still delivering at least the version's minimum. Shared by a lone approval and a batch.
   */
  private async freshCalls(user: SessionUser, intentId: string, version: number) {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { kind: "final" as const };
    if (version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { kind: "final" as const };

    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return { kind: "changed" as const };
    const draft = loadSwapDraft(stored);
    if (swapDraftHash(draft) !== current.draftHash) return { kind: "changed" as const };
    // The version's stop limit stands as long as the route still expects to deliver it; when the price has moved
    // below it, the person sees a new version with the new numbers.
    // Re-check everything on fresh facts, asking only the venue the person saw recommended.
    const venue = (current.payload as DraftPayload).venue ?? "app_kit";
    const fresh = await this.evaluate(user, before, before.request as StoredSwapRequest, venue);
    // No price for a moment is not a change: the person tries again, the version stands.
    if (fresh.quote.status === "unavailable") throw problem(HTTP.badGateway, "quote_unavailable");
    const still = fresh.quotes.find((entry) => entry.venue === venue);
    if (fresh.evaluation.blocking || !still || still.estimatedOut < draft.minOut || !fresh.viewIn || !fresh.viewOut) return { kind: "changed" as const };

    const { network, client } = this.clients(before.network);
    let calls: SwapCall[];
    try {
      const prepared = await this.venues.prepare(venue, {
        network,
        client,
        from: draft.from,
        tokenIn: draft.tokenIn,
        tokenOut: draft.tokenOut,
        amountIn: draft.amountIn,
        decimalsIn: fresh.viewIn.decimals,
        decimalsOut: fresh.viewOut.decimals,
        slippageBps: (fresh.quote.status === "ok" ? fresh.quote.slippageBps : DEFAULT_LIMITS[before.network].maxSlippageOtherBps) / SWAP_ROUTE_SLIPPAGE_DIVISOR,
        minOut: draft.minOut,
      });
      calls = prepared.calls;
    } catch (error) {
      // The price moved enough that the calls no longer guarantee what the person was shown: a new version.
      if (error instanceof VenueRefused && error.reason === "below_minimum") return { kind: "changed" as const };
      if (error instanceof VenueRefused) {
        this.log.error({ intentId, venue, reason: error.reason }, "security.swap_calls_refused");
        throw problem(HTTP.badGateway, "quote_unavailable", "the swap route returned calls Kawase does not accept");
      }
      // Not a new version: the price check above passed, so a new quote would most likely fail the same way.
      this.log.warn({ err: error, intentId, venue }, "swap prepare failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }

    return { kind: "calls" as const, before, current, draft, calls, venue };
  }

  /**
   * The rehearsal before the signature (Aomi's "SIMULATED ✓", Abu 10-16): the very calls Approve would send, run from
   * the person's own address on Arc's latest state, so the card can show what leaves and arrives and catch a revert
   * before anything is signed. Nothing is stored or sent.
   */
  async simulate(user: SessionUser, intentId: string, version: number): Promise<Simulation | { status: "changed"; reason?: "route_failed"; venue?: string }> {
    const fresh = await this.freshCalls(user, intentId, version);
    if (fresh.kind !== "calls") return { status: "changed" };
    const { before, draft, calls } = fresh;
    const view = (fresh.current.payload as DraftPayload).view;
    const tokens = view?.tokens ? [view.tokens.in, view.tokens.out].map((token) => ({ address: token.address, symbol: token.symbol, decimals: token.decimals })) : [];
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    const result = await simulate(before.network, draft.from, [{ from: draft.from, to: draft.from, data }], tokens);
    if (result.status !== "reverted") return result;
    // The route itself fails on Arc as it is now: the next best gets a new version, which the card simulates again.
    const next = await this.routeFailed(user, intentId, fresh.venue, draft, result.reason);
    return next.status === "changed" ? { status: "changed", reason: "route_failed", venue: fresh.venue } : result;
  }

  /**
   * The chosen venue's calls revert on Arc (its rehearsal or the node's gas estimate said so). The venue sits out this
   * pair's races for a while, a pick of it is dropped, and the swap gets a new version on the next best route.
   */
  private async routeFailed(user: SessionUser, intentId: string, venue: SwapVenue, draft: SwapDraft, why: string): Promise<SwapApproveResponse> {
    this.log.warn({ intentId, venue, why }, "swap route reverts, benched");
    this.venues.benchReverting(venue, { chainId: draft.chainId, tokenIn: draft.tokenIn, tokenOut: draft.tokenOut });
    await this.dropPick(intentId, venue);
    const answer = await this.redraft(user, intentId);
    return answer.status === "changed" ? { ...answer, reason: "route_failed" } : answer;
  }

  /** A person's pick of a venue that failed is forgotten, so the swap is not held to it once it races again. */
  private async dropPick(intentId: string, venue: SwapVenue) {
    const [row] = await this.db.select({ request: intents.request }).from(intents).where(eq(intents.id, intentId));
    const request = row?.request as StoredSwapRequest | undefined;
    if (request?.venue !== venue) return;
    await this.db.update(intents).set({ request: { ...request, venue: null } }).where(eq(intents.id, intentId));
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
      const checks = {
        signer: signer?.toLowerCase() === draft.from.toLowerCase(),
        chain: parsed.chainId === draft.chainId,
        to: parsed.to?.toLowerCase() === draft.from.toLowerCase(),
        data: parsed.data?.toLowerCase() === unsigned.data.toLowerCase(),
        value: (parsed.value ?? ZERO) === ZERO,
        nonce: parsed.nonce === unsigned.nonce,
        fee: (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee,
      };
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      const matches = failed.length === 0;
      if (!matches) {
        this.log.warn({ intentId, approvalId: approval.id, failed }, "security.draft_mismatch");
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

  // ── Inside the budget (D38): one-shot leaves, no Face ID ────────────────────────────────────────────────────

  /**
   * The same approval as `approve`, on the same fresh calls, but inside the person's budget: instead of a transaction
   * the phone signs two one-shot leaves (an exact approve, and the router call whose output must land in the wallet:
   * at least this version's `minOut`, spending at most `amountIn`), which Kawase's ops wallet redeems. Outside the
   * budget (none, paused, the venue or category off, over a cap, no dollar value) it says so and nothing is offered:
   * the phone takes the ordinary path.
   */
  async approveLeaf(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice" }, budget: LeafBudget): Promise<LeafResponse<SwapIntent>> {
    const fresh = await this.freshCalls(user, intentId, input.version);
    if (fresh.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (fresh.kind === "changed") return this.redraft(user, intentId) as Promise<LeafResponse<SwapIntent>>;
    const { before, current, draft, calls, venue } = fresh;
    const { network, client, ops } = this.clients(before.network);
    if (!this.ops) throw problem(HTTP.serviceUnavailable, "network_unavailable", "silent swaps are not available here");
    // Every venue's checked calls as leaves: exact approvals, the venue's own call pinned, the allowance back to zero
    // after. A shape the plan does not recognise is not silent: the person confirms the swap the ordinary way.
    let plan: SwapLeafPlan;
    try {
      plan = planSwapLeaves(calls, { tokenIn: draft.tokenIn, amountIn: draft.amountIn, permit2: PERMIT2_ADDRESS });
    } catch (error) {
      if (!(error instanceof LeafPlanRefused)) throw error;
      this.log.warn({ intentId, venue, reason: error.message }, "swap leaf plan refused");
      return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: "venue_off" };
    }
    const nativeIn = plan.swap.value !== ZERO;
    if (nativeIn && (draft.tokenIn.toLowerCase() !== network.addresses.usdc.toLowerCase() || plan.swap.value !== draft.amountIn * NATIVE_USDC_SCALE)) throw problem(HTTP.badGateway, "quote_unavailable", "the swap route carries native value");

    // A token Kawase does not vouch for is never silent (the token rules, D12): the person confirms it on the card.
    if ((current.payload as DraftPayload).view?.unverifiedOut) return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: "token_unvetted" };
    // The budget counts dollars: the draft's own dollar value, or the amount itself when it is USDC.
    const valueUsd = ((current.payload as DraftPayload).view?.valueUsd ?? null) as number | null;
    const amountUsd = valueUsd !== null ? usdBaseUnits(valueUsd) : draft.tokenIn.toLowerCase() === network.addresses.usdc.toLowerCase() ? draft.amountIn : undefined;
    if (amountUsd === undefined) return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: "unpriced" };
    const line = { category: "swap" as const, venue, amountUsd };
    const fits = await budget.allows(this.db, user.id, before.network, line);
    if (!fits.ok) return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: fits.reason };

    const [nonce, now] = await Promise.all([readGrantNonce(client, network, draft.from), chainNow(client)]);
    const leaves = buildSwapLeaves({ network, wallet: draft.from, ops: ops.address, tokenIn: draft.tokenIn, tokenOut: draft.tokenOut, amountIn: draft.amountIn, minOut: draft.minOut, plan, nonce, now });
    const approvalId = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return undefined;
      return storeLeafRequest(tx, { userId: user.id, intentId, network: intent.network, kind: "swap", draftVersion: intent.currentDraftVersion, draftHash: current.draftHash!, steps: leaves.steps, line, expiresAt: leaves.expiresAt });
    });
    if (!approvalId) return { status: "final", intent: await this.get(user.id, intentId) };
    return {
      status: "sign_leaf",
      intent: await this.view(user.id, intentId),
      approvalId,
      leaves: offerLeaves(network, leaves.steps),
      expiresAt: new Date(leaves.expiresAt * MS_PER_SECOND).toISOString(),
      budget: { category: "swap", venue, amountUsd: amountUsd.toString(), leftThisWeek: (fits.left).toString() },
    };
  }

  /**
   * The phone signed the leaves: each must be this wallet's signature over exactly the stored terms. The spend is
   * reserved against this week (re-checked under the budget lock), the ops wallet redeems both leaves in one
   * transaction, and the same receipt witness as a signed swap settles it.
   */
  async submitLeaf(user: SessionUser, intentId: string, input: { approvalId: string; signatures: Hex[] }, budget: LeafBudget): Promise<LeafResponse<SwapIntent>> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId) as Promise<LeafResponse<SwapIntent>>;
    const draft = loadSwapDraft(stored);
    const { network, ops } = this.clients(before.network);
    if (!this.opsAttempts) throw problem(HTTP.serviceUnavailable, "network_unavailable", "silent swaps are not available here");

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const { request, steps } = await takeSignedLeaves(tx, network, { approvalId: input.approvalId, intentId, kind: "swap", draftVersion: intent.currentDraftVersion, draftHash: current.draftHash!, wallet: draft.from, signatures: input.signatures });
      const fits = await budget.reserve(tx, user.id, intent.network, { category: "swap", venue: request.venue, amountUsd: request.amountUsd, intentId });
      if (!fits.ok) {
        await markLeafRequest(tx, request.id, "rejected");
        return { kind: "outside" as const, reason: fits.reason };
      }
      const call = encodeRedeemLeaves(network, steps);
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "swap_leaf",
          provider: "circle_dcw",
          idempotencyKey: randomUUID(),
          fromAddress: ops.address,
          toAddress: call.to,
          status: "prepared",
          receipt: { prepared: { to: call.to, data: call.data } },
        })
        .returning();
      await markLeafRequest(tx, request.id, "redeemed");
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "redeem" as const, attempt: attempt! };
    });
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (prepared.kind === "outside") return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: prepared.reason };
    await this.opsAttempts.submit(intentId, prepared.attempt);
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
      const latest = await this.latestAttempt(intentId);
      if (!latest) return false;
      // A leaf redeem (D38) goes out through Circle: its hash arrives once Circle has one.
      const hash = latest.provider === "circle_dcw" ? await this.opsAttempts?.hash(intentId, intent.network, latest) : (latest.txHash as Hex | null);
      if (!hash) return latest.provider === "circle_dcw" && (await this.latestAttempt(intentId))?.status === "not_sent";
      const attempt = { ...latest, txHash: hash };
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
    const payload = (await this.currentDraft(intent))?.payload as DraftPayload | undefined;
    const stored = payload?.draft;
    if (!stored) return;
    const draft = loadSwapDraft(stored);
    const moved = swapWitness(receipt, draft);
    const witnessed = receipt.status === "success" && moved.out === draft.amountIn && moved.in >= draft.minOut;
    if (receipt.status === "success" && !witnessed) this.log.error({ intentId: intent.id, tx: receipt.transactionHash }, "security.receipt_mismatch");
    if (!witnessed) {
      // A route that reverted on chain sits out this pair's races, so "Try again" goes by the next best.
      if (receipt.status !== "success" && payload?.venue) this.venues.benchReverting(payload.venue, { chainId: draft.chainId, tokenIn: draft.tokenIn, tokenOut: draft.tokenOut });
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
      // Its receipt (push, and the slip by email): what left, what came back and where it was swapped. A withdrawal's
      // own conversion is told once, by the withdrawal when it arrives.
      const view = payload?.view;
      if (!this.inbox || !view) return;
      const [withdrawal] = await tx
        .select({ id: withdrawals.id })
        .from(withdrawals)
        .where(sql`${withdrawals.steps} @> ${JSON.stringify([{ intentId: intent.id }])}::jsonb`)
        .limit(1);
      if (withdrawal) return;
      await this.inbox.add(tx, {
        userId: intent.userId,
        network: intent.network,
        kind: "swap_completed",
        params: {
          amountIn: view.amountIn,
          symbolIn: view.tokenIn,
          amount: moved.in.toString(),
          asset: view.tokenOut,
          ...(view.tokens ? { decimals: String(view.tokens.out.decimals), decimalsIn: String(view.tokens.in.decimals) } : {}),
          venue: view.provider,
        },
        intentId: intent.id,
        txHash: receipt.transactionHash,
        dedupeKey: `swap_completed:${intent.id}`,
      });
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
  const venue = patch.venue !== undefined ? patch.venue : (base.venue ?? null);
  return { tokenIn: pick("tokenIn"), tokenOut: pick("tokenOut"), amount: pick("amount")?.trim() || null, venue: isSwapVenue(venue) ? venue : null };
}

/** Arc's USDC: every movement, native or through the ERC-20, is also logged from this system address at 18 decimals. */
const ARC_NATIVE_LOGGER = "0xfffffffffffffffffffffffffffffffffffffffe";
const ARC_USDC = "0x3600000000000000000000000000000000000000";

/**
 * What the receipt's Transfer logs say moved: tokenIn out of the wallet, tokenOut into it. USDC on Arc can leave as
 * the native coin (Uniswap's router is paid that way), which only the system log records: for USDC the larger of
 * the ERC-20 log and the system log (rescaled to 6 decimals) counts, never their sum.
 */
function swapWitness(receipt: TransactionReceipt, draft: SwapDraft) {
  let out = ZERO;
  let into = ZERO;
  let nativeOut = ZERO;
  let nativeIn = ZERO;
  const wallet = draft.from.toLowerCase();
  const tokenIn = draft.tokenIn.toLowerCase();
  const tokenOut = draft.tokenOut.toLowerCase();
  const onArc = draft.chainId === NETWORKS.mainnet.chainId || draft.chainId === NETWORKS.testnet.chainId;
  for (const log of receipt.logs) {
    const token = log.address.toLowerCase();
    const system = onArc && token === ARC_NATIVE_LOGGER;
    if (token !== tokenIn && token !== tokenOut && !system) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName !== "Transfer") continue;
      if (system) {
        if (event.args.from.toLowerCase() === wallet) nativeOut += event.args.value;
        if (event.args.to.toLowerCase() === wallet) nativeIn += event.args.value;
        continue;
      }
      if (token === tokenIn && event.args.from.toLowerCase() === wallet) out += event.args.value;
      if (token === tokenOut && event.args.to.toLowerCase() === wallet) into += event.args.value;
    } catch {
      // Not an ERC-20 Transfer.
    }
  }
  const fromNative = (value: bigint) => rescale(value, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  if (onArc && tokenIn === ARC_USDC && fromNative(nativeOut) > out) out = fromNative(nativeOut);
  if (onArc && tokenOut === ARC_USDC && fromNative(nativeIn) > into) into = fromNative(nativeIn);
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

/** Gas for approve + swap before an estimate is possible: Circle's adapter is lighter than an aggregator route. */
const gasEstimate = (venue: SwapVenue) => (venue === "app_kit" ? SWAP_BATCH_GAS_ESTIMATE : AGGREGATOR_BATCH_GAS_ESTIMATE);

/** The node refused the calls because they revert (not because it failed to answer). */
const executionReverted = (error: unknown) => error instanceof BaseError && Boolean(error.walk((cause) => cause instanceof ExecutionRevertedError));

/**
 * Every venue asked: the chosen one (the person's pick, else the most delivered), the others that quoted, best first,
 * then those that could not (R3). Each carries the venue's own fee, so a pick is made knowing it.
 */
function routeViews(quotes: readonly VenueQuote[], failures: readonly VenueFailure[], chosen: SwapVenue): SwapRouteView[] {
  const best = quotes[0];
  const ordered = [...quotes.filter((entry) => entry.venue === chosen), ...quotes.filter((entry) => entry.venue !== chosen)];
  return [
    ...ordered.map((entry) => ({
      venue: entry.venue,
      label: SWAP_VENUE_NAMES[entry.venue],
      status: entry.venue === chosen ? ("chosen" as const) : ("quoted" as const),
      estimatedOut: entry.estimatedOut.toString(),
      minOut: entry.minOut.toString(),
      via: entry.via,
      feeUsd: entry.feeUsd,
      feeBps: entry.fee?.bps ?? null,
      fee: entry.fee?.amount !== null && entry.fee?.amount !== undefined ? entry.fee.amount.toString() : null,
      feeToken: entry.fee?.token ?? null,
      quoteId: entry.quoteId,
      reason: entry.venue === chosen ? (best && best.venue !== chosen ? "picked" : null) : "less_out",
    })),
    ...failures.flatMap((entry) => {
      const reason = shownReason(entry.reason);
      return reason === null ? [] : [{ venue: entry.venue, label: SWAP_VENUE_NAMES[entry.venue], status: "unavailable" as const, estimatedOut: null, minOut: null, via: [], feeUsd: null, feeBps: null, fee: null, feeToken: null, quoteId: null, reason }];
    }),
  ];
}

/**
 * A failure as the review shows it, in the reasons the ticket catalog words (not_on_network, no_route, timeout,
 * failed, rate_limited: "Busy right now"). A venue this server has no key for is not a fact the person needs, so it is
 * left out.
 */
function shownReason(reason: VenueFailure["reason"]): Exclude<VenueFailure["reason"], "needs_key"> | null {
  return reason === "needs_key" ? null : reason;
}
