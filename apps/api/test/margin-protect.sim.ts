// Margin protection on Arc mainnet state, simulated (no funds move): a fresh wallet (7702 DeleGator code, 20 USDC by
// state override) opens a $10 2× long on cirBTC and a $10 2× short on EURC as it would itself (KyberSwap + Aave V4),
// signs that position's six protection grants (its pair, its Uniswap pool, caps from its size), and then a different
// address standing in for Kawase's ops wallet closes it under those grants alone: DelegationManager.redeemDelegations
// over the close plan shaped as the grants allow (one capped approval each, back to zero at the end), its swaps
// through Uniswap v3 in the pinned pool with the wallet as the recipient.
// The chain must refuse, each by the caveat that pins it: a swap into another token, a swap in another fee tier's pool,
// a swap paying a stranger, an approval over the cap, a second approval after the close, and a redeem from anyone but
// the ops wallet. Then the off switch (H4): the wallet disables the grants on chain, once as its own transaction and
// once through Kawase's relayer (the one-time delegation it signs when it can't pay the fee), and the same close is
// refused as a disabled delegation. Run: tsx test/margin-protect.sim.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { concat, createPublicClient, decodeErrorResult, decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, http, numberToHex, pad, parseAbi, parseUnits, slice, size, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { MARGIN, MARGIN_PROTECTION } from "@kawase/config";
import { readMarket, spokeAbi, type AaveReserve } from "@kawase/integrations-aave-v4";
import {
  buildProtectGrants,
  buildRelayedBatch,
  encodeRedeemBatch,
  encodeRedeemProtect,
  encodeRevoke,
  encodeSelfBatch,
  grantTypedData,
  PROTECT_PURPOSES,
  ProtectCallRefused,
  ProtectCapExceeded,
  shapeProtectiveClose,
  withSignature,
  type ProtectGrants,
  type ProtectPurpose,
  type ProtectScope,
} from "@kawase/integrations-delegation";
import { AAVE_V4, DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";

import { planClose, planOpen, type MarginSide, type PlanLimits } from "../src/margin/plan";
import { kyberSwapper } from "../src/margin/swapper";
import { uniswapQuote, uniswapSwapper } from "../src/margin/uniswap";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const TIMEOUT_MS = 60_000;
const FUNDING = parseUnits("20", 18);
const MARGIN_USDC = 10_000_000n;
const TWO_X = 20_000;
const FULL = 10_000;
const BPS = 10_000n;
const SALT_BYTES = 32;
const HOUR_S = 3_600;
const MS_PER_S = 1_000;
const WORD = 32;
const SELECTOR = 4;
/** exactInputSingle's struct words: tokenOut (1), fee (2), recipient (3). */
const TOKEN_OUT_WORD = 1;
const FEE_WORD = 2;
const RECIPIENT_WORD = 3;
const OPEN_SLIPPAGE_BPS = 400;
const SUCCESS = "0x1";
const REVERTED = "0x0";

const network = getNetwork("mainnet");
const spoke = AAVE_V4.mainnet!.mainSpoke;
const router = MARGIN_PROTECTION.uniswap.router as Address;
const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address;
const ops = privateKeyToAccount(generatePrivateKey()).address;
const relayer = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const limits: PlanLimits = { ...MARGIN, slippageBps: MARGIN.slippageBps };
const market = await readMarket(client, spoke);
const bySymbol = (symbol: string) => market.reserves.find((reserve) => reserve.symbol === symbol)!;
const usdc = bySymbol("USDC");
const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
const withHeadroom = (amount: bigint) => (amount * BigInt(MARGIN_PROTECTION.capHeadroomBps)) / BPS;
const withBuffer = (amount: bigint) => amount + (amount * BigInt(MARGIN.repayBufferBps)) / BPS;

type Call = { from?: Address; to: Address; data: Hex };
/** A call from the wallet, as a plan or the shaped close carries it. */
type PlanCall = { to: Address; data: Hex; value?: bigint | undefined };
type CallResult = { status: string; returnData: Hex; error?: { message?: string } };
async function simulate(blocks: Call[][]): Promise<CallResult[][]> {
  const overrides = { [wallet]: { balance: numberToHex(FUNDING), code: designator }, [ops]: { balance: numberToHex(FUNDING) }, [relayer]: { balance: numberToHex(FUNDING) } };
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: blocks.map((calls, index) => ({ ...(index === 0 ? { stateOverrides: overrides } : {}), calls })) }, "latest"] as never,
  })) as { calls: CallResult[] }[];
  return result.map((block) => block.calls);
}
const read = (functionName: "getUserSuppliedAssets" | "getUserTotalDebt", reserve: AaveReserve): Call => ({ to: spoke, data: encodeFunctionData({ abi: spokeAbi, functionName, args: [BigInt(reserve.reserveId), wallet] }) });
const asBigint = (result: CallResult, functionName: "getUserSuppliedAssets" | "getUserTotalDebt") => decodeFunctionResult({ abi: spokeAbi, functionName, data: result.returnData }) as bigint;
const usdcBalance: Call = { to: usdc.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) };

