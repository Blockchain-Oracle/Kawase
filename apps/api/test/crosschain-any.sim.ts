// Any-asset moves out of Arc on mainnet state, simulated (no funds move): a fresh wallet with the 7702 DeleGator code,
// 30 USDC and the asset it moves (state overrides on the token's balance slot, found by probing) sends, as the one batch
// Kawase hands the wallet (each provider's calls checked first):
//   1. 0.005 WETH to a friend on Base through LI.FI (WETH arrives);
//   2. 20 EURC through deBridge's forwarder (plus its 1 USDC fee as value);
//   3. 20 USDC through deBridge as Arc's native coin (value = amount + fee);
//   4. convert first: 0.005 WETH swapped to USDC on KyberSwap and that USDC's minimum sent through Across, one batch.
// eth_simulateV1 runs each; the receipt logs are read back the way the tracker reads them: the asset leaving by its own
// Transfer logs, USDC leaving by Arc's native-transfer log (0xffff…fffe), which must equal the amount bridged plus any
// flat fee. Run: tsx test/crosschain-any.sim.ts
import assert from "node:assert/strict";
import { createPublicClient, decodeEventLog, encodeFunctionData, erc20Abi, formatUnits, http, pad, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import { acrossQuote, checkAcrossCalls, checkDebridgeCalls, checkLifiCalls, DEBRIDGE_NATIVE, debridgeQuote, lifiQuote, lifiToken, type BridgeCall } from "@kawase/integrations-bridges";
import { encodeSelfBatch } from "@kawase/integrations-delegation";
import { approveRouterCall, build, checkKyberSwap, quote as kyberQuote } from "@kawase/integrations-kyberswap";
import { DELEGATION_FRAMEWORK } from "@kawase/networks";

const RPC = "https://rpc.drpc.mainnet.arc.io";
const USDC: Address = "0x3600000000000000000000000000000000000000";
const WETH: Address = "0x128cC466B61f542da60c70e3aA11c10e19B84EDB";
const EURC: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const NATIVE_LOGGER = "0xfffffffffffffffffffffffffffffffffffffffe";
const ARC = 5042;
const BASE = 8453;
const FRIEND: Address = "0x7a3b9e2c4d5f60718293a4b5c6d7e8f901234567";
const FUNDING = parseUnits("30", 18);
const WETH_AMOUNT = parseUnits("0.005", 18);
const EURC_AMOUNT = parseUnits("20", 6);
const USDC_AMOUNT = parseUnits("20", 6);
const NATIVE_SCALE = 10n ** 12n;
const SLIPPAGE_BPS = 100;
const TIMEOUT_MS = 60_000;

const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const designator = `0xef0100${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice(2)}` as Hex;

/**
 * The storage key holding the wallet's balance of a token: the node's access list for `balanceOf(wallet)` names the
 * keys it reads; the one that, overridden, changes what balanceOf returns is the balance (proxies and namespaced
 * storage included).
 */
async function balanceKey(token: Address): Promise<{ address: Address; key: Hex }> {
  const probe = parseUnits("123", 6);
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  const access = (await client.request({ method: "eth_createAccessList" as never, params: [{ from: wallet, to: token, data }, "latest"] as never })) as { accessList: { address: Address; storageKeys: Hex[] }[] };
  for (const entry of access.accessList) {
    for (const key of entry.storageKeys) {
      const read = await client.call({ to: token, data, stateOverride: [{ address: entry.address, stateDiff: [{ slot: key, value: pad(toHex(probe), { size: 32 }) }] }] }).catch(() => undefined);
      if (read?.data && BigInt(read.data) === probe) return { address: entry.address, key };
    }
  }
  throw new Error(`no balance key found for ${token}`);
}

const slotOverride = (where: { address: Address; key: Hex }, amount: bigint) => ({ [where.address]: { stateDiff: { [where.key]: pad(toHex(amount), { size: 32 }) } } });

function outOf(logs: { address: string; topics: Hex[]; data: Hex }[], token: string): bigint {
  let out = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (event.eventName === "Transfer" && event.args.from.toLowerCase() === wallet.toLowerCase()) out += event.args.value;
    } catch {
      // Not a Transfer.
    }
  }
  return out;
}

async function run(name: string, calls: BridgeCall[], overrides: Record<string, unknown>) {
  const result = (await client.request({
    method: "eth_simulateV1" as never,
    params: [{ blockStateCalls: [{ stateOverrides: { [wallet]: { balance: `0x${FUNDING.toString(16)}`, code: designator }, ...overrides }, calls: [{ from: wallet, to: wallet, data: encodeSelfBatch(calls) }] }] }, "latest"] as never,
  })) as { calls: { status: string; logs: { address: string; topics: Hex[]; data: Hex }[]; error?: { message?: string } }[] }[];
  const sent = result[0]!.calls[0]!;
  assert.equal(sent.status, "0x1", `${name} reverted: ${sent.error?.message ?? ""}`);
  return sent.logs;
}

const [wethSlot, eurcSlot] = await Promise.all([balanceKey(WETH), balanceKey(EURC)]);
console.log(`balance keys: WETH ${wethSlot.key.slice(0, 10)}… on ${wethSlot.address.slice(0, 8)}…, EURC ${eurcSlot.key.slice(0, 10)}…`);
const [wethBase, eurcBase, usdcBase] = await Promise.all([lifiToken(BASE, "WETH"), lifiToken(BASE, "EURC"), lifiToken(BASE, "USDC")]);

