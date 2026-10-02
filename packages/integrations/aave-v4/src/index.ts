// Aave V4 on Arc, read and called directly (not through the shallow ERC-4626 tokenization spokes; gaps.md G22).
// A Spoke holds each wallet's account: supplied assets (optionally used as collateral) and debt, per reserve. Health
// = Σ(collateral value × collateral factor) / debt value; below 1 the account can be liquidated. Prices come from
// the Spoke's oracle with 8 decimals (USD). Every write is `fn(reserveId, amount, onBehalfOf)` from the wallet itself
// (the Spoke pulls with `transferFrom`, so an approval to the Spoke comes first), which is why a whole position can
// be opened or closed as one EIP-7702 batch. Generic: product rules (leverage caps, health floors) live in the caller.
import { decodeEventLog, encodeFunctionData, erc20Abi, maxUint256, type Address, type Hex, type Log, type PublicClient } from "viem";

import { hubAbi, oracleAbi, spokeAbi, symbolAbi } from "./abi";

export { hubAbi, oracleAbi, spokeAbi } from "./abi";

/** The Spoke's oracle answers in USD with 8 decimals (SpokeUtils.ORACLE_DECIMALS). */
export const ORACLE_DECIMALS = 8;
/** 1e18 and 1e27, the fixed-point scales Aave uses for health (WAD) and rates (RAY). */
export const WAD = 1_000_000_000_000_000_000n;
export const RAY = 1_000_000_000_000_000_000_000_000_000n;
export const BPS = 10_000n;
const TEN = 10n;
const ZERO = 0n;
const NO_DEBT_HEALTH = maxUint256;

/** A flat multicall answer, `count` equal groups of consecutive results. */
function groups<T>(results: readonly T[], count: number): T[][] {
  const size = count === 0 ? 0 : results.length / count;
  return Array.from({ length: count }, (_, index) => results.slice(index * size, (index + 1) * size));
}

export type AaveReserve = {
  reserveId: number;
  underlying: Address;
  symbol: string;
  decimals: number;
  hub: Address;
  assetId: number;
  /** Basis points of value that count toward borrowing (0 = cannot be collateral). */
  collateralFactorBps: number;
  liquidationFeeBps: number;
  maxLiquidationBonusBps: number;
  borrowable: boolean;
  paused: boolean;
  frozen: boolean;
  /** USD, 8 decimals. */
  price: bigint;
  /** On this Spoke, base units. */
  supplied: bigint;
  debt: bigint;
  /** What the hub can still lend now (all spokes share it), base units. */
  liquidity: bigint;
  /** Yearly drawn rate, RAY; a borrower pays this plus their risk premium on it. */
  drawnRateRay: bigint;
  /** Share of interest kept by the protocol, basis points. */
  liquidityFeeBps: number;
  /** The hub's whole book for the asset (all spokes), for utilisation. */
  hubAdded: bigint;
  hubOwed: bigint;
};

export type AaveMarket = { spoke: Address; oracle: Address; targetHealthFactor: bigint; reserves: AaveReserve[] };

