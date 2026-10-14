// Uniswap's calldata check, offline: built Universal Router calls that must pass and the wrong-token, wrong-recipient
// and left-in-the-router cases that must be refused.
// Run: pnpm --filter @kawase/api exec tsx --test test/uniswap-check.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { concat, encodeAbiParameters, encodeFunctionData, erc20Abi, numberToHex, parseAbi, parseAbiParameters, type Address, type Hex } from "viem";

import { checkUniswapCalls, PERMIT2, UNISWAP_ROUTERS } from "../src/routing/uniswap";

const CHAIN = 5042;
const ROUTER = UNISWAP_ROUTERS[CHAIN]!;
const WALLET: Address = "0x1111111111111111111111111111111111111111";
const STRANGER: Address = "0x9999999999999999999999999999999999999999";
const TOKEN_IN: Address = "0x2222222222222222222222222222222222222222";
const TOKEN_OUT: Address = "0x3333333333333333333333333333333333333333";
const OTHER: Address = "0x4444444444444444444444444444444444444444";
const MSG_SENDER: Address = "0x0000000000000000000000000000000000000001";
const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";
const AMOUNT_IN = 10_000_000n;
const MIN_OUT = 8_500_000n;
const POOL_FEE = 500;
const DEADLINE = 2_000_000_000n;
const CMD = { V3: 0x00, SWEEP: 0x04, V2: 0x08 } as const;

const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const expected = { chainId: CHAIN, tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, amountIn: AMOUNT_IN, recipient: WALLET, minOut: MIN_OUT, nativeIn: false };

const v3Path = (...tokens: Address[]): Hex => concat(tokens.flatMap((token, index) => (index === 0 ? [token] : [numberToHex(POOL_FEE, { size: 3 }), token])));
const v3 = (recipient: Address, path: Hex, minimum = MIN_OUT, amount = AMOUNT_IN) => ({ command: CMD.V3, input: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, bytes, bool"), [recipient, amount, minimum, path, true]) });
const v2 = (recipient: Address, path: Address[], minimum = MIN_OUT) => ({ command: CMD.V2, input: encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address[], bool"), [recipient, AMOUNT_IN, minimum, path, true]) });
const sweep = (token: Address, recipient: Address, minimum: bigint) => ({ command: CMD.SWEEP, input: encodeAbiParameters(parseAbiParameters("address, address, uint256"), [token, recipient, minimum]) });

/** approve exactly to Permit2, then the router's `execute` with these commands. */
function calls(steps: { command: number; input: Hex }[], spender: Address = PERMIT2) {
  const commands = concat(steps.map((step) => numberToHex(step.command, { size: 1 })));
  return [
    { to: TOKEN_IN, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, AMOUNT_IN] }), value: 0n },
    { to: ROUTER, data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [commands, steps.map((step) => step.input), DEADLINE] }), value: 0n },
  ];
}

test("a V3 swap of tokenIn → tokenOut paid to the wallet passes and counts its minimum", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(WALLET, v3Path(TOKEN_IN, OTHER, TOKEN_OUT))]), expected), { ok: true, guaranteedOut: MIN_OUT });
});

test("a V3 path that ends in another token is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(WALLET, v3Path(TOKEN_IN, OTHER))]), expected), { ok: false, reason: "wrong_amount" });
});

test("a V3 path that starts from another token is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(MSG_SENDER, v3Path(OTHER, TOKEN_OUT))]), expected), { ok: false, reason: "wrong_amount" });
});

test("a V2 path that ends in another token is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v2(WALLET, [TOKEN_IN, OTHER])]), expected), { ok: false, reason: "wrong_amount" });
});

test("a swap paid to someone else is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(STRANGER, v3Path(TOKEN_IN, TOKEN_OUT))]), expected), { ok: false, reason: "wrong_recipient" });
});

test("output left in the router with no sweep is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v2(ADDRESS_THIS, [TOKEN_IN, TOKEN_OUT])]), expected), { ok: false, reason: "wrong_recipient" });
});

test("output left in the router passes once a later sweep of tokenOut pays the wallet, counting the sweep's minimum", () => {
  assert.deepEqual(checkUniswapCalls(calls([v2(ADDRESS_THIS, [TOKEN_IN, TOKEN_OUT], 0n), sweep(TOKEN_OUT, MSG_SENDER, MIN_OUT)]), expected), { ok: true, guaranteedOut: MIN_OUT });
});

test("a sweep of another token does not count, and does not release output left in the router", () => {
  assert.deepEqual(checkUniswapCalls(calls([v2(ADDRESS_THIS, [TOKEN_IN, TOKEN_OUT]), sweep(OTHER, WALLET, MIN_OUT)]), expected), { ok: false, reason: "wrong_recipient" });
});

test("a sweep to someone else is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v2(ADDRESS_THIS, [TOKEN_IN, TOKEN_OUT]), sweep(TOKEN_OUT, STRANGER, MIN_OUT)]), expected), { ok: false, reason: "wrong_recipient" });
});

test("a route whose minimums sum below the quote's minimum is refused", () => {
  const half = AMOUNT_IN / 2n;
  const steps = [v3(WALLET, v3Path(TOKEN_IN, TOKEN_OUT), MIN_OUT / 4n, half), v3(WALLET, v3Path(TOKEN_IN, OTHER, TOKEN_OUT), MIN_OUT / 4n, half)];
  assert.deepEqual(checkUniswapCalls(calls(steps), expected), { ok: false, reason: "below_minimum" });
});

test("an input that is not exactly the amount is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(WALLET, v3Path(TOKEN_IN, TOKEN_OUT), MIN_OUT, AMOUNT_IN + 1n)]), expected), { ok: false, reason: "wrong_amount" });
});

test("an approval to anyone but Permit2 is refused", () => {
  assert.deepEqual(checkUniswapCalls(calls([v3(WALLET, v3Path(TOKEN_IN, TOKEN_OUT))], STRANGER), expected), { ok: false, reason: "wrong_approval" });
});
