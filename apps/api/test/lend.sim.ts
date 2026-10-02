// Aave V4 earn and borrow on Arc mainnet state, simulated (no funds move): a fresh wallet with the 7702 DeleGator
// code and 30 USDC (state overrides) runs the calls LendService builds: supply 20 USDC as collateral + borrow 5 EURC
// (one batch, the collateral put in with the loan), and then the repay and the withdrawal exactly as encoded for
// those actions. eth_simulateV1 runs each batch and the Spoke's own reads say what the account holds after.
// The repay and withdrawal run in the same batch as the borrow: on this RPC a second simulated transaction from the
// 7702 wallet fails the Spoke's withdraw/borrow paths even for an account with no debt (supply | withdraw reverts,
// supply + withdraw in one batch passes; seen 10-02), so the second step repeats the first and adds them.
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
/** A block's interest on 5 EURC, in base units. */
const DUST = 10n;

const read = (functionName: "getUserSuppliedAssets" | "getUserTotalDebt", reserveId: number) => ({ to: spoke, data: encodeFunctionData({ abi: spokeAbi, functionName, args: [BigInt(reserveId), wallet] }) });
const value = (data: Hex, functionName: "getUserSuppliedAssets" | "getUserTotalDebt") => decodeFunctionResult({ abi: spokeAbi, functionName, data }) as bigint;
const borrowWithCollateral: SpokeCall[] = [approveCall(usdc.underlying, spoke, SUPPLY), supplyCall(spoke, usdc.reserveId, SUPPLY, wallet), collateralCall(spoke, usdc.reserveId, true, wallet), borrowCall(spoke, eurc.reserveId, BORROW, wallet)];
const repayThenWithdraw: SpokeCall[] = [approveCall(eurc.underlying, spoke, BORROW), repayCall(spoke, eurc.reserveId, BORROW, wallet), withdrawCall(spoke, usdc.reserveId, WITHDRAW, wallet)];

async function run(name: string, calls: SpokeCall[]) {
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [
      {
        blockStateCalls: [
          {
            stateOverrides: { [wallet]: { balance: `0x${parseUnits("30", 18).toString(16)}`, code: designator } },
            calls: [{ from: wallet as Address, to: wallet as Address, data: encodeSelfBatch(calls) }, read("getUserSuppliedAssets", usdc.reserveId), read("getUserTotalDebt", eurc.reserveId)],
          },
        ],
      },
      "latest",
    ] as never,
  })) as { calls: { status: string; returnData: Hex; error?: { message?: string } }[] }[];
  const [sent, supplied, owed] = result[0]!.calls;
  assert.equal(sent!.status, "0x1", `${name} reverted: ${sent!.error?.message ?? ""}`);
  const after = { supplied: value(supplied!.returnData, "getUserSuppliedAssets"), owed: value(owed!.returnData, "getUserTotalDebt") };
  console.log(`${name}: ok · supplied ${formatUnits(after.supplied, usdc.decimals)} USDC · owes ${formatUnits(after.owed, eurc.decimals)} EURC`);
  return after;
}

const borrowed = await run("supply 20 USDC as collateral + borrow 5 EURC", borrowWithCollateral);
assert.ok(borrowed.owed >= BORROW);
const settled = await run("… then repay 5 EURC + withdraw 15 USDC", [...borrowWithCollateral, ...repayThenWithdraw]);
assert.ok(settled.owed <= DUST && settled.supplied <= SUPPLY - WITHDRAW);
console.log(`wallet ${wallet}: borrow with collateral, repay and withdraw simulated on Arc mainnet state`);
