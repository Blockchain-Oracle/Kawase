// Kawase Margin round trip on Arc mainnet state, simulated (no funds move): a fresh wallet with the 7702 DeleGator
// code and 20 USDC (state overrides) opens a $10 2× long on cirBTC and a $10 2× short on WETH as one batch each,
// with real KyberSwap router calldata and the real Aave V4 Main Spoke, then closes both; eth_simulateV1 runs the
// blocks in order and the Spoke's own reads say what happened. Run: tsx test/margin.sim.ts
import assert from "node:assert/strict";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { MARGIN } from "@kawase/config";
import { readMarket, spokeAbi, type AaveReserve } from "@kawase/integrations-aave-v4";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { AAVE_V4, DELEGATION_FRAMEWORK } from "@kawase/networks";

import { planClose, planOpen, type MarginSide, type Plan, type PlanLimits } from "../src/margin/plan";
import { kyberSwapper } from "../src/margin/swapper";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const TIMEOUT_MS = 60_000;
const NATIVE_DECIMALS = 18;
const FUNDING = parseUnits("20", NATIVE_DECIMALS);
const MARGIN_USDC = 10_000_000n;
const TWO_X = 20_000;
const FULL = 10_000;
const PRICE_DECIMALS = 8;
const HEALTH_DECIMALS = 18;
/** Base units the Spoke may round a supply down by when it reads it back through shares. */
const SHARE_ROUNDING = 10n;

const spoke = AAVE_V4.mainnet!.mainSpoke;
const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const limits: PlanLimits = { ...MARGIN, slippageBps: MARGIN.slippageBps };
const swapper = kyberSwapper({ chainId: arc.id, wallet, slippageBps: MARGIN.slippageBps, buildSlippageBps: MARGIN.buildSlippageBps, mode: "build" });

const market = await readMarket(client, spoke);
const bySymbol = (symbol: string) => market.reserves.find((reserve) => reserve.symbol === symbol)!;
const usdc = bySymbol("USDC");

type Call = { from?: Address; to: Address; data: Hex };
type CallResult = { status: string; returnData: Hex; error?: { message?: string } };
async function simulate(blocks: Call[][]): Promise<CallResult[][]> {
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: blocks.map((calls, index) => ({ ...(index === 0 ? { stateOverrides: { [wallet]: { balance: `0x${FUNDING.toString(16)}`, code: designator } } } : {}), calls })) }, "latest"] as never,
  })) as { calls: CallResult[] }[];
  return result.map((block) => block.calls);
}
const batch = (plan: Plan): Call => ({ from: wallet, to: wallet, data: encodeSelfBatch(plan.calls) });
const read = (functionName: "getUserSuppliedAssets" | "getUserTotalDebt", reserve: AaveReserve): Call => ({
  to: spoke,
  data: encodeFunctionData({ abi: spokeAbi, functionName, args: [BigInt(reserve.reserveId), wallet] }),
});
const health: Call = { to: spoke, data: encodeFunctionData({ abi: spokeAbi, functionName: "getUserAccountData", args: [wallet] }) };
const usdcBalance: Call = { to: usdc.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) };
const asBigint = (result: CallResult, functionName: "getUserSuppliedAssets" | "getUserTotalDebt") => decodeFunctionResult({ abi: spokeAbi, functionName, data: result.returnData }) as bigint;
const healthOf = (result: CallResult) => (decodeFunctionResult({ abi: spokeAbi, functionName: "getUserAccountData", data: result.returnData }) as { healthFactor: bigint }).healthFactor;

async function roundTrip(side: MarginSide, symbol: string) {
  const asset = bySymbol(symbol);
  const collateral = side === "long" ? asset : usdc;
  const debt = side === "long" ? usdc : asset;
  const open = await planOpen({ side, wallet, spoke, usdc, asset, margin: MARGIN_USDC, leverageBps: TWO_X, base: { weightedCollateral: 0n, debtValue: 0n }, collateralOn: false, limits }, swapper);
  console.log(`${side} ${symbol} 2×: ${open.calls.length} calls, ${open.loops} loops, borrow ${formatUnits(open.debtDelta, debt.decimals)} ${debt.symbol}, supply ≥ ${formatUnits(open.collateralDelta, collateral.decimals)} ${collateral.symbol}, health ${(open.healthAfterBps / FULL).toFixed(3)}, liquidation $${formatUnits(open.liquidationPrice ?? 0n, PRICE_DECIMALS)} (now $${formatUnits(asset.price, PRICE_DECIMALS)}) via ${open.venues.join(",")}`);

  const [afterOpen] = await simulate([[batch(open), read("getUserSuppliedAssets", collateral), read("getUserTotalDebt", debt), health]]);
  const [opened, supplied, owed, healthAfter] = afterOpen!;
  assert.equal(opened!.status, "0x1", `open reverted: ${opened!.error?.message ?? ""}`);
  const suppliedNow = asBigint(supplied!, "getUserSuppliedAssets");
  const owedNow = asBigint(owed!, "getUserTotalDebt");
  console.log(`  opened: supplied ${formatUnits(suppliedNow, collateral.decimals)} ${collateral.symbol}, owes ${formatUnits(owedNow, debt.decimals)} ${debt.symbol}, health ${formatUnits(healthOf(healthAfter!), HEALTH_DECIMALS)}`);
  // The Spoke reads supply back through shares, rounded against the holder by a few base units.
  assert.ok(suppliedNow + SHARE_ROUNDING >= open.collateralDelta && owedNow >= open.debtDelta);

  const close = await planClose({ side, wallet, spoke, usdc, asset, collateral: suppliedNow, debt: owedNow, fractionBps: FULL, base: { weightedCollateral: 0n, debtValue: 0n }, soleDebtor: true, limits }, swapper);
  console.log(`  close: ${close.calls.length} calls, ${close.loops} loops, repays ≥ ${formatUnits(close.debtDelta, debt.decimals)} ${debt.symbol}, returns ≥ ${formatUnits(close.returnedMin, usdc.decimals)} USDC`);
  const [, afterClose] = await simulate([[batch(open)], [batch(close), read("getUserTotalDebt", debt), read("getUserSuppliedAssets", collateral), usdcBalance]]);
  const [closed, debtLeft, collateralLeft, balance] = afterClose!;
  assert.equal(closed!.status, "0x1", `close reverted: ${closed!.error?.message ?? ""}`);
  const remainingDebt = asBigint(debtLeft!, "getUserTotalDebt");
  console.log(`  closed: debt left ${remainingDebt}, collateral left ${asBigint(collateralLeft!, "getUserSuppliedAssets")}, wallet USDC ${formatUnits(decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: balance!.returnData }), usdc.decimals)}`);
  assert.equal(remainingDebt, 0n);
}

await roundTrip("long", "cirBTC");
await roundTrip("short", "WETH");
console.log(`wallet ${wallet}: both round trips simulated on Arc mainnet state`);
