// Kawase Margin's batch planner (trade.md "Long / short", X23): a leveraged long or short on Aave V4 built as one
// list of calls the wallet sends itself (EIP-7702), so it opens or closes all at once or not at all.
//
//   long X:  swap margin USDC → X, supply X as collateral, then loop { borrow USDC, swap → X, supply }
//   short X: supply margin USDC as collateral, then loop { borrow X, swap X → USDC, supply }
//   close:   loop { withdraw collateral, swap → the debt asset, repay } until the debt share is repaid, then take the
//            rest of the collateral out (as USDC for a long)
//
// There is no flash loan: each loop borrows only as far as the account's health stays above `loopHealth`, using the
// Spoke's oracle prices and each swap's on-chain minimum (what is supplied is the minimum the router guarantees, so
// the plan is conservative; anything above it stays in the wallet). Health = Σ(collateral value × factor) ÷ debt
// value, the Spoke's own formula. The swaps come from a `Swapper` (quotes only while drafting; checked router
// calldata while approving), so this module never talks to an api or a chain.
import { BPS, amountFor, approveCall, borrowCall, collateralCall, repayCall, supplyCall, valueOf, withdrawCall, type AaveReserve, type SpokeCall } from "@kawase/integrations-aave-v4";
import { maxUint256, type Address } from "viem";

export type MarginSide = "long" | "short";

/** One swap leg: what the route guarantees on chain and the calls that do it (empty while only drafting). */
export type SwapLeg = { amountOut: bigint; minOut: bigint; calls: SpokeCall[]; venues: string[] };
export type Swapper = (tokenIn: Address, tokenOut: Address, amountIn: bigint) => Promise<SwapLeg>;

/** The account outside this position, in USD (8 decimals): weighted collateral = Σ value × factor ÷ BPS. */
export type AccountBase = { weightedCollateral: bigint; debtValue: bigint };

export type PlanLimits = { loopHealthBps: number; minOpenHealthBps: number; maxLoops: number; dustValue: bigint; repayBufferBps: number; slippageBps: number };

export type OpenInput = {
  side: MarginSide;
  wallet: Address;
  spoke: Address;
  usdc: AaveReserve;
  /** The traded asset (cirBTC, WETH, EURC…). */
  asset: AaveReserve;
  /** USDC base units the wallet puts in. */
  margin: bigint;
  /** Notional ÷ margin, in basis points (20_000 = 2×). */
  leverageBps: number;
  base: AccountBase;
  /** Whether the collateral reserve is already switched on as collateral for this wallet. */
  collateralOn: boolean;
  limits: PlanLimits;
};

export type Plan = {
  calls: SpokeCall[];
  collateralReserveId: number;
  debtReserveId: number;
  /** Exactly what the batch borrows (open) or at least what it repays (close), in the debt asset's base units. */
  debtDelta: bigint;
  /** The least collateral supplied (open) or exactly what is withdrawn (close), in the collateral asset's units. */
  collateralDelta: bigint;
  /** Close: the least USDC that comes back to the wallet. */
  returnedMin: bigint;
  loops: number;
  /** The account's health after the batch at today's prices, bps (maxUint for no debt). */
  healthAfterBps: number;
  /** The traded asset's price at which this position alone would be liquidated (USD, 8 decimals), others unchanged. */
  liquidationPrice: bigint | null;
  venues: string[];
};

export class PlanError extends Error {
  constructor(readonly code: "leverage_too_high" | "not_borrowable" | "nothing_to_close" | "below_dust" | "loops_exhausted") {
    super(code);
    this.name = "PlanError";
  }
}

const ZERO = 0n;
const ONE_BPS = BPS;
const BPS_NUMBER = Number(BPS);
const NO_DEBT_BPS = Number.MAX_SAFE_INTEGER;
const weighted = (reserve: AaveReserve, amount: bigint) => (valueOf(amount, reserve.decimals, reserve.price) * BigInt(reserve.collateralFactorBps)) / ONE_BPS;
const value = (reserve: AaveReserve, amount: bigint) => valueOf(amount, reserve.decimals, reserve.price);
const healthBps = (weightedCollateral: bigint, debtValue: bigint) => (debtValue === ZERO ? NO_DEBT_BPS : Number((weightedCollateral * ONE_BPS) / debtValue));
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const unique = (names: string[]) => [...new Set(names)];

