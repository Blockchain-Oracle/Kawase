// Aave V4 earn and borrow on Arc mainnet state, simulated (no funds move): a fresh wallet with the 7702 DeleGator code
// and 30 USDC (state overrides) sends, as two transactions one after the other, the batches LendService builds:
// supply 20 USDC as collateral + borrow 5 EURC (the collateral put in with the loan), then repay 5 EURC + withdraw
// 15 USDC; and a lone withdrawal, which is a one-call batch. eth_simulateV1 runs them in order and the Spoke's own
// reads say what the account holds after each. (Until 10-02 one-call batches were encoded in the batch mode, which the
// DeleGator refuses with DecodingError(); encodeSelfBatch now sends one call in single mode.)
// Run: tsx test/lend.sim.ts
import assert from "node:assert/strict";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, formatUnits, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { approveCall, borrowCall, collateralCall, readMarket, repayCall, spokeAbi, supplyCall, withdrawCall, type SpokeCall } from "@kawase/integrations-aave-v4";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { AAVE_V4, DELEGATION_FRAMEWORK } from "@kawase/networks";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const TIMEOUT_MS = 60_000;
const spoke = AAVE_V4.mainnet!.mainSpoke;
const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const market = await readMarket(client, spoke);
const usdc = market.reserves.find((reserve) => reserve.symbol === "USDC")!;
const eurc = market.reserves.find((reserve) => reserve.symbol === "EURC")!;
const SUPPLY = parseUnits("20", usdc.decimals);
const BORROW = parseUnits("5", eurc.decimals);
const WITHDRAW = parseUnits("15", usdc.decimals);
const LAST = parseUnits("2", usdc.decimals);
/** A block's interest on 5 EURC, in base units. */
const DUST = 10n;

type Read = "getUserSuppliedAssets" | "getUserTotalDebt";
const read = (functionName: Read, reserveId: number) => ({ to: spoke, data: encodeFunctionData({ abi: spokeAbi, functionName, args: [BigInt(reserveId), wallet] }) });
const value = (data: Hex, functionName: Read) => decodeFunctionResult({ abi: spokeAbi, functionName, data }) as bigint;
const borrowWithCollateral: SpokeCall[] = [approveCall(usdc.underlying, spoke, SUPPLY), supplyCall(spoke, usdc.reserveId, SUPPLY, wallet), collateralCall(spoke, usdc.reserveId, true, wallet), borrowCall(spoke, eurc.reserveId, BORROW, wallet)];
const repayThenWithdraw: SpokeCall[] = [approveCall(eurc.underlying, spoke, BORROW), repayCall(spoke, eurc.reserveId, BORROW, wallet), withdrawCall(spoke, usdc.reserveId, WITHDRAW, wallet)];
const withdrawAlone: SpokeCall[] = [withdrawCall(spoke, usdc.reserveId, LAST, wallet)];
const steps = [
  { name: "supply 20 USDC as collateral + borrow 5 EURC", calls: borrowWithCollateral },
  { name: "then repay 5 EURC + withdraw 15 USDC", calls: repayThenWithdraw },
  { name: "then withdraw 2 USDC alone (one call)", calls: withdrawAlone },
];

const result = (await client.request({
  method: "eth_simulateV1" as never,
  params: [
    {
      blockStateCalls: [
        {
          stateOverrides: { [wallet]: { balance: `0x${parseUnits("30", 18).toString(16)}`, code: designator } },
          calls: steps.flatMap((step) => [{ from: wallet as Address, to: wallet as Address, data: encodeSelfBatch(step.calls) }, read("getUserSuppliedAssets", usdc.reserveId), read("getUserTotalDebt", eurc.reserveId)]),
        },
      ],
    },
    "latest",
  ] as never,
})) as { calls: { status: string; returnData: Hex; error?: { message?: string } }[] }[];

const CALLS_PER_STEP = 3;
const after = steps.map((step, index) => {
  const [sent, supplied, owed] = result[0]!.calls.slice(index * CALLS_PER_STEP, (index + 1) * CALLS_PER_STEP);
  assert.equal(sent!.status, "0x1", `${step.name} reverted: ${sent!.error?.message ?? ""}`);
  const state = { supplied: value(supplied!.returnData, "getUserSuppliedAssets"), owed: value(owed!.returnData, "getUserTotalDebt") };
  console.log(`${step.name}: ok · supplied ${formatUnits(state.supplied, usdc.decimals)} USDC · owes ${formatUnits(state.owed, eurc.decimals)} EURC`);
  return state;
});
assert.ok(after[0]!.owed >= BORROW);
assert.ok(after[1]!.owed <= DUST && after[1]!.supplied <= SUPPLY - WITHDRAW);
assert.ok(after[2]!.supplied <= SUPPLY - WITHDRAW - LAST);
console.log(`wallet ${wallet}: borrow with collateral, repay, withdraw and a lone withdrawal simulated as three transactions on Arc mainnet state`);