/** The DelegationManager's own refusals (custom errors) and an enforcer's reason string. */
const REVERTS = parseAbi(["error Error(string message)", "error InvalidDelegate()", "error CannotUseADisabledDelegation()"]);
/** Why a redeem reverted: the enforcer's reason string or the manager's error name. */
function reason(result: CallResult): string {
  try {
    const decoded = decodeErrorResult({ data: result.returnData, abi: REVERTS });
    return decoded.errorName === "Error" ? String(decoded.args?.[0]) : decoded.errorName;
  } catch {
    return result.error?.message ?? result.returnData;
  }
}
function refusedBy(result: CallResult | undefined, expected: RegExp, what: string) {
  assert.ok(result, what);
  assert.equal(result.status, REVERTED, `${what} must not redeem`);
  assert.match(reason(result), expected, `${what}: refused for the wrong reason`);
  console.log(`  refused on chain: ${what} (${reason(result)})`);
}

/** One struct word of every Uniswap swap in the calls, replaced. */
const rewriteSwaps = (calls: readonly PlanCall[], wordIndex: number, value: Hex) =>
  calls.map((call) => (call.to.toLowerCase() === router.toLowerCase() ? { ...call, data: concat([slice(call.data, 0, SELECTOR + wordIndex * WORD), value, slice(call.data, SELECTOR + (wordIndex + 1) * WORD, size(call.data))]) } : call));
const approve = (token: Address, spender: Address, amount: bigint): PlanCall => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: 0n });

async function protectRoundTrip(side: MarginSide, symbol: string, otherSymbol: string) {
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
  assert.equal(afterOpen![0]!.status, SUCCESS, `open reverted: ${afterOpen![0]!.error?.message ?? ""}`);
  const supplied = asBigint(afterOpen![1]!, "getUserSuppliedAssets");
  const owed = asBigint(afterOpen![2]!, "getUserTotalDebt");

  // What the api pins at signing (protection.ts requestGrant): the pair, the best pool for the whole collateral, caps.
  const pool = await uniswapQuote(client as never, collateral.underlying, debt.underlying, supplied);
  const scope: ProtectScope = {
    spoke,
    router,
    fee: pool.fee,
    collateral: { token: collateral.underlying, reserveId: collateral.reserveId, cap: withHeadroom(supplied) },
    debt: { token: debt.underlying, reserveId: debt.reserveId, cap: withHeadroom(withBuffer(owed)) },
  };
  const unsigned = buildProtectGrants({ network, wallet, redeemer: ops, ...scope, expiresAt: Math.floor(Date.now() / MS_PER_S) + HOUR_S, salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose) => [purpose, salt()])) as Record<ProtectPurpose, Hex> });
  const grants = Object.fromEntries(await Promise.all(PROTECT_PURPOSES.map(async (purpose) => [purpose, withSignature(unsigned[purpose], await account.signTypedData(grantTypedData(network, unsigned[purpose]) as never))] as const))) as ProtectGrants;

  // The protective close, planned in the pinned pool (recipient = the wallet), shaped and redeemed by the ops address.
  const close = await planClose(
    { side, wallet, spoke, usdc, asset, collateral: supplied, debt: owed, fractionBps: FULL, base: { weightedCollateral: 0n, debtValue: 0n }, soleDebtor: true, limits: { ...limits, slippageBps: MARGIN_PROTECTION.stopLossSlippageBps } },
    uniswapSwapper({ client: client as never, wallet, slippageBps: MARGIN_PROTECTION.stopLossSlippageBps, mode: "build", fee: scope.fee }),
  );
  const shaped = shapeProtectiveClose(scope, close.calls);
  const redeem = encodeRedeemProtect(network, grants, scope, shaped);
  const asOps = (calls: readonly PlanCall[]): Call => ({ from: ops, ...encodeRedeemProtect(network, grants, scope, calls) });
  const [, afterClose, again] = await simulate([
    [openCall],
    [{ from: ops, to: redeem.to, data: redeem.data }, read("getUserTotalDebt", debt), read("getUserSuppliedAssets", collateral), usdcBalance],
    // After the close, the approval grant is spent: the router can't be approved again.
    [asOps([approve(scope.collateral.token, router, scope.collateral.cap)])],
  ]);
  const [closed, debtLeft, collateralLeft, balance] = afterClose!;
  assert.equal(closed!.status, SUCCESS, `protective close reverted: ${closed!.error?.message ?? reason(closed!)}`);
  assert.equal(asBigint(debtLeft!, "getUserTotalDebt"), 0n);
  const usdcAfter = decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: balance!.returnData }) as bigint;
  console.log(
    `${side} ${symbol} 2×: opened (supplied ${formatUnits(supplied, collateral.decimals)} ${collateral.symbol}, owes ${formatUnits(owed, debt.decimals)} ${debt.symbol}); ops closed it under the grants (pool ${scope.fee / 100} bps, caps ${formatUnits(scope.collateral.cap, collateral.decimals)} ${collateral.symbol} / ${formatUnits(scope.debt.cap, debt.decimals)} ${debt.symbol}) in ${shaped.length} calls: debt 0, collateral left ${asBigint(collateralLeft!, "getUserSuppliedAssets")}, wallet USDC ${formatUnits(usdcAfter, usdc.decimals)}`,
  );
  refusedBy(again![0], /LimitedCallsEnforcer/, "a second approval of the router once the close spent the grant");

  // The same close, each time with one thing an attacker would want changed. Every one is refused by the caveat.
  const other = bySymbol(otherSymbol);
  const differentTier = MARGIN_PROTECTION.feeTiers.find((tier) => tier !== scope.fee)!;
  const attacks: [string, RegExp, Call][] = [
    ["a swap into another token", /AllowedCalldataEnforcer/, asOps(rewriteSwaps(shaped, TOKEN_OUT_WORD, pad(other.underlying, { size: WORD })))],
    ["a swap in another fee tier's pool", /AllowedCalldataEnforcer/, asOps(rewriteSwaps(shaped, FEE_WORD, numberToHex(differentTier, { size: WORD })))],
    ["a swap paying a stranger", /AllowedCalldataEnforcer/, asOps(rewriteSwaps(shaped, RECIPIENT_WORD, pad(stranger, { size: WORD })))],
    ["an approval of the router over the cap", /AllowedCalldataEnforcer/, asOps([approve(scope.collateral.token, router, scope.collateral.cap + 1n)])],
    ["an approval of the Spoke over the cap", /AllowedCalldataEnforcer/, asOps([approve(scope.debt.token, spoke, scope.debt.cap + 1n)])],
    ["the same close from anyone but the ops wallet", /InvalidDelegate|RedeemerEnforcer/, { from: stranger, to: redeem.to, data: redeem.data }],
  ];
  const results = await simulate([[openCall], attacks.map(([, , call]) => call)]);
  attacks.forEach(([what, expected], index) => refusedBy(results[1]![index], expected, what));

  // Off (H4): the wallet disables the six grants on chain; then the very same close is refused.
  const disables = PROTECT_PURPOSES.map((purpose) => encodeRevoke(network, grants[purpose]));
  const ownDisable: Call = { from: wallet, to: wallet, data: encodeSelfBatch(disables) };
  const relayedGrant = buildRelayedBatch({ network, wallet, relayer, calls: disables, expiresAt: Math.floor(Date.now() / MS_PER_S) + HOUR_S, salt: salt() });
  const relayedSigned = withSignature(relayedGrant, await account.signTypedData(grantTypedData(network, relayedGrant) as never));
  const relayedDisable: Call = { from: relayer, ...encodeRedeemBatch(network, relayedSigned, disables) };
  for (const [how, disable] of [
    ["the wallet's own transaction", ownDisable],
    ["Kawase's relayer (the wallet can't pay the fee)", relayedDisable],
  ] as const) {
    const [, off, after] = await simulate([[openCall], [disable], [{ from: ops, to: redeem.to, data: redeem.data }]]);
    assert.equal(off![0]!.status, SUCCESS, `disable via ${how} reverted: ${reason(off![0]!)}`);
    refusedBy(after![0], /CannotUseADisabledDelegation/, `the close after protection was turned off through ${how}`);
  }
}

