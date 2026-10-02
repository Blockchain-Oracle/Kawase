// Cross-chain moves on Arc mainnet state, simulated (no funds move): a fresh wallet with the 7702 DeleGator code and
// 30 USDC (state overrides) sends 20 USDC to someone else on Base through Across and through Relay, each as the one
// batch Kawase would hand the wallet (the provider's calls, checked first); eth_simulateV1 runs each and the USDC
// that left the wallet is read back. The fills happen on Base and are followed through the providers' status apis.
// Run: tsx test/crosschain.sim.ts
import assert from "node:assert/strict";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, erc20Abi, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { acrossQuote, checkAcrossCalls, checkRelayCalls, relayContracts, relayQuote, type BridgeCall } from "@kawase/integrations-bridges";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { DELEGATION_FRAMEWORK } from "@kawase/networks";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const USDC: Address = "0x3600000000000000000000000000000000000000";
const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE = 8453;
const FRIEND: Address = "0x000000000000000000000000000000000000dEaD";
const AMOUNT = 20_000_000n;
const FUNDING = parseUnits("30", 18);
const TIMEOUT_MS = 60_000;

const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;
const balanceCall = { to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) };

async function run(name: string, calls: BridgeCall[]) {
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: [{ stateOverrides: { [wallet]: { balance: `0x${FUNDING.toString(16)}`, code: designator } }, calls: [balanceCall, { from: wallet, to: wallet, data: encodeSelfBatch(calls) }, balanceCall] }] }, "latest"] as never,
  })) as { calls: { status: string; returnData: Hex; error?: { message?: string } }[] }[];
  const [before, batch, after] = result[0]!.calls;
  assert.equal(batch!.status, "0x1", `${name} reverted: ${batch!.error?.message ?? ""}`);
  const read = (data: Hex) => decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data }) as bigint;
  const left = read(before!.returnData) - read(after!.returnData);
  console.log(`${name}: batch ok, ${left} USDC base units left the wallet`);
  assert.equal(left, AMOUNT);
}

const across = await acrossQuote({ originChainId: arc.id, destinationChainId: BASE, inputToken: USDC, outputToken: BASE_USDC, amount: AMOUNT, depositor: wallet, recipient: FRIEND });
assert.ok(checkAcrossCalls(across.calls, { spokePool: across.spokePool, depositor: wallet, recipient: FRIEND, inputToken: USDC, outputToken: BASE_USDC, amount: AMOUNT, minOutput: across.minOutputAmount, destinationChainId: BASE }).ok);
await run(`Across (→ ${across.outputAmount} on Base)`, across.calls);

const relay = await relayQuote({ originChainId: arc.id, destinationChainId: BASE, originCurrency: USDC, destinationCurrency: BASE_USDC, amount: AMOUNT, user: wallet, recipient: FRIEND });
assert.ok(checkRelayCalls(relay.calls, { depositories: await relayContracts(arc.id), depositor: wallet, token: USDC, amount: AMOUNT }).ok);
await run(`Relay (→ ${relay.outputAmount} on Base)`, relay.calls);
console.log(`wallet ${wallet}: both deposits simulated on Arc mainnet state`);
