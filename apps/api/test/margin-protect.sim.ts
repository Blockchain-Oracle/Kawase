// Margin protection on Arc mainnet state, simulated (no funds move): a fresh wallet (7702 DeleGator code, 20 USDC by
// state override) opens a $10 2× long on cirBTC and a $10 2× short on EURC as it would itself (KyberSwap + Aave V4),
// signs the five protection grants once, and then a different address standing in for Kawase's ops wallet closes
// each position under those grants alone: DelegationManager.redeemDelegations over the close plan, its swaps through
// Uniswap v3 with the wallet as the pinned recipient. The chain must also refuse the same close with one swap's
// recipient changed to a stranger, and the encoder refuses a call no grant covers. Run: tsx test/margin-protect.sim.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { concat, createPublicClient, decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, http, pad, parseUnits, slice, size, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { MARGIN, MARGIN_PROTECTION } from "@kawase/config";
import { readMarket, spokeAbi, type AaveReserve } from "@kawase/integrations-aave-v4";
import { buildProtectGrants, encodeRedeemProtect, encodeSelfBatch, grantTypedData, PROTECT_PURPOSES, ProtectCallRefused, withSignature, type ProtectGrants } from "@kawase/integrations-delegation";
import { AAVE_V4, DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";

import { planClose, planOpen, type MarginSide, type Plan, type PlanLimits } from "../src/margin/plan";
import { kyberSwapper } from "../src/margin/swapper";
import { uniswapSwapper } from "../src/margin/uniswap";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const TIMEOUT_MS = 60_000;
const FUNDING = parseUnits("20", 18);
const MARGIN_USDC = 10_000_000n;
const TWO_X = 20_000;
const FULL = 10_000;
const SALT_BYTES = 32;
const HOUR_S = 3_600;
const WORD = 32;
const SELECTOR = 4;
const RECIPIENT_WORD = 3;
const OPEN_SLIPPAGE_BPS = 400;

const network = getNetwork("mainnet");
const spoke = AAVE_V4.mainnet!.mainSpoke;
const router = MARGIN_PROTECTION.uniswap.router as Address;
const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address;
const ops = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const limits: PlanLimits = { ...MARGIN, slippageBps: MARGIN.slippageBps };
const market = await readMarket(client, spoke);
const bySymbol = (symbol: string) => market.reserves.find((reserve) => reserve.symbol === symbol)!;
const usdc = bySymbol("USDC");
const terms = { spoke, router, tokens: market.reserves.map((reserve) => reserve.underlying) };

// The person signs the five grants once.
const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
const unsigned = buildProtectGrants({ network, wallet, redeemer: ops, ...terms, expiresAt: Math.floor(Date.now() / 1000) + HOUR_S, salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose) => [purpose, salt()])) as Record<(typeof PROTECT_PURPOSES)[number], Hex> });
const grants = Object.fromEntries(
  await Promise.all(PROTECT_PURPOSES.map(async (purpose) => [purpose, withSignature(unsigned[purpose], await account.signTypedData(grantTypedData(network, unsigned[purpose]) as never))] as const)),
) as ProtectGrants;

type Call = { from?: Address; to: Address; data: Hex };
type CallResult = { status: string; returnData: Hex; error?: { message?: string } };
async function simulate(blocks: Call[][]): Promise<CallResult[][]> {
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: blocks.map((calls, index) => ({ ...(index === 0 ? { stateOverrides: { [wallet]: { balance: `0x${FUNDING.toString(16)}`, code: designator }, [ops]: { balance: `0x${FUNDING.toString(16)}` } } } : {}), calls })) }, "latest"] as never,
  })) as { calls: CallResult[] }[];
  return result.map((block) => block.calls);
}
const read = (functionName: "getUserSuppliedAssets" | "getUserTotalDebt", reserve: AaveReserve): Call => ({ to: spoke, data: encodeFunctionData({ abi: spokeAbi, functionName, args: [BigInt(reserve.reserveId), wallet] }) });
const asBigint = (result: CallResult, functionName: "getUserSuppliedAssets" | "getUserTotalDebt") => decodeFunctionResult({ abi: spokeAbi, functionName, data: result.returnData }) as bigint;
const usdcBalance: Call = { to: usdc.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) };

/** The same calls with every Uniswap swap's recipient (the struct's fourth word) replaced. */
const redirect = (calls: Plan["calls"], to: Address) =>
  calls.map((call) => (call.to.toLowerCase() === router.toLowerCase() ? { ...call, data: concat([slice(call.data, 0, SELECTOR + RECIPIENT_WORD * WORD), pad(to, { size: WORD }), slice(call.data, SELECTOR + (RECIPIENT_WORD + 1) * WORD, size(call.data))]) } : call));

