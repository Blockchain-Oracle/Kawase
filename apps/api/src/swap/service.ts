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
  SWAP_VENUE_LABELS,
  TOKEN_RULES,
  type SwapVenueId,
} from "@kawase/config";
import type { SwapApproveResponse, SwapDraftView, SwapIntent, SwapRequest, SwapRouteView, TokenView, UnsignedTransaction } from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import type { SwapCall } from "@kawase/integrations-app-kit";
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
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import { CANONICAL_TOKENS, normalizeSymbol, type NetworkContext, type NetworkId } from "@kawase/networks";
import { evaluateSwap, type PolicyResult, type SwapEvaluation, type SwapQuoteFacts, type TokenRuleFacts } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { SwapEngine } from "./engine";
import { createSwapVenues, VenueRefused, type SwapVenues, type VenueFailure, type VenueQuote } from "./venues";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

/** As asked: "USDC"/"EURC" (older swaps), a verified symbol, or a lower-case token address. */
type StoredSwapRequest = { tokenIn: string | null; tokenOut: string | null; amount: string | null };
type DraftPayload = { draft: StoredSwapDraft | null; view: SwapDraftView | null; venue?: SwapVenueId };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };

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
  private readonly venues: SwapVenues;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: SwapEngine,
    private readonly log: Logger,
    private readonly assets?: AssetService,
  ) {
    this.venues = createSwapVenues(engine);
  }

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
  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredSwapRequest, onlyVenue?: SwapVenueId) {
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
      best = quotes[0];
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

    // The token rules (D12) for what is bought.
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
        perTradeUsd: TOKEN_RULES.unverifiedPerTradeUsd,
        perDayUsd: TOKEN_RULES.unverifiedPerDayUsd,
      };
    }

    const evaluation = evaluateSwap({
      network,
      capability: { here: view.swap[network].state, other: view.swap[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: false,
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
        : { gasFloat: GAS_FLOAT_USDC_BASE_UNITS, maxRateGapBps: TOKEN_RULES.maxPriceImpactBps, warnRateGapBps: TOKEN_RULES.warnPriceImpactBps },
      tokenRules,
    });
    return { wallet, evaluation, quote, marketRate, amount, viewIn, viewOut, best, quotes, failures, valueUsd, unverifiedOut: tokenRules?.unverified ?? false };
  }

  /** US dollars bought today in tokens Kawase does not vouch for (the token rules' daily limit). */
  private async unverifiedSpentToday(userId: string, network: NetworkId, exclude: string): Promise<number> {
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
        provider: SWAP_VENUE_LABELS[best.venue],
        quotedAt: new Date().toISOString(),
        tokens: { in: viewIn, out: viewOut },
        venue: best.venue,
        routes: routeViews(fresh.quotes, fresh.failures),
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
    // Re-check everything on fresh facts, asking only the venue the person saw recommended.
    const venue = (current.payload as DraftPayload).venue ?? "app_kit";
    const fresh = await this.evaluate(user, before, before.request as StoredSwapRequest, venue);
    // No price for a moment is not a change: the person tries again, the version stands.
    if (fresh.quote.status === "unavailable") throw problem(HTTP.badGateway, "quote_unavailable");
    const still = fresh.quotes.find((entry) => entry.venue === venue);
    if (fresh.evaluation.blocking || !still || still.estimatedOut < draft.minOut || !fresh.viewIn || !fresh.viewOut) return this.redraft(user, intentId);

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
      if (error instanceof VenueRefused && error.reason === "below_minimum") return this.redraft(user, intentId);
      if (error instanceof VenueRefused) {
        this.log.error({ intentId, venue, reason: error.reason }, "security.swap_calls_refused");
        throw problem(HTTP.badGateway, "quote_unavailable", "the swap route returned calls Kawase does not accept");
      }
      // Not a new version: the price check above passed, so a new quote would most likely fail the same way.
      this.log.warn({ err: error, intentId, venue }, "swap prepare failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }

    // Lower-case, as a parsed signed transaction reads it back (App Kit's calldata can carry upper-case hex).
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        this.log.warn({ err: error, intentId }, "swap gas estimate failed");
        return gasEstimate(venue);
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

/** Gas for approve + swap before an estimate is possible: Circle's adapter is lighter than an aggregator route. */
const gasEstimate = (venue: SwapVenueId) => (venue === "app_kit" ? SWAP_BATCH_GAS_ESTIMATE : AGGREGATOR_BATCH_GAS_ESTIMATE);

/** Every venue asked, best first: the chosen one, the others that quoted, then those that could not (R3). */
function routeViews(quotes: readonly VenueQuote[], failures: readonly VenueFailure[]): SwapRouteView[] {
  return [
    ...quotes.map((entry, index) => ({
      venue: entry.venue,
      label: SWAP_VENUE_LABELS[entry.venue],
      status: index === 0 ? ("chosen" as const) : ("quoted" as const),
      estimatedOut: entry.estimatedOut.toString(),
      minOut: entry.minOut.toString(),
      via: entry.via,
      feeUsd: entry.feeUsd,
      reason: index === 0 ? null : "less_out",
    })),
    ...failures.map((entry) => ({ venue: entry.venue, label: SWAP_VENUE_LABELS[entry.venue], status: "unavailable" as const, estimatedOut: null, minOut: null, via: [], feeUsd: null, reason: entry.reason })),
  ];
}
