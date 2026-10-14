// Aero's Slipstream pools on Arc, read and spoken to directly: a pool's price and tick, a position's NFT, and the
// position manager's calls (mint, decrease, collect, burn) and Merkl's claim, encoded here so the service only plans.
// The math is the concentrated-liquidity formulas (Uniswap v3's, which Slipstream keeps): for liquidity L between
// √a and √b at √p, amount0 = L(√b − √p)/(√p·√b) and amount1 = L(√p − √a), in raw units. Floats are enough here:
// they size a split and set minimums a percent under, never an exact amount the chain checks.
import { encodeFunctionData, erc20Abi, maxUint128, parseAbi, type Address, type Hex, type PublicClient } from "viem";

import { AERO_LP } from "@kawase/config";

const TICK_BASE = 1.0001;
const BPS = 10_000;

export const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function tickSpacing() view returns (int24)",
]);

export const positionManagerAbi = parseAbi([
  "function mint((address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline, uint160 sqrtPriceX96)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) payable returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)",
  "function burn(uint256 tokenId) payable",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
]);

const distributorAbi = parseAbi(["function claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs)"]);

export type PoolState = { address: Address; token0: Address; token1: Address; tickSpacing: number; tick: number; sqrtPrice: number };
export type Call = { to: Address; data: Hex; value: bigint };

const NO_VALUE = 0n;
const NONE = 0n;
/** Slot0's √price is a Q64.96 fixed-point number. */
const Q96_BITS = 96;
const Q96 = Number(BigInt(1) << BigInt(Q96_BITS));

/** √price (raw token1 per raw token0) at a tick. */
export const sqrtAtTick = (tick: number) => Math.sqrt(TICK_BASE ** tick);

export async function readPool(client: PublicClient, address: Address): Promise<PoolState> {
  const [slot0, token0, token1, tickSpacing] = await Promise.all([
    client.readContract({ address, abi: poolAbi, functionName: "slot0" }),
    client.readContract({ address, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address, abi: poolAbi, functionName: "token1" }),
    client.readContract({ address, abi: poolAbi, functionName: "tickSpacing" }),
  ]);
  return { address, token0, token1, tickSpacing: Number(tickSpacing), tick: Number(slot0[1]), sqrtPrice: Number(slot0[0]) / Q96 };
}

/** The ticks `rangeBps` each side of the price now, on the pool's spacing, the price strictly inside. */
export function rangeAround(pool: Pick<PoolState, "tick" | "tickSpacing">, rangeBps: number) {
  const width = Math.log(1 + rangeBps / BPS) / Math.log(TICK_BASE);
  const spacing = pool.tickSpacing;
  let lower = Math.floor((pool.tick - width) / spacing) * spacing;
  let upper = Math.ceil((pool.tick + width) / spacing) * spacing;
  if (lower >= pool.tick) lower -= spacing;
  if (upper <= pool.tick) upper += spacing;
  return { tickLower: lower, tickUpper: upper };
}

/** Raw amounts a liquidity holds between two ticks at √p (both sides inside the range; one side outside it). */
export function amountsFor(liquidity: number, sqrtPrice: number, tickLower: number, tickUpper: number) {
  const a = sqrtAtTick(tickLower);
  const b = sqrtAtTick(tickUpper);
  const p = Math.min(Math.max(sqrtPrice, a), b);
  return { amount0: (liquidity * (b - p)) / (p * b), amount1: liquidity * (p - a) };
}

/** The share of a deposit's value that goes in as token0, at the price now, for a range around it. */
export function token0Share(sqrtPrice: number, tickLower: number, tickUpper: number) {
  const { amount0, amount1 } = amountsFor(1, sqrtPrice, tickLower, tickUpper);
  const value0 = amount0 * sqrtPrice * sqrtPrice;
  return value0 / (value0 + amount1);
}

