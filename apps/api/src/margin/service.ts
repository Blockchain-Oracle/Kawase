// Kawase Margin (trade.md "Long / short", X23): leveraged longs and shorts on the person's own Aave V4 account on
// Arc, opened and closed as one EIP-7702 batch they sign (slide to confirm), built like swaps.
//
// Markets come from the venue's live reserves (R1): every reserve but USDC is a market; a long needs the asset to
// count as collateral and USDC to be borrowable, a short needs the asset to be borrowable (USDC is the collateral).
// The leverage cap comes from the collateral factor and the opening floor (MARGIN in config).
//
// Drafting: resolve the market, side, margin and leverage (inferred where it can be: 2× when unsaid, capped), read
// the account, and plan the batch with quotes only; the version hashes what moves money (MarginDraft). Approving:
// plan again with KyberSwap calldata built and checked leg by leg, require the fresh plan to be at least as good as
// the version (else a new version), simulate the whole batch from the wallet (eth_call), and hand the wallet one
// transaction to itself. Tracking: done only when the receipt's Spoke events match the version; then the position
// row moves by exactly those amounts.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { erc20Abi, formatUnits, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex, type TransactionReceipt } from "viem";

import {
  APPROVAL_TTL_S,
  GAS_ESTIMATE_HEADROOM_PERCENT,
  GAS_FLOAT_USDC_BASE_UNITS,
  INTENT_TTL_S,
  MARGIN,
  MARGIN_MARKET_ALIASES,
  MARGIN_PROTECTION,
  MAX_FEE_DRAFT_MULTIPLIER,
  MS_PER_SECOND,
  SEND_UNKNOWN_AFTER_S,
} from "@kawase/config";
import type {
  MarginApproveResponse,
  MarginDraftView,
  MarginIntent,
  MarginMarketView,
  MarginMarketsView,
  MarginPositionView,
  MarginRequest,
  MarginSide,
  MarginUnavailable,
  UnsignedTransaction,
} from "@kawase/api-client";
import { approvals, intentDrafts, intents, marginPositions, newId, txAttempts, type Db } from "@kawase/db";
import { BPS, WAD, borrowApr, hasNoDebt, readAccount, readMarket, spokeMoves, valueOf, type AaveAccount, type AaveMarket, type AaveReserve } from "@kawase/integrations-aave-v4";
import { encodeRedeemProtect, encodeSelfBatch, isWalletSetUp, ProtectCapExceeded, shapeProtectiveClose, type ProtectGrants, type ProtectScope } from "@kawase/integrations-delegation";
import { DRAFTABLE_STATES, loadMarginDraft, marginDraftHash, storeMarginDraft, type IntentState, type MarginDraft, type StoredMarginDraft } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import { AAVE_V4, type NetworkContext, type NetworkId } from "@kawase/networks";
import { evaluateMargin, type MarginEvaluation, type MarginFacts, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import type { InboxService } from "../inbox/service";
import { OpsAttempts } from "../intents/ops-attempts";
import type { OpsExecutor } from "../send/ops";
import { HTTP, problem } from "../http/problem";
import { jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import { parseRequestAmount } from "../send/facts";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { PlanError, liquidationPrice, maxLeverageBps, planClose, planOpen, type AccountBase, type Plan, type PlanLimits } from "./plan";
import { kyberSwapper } from "./swapper";
import type { MarginProtection } from "./protection";
import { uniswapSwapper } from "./uniswap";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;
type PositionRow = typeof marginPositions.$inferSelect;

type StoredRequest = MarginIntent["request"];
type DraftPayload = { draft: StoredMarginDraft | null; view: MarginDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };

const VENUE = "Aave V4";
const PROVIDER = "Aave V4 · KyberSwap";
const PROTECT_PROVIDER = "Aave V4 · Uniswap v3";
const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const BPS_NUMBER = Number(BPS);
const DEFAULT_LEVERAGE_BPS = 20_000;
const FULL_BPS = BPS_NUMBER;
const OPEN = 0;
const CLOSE = 1;
const LONG = 0;
const SHORT = 1;
const PRICE_DECIMALS = 8;
const WAD_DECIMALS = 18;
const MARKETS_FRESH_MS = 15_000;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 60;
const ERROR_MAX = 140;
/** Supplies are read back through shares, rounded against the holder by a few base units. */
const SHARE_ROUNDING = 10n;
/** A swap router's own "less than the minimum" revert (KyberSwap; Uniswap). */
const SHORT_LEG = /Return amount is not enough|Too little received|INSUFFICIENT_OUTPUT/i;

const limits: PlanLimits = {
  loopHealthBps: MARGIN.loopHealthBps,
  minOpenHealthBps: MARGIN.minOpenHealthBps,
  maxLoops: MARGIN.maxLoops,
  dustValue: MARGIN.dustValue,
  repayBufferBps: MARGIN.repayBufferBps,
  slippageBps: MARGIN.slippageBps,
};

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const usd = (value: bigint) => Number(formatUnits(value, PRICE_DECIMALS));
const health = (bps: number) => (bps >= Number.MAX_SAFE_INTEGER ? null : bps / BPS_NUMBER);
const wadHealth = (account: AaveAccount) => (hasNoDebt(account) ? null : Number(formatUnits(account.healthFactor, WAD_DECIMALS)));
const lessDrift = (amount: bigint) => (amount * (BPS - BigInt(MARGIN.driftBps))) / BPS;

/** 18-decimal native fee → USDC base units, rounded up. */
const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(scaled, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

function restingState(evaluation: MarginEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

/** The account outside some amounts: what the Spoke counts, less this position's own collateral and debt. */
function baseOf(account: AaveAccount, without?: { collateral: AaveReserve; collateralAmount: bigint; debt: AaveReserve; debtAmount: bigint }): AccountBase {
  const weightedCollateral = (account.totalCollateralValue * account.avgCollateralFactor) / WAD;
  if (!without) return { weightedCollateral, debtValue: account.totalDebtValue };
  const own = (valueOf(without.collateralAmount, without.collateral.decimals, without.collateral.price) * BigInt(without.collateral.collateralFactorBps)) / BPS;
  const ownDebt = valueOf(without.debtAmount, without.debt.decimals, without.debt.price);
  return {
    weightedCollateral: weightedCollateral > own ? weightedCollateral - own : ZERO,
    debtValue: account.totalDebtValue > ownDebt ? account.totalDebtValue - ownDebt : ZERO,
  };
}

export class MarginService {
  private readonly tracking = new Set<string>();
  private readonly marketCache = new Map<NetworkId, { at: number; market: AaveMarket }>();

  /** Protective closes go out through the ops wallet (Circle), under the person's protection grants. */
  private readonly opsAttempts: OpsAttempts | undefined;
  /** Take-profit / stop-loss, attached by the app (the grants, the targets and the monitor live there). */
  protection: MarginProtection | undefined;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly log: Logger,
    ops?: OpsExecutor,
    private readonly inbox?: InboxService,
  ) {
    this.opsAttempts = ops ? new OpsAttempts(db, chains, ops, log, (intentId, attemptId, error) => this.settleFailed(intentId, attemptId, "not_sent", error)) : undefined;
  }

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── Markets ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async venue(network: NetworkId): Promise<AaveMarket | undefined> {
    const spoke = AAVE_V4[network]?.mainSpoke;
    const clients = this.chains.get(network);
    if (!spoke || !clients) return undefined;
    const hit = this.marketCache.get(network);
    if (hit && Date.now() - hit.at < MARKETS_FRESH_MS) return hit.market;
    const market = await readMarket(clients.client, spoke);
    this.marketCache.set(network, { at: Date.now(), market });
    return market;
  }

  /** The venue as read now (cached briefly), for the protection monitor. */
  venueFor(network: NetworkId) {
    return this.venue(network);
  }

  private usdcOf(network: NetworkContext, market: AaveMarket) {
    return market.reserves.find((reserve) => same(reserve.underlying, network.addresses.usdc));
  }

  private sideView(side: MarginSide, asset: AaveReserve, usdc: AaveReserve): MarginMarketView["long"] {
    const collateral = side === "long" ? asset : usdc;
    const debt = side === "long" ? usdc : asset;
    const reason: MarginUnavailable | null =
      collateral.paused || collateral.frozen || debt.paused || debt.frozen
        ? "paused"
        : collateral.collateralFactorBps === 0
          ? "no_collateral_factor"
          : !debt.borrowable
            ? "not_borrowable"
            : debt.liquidity === ZERO
              ? "no_liquidity"
              : null;
    const cap = reason ? 0 : maxLeverageBps(side, collateral.collateralFactorBps, MARGIN.minOpenHealthBps);
    return { available: !reason && cap > (side === "long" ? BPS_NUMBER : 0), reason, maxLeverage: Math.min(cap / BPS_NUMBER, MARGIN.maxLeverage) };
  }

  async markets(network: NetworkId): Promise<MarginMarketsView> {
    const shell = { network, venue: VENUE, minOpenHealth: MARGIN.minOpenHealthBps / BPS_NUMBER, leverageStep: MARGIN.leverageStep, presets: MARGIN.presets };
    const venue = await this.venue(network);
    const clients = this.chains.get(network);
    if (!venue || !clients) return { ...shell, available: false, reason: "mainnet_only", markets: [] };
    const usdc = this.usdcOf(clients.network, venue);
    if (!usdc) return { ...shell, available: false, reason: "not_borrowable", markets: [] };
    const markets = venue.reserves
      .filter((reserve) => reserve.reserveId !== usdc.reserveId)
      .map(
        (asset): MarginMarketView => ({
          market: asset.symbol,
          asset: asset.underlying,
          decimals: asset.decimals,
          price: asset.price.toString(),
          long: this.sideView("long", asset, usdc),
          short: this.sideView("short", asset, usdc),
          borrowAprUsdc: borrowApr(usdc),
          borrowAprAsset: borrowApr(asset),
          liquidity: asset.liquidity.toString(),
        }),
      );
    return { ...shell, available: true, reason: null, markets };
  }

  /** "btc", "Bitcoin", "cirBTC" → the venue's reserve; aliases are data (config), symbols come from the venue. */
  private findAsset(venue: AaveMarket, usdc: AaveReserve, name: string | null): AaveReserve | "unknown" | undefined {
    if (!name) return undefined;
    const wanted = name.trim().toLowerCase();
    const symbol = (MARGIN_MARKET_ALIASES as Record<string, string>)[wanted] ?? wanted;
    const found = venue.reserves.find((reserve) => reserve.reserveId !== usdc.reserveId && (reserve.symbol.toLowerCase() === symbol.toLowerCase() || same(reserve.underlying, wanted)));
    return found ?? "unknown";
  }

  // ── Positions ───────────────────────────────────────────────────────────────────────────────────────────────

  private async openRows(userId: string, network: NetworkId): Promise<PositionRow[]> {
    return this.db
      .select()
      .from(marginPositions)
      .where(and(eq(marginPositions.userId, userId), eq(marginPositions.network, network), eq(marginPositions.status, "open")));
  }

  /**
   * This position's live share of the account. The asset side is its own (only a long supplies the asset, only a
   * short borrows it); the USDC side is shared, so it gets its recorded share of what the account holds now.
   */
  private live(row: PositionRow, rows: PositionRow[], account: AaveAccount, asset: AaveReserve, usdc: AaveReserve) {
    const at = (reserve: AaveReserve) => account.reserves[reserve.reserveId]!;
    const share = (total: bigint, field: "collateral" | "debt", side: MarginSide) => {
      const recorded = rows.filter((other) => other.side === side).reduce((sum, other) => sum + other[field], ZERO);
      return recorded === ZERO ? ZERO : (total * row[field]) / recorded;
    };
    if (row.side === "long") return { collateral: at(asset).supplied, debt: share(at(usdc).debt, "debt", "long") };
    const collateral = share(at(usdc).supplied, "collateral", "short");
    return { collateral: collateral < row.collateral ? collateral : row.collateral, debt: at(asset).debt };
  }

  async positions(user: SessionUser): Promise<MarginPositionView[]> {
    const network = user.activeNetwork;
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const rows = await this.openRows(user.id, network);
    if (!wallet || rows.length === 0) return [];
    const venue = await this.venue(network);
    const clients = this.chains.get(network);
    if (!venue || !clients) return [];
    const usdc = this.usdcOf(clients.network, venue)!;
    const account = await readAccount(clients.client, venue.spoke, wallet, venue.reserves.length);
    return rows.flatMap((row) => {
      const asset = venue.reserves.find((reserve) => same(reserve.underlying, row.asset));
      return asset ? [this.positionView(row, rows, account, asset, usdc)] : [];
    });
  }

  private positionView(row: PositionRow, rows: PositionRow[], account: AaveAccount, asset: AaveReserve, usdc: AaveReserve): MarginPositionView {
    const side = row.side as MarginSide;
    const live = this.live(row, rows, account, asset, usdc);
    const collateralReserve = side === "long" ? asset : usdc;
    const debtReserve = side === "long" ? usdc : asset;
    const collateralUsd = usd(valueOf(live.collateral, collateralReserve.decimals, collateralReserve.price));
    const debtUsd = usd(valueOf(live.debt, debtReserve.decimals, debtReserve.price));
    const interestUsd = usd(valueOf(live.debt > row.debt ? live.debt - row.debt : ZERO, debtReserve.decimals, debtReserve.price));
    const equityUsd = collateralUsd - debtUsd;
    const notionalUsd = side === "long" ? collateralUsd : debtUsd;
    const marginUsd = usd(valueOf(row.margin, usdc.decimals, usdc.price));
    const returnedUsd = usd(valueOf(row.returned, usdc.decimals, usdc.price));
    const pnlUsd = equityUsd + returnedUsd - marginUsd;
    const base = baseOf(account, { collateral: collateralReserve, collateralAmount: live.collateral, debt: debtReserve, debtAmount: live.debt });
    const liquidation = liquidationPrice({ side, asset, usdc, collateral: live.collateral, debt: live.debt, base });
    const mark = usd(asset.price);
    return {
      id: row.id,
      network: row.network,
      market: row.market,
      asset: row.asset,
      side,
      status: row.status as MarginPositionView["status"],
      collateral: live.collateral.toString(),
      collateralDecimals: collateralReserve.decimals,
      debt: live.debt.toString(),
      debtDecimals: debtReserve.decimals,
      margin: row.margin.toString(),
      returned: row.returned.toString(),
      entryPrice: row.entryPrice.toString(),
      markPrice: asset.price.toString(),
      leverage: equityUsd > 0 ? notionalUsd / equityUsd : 0,
      notionalUsd,
      equityUsd,
      pnlUsd,
      pnlPercent: marginUsd > 0 ? pnlUsd / marginUsd : 0,
      pnlSplit: { price: pnlUsd + interestUsd, borrow: -interestUsd },
      health: wadHealth(account),
      liquidationPrice: liquidation?.toString() ?? null,
      liquidationDistance: liquidation && mark > 0 ? Math.abs(usd(liquidation) - mark) / mark : null,
      borrowApr: borrowApr(debtReserve) * (1 + account.riskPremiumBps / BPS_NUMBER),
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      takeProfit: row.takeProfit?.toString() ?? null,
      stopLoss: row.stopLoss?.toString() ?? null,
      protection: (row.protection as MarginPositionView["protection"]) ?? null,
    };
  }

  /**
   * One open position's close, read fresh: the venue, the live amounts it holds of the shared account, the account
   * outside it, and whether it is the only debtor of its debt asset (then a full close repays "all").
   */
  async closeContext(userId: string, network: NetworkId, positionId: string) {
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(userId))?.address as Address | undefined;
    const venue = await this.venue(network);
    if (!clients || !wallet || !venue) return undefined;
    const usdc = this.usdcOf(clients.network, venue);
    const rows = await this.openRows(userId, network);
    const row = rows.find((entry) => entry.id === positionId);
    const asset = row ? venue.reserves.find((reserve) => same(reserve.underlying, row.asset)) : undefined;
    if (!usdc || !row || !asset) return undefined;
    const side = row.side as MarginSide;
    const account = await readAccount(clients.client, venue.spoke, wallet, venue.reserves.length);
    const live = this.live(row, rows, account, asset, usdc);
    const collateral = side === "long" ? asset : usdc;
    const debt = side === "long" ? usdc : asset;
    const soleDebtor = !rows.some((other) => other.id !== row.id && (side === "long" ? other.side === "long" : same(other.asset, row.asset) && other.side === "short"));
    return { clients, wallet, venue, usdc, asset, side, row, rows, account, live, collateral, debt, soleDebtor, base: baseOf(account, { collateral, collateralAmount: live.collateral, debt, debtAmount: live.debt }) };
  }

  /**
   * A full close planned through the route protection can use (Uniswap v3, recipient the wallet): in the pool of `fee`
   * when the grants pin one, else the best tier now.
   */
  async planProtectiveClose(context: NonNullable<Awaited<ReturnType<MarginService["closeContext"]>>>, slippageBps: number, mode: "quote" | "build", fee?: number) {
    const { clients, wallet, venue, usdc, asset, side, live, base, soleDebtor } = context;
    return planClose(
      { side, wallet, spoke: venue.spoke, usdc, asset, collateral: live.collateral, debt: live.debt, fractionBps: FULL_BPS, base, soleDebtor, limits: { ...limits, slippageBps } },
      uniswapSwapper({ client: clients.client as never, wallet, slippageBps, mode, fee }),
    );
  }

  /**
   * Kawase closes a position for the person (take-profit or stop-loss): the close planned now in the pool the grants
   * pin, shaped as they allow (one capped approval each, back to zero at the end), every call under the grant that
   * covers it, simulated from the ops wallet, then recorded as an order of its own (origin "automation") and handed to
   * the ops wallet once. The receipt is witnessed exactly as for a close the person signs.
   */
  async protectiveClose(input: { userId: string; network: NetworkId; positionId: string; reason: "take_profit" | "stop_loss"; slippageBps: number; grants: ProtectGrants; scope: ProtectScope }): Promise<{ intentId: string } | { refused: string }> {
    const ops = this.chains.get(input.network)?.ops;
    if (!this.opsAttempts || !ops) return { refused: "no_ops_wallet" };
    const context = await this.closeContext(input.userId, input.network, input.positionId);
    if (!context) return { refused: "position_gone" };
    let plan: Plan;
    try {
      plan = await this.planProtectiveClose(context, input.slippageBps, "build", input.scope.fee);
    } catch (error) {
      this.log.warn({ err: error, positionId: input.positionId }, "protective close plan failed");
      return { refused: "no_route" };
    }
    let redeem: { to: Address; data: Hex };
    try {
      redeem = encodeRedeemProtect(context.clients.network, input.grants, input.scope, shapeProtectiveClose(input.scope, plan.calls));
    } catch (error) {
      // Grown past what the person let Kawase move: not a security event, they are asked again.
      if (error instanceof ProtectCapExceeded) {
        this.log.warn({ err: error, positionId: input.positionId }, "protective close over the grants' caps");
        return { refused: "grant_outgrown" };
      }
      this.log.error({ err: error, positionId: input.positionId }, "security.protect_call_refused");
      return { refused: "not_covered" };
    }
    try {
      await context.clients.client.call({ account: ops.address as Address, to: redeem.to, data: redeem.data });
    } catch (error) {
      this.log.warn({ err: error, positionId: input.positionId }, "protective close simulation reverted");
      return { refused: "simulation" };
    }
    const { venue, usdc, asset, side, row } = context;
    const collateralReserve = side === "long" ? asset : usdc;
    const debtReserve = side === "long" ? usdc : asset;
    const draft: MarginDraft = {
      chainId: context.clients.network.chainId,
      from: context.wallet,
      spoke: venue.spoke,
      action: CLOSE,
      side: side === "long" ? LONG : SHORT,
      collateralReserveId: plan.collateralReserveId,
      debtReserveId: plan.debtReserveId,
      margin: ZERO,
      debtDelta: plan.debtDelta,
      collateralDelta: plan.collateralDelta,
      returnedMin: plan.returnedMin,
      fractionBps: FULL_BPS,
      maxFee: ZERO,
    };
    const view: MarginDraftView = {
      action: "close",
      market: row.market,
      side,
      asset: asset.underlying,
      assetDecimals: asset.decimals,
      margin: "0",
      leverage: 0,
      notionalUsd: usd(valueOf(side === "long" ? plan.collateralDelta : plan.debtDelta, asset.decimals, asset.price)),
      size: "0",
      debtDelta: plan.debtDelta.toString(),
      debtAsset: debtReserve.symbol,
      debtDecimals: debtReserve.decimals,
      collateralDelta: plan.collateralDelta.toString(),
      collateralAsset: collateralReserve.symbol,
      collateralDecimals: collateralReserve.decimals,
      returnedMin: plan.returnedMin.toString(),
      healthAfter: health(plan.healthAfterBps),
      liquidationPrice: null,
      liquidationDistance: null,
      markPrice: asset.price.toString(),
      borrowApr: borrowApr(debtReserve),
      fraction: 1,
      loops: plan.loops,
      venues: plan.venues,
      fees: { network: "0" },
      provider: PROTECT_PROVIDER,
      quotedAt: new Date().toISOString(),
    };
    const request: StoredRequest = { action: "close", market: row.market, side, margin: null, leverage: null, positionId: row.id, fraction: 1 };
    const prepared = await this.db.transaction(async (tx) => {
      // One protective close per position at a time: the row says so while it is in flight.
      const [claimed] = await tx
        .update(marginPositions)
        .set({ protection: "closing" })
        .where(and(eq(marginPositions.id, row.id), eq(marginPositions.status, "open"), eq(marginPositions.protection, "armed")))
        .returning({ id: marginPositions.id });
      if (!claimed) return undefined;
      const [intent] = await tx
        .insert(intents)
        .values({ userId: input.userId, network: input.network, kind: "margin", originSurface: "automation", state: "executing", request, expiresAt: later(INTENT_TTL_S), currentDraftVersion: 1 })
        .returning();
      const payload: DraftPayload = { draft: storeMarginDraft(draft), view };
      await tx.insert(intentDrafts).values({ intentId: intent!.id, version: 1, payload: payload as unknown as Record<string, unknown>, draftHash: marginDraftHash(draft), policyReport: { results: [], blocking: null }, route: "automation", createdBy: "system" });
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: input.userId,
          intentId: intent!.id,
          network: input.network,
          chainId: context.clients.network.chainId,
          attemptNo: 1,
          kind: "margin_protect",
          provider: "circle_dcw",
          idempotencyKey: randomUUID(),
          fromAddress: ops.address,
          toAddress: redeem.to,
          status: "prepared",
          receipt: { prepared: { to: redeem.to, data: redeem.data }, reason: input.reason, positionId: row.id },
        })
        .returning();
      return { intentId: intent!.id, attempt: attempt! };
    });
    if (!prepared) return { refused: "already_closing" };
    await this.opsAttempts.submit(prepared.intentId, prepared.attempt);
    void this.follow(prepared.intentId);
    return { intentId: prepared.intentId };
  }

  /** How a protective close ended, told to the person (the inbox, then push and email as they chose). */
  private async tellProtective(intent: IntentRow, outcome: "closed" | "failed", returned: bigint | null) {
    if (intent.originSurface !== "automation" || !this.inbox) return;
    const request = intent.request as StoredRequest;
    const [attempt] = await this.db.select().from(txAttempts).where(eq(txAttempts.intentId, intent.id)).limit(1);
    const reason = (attempt?.receipt as { reason?: string } | null)?.reason ?? "stop_loss";
    if (outcome === "failed" && request.positionId) await this.db.update(marginPositions).set({ protection: "unavailable" }).where(and(eq(marginPositions.id, request.positionId), eq(marginPositions.protection, "closing")));
    await this.inbox.add(this.db, {
      userId: intent.userId,
      network: intent.network,
      kind: "position_closed",
      params: { market: request.market ?? "", side: request.side ?? "", reason, outcome, ...(returned !== null ? { asset: "USDC", amount: returned.toString() } : {}) },
      dedupeKey: `position_closed:${intent.id}`,
      intentId: intent.id,
    });
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: MarginRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise({ action: "open", market: null, side: null, margin: null, leverage: null, positionId: null, fraction: null }, request);
    const [row] = await this.db
      .insert(intents)
      .values({
        userId: user.id,
        threadId: origin.threadId ?? null,
        network: user.activeNetwork,
        kind: "margin",
        originSurface: origin.surface,
        state: "submitted",
        request: stored,
        expiresAt: later(INTENT_TTL_S),
      })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  async revise(user: SessionUser, intentId: string, patch: MarginRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  /** Everything the policy and the planner need, fresh; `mode` decides whether swap legs are only quoted or built. */
  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredRequest, mode: "quote" | "build") {
    const network = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const view = await capabilityView(this.db, this.chains.available);
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const venue = await this.venue(network).catch((error: unknown) => {
      this.log.warn({ err: error }, "margin market read failed");
      return undefined;
    });
    const usdc = clients && venue ? this.usdcOf(clients.network, venue) : undefined;

    let usdcBalance = ZERO;
    let setUp = false;
    let account: AaveAccount | undefined;
    if (clients && wallet) {
      const [balance, code] = await Promise.all([
        clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
        clients.client.getCode({ address: wallet }),
      ]);
      usdcBalance = balance;
      setUp = isWalletSetUp(code);
      if (venue) account = await readAccount(clients.client, venue.spoke, wallet, venue.reserves.length);
    }

    const found = venue && usdc ? this.findAsset(venue, usdc, request.market) : undefined;
    const asset = found && found !== "unknown" ? found : undefined;
    let position: PositionRow | undefined;
    let rows: PositionRow[] = [];
    if (request.action === "close") {
      rows = await this.openRows(user.id, network);
      position = request.positionId
        ? rows.find((row) => row.id === request.positionId)
        : rows.find((row) => (!asset || same(row.asset, asset.underlying)) && (!request.side || row.side === request.side));
    }
    const side: MarginSide | null = request.action === "close" ? ((position?.side as MarginSide | undefined) ?? request.side) : request.side;
    const closeAsset = position && venue ? venue.reserves.find((reserve) => same(reserve.underlying, position!.asset)) : undefined;
    const market = request.action === "close" ? closeAsset : asset;
    const sideView = market && usdc && side ? this.sideView(side, market, usdc) : undefined;
    const maxBps = sideView ? Math.min(Math.round(sideView.maxLeverage * BPS_NUMBER), maxLeverageBps(side!, (side === "long" ? market! : usdc!).collateralFactorBps, MARGIN.minOpenHealthBps)) : 0;
    const leverageBps = request.leverage ? Math.round(request.leverage * BPS_NUMBER) : null;
    const chosenLeverage = leverageBps ?? Math.min(DEFAULT_LEVERAGE_BPS, maxBps);
    const amount = parseRequestAmount(request.margin, "USDC");
    const fractionBps = Math.round(Math.min(Math.max(request.fraction ?? 1, 0), 1) * FULL_BPS);

    let plan: Plan | undefined;
    let planStatus: MarginFacts["plan"] = { status: "not_requested" };
    // Kawase's slippage for this order: the default, or wider after a simulation showed the legs falling short.
    const slippageBps = request.slippageBps ?? MARGIN.slippageBps;
    const orderLimits: PlanLimits = { ...limits, slippageBps };
    const swapper = clients && wallet ? kyberSwapper({ chainId: clients.network.chainId, wallet, slippageBps, buildSlippageBps: Math.round((slippageBps * MARGIN.buildSlippageBps) / MARGIN.slippageBps), mode }) : undefined;
    try {
      if (swapper && venue && usdc && market && side && account && wallet) {
        if (request.action === "open" && amount.status === "ok" && amount.baseUnits > ZERO && sideView?.available && chosenLeverage <= maxBps) {
          const collateral = side === "long" ? market : usdc;
          plan = await planOpen(
            { side, wallet, spoke: venue.spoke, usdc, asset: market, margin: amount.baseUnits, leverageBps: chosenLeverage, base: baseOf(account), collateralOn: account.reserves[collateral.reserveId]!.usingAsCollateral, limits: orderLimits },
            swapper,
          );
        }
        if (request.action === "close" && position) {
          const live = this.live(position, rows, account, market, usdc);
          const collateralReserve = side === "long" ? market : usdc;
          const debtReserve = side === "long" ? usdc : market;
          const soleDebtor = !rows.some((row) => row.id !== position!.id && (side === "long" ? row.side === "long" : same(row.asset, position!.asset) && row.side === "short"));
          plan = await planClose(
            {
              side,
              wallet,
              spoke: venue.spoke,
              usdc,
              asset: market,
              collateral: live.collateral,
              debt: live.debt,
              fractionBps,
              base: baseOf(account, { collateral: collateralReserve, collateralAmount: live.collateral, debt: debtReserve, debtAmount: live.debt }),
              soleDebtor,
              limits: orderLimits,
            },
            swapper,
          );
        }
      }
      if (plan) planStatus = { status: "ok", liquidationPrice: plan.liquidationPrice?.toString() ?? null };
    } catch (error) {
      if (error instanceof PlanError && error.code === "leverage_too_high") planStatus = { status: "too_high" };
      else {
        this.log.warn({ err: error, intentId: intent.id }, "margin plan failed");
        planStatus = { status: "unavailable" };
      }
    }

    const facts: MarginFacts = {
      network,
      capability: { here: view.margin[network].state, other: view.margin[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: false,
      wallet: { registered: Boolean(wallet), setUp, usdc: usdcBalance },
      action: request.action,
      market:
        request.action === "close"
          ? market
            ? { status: "found", symbol: market.symbol, side, sideAvailable: true, sideReason: null, maxLeverageBps: maxBps }
            : request.market || request.positionId
              ? { status: "found", symbol: request.market ?? "", side, sideAvailable: true, sideReason: null, maxLeverageBps: maxBps }
              : { status: "missing" }
          : !request.market
            ? { status: "missing" }
            : !asset
              ? { status: "unknown", name: request.market }
              : { status: "found", symbol: asset.symbol, side, sideAvailable: Boolean(sideView?.available), sideReason: sideView?.reason ?? (sideView ? "not_borrowable" : null), maxLeverageBps: maxBps },
      amount,
      leverageBps,
      position: request.action === "close" ? (position ? { status: "found" } : { status: "missing" }) : { status: "not_needed" },
      plan: planStatus,
      thresholds: { gasFloat: GAS_FLOAT_USDC_BASE_UNITS },
    };
    return { wallet, venue, usdc, market, side, plan, account, amount, chosenLeverage, fractionBps, position, evaluation: evaluateMargin(facts), clients };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const fresh = await this.evaluate(user, intent, request, "quote");
    const { wallet, venue, usdc, market, side, plan, amount, chosenLeverage, fractionBps, position, evaluation, clients } = fresh;
    let draft: MarginDraft | null = null;
    let view: MarginDraftView | null = null;
    if (wallet && venue && usdc && market && side && plan && clients) {
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const disables = await this.protectionDisables(user.id, intent.network, request.action, fractionBps, position);
      const gas = MARGIN.gasBase + MARGIN.gasPerLoop * BigInt(plan.loops + 1) + MARGIN_PROTECTION.disableGas * BigInt(disables.length);
      const fee = ((gas * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      const open = request.action === "open";
      const collateralReserve = side === "long" ? market : usdc;
      const debtReserve = side === "long" ? usdc : market;
      draft = {
        chainId: clients.network.chainId,
        from: wallet,
        spoke: venue.spoke,
        action: open ? OPEN : CLOSE,
        side: side === "long" ? LONG : SHORT,
        collateralReserveId: plan.collateralReserveId,
        debtReserveId: plan.debtReserveId,
        margin: open && amount.status === "ok" ? amount.baseUnits : ZERO,
        // Open borrows exactly this; a close repays at least this (interest only adds to it by approval time).
        debtDelta: plan.debtDelta,
        // Floors with room for the price to move between this quote and the approval's built calldata.
        collateralDelta: lessDrift(plan.collateralDelta),
        returnedMin: lessDrift(plan.returnedMin),
        fractionBps: open ? FULL_BPS : fractionBps,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const size = side === "long" ? (open ? plan.collateralDelta : ZERO) : open ? plan.debtDelta : ZERO;
      const notional = open
        ? side === "long"
          ? valueOf(plan.collateralDelta, market.decimals, market.price)
          : valueOf(plan.debtDelta, market.decimals, market.price)
        : side === "long"
          ? valueOf(plan.collateralDelta, market.decimals, market.price)
          : valueOf(plan.debtDelta, market.decimals, market.price);
      view = {
        action: request.action,
        market: market.symbol,
        side,
        asset: market.underlying,
        assetDecimals: market.decimals,
        margin: draft.margin.toString(),
        leverage: open ? chosenLeverage / BPS_NUMBER : 0,
        notionalUsd: usd(notional),
        size: size.toString(),
        debtDelta: plan.debtDelta.toString(),
        debtAsset: debtReserve.symbol,
        debtDecimals: debtReserve.decimals,
        collateralDelta: plan.collateralDelta.toString(),
        collateralAsset: collateralReserve.symbol,
        collateralDecimals: collateralReserve.decimals,
        returnedMin: plan.returnedMin.toString(),
        healthAfter: health(plan.healthAfterBps),
        liquidationPrice: plan.liquidationPrice?.toString() ?? null,
        liquidationDistance: plan.liquidationPrice ? Math.abs(usd(plan.liquidationPrice) - usd(market.price)) / usd(market.price) : null,
        markPrice: market.price.toString(),
        borrowApr: borrowApr(debtReserve),
        fraction: open ? 1 : fractionBps / FULL_BPS,
        loops: plan.loops,
        venues: plan.venues,
        fees: { network: feeInUsdc(fee).toString() },
        protectionOff: disables.length > 0,
        provider: PROVIDER,
        quotedAt: new Date().toISOString(),
      };
    }
    const payload: DraftPayload = { draft: draft ? storeMarginDraft(draft) : null, view };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = draft || evaluation.blocking ? restingState(evaluation) : "input_required";
    const nextRequest: StoredRequest = { ...request, positionId: position?.id ?? request.positionId };
    await this.db.transaction(async (tx) => {
      await tx
        .update(intentDrafts)
        .set({ voidedAt: new Date(), voidReason: "superseded" })
        .where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? marginDraftHash(draft) : null,
        policyReport: report as unknown as Record<string, unknown>,
        route: draft && !evaluation.blocking ? "wallet_signature" : null,
        createdBy,
      });
      await tx.update(intents).set({ state, currentDraftVersion: version, request: nextRequest }).where(eq(intents.id, intent.id));
    });
    return this.view(user.id, intent.id);
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async ownIntent(userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await this.db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "margin")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such order");
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

  async get(userId: string, intentId: string): Promise<MarginIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<MarginIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const explorer = this.chains.get(intent.network)?.network.viemChain.blockExplorers?.default.url;
    const request = intent.request as StoredRequest;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      version: intent.currentDraftVersion,
      request,
      draft: payload.view ?? null,
      results: report.results,
      blocking: report.blocking,
      positionId: (attempt?.receipt as { positionId?: string } | null)?.positionId ?? request.positionId ?? null,
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

  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice"; deviceId?: string | undefined }): Promise<MarginApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };

    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return this.redraft(user, intentId);
    const draft = loadMarginDraft(stored);
    if (marginDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);

    // The real calls: every swap leg built and checked, at today's prices.
    const fresh = await this.evaluate(user, before, before.request as StoredRequest, "build");
    if (fresh.evaluation.blocking?.code === "QUOTE_UNAVAILABLE") throw problem(HTTP.badGateway, "quote_unavailable");
    const plan = fresh.plan;
    if (fresh.evaluation.blocking || !plan) return this.redraft(user, intentId);
    // At least as good as the version the person saw; otherwise they see the new numbers first.
    const holds =
      plan.collateralReserveId === draft.collateralReserveId &&
      plan.debtReserveId === draft.debtReserveId &&
      (draft.action === OPEN
        ? plan.debtDelta === draft.debtDelta && plan.collateralDelta >= draft.collateralDelta
        : plan.debtDelta >= draft.debtDelta && plan.collateralDelta >= draft.collateralDelta && plan.returnedMin >= draft.returnedMin);
    if (!holds) return this.redraft(user, intentId);

    const { network, client } = this.clients(before.network);
    const disables = await this.protectionDisables(user.id, before.network, (before.request as StoredRequest).action, fresh.fractionBps, fresh.position);
    const data = encodeSelfBatch([...plan.calls, ...disables]).toLowerCase() as Hex;
    // The whole batch, run against the chain as it is now, from the wallet: a revert stops it here, not on chain.
    try {
      await client.call({ account: draft.from, to: draft.from, data });
    } catch (error) {
      this.log.warn({ err: error, intentId }, "margin batch simulation reverted");
      // A leg short of its minimum: the legs move the same pools one after another. Plan again with room for that,
      // and show the person the new (lower) numbers before anything is signed.
      const current = (before.request as StoredRequest).slippageBps ?? MARGIN.slippageBps;
      if (SHORT_LEG.test(String((error as Error).message ?? error)) && current < MARGIN.maxSlippageBps) {
        const widened: StoredRequest = { ...(before.request as StoredRequest), slippageBps: MARGIN.maxSlippageBps };
        await this.db.update(intents).set({ request: widened }).where(eq(intents.id, intentId));
        return this.redraft(user, intentId);
      }
      throw problem(HTTP.badGateway, "simulation_failed", "the order would not go through right now; nothing was sent");
    }
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        this.log.warn({ err: error, intentId }, "margin gas estimate failed");
        return MARGIN.gasBase + MARGIN.gasPerLoop * BigInt(plan.loops + 1) + MARGIN_PROTECTION.disableGas * BigInt(disables.length);
      }),
    ]);
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: network.chainId,
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

  /** A full close of a position that has take-profit/stop-loss grants: their on-chain disables, carried by the close's own batch. */
  private async protectionDisables(userId: string, network: NetworkId, action: StoredRequest["action"], fractionBps: number, position: PositionRow | undefined) {
    if (action !== "close" || fractionBps < FULL_BPS || !position || !this.protection) return [];
    return this.protection.disableCalls(userId, network, position.id);
  }

  private async redraft(user: SessionUser, intentId: string): Promise<MarginApproveResponse> {
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
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such order");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  /** The wallet signed: it must be the exact transaction handed out for this version, then it is broadcast. */
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<MarginApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadMarginDraft(stored);
    const context = this.clients(before.network);

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
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
      if (failed.length > 0) {
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
          kind: "margin_wallet",
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
      this.log.warn({ intentId, refused, message: message.slice(0, ERROR_MAX) }, "margin broadcast failed");
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
        this.log.warn({ intentId, err: error }, "margin track failed");
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
      if (!attempt) return false;
      // A protective close goes out through Circle: its hash comes from Circle once Circle has sent it.
      const hash = attempt.txHash ?? (attempt.provider === "circle_dcw" && this.opsAttempts ? await this.opsAttempts.hash(intentId, intent.network, attempt) : undefined);
      if (!hash) return false;
      await this.db.update(txAttempts).set({ lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));
      const receipt = await this.clients(intent.network).client.getTransactionReceipt({ hash: hash as Hex }).catch(() => undefined);
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

  /** Done only when the Spoke's own events in this receipt match the version; the position moves by exactly them. */
  private async settle(intent: IntentRow, attempt: AttemptRow, receipt: TransactionReceipt) {
    const current = await this.currentDraft(intent);
    const payload = current?.payload as DraftPayload | undefined;
    if (!payload?.draft || !payload.view) return;
    const draft = loadMarginDraft(payload.draft);
    const view = payload.view;
    const moves = spokeMoves(receipt.logs, draft.spoke, draft.from);
    const sum = (map: Map<number, bigint>, id: number) => map.get(id) ?? ZERO;
    const open = draft.action === OPEN;
    const borrowed = sum(moves.borrowed, draft.debtReserveId);
    const supplied = sum(moves.supplied, draft.collateralReserveId);
    const repaid = sum(moves.repaid, draft.debtReserveId);
    const withdrawn = sum(moves.withdrawn, draft.collateralReserveId);
    const witnessed =
      receipt.status === "success" &&
      (open ? borrowed === draft.debtDelta && supplied + SHARE_ROUNDING >= draft.collateralDelta : repaid >= draft.debtDelta && withdrawn >= draft.collateralDelta);
    if (receipt.status === "success" && !witnessed) this.log.error({ intentId: intent.id, tx: receipt.transactionHash }, "security.receipt_mismatch");
    if (!witnessed) {
      await this.settleFailed(intent.id, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null, receipt);
      return;
    }
    const request = intent.request as StoredRequest;
    const positionId = await this.db.transaction(async (tx) => {
      const [done] = await tx
        .update(intents)
        .set({ state: "completed", completedAt: new Date() })
        .where(and(eq(intents.id, intent.id), inArray(intents.state, ["executing", "unknown_outcome"])))
        .returning({ id: intents.id });
      if (!done) return null;
      const id = open
        ? await this.recordOpen(tx, intent, view, draft, { supplied, borrowed })
        : await this.recordClose(tx, request.positionId, draft, { withdrawn, repaid, returned: BigInt(view.returnedMin) });
      await tx
        .update(txAttempts)
        .set({ status: "confirmed", receipt: { positionId: id, supplied: supplied.toString(), borrowed: borrowed.toString(), repaid: repaid.toString(), withdrawn: withdrawn.toString(), chain: jsonSafe(receiptSummary(receipt)) } })
        .where(eq(txAttempts.id, attempt.id));
      return id;
    });
    if (!open) await this.tellProtective(intent, "closed", BigInt(view.returnedMin));
    // Closed for good: its protection grants are done (disabled in the person's own batch, or spent by Kawase's close).
    if (!open && positionId && draft.fractionBps >= FULL_BPS) await this.protection?.closed(intent.userId, intent.network, positionId, attempt).catch((error: unknown) => this.log.warn({ err: error, positionId }, "protection grants not set aside"));
    // Added to: past what its protection grants let Kawase move, the position stops being watched and asks again.
    if (open && positionId) await this.protection?.resized(intent.userId, intent.network, positionId).catch((error: unknown) => this.log.warn({ err: error, positionId }, "protection resize check failed"));
  }

  private async recordOpen(tx: Tx, intent: IntentRow, view: MarginDraftView, draft: MarginDraft, moved: { supplied: bigint; borrowed: bigint }) {
    const price = BigInt(view.markPrice);
    const size = view.side === "long" ? moved.supplied : moved.borrowed;
    const [existing] = await tx
      .select()
      .from(marginPositions)
      .where(and(eq(marginPositions.userId, intent.userId), eq(marginPositions.network, intent.network), eq(marginPositions.market, view.market), eq(marginPositions.side, view.side), eq(marginPositions.status, "open")))
      .for("update");
    if (existing) {
      const heldBefore = view.side === "long" ? existing.collateral : existing.debt;
      const entry = heldBefore + size === ZERO ? price : (existing.entryPrice * heldBefore + price * size) / (heldBefore + size);
      await tx
        .update(marginPositions)
        .set({ collateral: existing.collateral + moved.supplied, debt: existing.debt + moved.borrowed, margin: existing.margin + draft.margin, entryPrice: entry })
        .where(eq(marginPositions.id, existing.id));
      return existing.id;
    }
    const [row] = await tx
      .insert(marginPositions)
      .values({
        userId: intent.userId,
        network: intent.network,
        venue: VENUE,
        market: view.market,
        asset: view.asset,
        side: view.side,
        collateral: moved.supplied,
        debt: moved.borrowed,
        margin: draft.margin,
        entryPrice: price,
        openedAt: new Date(),
      })
      .returning({ id: marginPositions.id });
    return row!.id;
  }

  private async recordClose(tx: Tx, positionId: string | null, draft: MarginDraft, moved: { withdrawn: bigint; repaid: bigint; returned: bigint }) {
    if (!positionId) return null;
    const [row] = await tx.select().from(marginPositions).where(eq(marginPositions.id, positionId)).for("update");
    if (!row) return null;
    const full = draft.fractionBps >= FULL_BPS;
    const left = (held: bigint, out: bigint) => (full || out >= held ? ZERO : held - out);
    await tx
      .update(marginPositions)
      .set({
        collateral: left(row.collateral, moved.withdrawn),
        debt: left(row.debt, moved.repaid),
        returned: row.returned + moved.returned,
        ...(full ? { status: "closed", closedAt: new Date() } : {}),
      })
      .where(eq(marginPositions.id, positionId));
    return positionId;
  }

  private async settleFailed(intentId: string, attemptId: string, how: "not_sent" | "reverted" | "mismatch", error: string | null, receipt?: TransactionReceipt) {
    const failed = await this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(intents)
        .set({ state: "failed", completedAt: new Date() })
        .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome", "approved"])))
        .returning({ id: intents.id });
      if (!moved) return false;
      await tx
        .update(txAttempts)
        .set({
          status: how === "not_sent" ? "not_sent" : "reverted",
          errorCode: how === "mismatch" ? "receipt_mismatch" : error,
          ...(receipt ? { receipt: jsonSafe(receiptSummary(receipt)) } : {}),
        })
        .where(eq(txAttempts.id, attemptId));
      return true;
    });
    if (!failed) return;
    const [intent] = await this.db.select().from(intents).where(eq(intents.id, intentId));
    if (intent) await this.tellProtective(intent, "failed", null);
  }

  startSweeper(intervalMs: number) {
    const run = async () => {
      const open = await this.db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.kind, "margin"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "margin sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "margin sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

function normalise(base: StoredRequest, patch: MarginRequest): StoredRequest {
  const pick = <K extends keyof StoredRequest>(key: K): StoredRequest[K] => (patch[key as keyof MarginRequest] !== undefined ? (patch[key as keyof MarginRequest] as StoredRequest[K]) : base[key]);
  const margin = pick("margin");
  return {
    action: patch.action ?? base.action ?? "open",
    market: pick("market")?.trim() || null,
    side: pick("side") ?? null,
    margin: typeof margin === "string" ? margin.trim() || null : null,
    leverage: pick("leverage") ?? null,
    positionId: pick("positionId") ?? null,
    fraction: pick("fraction") ?? null,
    // Kawase's own, never the client's: kept across edits of the same order.
    slippageBps: base.slippageBps ?? null,
  };
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