// 1. WETH as itself through LI.FI.
const lifi = await lifiQuote({ fromChainId: ARC, toChainId: BASE, fromToken: WETH, toToken: wethBase!.address, amount: WETH_AMOUNT, from: wallet, to: FRIEND, slippageBps: SLIPPAGE_BPS });
assert.deepEqual(checkLifiCalls(lifi.calls, { chainId: ARC, token: WETH, amount: WETH_AMOUNT, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
const lifiLogs = await run("LI.FI WETH", lifi.calls, slotOverride(wethSlot, WETH_AMOUNT));
assert.equal(outOf(lifiLogs, WETH), WETH_AMOUNT);
assert.equal(outOf(lifiLogs, NATIVE_LOGGER), 0n, "no USDC leaves on a WETH move");
console.log(`1. LI.FI 0.005 WETH → ${formatUnits(lifi.minOutputAmount, 18)}+ WETH on Base for a friend: batch ok, exactly 0.005 WETH left, no USDC`);

// 2. EURC through deBridge's forwarder, its flat fee as value.
const eurc = await debridgeQuote({ srcChainId: ARC, srcToken: EURC, amount: EURC_AMOUNT, dstChainId: BASE, dstToken: eurcBase!.address, recipient: FRIEND, authority: wallet });
assert.deepEqual(checkDebridgeCalls(eurc.calls, { token: EURC, amount: EURC_AMOUNT, fixFee: eurc.fixFee, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
const eurcLogs = await run("deBridge EURC", eurc.calls, slotOverride(eurcSlot, EURC_AMOUNT));
assert.equal(outOf(eurcLogs, EURC), EURC_AMOUNT);
assert.equal(outOf(eurcLogs, NATIVE_LOGGER), eurc.fixFee, "the flat fee leaves as native USDC");
console.log(`2. deBridge 20 EURC → ${formatUnits(eurc.outputAmount, 6)} EURC on Base: batch ok, 20 EURC + ${formatUnits(eurc.fixFee, 18)} USDC fee left`);

// 3. USDC as Arc's native coin through deBridge.
const usdc = await debridgeQuote({ srcChainId: ARC, srcToken: DEBRIDGE_NATIVE, amount: USDC_AMOUNT * NATIVE_SCALE, dstChainId: BASE, dstToken: usdcBase!.address, recipient: FRIEND, authority: wallet });
assert.deepEqual(checkDebridgeCalls(usdc.calls, { token: DEBRIDGE_NATIVE, amount: USDC_AMOUNT * NATIVE_SCALE, fixFee: usdc.fixFee, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
const usdcLogs = await run("deBridge USDC", usdc.calls, {});
assert.equal(outOf(usdcLogs, NATIVE_LOGGER), USDC_AMOUNT * NATIVE_SCALE + usdc.fixFee, "amount + fee, as the tracker expects");
console.log(`3. deBridge 20 USDC (native) → ${formatUnits(usdc.outputAmount, 6)} USDC on Base: batch ok, 21 USDC left (20 + fee)`);

// 4. Convert first: WETH → USDC on KyberSwap, then the swap's minimum through Across, one batch.
const route = await kyberQuote({ chainId: ARC, tokenIn: WETH, tokenOut: USDC, amountIn: WETH_AMOUNT, sender: wallet, recipient: wallet, slippageBps: SLIPPAGE_BPS, clientId: "kawase" });
// Built at half the quoted slippage, as the service does (the build re-prices).
const swap = await build(route, { slippageBps: SLIPPAGE_BPS / 2, clientId: "kawase" });
const swapCheck = checkKyberSwap(swap, { tokenIn: WETH, tokenOut: USDC, amountIn: WETH_AMOUNT, recipient: wallet, minOut: route.minOut });
assert.ok(swapCheck.ok, swapCheck.ok ? "" : swapCheck.reason);
const minUsdc = swapCheck.decoded.minReturnAmount;
const across = await acrossQuote({ originChainId: ARC, destinationChainId: BASE, inputToken: USDC, outputToken: usdcBase!.address, amount: minUsdc, depositor: wallet, recipient: FRIEND });
assert.deepEqual(checkAcrossCalls(across.calls, { spokePool: across.spokePool, depositor: wallet, recipient: FRIEND, inputToken: USDC, outputToken: usdcBase!.address, amount: minUsdc, minOutput: across.minOutputAmount, destinationChainId: BASE }), { ok: true });
const convertLogs = await run("convert first", [approveRouterCall(WETH, WETH_AMOUNT), { to: swap.to, data: swap.data, value: swap.value }, ...across.calls], slotOverride(wethSlot, WETH_AMOUNT));
assert.equal(outOf(convertLogs, WETH), WETH_AMOUNT);
assert.equal(outOf(convertLogs, NATIVE_LOGGER), minUsdc * NATIVE_SCALE, "exactly the swap's minimum USDC is bridged");
console.log(`4. convert first: 0.005 WETH → ≥${formatUnits(minUsdc, 6)} USDC (KyberSwap) → Across → ${formatUnits(across.minOutputAmount, 6)}+ USDC on Base: one batch ok`);
console.log(`wallet ${wallet}: four any-asset batches simulated on Arc mainnet state`);