/** What a mint of these amounts would actually put in at √p (the scarcer side sets the liquidity; the rest stays). */
export function usedFor(amount0: number, amount1: number, sqrtPrice: number, tickLower: number, tickUpper: number) {
  const a = sqrtAtTick(tickLower);
  const b = sqrtAtTick(tickUpper);
  const liquidity = Math.min((amount0 * sqrtPrice * b) / (b - sqrtPrice), amount1 / (sqrtPrice - a));
  return { liquidity, ...amountsFor(liquidity, sqrtPrice, tickLower, tickUpper) };
}

/** A float amount `slippageBps` under, as base units for a minimum the chain checks. */
export const minimum = (amount: number, slippageBps: number) => BigInt(Math.max(0, Math.floor((amount * (BPS - slippageBps)) / BPS)));

const approve = (token: Address, spender: Address, amount: bigint): Call => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: NO_VALUE });

/** Both sides approved to the position manager, the mint paid to the wallet, and the approvals back to zero. */
export function mintCalls(input: { pool: PoolState; wallet: Address; tickLower: number; tickUpper: number; desired0: bigint; desired1: bigint; min0: bigint; min1: bigint; deadline: number }): Call[] {
  const manager = AERO_LP.positionManager as Address;
  const { pool } = input;
  const mint = encodeFunctionData({
    abi: positionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0: pool.token0,
        token1: pool.token1,
        tickSpacing: pool.tickSpacing,
        tickLower: input.tickLower,
        tickUpper: input.tickUpper,
        amount0Desired: input.desired0,
        amount1Desired: input.desired1,
        amount0Min: input.min0,
        amount1Min: input.min1,
        recipient: input.wallet,
        deadline: BigInt(input.deadline),
        // The pool exists: no price to create it at.
        sqrtPriceX96: 0n,
      },
    ],
  });
  return [
    approve(pool.token0, manager, input.desired0),
    approve(pool.token1, manager, input.desired1),
    { to: manager, data: mint, value: NO_VALUE },
    approve(pool.token0, manager, NONE),
    approve(pool.token1, manager, NONE),
  ];
}

/** All of a position out to the wallet, its fees included, and the emptied NFT burnt. */
export function withdrawCalls(input: { tokenId: bigint; liquidity: bigint; wallet: Address; min0: bigint; min1: bigint; deadline: number }): Call[] {
  const manager = AERO_LP.positionManager as Address;
  return [
    { to: manager, data: encodeFunctionData({ abi: positionManagerAbi, functionName: "decreaseLiquidity", args: [{ tokenId: input.tokenId, liquidity: input.liquidity, amount0Min: input.min0, amount1Min: input.min1, deadline: BigInt(input.deadline) }] }), value: NO_VALUE },
    { to: manager, data: encodeFunctionData({ abi: positionManagerAbi, functionName: "collect", args: [{ tokenId: input.tokenId, recipient: input.wallet, amount0Max: maxUint128, amount1Max: maxUint128 }] }), value: NO_VALUE },
    { to: manager, data: encodeFunctionData({ abi: positionManagerAbi, functionName: "burn", args: [input.tokenId] }), value: NO_VALUE },
  ];
}

/** Merkl's claim for the wallet: each token's cumulative amount and its proof (the Distributor pays the difference). */
export function claimCall(wallet: Address, rewards: readonly { token: Address; amount: bigint; proofs: Hex[] }[]): Call {
  return {
    to: AERO_LP.merklDistributor as Address,
    data: encodeFunctionData({ abi: distributorAbi, functionName: "claim", args: [rewards.map(() => wallet), rewards.map((reward) => reward.token), rewards.map((reward) => reward.amount), rewards.map((reward) => reward.proofs)] }),
    value: NO_VALUE,
  };
}

/** A position's fees owed now: `collect` read from the owner (the manager pokes the pool first, so it is current). */
export async function feesOwed(client: PublicClient, wallet: Address, tokenId: bigint) {
  const { result } = await client.simulateContract({
    account: wallet,
    address: AERO_LP.positionManager as Address,
    abi: positionManagerAbi,
    functionName: "collect",
    args: [{ tokenId, recipient: wallet, amount0Max: maxUint128, amount1Max: maxUint128 }],
  });
  return { fee0: result[0], fee1: result[1] };
}