/**
 * Highest leverage (bps) the ticket offers for a side, from the live collateral factor and the opening floor:
 * long ≤ H ÷ (H − CF) (the asset is the collateral), short ≤ CF ÷ (H − CF) (USDC is the collateral).
 */
export function maxLeverageBps(side: MarginSide, collateralFactorBps: number, minOpenHealthBps: number): number {
  if (collateralFactorBps <= 0 || minOpenHealthBps <= collateralFactorBps) return 0;
  const gap = minOpenHealthBps - collateralFactorBps;
  return side === "long" ? Math.floor((minOpenHealthBps * BPS_NUMBER) / gap) : Math.floor((collateralFactorBps * BPS_NUMBER) / gap);
}

/** Liquidation price of the traded asset for one position, everything else in the account held still. */
export function liquidationPrice(input: {
  side: MarginSide;
  asset: AaveReserve;
  usdc: AaveReserve;
  /** Long: asset supplied; short: USDC supplied. */
  collateral: bigint;
  /** Long: USDC owed; short: asset owed. */
  debt: bigint;
  base: AccountBase;
}): bigint | null {
  const { side, asset, usdc, collateral, debt, base } = input;
  const scale = amountFor(asset.price, asset.decimals, asset.price);
  if (side === "long") {
    // W_o + C·P·cf = D_o + D  →  P = (D_o + D − W_o) ÷ (C·cf)
    const shortfall = base.debtValue + value(usdc, debt) - base.weightedCollateral;
    if (shortfall <= ZERO || collateral === ZERO || asset.collateralFactorBps === 0) return null;
    return (shortfall * ONE_BPS * scale) / (collateral * BigInt(asset.collateralFactorBps));
  }
  // W_o + U·cf_u = D_o + B·P  →  P = (W_o + U·cf_u − D_o) ÷ B
  const room = base.weightedCollateral + weighted(usdc, collateral) - base.debtValue;
  if (debt === ZERO || room <= ZERO) return null;
  return (room * scale) / debt;
}