// Off chain, before anything is sent: a call no grant covers never becomes a redeem, and a close bigger than the caps
// is refused rather than tried.
const probeScope: ProtectScope = { spoke, router, fee: MARGIN_PROTECTION.feeTiers[0], collateral: { token: bySymbol("cirBTC").underlying, reserveId: bySymbol("cirBTC").reserveId, cap: 100n }, debt: { token: usdc.underlying, reserveId: usdc.reserveId, cap: 100n } };
const probeGrants = buildProtectGrants({ network, wallet, redeemer: ops, ...probeScope, expiresAt: Math.floor(Date.now() / MS_PER_S) + HOUR_S, salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose) => [purpose, salt()])) as Record<ProtectPurpose, Hex> });
assert.throws(() => encodeRedeemProtect(network, probeGrants, probeScope, [{ to: usdc.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [stranger, 1n] }), value: 0n }]), ProtectCallRefused);
assert.throws(() => shapeProtectiveClose(probeScope, [approve(probeScope.collateral.token, router, 101n)]), ProtectCapExceeded);
assert.throws(() => shapeProtectiveClose(probeScope, [approve(probeScope.collateral.token, stranger, 1n)]), ProtectCallRefused);
console.log("off chain: a transfer no grant covers, a close over the cap and an approval to a stranger are refused before sending");

await protectRoundTrip("long", "cirBTC", "EURC");
// WETH has too little Uniswap v3 liquidity on Arc for a protective close right now (its 0.3% pool holds ~$812); EURC is deep enough.
await protectRoundTrip("short", "EURC", "cirBTC");
console.log(`wallet ${wallet}: positions opened by the wallet, closed by the ops wallet under the pinned protection grants, refused when anything else was tried or after the off switch, on Arc mainnet state`);
