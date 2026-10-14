// The opaque venues' calldata checks, offline (Stage 2 open item): built 0x, Socket and Gas.zip calls that must pass, and
// the wrong-target, wrong-recipient, wrong-amount, below-minimum, native-value and expired cases that must be refused.
// Nothing here touches a network. Run: pnpm --filter @kawase/api exec tsx --test test/venue-checks.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { concat, encodeAbiParameters, encodeFunctionData, erc20Abi, pad, parseAbi, parseAbiParameters, type Address, type Hex } from "viem";

import { checkGasZipCalls, checkSocketCalls, GASZIP_DEPOSIT, GASZIP_SHORT_IDS, SOCKET_ALLOWANCE_HOLDER, SOCKET_EXECUTOR } from "@kawase/integrations-bridges";

import { checkZeroExCalls, ZEROX_ALLOWANCE_HOLDER } from "../src/routing/zerox";

const ARC = 5042;
const BASE = 8453;
const WALLET: Address = "0x1111111111111111111111111111111111111111";
const STRANGER: Address = "0x9999999999999999999999999999999999999999";
const TOKEN_IN: Address = "0x3600000000000000000000000000000000000000";
const TOKEN_OUT: Address = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const SETTLER: Address = "0x5555555555555555555555555555555555555555";
const AMOUNT = 10_000_000n;
const MIN_OUT = 8_800_000n;
const NOW = 1_800_000_000;
const LATER = NOW + 60;
const NO_VALUE = 0n;
const ONE_NATIVE = 10n ** 18n;
const SELECTOR: Hex = "0x12345678";

const execAbi = parseAbi(["function exec(address operator, address token, uint256 amount, address target, bytes data) payable"]);
const depositAbi = parseAbi(["function deposit(uint256 chains, bytes32 to) payable"]);
const approve = (token: Address, spender: Address, amount = AMOUNT) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: NO_VALUE });

// ── 0x (AllowanceHolder → Settler): the slippage word names recipient, buy token and the least out. ─────────────────
const settlerData = (recipient: Address, buyToken: Address, minOut: bigint): Hex =>
  concat([SELECTOR, encodeAbiParameters(parseAbiParameters("(address recipient, address buyToken, uint256 minAmountOut), bytes[], bytes32"), [{ recipient, buyToken, minAmountOut: minOut }, [], pad("0x00")])]);
const zeroEx = (overrides: { recipient?: Address; buyToken?: Address; minOut?: bigint; target?: Address; amount?: bigint; to?: Address; value?: bigint } = {}) => [
  approve(TOKEN_IN, ZEROX_ALLOWANCE_HOLDER),
  {
    to: overrides.to ?? ZEROX_ALLOWANCE_HOLDER,
    data: encodeFunctionData({ abi: execAbi, functionName: "exec", args: [overrides.target ?? SETTLER, TOKEN_IN, overrides.amount ?? AMOUNT, overrides.target ?? SETTLER, settlerData(overrides.recipient ?? WALLET, overrides.buyToken ?? TOKEN_OUT, overrides.minOut ?? MIN_OUT)] }),
    value: overrides.value ?? NO_VALUE,
  },
];
const zeroExExpected = { tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, amountIn: AMOUNT, recipient: WALLET, minOut: MIN_OUT, settlers: [SETTLER] };

test("0x: approve the AllowanceHolder exactly, exec a vouched Settler paying the wallet at least minOut", () => {
  assert.deepEqual(checkZeroExCalls(zeroEx(), zeroExExpected), { ok: true, guaranteedOut: MIN_OUT });
});

test("0x: another recipient, another token, a lower minimum, a stranger Settler or native value are refused", () => {
  assert.deepEqual(checkZeroExCalls(zeroEx({ recipient: STRANGER }), zeroExExpected), { ok: false, reason: "wrong_recipient" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ buyToken: STRANGER }), zeroExExpected), { ok: false, reason: "wrong_token" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ minOut: MIN_OUT - 1n }), zeroExExpected), { ok: false, reason: "below_minimum" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ target: STRANGER }), zeroExExpected), { ok: false, reason: "wrong_target" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ to: STRANGER }), zeroExExpected), { ok: false, reason: "wrong_target" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ amount: AMOUNT + 1n }), zeroExExpected), { ok: false, reason: "wrong_amount" });
  assert.deepEqual(checkZeroExCalls(zeroEx({ value: 1n }), zeroExExpected), { ok: false, reason: "native_value" });
  assert.deepEqual(checkZeroExCalls([approve(TOKEN_IN, ZEROX_ALLOWANCE_HOLDER, AMOUNT * 2n), zeroEx()[1]!], zeroExExpected), { ok: false, reason: "wrong_approval" });
  assert.deepEqual(checkZeroExCalls(zeroEx().slice(1), zeroExExpected), { ok: false, reason: "wrong_shape" });
});

