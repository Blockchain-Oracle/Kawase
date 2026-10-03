// Bring to Arc in two steps (a token not yet approved to Permit2 on the chain it is on): Relay's live answer for WETH on
// Base from a fresh address is exactly one approval (WETH → Permit2, for at least the amount) plus the Permit2
// signature; Kawase's check accepts that and nothing else (another spender, less than the amount, another token, native
// value, an extra call), and the approval runs on Base from that address (simulated: nothing is sent). The second step
// (the Permit2 signature) is the path proven for already approved tokens. Run: tsx --test test/bring-in-two-step.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicClient, encodeFunctionData, erc20Abi, http, maxUint256, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { checkPermit2Approval, PERMIT2, relayQuote } from "@kawase/integrations-bridges";

const BASE_RPC = "https://mainnet.base.org";
const ARC_MAINNET = 5042;
const BASE_WETH: Address = "0x4200000000000000000000000000000000000006";
const ARC_WETH: Address = "0x128cC466B61f542da60c70e3aA11c10e19B84EDB";
const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AMOUNT = 1_000_000_000_000_000n;

test("a token not yet approved to Permit2 comes in two steps: exactly the approval, then the signature", { timeout: 120_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const quote = await relayQuote({ originChainId: base.id, destinationChainId: ARC_MAINNET, originCurrency: BASE_WETH, destinationCurrency: ARC_WETH, amount: AMOUNT, user: wallet, recipient: wallet, usePermit: true });
  assert.ok(quote.permit, "the second step is a signature");
  assert.equal(quote.calls.length, 1, `${quote.calls.length} calls`);
  assert.ok(checkPermit2Approval(quote.calls, { token: BASE_WETH, amount: AMOUNT }), "Relay's approval passes the check");
  console.log(`Relay for 0.001 WETH from Base: approve WETH → Permit2 (${quote.calls[0]!.data.slice(0, 10)}…), then a ${quote.permit.typedData.primaryType} signature; ${quote.outputAmount} arrives`);

  // Anything else is refused.
  const approve = (spender: Address, amount: bigint, token: Address = BASE_WETH, value = 0n) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value });
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  assert.equal(checkPermit2Approval([approve(stranger, maxUint256)], { token: BASE_WETH, amount: AMOUNT }), false, "another spender");
  assert.equal(checkPermit2Approval([approve(PERMIT2, AMOUNT - 1n)], { token: BASE_WETH, amount: AMOUNT }), false, "less than the amount");
  assert.equal(checkPermit2Approval([approve(PERMIT2, maxUint256, BASE_USDC)], { token: BASE_WETH, amount: AMOUNT }), false, "another token");
  assert.equal(checkPermit2Approval([approve(PERMIT2, maxUint256, BASE_WETH, 1n)], { token: BASE_WETH, amount: AMOUNT }), false, "native value");
  assert.equal(checkPermit2Approval([approve(PERMIT2, maxUint256), approve(stranger, 1n)], { token: BASE_WETH, amount: AMOUNT }), false, "an extra call");
  console.log("refused: another spender, less than the amount, another token, native value, an extra call");

  // The approval itself runs on Base from that address (it needs no balance; only its gas, in ETH, is the person's).
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const call = quote.calls[0]!;
  const gas = await client.estimateGas({ account: wallet, to: call.to, data: call.data, value: call.value, stateOverride: [{ address: wallet, balance: 10n ** 18n }] });
  console.log(`the approval simulates on Base for ${gas} gas`);
});