/** Every reserve on a Spoke, with its configuration, price, size, liquidity and rate, read in two multicalls. */
export async function readMarket(client: PublicClient, spoke: Address): Promise<AaveMarket> {
  const [count, oracle, liquidation] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: spoke, abi: spokeAbi, functionName: "getReserveCount" },
      { address: spoke, abi: spokeAbi, functionName: "ORACLE" },
      { address: spoke, abi: spokeAbi, functionName: "getLiquidationConfig" },
    ],
  });
  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index));
  const base = await client.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => [
      { address: spoke, abi: spokeAbi, functionName: "getReserve", args: [id] } as const,
      { address: spoke, abi: spokeAbi, functionName: "getReserveConfig", args: [id] } as const,
      { address: spoke, abi: spokeAbi, functionName: "getReserveSuppliedAssets", args: [id] } as const,
      { address: spoke, abi: spokeAbi, functionName: "getReserveTotalDebt", args: [id] } as const,
      { address: oracle, abi: oracleAbi, functionName: "getReservePrice", args: [id] } as const,
    ]),
  });
  const rows = groups(base, ids.length).map(([reserve, config, supplied, debt, price]) => ({
    reserve: reserve as { underlying: Address; hub: Address; assetId: number; decimals: number; dynamicConfigKey: number },
    config: config as { paused: boolean; frozen: boolean; borrowable: boolean },
    supplied: supplied as bigint,
    debt: debt as bigint,
    price: price as bigint,
  }));
  const extra = await client.multicall({
    allowFailure: false,
    contracts: rows.flatMap((row, index) => [
      { address: spoke, abi: spokeAbi, functionName: "getDynamicReserveConfig", args: [ids[index]!, row.reserve.dynamicConfigKey] } as const,
      { address: row.reserve.underlying, abi: symbolAbi, functionName: "symbol" } as const,
      { address: row.reserve.hub, abi: hubAbi, functionName: "getAssetLiquidity", args: [BigInt(row.reserve.assetId)] } as const,
      { address: row.reserve.hub, abi: hubAbi, functionName: "getAssetDrawnRate", args: [BigInt(row.reserve.assetId)] } as const,
      { address: row.reserve.hub, abi: hubAbi, functionName: "getAssetConfig", args: [BigInt(row.reserve.assetId)] } as const,
      { address: row.reserve.hub, abi: hubAbi, functionName: "getAddedAssets", args: [BigInt(row.reserve.assetId)] } as const,
      { address: row.reserve.hub, abi: hubAbi, functionName: "getAssetTotalOwed", args: [BigInt(row.reserve.assetId)] } as const,
    ]),
  });
  const reserves = groups(extra, rows.length).map(([dynamicConfig, symbol, liquidity, drawnRate, hubConfig, added, owed], index): AaveReserve => {
    const row = rows[index]!;
    const dynamic = dynamicConfig as { collateralFactor: number; maxLiquidationBonus: number; liquidationFee: number };
    const assetConfig = hubConfig as { liquidityFee: number };
    return {
      reserveId: index,
      underlying: row.reserve.underlying,
      symbol: symbol as string,
      decimals: row.reserve.decimals,
      hub: row.reserve.hub,
      assetId: row.reserve.assetId,
      collateralFactorBps: dynamic.collateralFactor,
      liquidationFeeBps: dynamic.liquidationFee,
      maxLiquidationBonusBps: dynamic.maxLiquidationBonus,
      borrowable: row.config.borrowable,
      paused: row.config.paused,
      frozen: row.config.frozen,
      price: row.price,
      supplied: row.supplied,
      debt: row.debt,
      liquidity: liquidity as bigint,
      drawnRateRay: drawnRate as bigint,
      liquidityFeeBps: assetConfig.liquidityFee,
      hubAdded: added as bigint,
      hubOwed: owed as bigint,
    };
  });
  return { spoke, oracle, targetHealthFactor: liquidation.targetHealthFactor, reserves };
}

/** Yearly borrow rate as a fraction (0.021 = 2.1%), before the borrower's risk premium. */
export const borrowApr = (reserve: Pick<AaveReserve, "drawnRateRay">) => Number((reserve.drawnRateRay * BPS) / RAY) / Number(BPS);

/** Yearly supply rate as a fraction: what borrowers pay, spread over what is supplied, less the protocol's share. */
export function supplyApr(reserve: Pick<AaveReserve, "drawnRateRay" | "hubAdded" | "hubOwed" | "liquidityFeeBps">): number {
  if (reserve.hubAdded === ZERO) return 0;
  const utilisation = Number((reserve.hubOwed * BPS) / reserve.hubAdded) / Number(BPS);
  return borrowApr(reserve) * utilisation * (1 - reserve.liquidityFeeBps / Number(BPS));
}

/** USD value (8 decimals) of `amount` base units at `price`. */
export const valueOf = (amount: bigint, decimals: number, price: bigint) => (amount * price) / TEN ** BigInt(decimals);
/** Base units worth `value` (USD, 8 decimals) at `price`, rounded down. */
export const amountFor = (value: bigint, decimals: number, price: bigint) => (price === ZERO ? ZERO : (value * TEN ** BigInt(decimals)) / price);

export type AccountReserve = { reserveId: number; supplied: bigint; debt: bigint; usingAsCollateral: boolean; borrowing: boolean };

export type AaveAccount = {
  reserves: AccountReserve[];
  /** WAD; `maxUint256` with no debt. */
  healthFactor: bigint;
  /** USD, 8 decimals. */
  totalCollateralValue: bigint;
  totalDebtValue: bigint;
  /** WAD, the collateral-weighted average factor. */
  avgCollateralFactor: bigint;
  /** Basis points added to the drawn rate on this account's debt. */
  riskPremiumBps: number;
};