// ── Socket (its allowance holder → executor): opaque inner calldata must at least name the receiver. ────────────────
const socket = (overrides: { receiver?: Address; operator?: Address; amount?: bigint; to?: Address; value?: bigint; approveTo?: Address } = {}) => [
  approve(TOKEN_IN, overrides.approveTo ?? SOCKET_ALLOWANCE_HOLDER),
  {
    to: overrides.to ?? SOCKET_ALLOWANCE_HOLDER,
    data: encodeFunctionData({ abi: execAbi, functionName: "exec", args: [overrides.operator ?? SOCKET_EXECUTOR, TOKEN_IN, overrides.amount ?? AMOUNT, overrides.operator ?? SOCKET_EXECUTOR, concat([SELECTOR, encodeAbiParameters(parseAbiParameters("address, uint256"), [overrides.receiver ?? WALLET, MIN_OUT])])] }),
    value: overrides.value ?? NO_VALUE,
  },
];
const socketExpected = { token: TOKEN_IN, amount: AMOUNT, receiver: WALLET, expiresAt: LATER, now: NOW };

test("Socket: approve its allowance holder exactly, exec through its executor for the amount, receiver named", () => {
  assert.deepEqual(checkSocketCalls(socket(), socketExpected), { ok: true });
});

test("Socket: a missing receiver, a stranger operator, another amount, native value, a wrong approval or an expired quote are refused", () => {
  assert.deepEqual(checkSocketCalls(socket({ receiver: STRANGER }), socketExpected), { ok: false, reason: "receiver_missing" });
  assert.deepEqual(checkSocketCalls(socket({ operator: STRANGER }), socketExpected), { ok: false, reason: "wrong_operator" });
  assert.deepEqual(checkSocketCalls(socket({ amount: AMOUNT - 1n }), socketExpected), { ok: false, reason: "wrong_amount" });
  assert.deepEqual(checkSocketCalls(socket({ to: STRANGER }), socketExpected), { ok: false, reason: "wrong_target" });
  assert.deepEqual(checkSocketCalls(socket({ value: 1n }), socketExpected), { ok: false, reason: "native_value" });
  assert.deepEqual(checkSocketCalls(socket({ approveTo: STRANGER }), socketExpected), { ok: false, reason: "wrong_approval" });
  assert.deepEqual(checkSocketCalls(socket(), { ...socketExpected, now: LATER + 1 }), { ok: false, reason: "expired" });
});

// ── Gas.zip (one native-value deposit on Arc): the destination's short id and the recipient as the first 20 bytes. ─
const gasZip = (overrides: { recipient?: Address; to?: Address; value?: bigint; chain?: number } = {}) => [
  {
    to: overrides.to ?? GASZIP_DEPOSIT[ARC]!,
    data: encodeFunctionData({ abi: depositAbi, functionName: "deposit", args: [BigInt(GASZIP_SHORT_IDS[overrides.chain ?? BASE]!), pad(overrides.recipient ?? WALLET, { dir: "right" })] }),
    value: overrides.value ?? ONE_NATIVE,
  },
];
const gasZipExpected = { originChainId: ARC, destinationChainId: BASE, amountWei: ONE_NATIVE, recipient: WALLET, expires: LATER, now: NOW };

test("Gas.zip: one deposit to its Arc contract for exactly the amount, to the wallet on Base", () => {
  assert.deepEqual(checkGasZipCalls(gasZip(), gasZipExpected), { ok: true });
});

test("Gas.zip: another recipient, chain, contract or value, or an expired quote are refused", () => {
  assert.deepEqual(checkGasZipCalls(gasZip({ recipient: STRANGER }), gasZipExpected), { ok: false, reason: "wrong_recipient" });
  assert.deepEqual(checkGasZipCalls(gasZip({ chain: 1 }), gasZipExpected), { ok: false, reason: "wrong_destination" });
  assert.deepEqual(checkGasZipCalls(gasZip({ to: STRANGER }), gasZipExpected), { ok: false, reason: "wrong_target" });
  assert.deepEqual(checkGasZipCalls(gasZip({ value: ONE_NATIVE + 1n }), gasZipExpected), { ok: false, reason: "wrong_value" });
  assert.deepEqual(checkGasZipCalls(gasZip(), { ...gasZipExpected, now: LATER + 1 }), { ok: false, reason: "expired" });
});