/** Open (or add to) a long or a short: the calls, and what they will do at worst. */
export async function planOpen(input: OpenInput, swap: Swapper): Promise<Plan> {
  const { side, wallet, spoke, usdc, asset, margin, leverageBps, base, limits } = input;
  const collateral = side === "long" ? asset : usdc;
  const debtReserve = side === "long" ? usdc : asset;
  if (!debtReserve.borrowable || debtReserve.paused || debtReserve.frozen || collateral.paused || collateral.frozen) throw new PlanError("not_borrowable");
  const cap = maxLeverageBps(side, collateral.collateralFactorBps, limits.minOpenHealthBps);
  if (leverageBps > cap || (side === "long" && leverageBps < BPS_NUMBER)) throw new PlanError("leverage_too_high");
  if (value(usdc, margin) < limits.dustValue) throw new PlanError("below_dust");

  const calls: SpokeCall[] = [];
  const venues: string[] = [];
  // Margin in: a long buys the asset with it first; a short supplies it as it is.
  const first = side === "long" ? await swap(usdc.underlying, asset.underlying, margin) : undefined;
  if (first) {
    calls.push(...first.calls);
    venues.push(...first.venues);
  }
  let supplied = first ? first.minOut : margin;
  calls.push(approveCall(collateral.underlying, spoke, supplied), supplyCall(spoke, collateral.reserveId, supplied, wallet));
  if (!input.collateralOn) calls.push(collateralCall(spoke, collateral.reserveId, true, wallet));

  // What to borrow in total: a long owes margin × (L − 1) in USDC; a short owes margin × L worth of the asset.
  const targetDebt =
    side === "long"
      ? (margin * (BigInt(leverageBps) - ONE_BPS)) / ONE_BPS
      : amountFor((value(usdc, margin) * BigInt(leverageBps)) / ONE_BPS, asset.decimals, asset.price);
  let borrowed = ZERO;
  let collateralWeighted = base.weightedCollateral + weighted(collateral, supplied);
  let loops = 0;
  while (borrowed < targetDebt) {
    if (loops >= limits.maxLoops) throw new PlanError("loops_exhausted");
    const debtValue = base.debtValue + value(debtReserve, borrowed);
    const roomValue = (collateralWeighted * ONE_BPS) / BigInt(limits.loopHealthBps) - debtValue;
    const room = amountFor(roomValue > ZERO ? roomValue : ZERO, debtReserve.decimals, debtReserve.price);
    const step = min(targetDebt - borrowed, room);
    if (value(debtReserve, step) < limits.dustValue) {
      // What is left is too small to be worth a loop: the position opens a hair under the asked leverage.
      if (borrowed > ZERO && value(debtReserve, targetDebt - borrowed) < limits.dustValue) break;
      throw new PlanError("leverage_too_high");
    }
    calls.push(borrowCall(spoke, debtReserve.reserveId, step, wallet));
    const leg = await swap(debtReserve.underlying, collateral.underlying, step);
    calls.push(...leg.calls, approveCall(collateral.underlying, spoke, leg.minOut), supplyCall(spoke, collateral.reserveId, leg.minOut, wallet));
    venues.push(...leg.venues);
    borrowed += step;
    supplied += leg.minOut;
    collateralWeighted += weighted(collateral, leg.minOut);
    loops++;
  }
  const debtValueAfter = base.debtValue + value(debtReserve, borrowed);
  const healthAfterBps = healthBps(collateralWeighted, debtValueAfter);
  if (healthAfterBps < limits.minOpenHealthBps) throw new PlanError("leverage_too_high");
  return {
    calls,
    collateralReserveId: collateral.reserveId,
    debtReserveId: debtReserve.reserveId,
    debtDelta: borrowed,
    collateralDelta: supplied,
    returnedMin: ZERO,
    loops,
    healthAfterBps,
    liquidationPrice: liquidationPrice({ side, asset, usdc, collateral: supplied, debt: borrowed, base }),
    venues: unique(venues),
  };
}

export type CloseInput = {
  side: MarginSide;
  wallet: Address;
  spoke: Address;
  usdc: AaveReserve;
  asset: AaveReserve;
  /** This position's share of the account: collateral supplied and debt owed, live, base units. */
  collateral: bigint;
  debt: bigint;
  /** Basis points of the position to close (10_000 = all). */
  fractionBps: number;
  /** The account outside this position. */
  base: AccountBase;
  /** No other position owes this debt asset, so a full close may repay "everything" and leave no dust. */
  soleDebtor: boolean;
  limits: PlanLimits;
};