/** A wallet's account on a Spoke: per reserve what it supplied and owes, and the Spoke's own health figures. */
export async function readAccount(client: PublicClient, spoke: Address, user: Address, reserveCount: number): Promise<AaveAccount> {
  const ids = Array.from({ length: reserveCount }, (_, index) => BigInt(index));
  const [data, results] = await Promise.all([
    client.readContract({ address: spoke, abi: spokeAbi, functionName: "getUserAccountData", args: [user] }),
    client.multicall({
      allowFailure: false,
      contracts: ids.flatMap((id) => [
        { address: spoke, abi: spokeAbi, functionName: "getUserSuppliedAssets", args: [id, user] } as const,
        { address: spoke, abi: spokeAbi, functionName: "getUserTotalDebt", args: [id, user] } as const,
        { address: spoke, abi: spokeAbi, functionName: "getUserReserveStatus", args: [id, user] } as const,
      ]),
    }),
  ]);
  const reserves = groups(results, ids.length).map(([supplied, debt, status], index): AccountReserve => {
    const [usingAsCollateral, borrowing] = status as readonly [boolean, boolean];
    return { reserveId: index, supplied: supplied as bigint, debt: debt as bigint, usingAsCollateral, borrowing };
  });
  return {
    reserves,
    healthFactor: data.healthFactor,
    // The Spoke reports both in the oracle's 8-decimal USD scaled by WAD (debt by WAD and RAY): a $47,263 collateral
    // reads 4.7263e30 (checked against a live account 10-02, where Σ value × factor ÷ debt equals its healthFactor).
    totalCollateralValue: data.totalCollateralValue / WAD,
    totalDebtValue: data.totalDebtValueRay / RAY / WAD,
    avgCollateralFactor: data.avgCollateralFactor,
    riskPremiumBps: Number(data.riskPremium),
  };
}

export const hasNoDebt = (account: Pick<AaveAccount, "healthFactor">) => account.healthFactor === NO_DEBT_HEALTH;

// ── Calls (each `{ to, data }` from the wallet itself) ──────────────────────────────────────────────────────────

export type SpokeCall = { to: Address; data: Hex; value: bigint };
const NO_VALUE = 0n;
const call = (to: Address, data: Hex): SpokeCall => ({ to, data, value: NO_VALUE });

export const approveCall = (token: Address, spender: Address, amount: bigint) => call(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
export const supplyCall = (spoke: Address, reserveId: number, amount: bigint, onBehalfOf: Address) =>
  call(spoke, encodeFunctionData({ abi: spokeAbi, functionName: "supply", args: [BigInt(reserveId), amount, onBehalfOf] }));
/** `maxUint256` withdraws everything supplied (the Spoke takes the smaller of the two). */
export const withdrawCall = (spoke: Address, reserveId: number, amount: bigint, onBehalfOf: Address) =>
  call(spoke, encodeFunctionData({ abi: spokeAbi, functionName: "withdraw", args: [BigInt(reserveId), amount, onBehalfOf] }));
export const borrowCall = (spoke: Address, reserveId: number, amount: bigint, onBehalfOf: Address) =>
  call(spoke, encodeFunctionData({ abi: spokeAbi, functionName: "borrow", args: [BigInt(reserveId), amount, onBehalfOf] }));
/** `maxUint256` repays the whole debt at execution time (the approval must cover it). */
export const repayCall = (spoke: Address, reserveId: number, amount: bigint, onBehalfOf: Address) =>
  call(spoke, encodeFunctionData({ abi: spokeAbi, functionName: "repay", args: [BigInt(reserveId), amount, onBehalfOf] }));
export const collateralCall = (spoke: Address, reserveId: number, on: boolean, onBehalfOf: Address) =>
  call(spoke, encodeFunctionData({ abi: spokeAbi, functionName: "setUsingAsCollateral", args: [BigInt(reserveId), on, onBehalfOf] }));

// ── Receipts ────────────────────────────────────────────────────────────────────────────────────────────────

export type SpokeMoves = {
  /** Per reserve id, base units, for `user` only. */
  supplied: Map<number, bigint>;
  withdrawn: Map<number, bigint>;
  borrowed: Map<number, bigint>;
  repaid: Map<number, bigint>;
};

/** What a receipt says the Spoke did for `user`: its own events, nothing inferred. */
export function spokeMoves(logs: readonly Log[], spoke: Address, user: Address): SpokeMoves {
  const moves: SpokeMoves = { supplied: new Map(), withdrawn: new Map(), borrowed: new Map(), repaid: new Map() };
  const add = (map: Map<number, bigint>, id: bigint, amount: bigint) => map.set(Number(id), (map.get(Number(id)) ?? ZERO) + amount);
  for (const log of logs) {
    if (log.address.toLowerCase() !== spoke.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: spokeAbi, data: log.data, topics: log.topics });
      const args = event.args as { reserveId?: bigint; user?: Address };
      if (!args.user || args.user.toLowerCase() !== user.toLowerCase() || args.reserveId === undefined) continue;
      if (event.eventName === "Supply") add(moves.supplied, args.reserveId, event.args.suppliedAmount);
      if (event.eventName === "Withdraw") add(moves.withdrawn, args.reserveId, event.args.withdrawnAmount);
      if (event.eventName === "Borrow") add(moves.borrowed, args.reserveId, event.args.drawnAmount);
      if (event.eventName === "Repay") add(moves.repaid, args.reserveId, event.args.totalAmountRepaid);
    } catch {
      // Another event of the Spoke.
    }
  }
  return moves;
}
