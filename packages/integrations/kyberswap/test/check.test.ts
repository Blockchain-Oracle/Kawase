import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, parseAbi, type Address } from "viem";

import { KYBERSWAP_ROUTER, checkKyberSwap, decodeSwap, minimumOut } from "../src/index";

const USDC: Address = "0x3600000000000000000000000000000000000000";
const EURC: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const WALLET: Address = "0x000000000000000000000000000000000000bEEF";
const OTHER: Address = "0x000000000000000000000000000000000000dEaD";
const AMOUNT = 10_000_000n;
const MIN = 8_800_000n;

const abi = parseAbi([
  "struct SwapDescriptionV2 { address srcToken; address dstToken; address[] srcReceivers; uint256[] srcAmounts; address[] feeReceivers; uint256[] feeAmounts; address dstReceiver; uint256 amount; uint256 minReturnAmount; uint256 flags; bytes permit; }",
  "struct SwapExecutionParams { address callTarget; address approveTarget; bytes targetData; SwapDescriptionV2 desc; bytes clientData; }",
  "function swap(SwapExecutionParams execution) payable returns (uint256 returnAmount, uint256 gasUsed)",
]);

const swapData = (overrides: { dstReceiver?: Address; minReturnAmount?: bigint; feeAmounts?: bigint[] } = {}) =>
  encodeFunctionData({
    abi,
    functionName: "swap",
    args: [
      {
        callTarget: OTHER,
        approveTarget: OTHER,
        targetData: "0x",
        desc: {
          srcToken: USDC,
          dstToken: EURC,
          srcReceivers: [],
          srcAmounts: [],
          feeReceivers: [],
          feeAmounts: overrides.feeAmounts ?? [],
          dstReceiver: overrides.dstReceiver ?? WALLET,
          amount: AMOUNT,
          minReturnAmount: overrides.minReturnAmount ?? MIN,
          flags: 0n,
          permit: "0x",
        },
        clientData: "0x",
      },
    ],
  });

const expected = { tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT, recipient: WALLET, minOut: MIN };

test("minimumOut rounds down like the router", () => {
  assert.equal(minimumOut(8_897_985n, 50), 8_853_495n);
});

test("decodeSwap reads the on-chain promise", () => {
  const decoded = decodeSwap(swapData());
  assert.equal(decoded?.minReturnAmount, MIN);
  assert.equal(decoded?.dstReceiver, WALLET);
});

test("a correct swap passes", () => {
  assert.equal(checkKyberSwap({ to: KYBERSWAP_ROUTER, data: swapData(), value: 0n }, expected).ok, true);
});

test("refuses another recipient, a lower minimum, a fee, a different router", () => {
  const reason = (tx: Parameters<typeof checkKyberSwap>[0]) => {
    const result = checkKyberSwap(tx, expected);
    return result.ok ? "ok" : result.reason;
  };
  assert.equal(reason({ to: KYBERSWAP_ROUTER, data: swapData({ dstReceiver: OTHER }), value: 0n }), "wrong_recipient");
  assert.equal(reason({ to: KYBERSWAP_ROUTER, data: swapData({ minReturnAmount: MIN - 1n }), value: 0n }), "below_minimum");
  assert.equal(reason({ to: KYBERSWAP_ROUTER, data: swapData({ feeAmounts: [1n] }), value: 0n }), "fee_taken");
  assert.equal(reason({ to: OTHER, data: swapData(), value: 0n }), "wrong_router");
  assert.equal(reason({ to: KYBERSWAP_ROUTER, data: swapData(), value: 1n }), "native_value");
});