/** Close part or all of a position: withdraw collateral as health allows, swap it to the debt asset, repay; repeat. */
export async function planClose(input: CloseInput, swap: Swapper): Promise<Plan> {
  const { side, wallet, spoke, usdc, asset, base, limits } = input;
  const collateral = side === "long" ? asset : usdc;
  const debtReserve = side === "long" ? usdc : asset;
  const full = input.fractionBps >= BPS_NUMBER;
  const toRepay = full ? input.debt : (input.debt * BigInt(input.fractionBps)) / ONE_BPS;
  const toWithdraw = full ? input.collateral : (input.collateral * BigInt(input.fractionBps)) / ONE_BPS;
  if (toWithdraw === ZERO && toRepay === ZERO) throw new PlanError("nothing_to_close");

  const calls: SpokeCall[] = [];
  const venues: string[] = [];
  let repaid = ZERO;
  let withdrawn = ZERO;
  let returned = ZERO;
  let collateralWeighted = base.weightedCollateral + weighted(collateral, input.collateral);
  let debtValue = base.debtValue + value(debtReserve, input.debt);
  let loops = 0;
  const buffer = (amount: bigint) => amount + (amount * BigInt(limits.repayBufferBps)) / ONE_BPS;

  while (repaid < toRepay) {
    if (loops >= limits.maxLoops) throw new PlanError("loops_exhausted");
    const remaining = toRepay - repaid;
    const lastDebt = full && input.soleDebtor;
    // The collateral health allows out: keep Σ(value × factor) ≥ loopHealth × debt.
    const spareWeighted = collateralWeighted - (debtValue * BigInt(limits.loopHealthBps)) / ONE_BPS;
    const spare = spareWeighted > ZERO ? amountFor((spareWeighted * ONE_BPS) / BigInt(collateral.collateralFactorBps), collateral.decimals, collateral.price) : ZERO;
    // How much collateral buys what is left to repay (plus the buffer when repaying it all, plus slippage).
    const needValue = (value(debtReserve, lastDebt ? buffer(remaining) : remaining) * (ONE_BPS + BigInt(limits.slippageBps))) / ONE_BPS;
    const need = amountFor(needValue, collateral.decimals, collateral.price);
    const take = min(min(need, spare), toWithdraw - withdrawn);
    if (value(collateral, take) < limits.dustValue) throw new PlanError("loops_exhausted");
    calls.push(withdrawCall(spoke, collateral.reserveId, take, wallet));
    const leg = await swap(collateral.underlying, debtReserve.underlying, take);
    calls.push(...leg.calls);
    venues.push(...leg.venues);
    withdrawn += take;
    collateralWeighted -= weighted(collateral, take);
    if (lastDebt && leg.minOut >= buffer(remaining)) {
      // Everything owed, interest to the block included: the Spoke takes what is due and no more.
      calls.push(approveCall(debtReserve.underlying, spoke, buffer(remaining)), repayCall(spoke, debtReserve.reserveId, maxUint256, wallet), approveCall(debtReserve.underlying, spoke, ZERO));
      // A long's change is USDC and comes back; a short's is a sliver of the asset, left in the wallet.
      if (side === "long") returned += leg.minOut - buffer(remaining);
      repaid = toRepay;
    } else {
      const pay = min(leg.minOut, remaining);
      calls.push(approveCall(debtReserve.underlying, spoke, pay), repayCall(spoke, debtReserve.reserveId, pay, wallet));
      if (side === "long") returned += leg.minOut - pay;
      repaid += pay;
    }
    debtValue = base.debtValue + value(debtReserve, input.debt - min(repaid, input.debt));
    loops++;
  }
  // The rest of the collateral share comes out: a long sells it back to USDC; a short's is USDC already.
  const rest = toWithdraw - withdrawn;
  if (rest > ZERO) {
    calls.push(withdrawCall(spoke, collateral.reserveId, rest, wallet));
    withdrawn += rest;
    collateralWeighted -= weighted(collateral, rest);
    if (side === "long") {
      const leg = await swap(asset.underlying, usdc.underlying, rest);
      calls.push(...leg.calls);
      venues.push(...leg.venues);
      returned += leg.minOut;
    } else returned += rest;
  }
  const healthAfterBps = healthBps(collateralWeighted, debtValue);
  if (debtValue > ZERO && healthAfterBps < limits.loopHealthBps) throw new PlanError("loops_exhausted");
  const left = { collateral: input.collateral - withdrawn, debt: input.debt - min(repaid, input.debt) };
  return {
    calls,
    collateralReserveId: collateral.reserveId,
    debtReserveId: debtReserve.reserveId,
    debtDelta: repaid,
    collateralDelta: withdrawn,
    returnedMin: returned,
    loops,
    healthAfterBps,
    liquidationPrice: left.debt > ZERO ? liquidationPrice({ side, asset, usdc, collateral: left.collateral, debt: left.debt, base }) : null,
    venues: unique(venues),
  };
}