async function protectRoundTrip(side: MarginSide, symbol: string) {
  const asset = bySymbol(symbol);
  const collateral = side === "long" ? asset : usdc;
  const debt = side === "long" ? usdc : asset;
  // The open is only the setup here, built with room for its legs' own price impact (WETH pools on Arc are thin).
  const open = await planOpen(
    { side, wallet, spoke, usdc, asset, margin: MARGIN_USDC, leverageBps: TWO_X, base: { weightedCollateral: 0n, debtValue: 0n }, collateralOn: false, limits: { ...limits, slippageBps: OPEN_SLIPPAGE_BPS } },
    kyberSwapper({ chainId: arc.id, wallet, slippageBps: OPEN_SLIPPAGE_BPS, buildSlippageBps: OPEN_SLIPPAGE_BPS / 2, mode: "build" }),
  );
  const openCall: Call = { from: wallet, to: wallet, data: encodeSelfBatch(open.calls) };
  const [afterOpen] = await simulate([[openCall, read("getUserSuppliedAssets", collateral), read("getUserTotalDebt", debt)]]);
  assert.equal(afterOpen![0]!.status, "0x1", `open reverted: ${afterOpen![0]!.error?.message ?? ""}`);
  const supplied = asBigint(afterOpen![1]!, "getUserSuppliedAssets");
  const owed = asBigint(afterOpen![2]!, "getUserTotalDebt");

  // The protective close, planned with Uniswap legs (recipient = the wallet) and redeemed by the ops address.
  const close = await planClose(
    { side, wallet, spoke, usdc, asset, collateral: supplied, debt: owed, fractionBps: FULL, base: { weightedCollateral: 0n, debtValue: 0n }, soleDebtor: true, limits: { ...limits, slippageBps: MARGIN_PROTECTION.stopLossSlippageBps } },
    uniswapSwapper({ client: client as never, wallet, slippageBps: MARGIN_PROTECTION.stopLossSlippageBps, mode: "build" }),
  );
  const redeem = encodeRedeemProtect(network, grants, terms, close.calls);
  const [, afterClose] = await simulate([[openCall], [{ from: ops, to: redeem.to, data: redeem.data }, read("getUserTotalDebt", debt), read("getUserSuppliedAssets", collateral), usdcBalance]]);
  const [closed, debtLeft, collateralLeft, balance] = afterClose!;
  assert.equal(closed!.status, "0x1", `protective close reverted: ${closed!.error?.message ?? ""}`);
  assert.equal(asBigint(debtLeft!, "getUserTotalDebt"), 0n);
  const usdcAfter = decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: balance!.returnData }) as bigint;
  console.log(
    `${side} ${symbol} 2×: opened (supplied ${formatUnits(supplied, collateral.decimals)} ${collateral.symbol}, owes ${formatUnits(owed, debt.decimals)} ${debt.symbol}); ops closed it under the grants in ${close.calls.length} calls via ${close.venues.join(",")}: debt 0, collateral left ${asBigint(collateralLeft!, "getUserSuppliedAssets")}, wallet USDC ${formatUnits(usdcAfter, usdc.decimals)}`,
  );

  // The same close sending a swap's proceeds to a stranger: the chain refuses it.
  const stolen = encodeRedeemProtect(network, grants, terms, redirect(close.calls, stranger));
  const [, refused] = await simulate([[openCall], [{ from: ops, to: stolen.to, data: stolen.data }]]);
  assert.equal(refused![0]!.status, "0x0", "a swap paying someone else must not redeem");
  // Anyone but the ops wallet: refused too.
  const [, foreign] = await simulate([[openCall], [{ from: stranger, to: redeem.to, data: redeem.data }]]);
  assert.equal(foreign![0]!.status, "0x0", "only the ops wallet may redeem");
  console.log(`  refused on chain: proceeds to a stranger, and a redeem from anyone but the ops wallet`);
}

// A call no grant covers never becomes a redeem.
assert.throws(() => encodeRedeemProtect(network, grants, terms, [{ to: usdc.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [stranger, 1n] }), value: 0n }]), ProtectCallRefused);
await protectRoundTrip("long", "cirBTC");
// WETH has too little Uniswap v3 liquidity on Arc for a protective close right now (its 0.3% pool holds ~$812); EURC is deep enough.
await protectRoundTrip("short", "EURC");
console.log(`wallet ${wallet}: positions opened by the wallet, closed by the ops wallet under the protection grants, on Arc mainnet state`);
