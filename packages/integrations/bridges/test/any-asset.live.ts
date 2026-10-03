// Live quotes (no funds): LI.FI and deBridge out of Arc for assets other than USDC, each checked by its own check, and
// a quote whose recipient is not the one asked refused. Run: tsx test/any-asset.live.ts
import assert from "node:assert/strict";
import { formatUnits, type Address } from "viem";

import { checkDebridgeCalls, checkLifiCalls, DEBRIDGE_NATIVE, debridgeQuote, lifiQuote, lifiToken } from "../src";

const ARC = 5042;
const BASE = 8453;
const WALLET: Address = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
const FRIEND: Address = "0x7a3b9e2c4d5f60718293a4b5c6d7e8f901234567";
const WETH_ARC: Address = "0x128cC466B61f542da60c70e3aA11c10e19B84EDB";
const EURC_ARC: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const SLIPPAGE_BPS = 50;
const WETH_AMOUNT = 5_000_000_000_000_000n;
const EURC_AMOUNT = 20_000_000n;
const USDC_NATIVE_AMOUNT = 20_000_000_000_000_000_000n;
const ETH_DECIMALS = 18;
const STABLE_DECIMALS = 6;

const wethBase = await lifiToken(BASE, "WETH");
assert.ok(wethBase, "WETH on Base");
const weth = await lifiQuote({ fromChainId: ARC, toChainId: BASE, fromToken: WETH_ARC, toToken: wethBase.address, amount: WETH_AMOUNT, from: WALLET, to: FRIEND, slippageBps: SLIPPAGE_BPS });
assert.deepEqual(checkLifiCalls(weth.calls, { chainId: ARC, token: WETH_ARC, amount: WETH_AMOUNT, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
assert.deepEqual(checkLifiCalls(weth.calls, { chainId: ARC, token: WETH_ARC, amount: WETH_AMOUNT, recipient: WALLET, destinationChainId: BASE }), { ok: false, reason: "wrong_recipient" });
console.log(`LI.FI 0.005 WETH Arc → Base for a friend: ${formatUnits(weth.outputAmount, ETH_DECIMALS)} WETH (min ${formatUnits(weth.minOutputAmount, ETH_DECIMALS)}) via ${weth.tool} [${weth.steps.join(", ")}], ~${weth.fillSeconds}s; checked`);

const eurcBase = await lifiToken(BASE, "EURC");
assert.ok(eurcBase, "EURC on Base");
const eurc = await debridgeQuote({ srcChainId: ARC, srcToken: EURC_ARC, amount: EURC_AMOUNT, dstChainId: BASE, dstToken: eurcBase.address, recipient: FRIEND, authority: WALLET });
assert.deepEqual(checkDebridgeCalls(eurc.calls, { token: EURC_ARC, amount: EURC_AMOUNT, fixFee: eurc.fixFee, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
assert.equal(checkDebridgeCalls(eurc.calls, { token: EURC_ARC, amount: EURC_AMOUNT, fixFee: eurc.fixFee, recipient: "0x00000000000000000000000000000000000000aa", destinationChainId: BASE }).ok, false);
console.log(`deBridge 20 EURC Arc → Base: ${formatUnits(eurc.outputAmount, STABLE_DECIMALS)} EURC + fee ${formatUnits(eurc.fixFee, ETH_DECIMALS)} USDC, order ${eurc.orderId.slice(0, 10)}…; checked`);

const usdcBase = await lifiToken(BASE, "USDC");
assert.ok(usdcBase);
const usdc = await debridgeQuote({ srcChainId: ARC, srcToken: DEBRIDGE_NATIVE, amount: USDC_NATIVE_AMOUNT, dstChainId: BASE, dstToken: usdcBase.address, recipient: FRIEND, authority: WALLET });
assert.deepEqual(checkDebridgeCalls(usdc.calls, { token: DEBRIDGE_NATIVE, amount: USDC_NATIVE_AMOUNT, fixFee: usdc.fixFee, recipient: FRIEND, destinationChainId: BASE }), { ok: true });
console.log(`deBridge 20 USDC (native) Arc → Base: ${formatUnits(usdc.outputAmount, STABLE_DECIMALS)} USDC, value ${formatUnits(usdc.calls[0]!.value, ETH_DECIMALS)}; checked`);
