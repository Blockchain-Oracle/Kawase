// D38 on the phone: the budget's one-shot leaves and per-contact grants that Kawase builds pass the device checks, and
// every way a server could bend them is refused before anything is signed: another venue, a lower minimum than the
// phone's own quote, a balance watched for someone else, a longer life, a second use, a missing kill-switch, twin
// salts, a deposit for someone else, a grant to a stranger. The kill-switch call is accepted as a revoke.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";
import { SigningRefused, checkContactGrant, checkEarnLeaves, checkGrant, checkRevoke, checkSwapLeaves, type ShownGrant } from "@kawase/wallet";

import {
  LEAF_TTL_SECONDS,
  buildContactSendGrants,
  buildEarnLeaves,
  buildSwapLeaves,
  describeGrant,
  encodeIncrementNonce,
  encodeRedeemLeaves,
  encodeSelfBatch,
  grantTypedData,
  randomSalt,
  withSignature,
} from "../src";

const network = getNetwork("testnet");
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const ops = privateKeyToAccount(generatePrivateKey()).address;
const router = privateKeyToAccount(generatePrivateKey()).address;
const otherRouter = privateKeyToAccount(generatePrivateKey()).address;
const vault = privateKeyToAccount(generatePrivateKey()).address;
const contact = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const { usdc, eurc } = network.addresses;
const now = 1_791_000_000;
const nonce = 3n;
const json = <T>(value: T) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as T;
const typed = (leaf: Delegation) => json(grantTypedData(network, leaf)) as never;
const refused = (run: () => unknown, reason: RegExp) =>
  assert.throws(run, (error: unknown) => error instanceof SigningRefused && reason.test(error.reason), `expected a refusal matching ${reason}`);

const swapTerms = { network, wallet, ops, router, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n, routerCalldata: "0xdeadbeef" as Hex, nonce, now };
const expectSwap = { wallet, ops, now, nonce, routers: [router], tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n };
const swapPair = (overrides: Partial<typeof swapTerms> = {}, salts: [Hex, Hex] = [randomSalt(), randomSalt()]) => {
  const leaves = buildSwapLeaves({ ...swapTerms, ...overrides, salts });
  return [typed(leaves.approveLeaf), typed(leaves.swapLeaf)] as const;
};

test("a swap leaf pair Kawase builds passes the phone's checks", () => {
  const checked = checkSwapLeaves(swapPair(), expectSwap);
  assert.equal(checked.router, router);
  assert.equal(checked.guaranteedOut, 8_500_000n);
});

test("the phone refuses a swap leaf that differs from what it expects", () => {
  refused(() => checkSwapLeaves(swapPair({ router: otherRouter }), expectSwap), /allowlist/);
  refused(() => checkSwapLeaves(swapPair({ minOut: 8_000_000n }), expectSwap), /less than the phone's own quote/);
  refused(() => checkSwapLeaves(swapPair({ amountIn: 11_000_000n }), expectSwap), /approval of another spender or amount/);
  refused(() => checkSwapLeaves(swapPair({ ops: stranger }), expectSwap), /someone other than Kawase's ops wallet/);
  refused(() => checkSwapLeaves(swapPair({ now: now + 3600 }), expectSwap), /lives too long/);
  refused(() => checkSwapLeaves(swapPair({ now: now - 3600 }), expectSwap), /already expired/);
  refused(() => checkSwapLeaves(swapPair({ nonce: 2n }), expectSwap), /another kill-switch nonce/);
  const salt = randomSalt();
  refused(() => checkSwapLeaves(swapPair({}, [salt, salt]), expectSwap), /salts of their own/);
  refused(() => checkSwapLeaves(swapPair({ wallet: stranger }), expectSwap), /another wallet/);
});

test("a swap leaf with its output watched for someone else, or used twice, is refused", () => {
  const leaves = buildSwapLeaves({ ...swapTerms, salts: [randomSalt(), randomSalt()] });
  const balance = leaves.swapLeaf.caveats.find((caveat) => caveat.terms.length === 2 + 73 * 2 && caveat.terms.startsWith("0x00"))!;
  const redirected: Delegation = {
    ...leaves.swapLeaf,
    caveats: leaves.swapLeaf.caveats.map((caveat) => (caveat === balance ? { ...caveat, terms: (caveat.terms.slice(0, 44) + stranger.slice(2).toLowerCase() + caveat.terms.slice(84)) as Hex } : caveat)),
  };
  refused(() => checkSwapLeaves([typed(leaves.approveLeaf), typed(redirected)], expectSwap), /someone else's balance/);
  const limit = leaves.swapLeaf.caveats.find((caveat) => caveat.terms === `0x${"0".repeat(63)}1` && caveat !== balance)!;
  const twice: Delegation = { ...leaves.swapLeaf, caveats: leaves.swapLeaf.caveats.map((caveat) => (caveat === limit ? { ...caveat, terms: `0x${"0".repeat(63)}2` as Hex } : caveat)) };
  refused(() => checkSwapLeaves([typed(leaves.approveLeaf), typed(twice)], expectSwap), /more than once|kill-switch/);
  const noKill: Delegation = { ...leaves.swapLeaf, caveats: leaves.swapLeaf.caveats.slice(0, -1) };
  refused(() => checkSwapLeaves([typed(leaves.approveLeaf), typed(noKill)], expectSwap), /kill-switch/);
});

test("a leaf is never accepted as a standing grant, and an unsigned leaf is never redeemed", () => {
  const leaves = buildSwapLeaves({ ...swapTerms, salts: [randomSalt(), randomSalt()] });
  const shown = json(describeGrant(network, leaves.swapLeaf)) as unknown as ShownGrant;
  refused(() => checkGrant(typed(leaves.swapLeaf), shown, wallet), /terms its card does not show/);
  assert.throws(() => encodeRedeemLeaves(network, leaves.steps), /not signed/);
  const signed = leaves.steps.map((step) => ({ ...step, grant: withSignature(step.grant, "0x01") }));
  assert.equal(encodeRedeemLeaves(network, signed).data.slice(0, 10), "0xcef6d209");
});

test("earn leaves pin the receiver to the wallet and pass the phone's checks", () => {
  const base = { network, wallet, ops, vault, asset: usdc, amount: 5_000_000n, nonce, now, salts: [randomSalt(), randomSalt()] as const };
  const expectBase = { wallet, ops, now, nonce, vaults: [vault], vault, asset: usdc, amount: 5_000_000n };
  const deposit = buildEarnLeaves({ ...base, action: "deposit", minOut: 4_900_000n });
  assert.equal(deposit.leaves.length, 2);
  checkEarnLeaves(deposit.leaves.map(typed), { ...expectBase, action: "deposit", minOut: 4_900_000n });
  refused(() => checkEarnLeaves(deposit.leaves.map(typed), { ...expectBase, action: "deposit", minOut: 5_000_000n }), /too few shares/);
  refused(() => checkEarnLeaves(deposit.leaves.map(typed), { ...expectBase, vaults: [otherRouter], action: "deposit", minOut: 4_900_000n }), /allowlist/);
  const forOther = buildEarnLeaves({ ...base, wallet: stranger, action: "deposit", minOut: 4_900_000n });
  refused(() => checkEarnLeaves(forOther.leaves.map(typed), { ...expectBase, action: "deposit", minOut: 4_900_000n }), /another wallet/);

  const withdraw = buildEarnLeaves({ ...base, action: "withdraw", minOut: 4_990_000n, maxSharesIn: 5_100_000n });
  assert.equal(withdraw.leaves.length, 1);
  checkEarnLeaves(withdraw.leaves.map(typed), { ...expectBase, action: "withdraw", minOut: 4_990_000n, maxSharesIn: 5_100_000n });
  refused(() => checkEarnLeaves(withdraw.leaves.map(typed), { ...expectBase, action: "withdraw", minOut: 4_990_000n, maxSharesIn: 5_000_000n }), /burn too many shares/);
});

test("per-contact send grants pay only their contact, carry the kill-switch, and pass the card check", () => {
  const terms = { network, wallet, redeemer: ops, token: usdc, amountPerPeriod: 50_000_000n, periodSeconds: 604_800, startsAt: now, expiresAt: now + 604_800, nonce };
  const [toContact, toStranger] = buildContactSendGrants({ ...terms, contacts: [{ address: contact, salt: randomSalt() }, { address: stranger, salt: randomSalt() }] });
  const expected = { wallet, ops, token: usdc, recipient: contact, maxPerPeriod: 50_000_000n, nonce };
  checkContactGrant(typed(toContact!), expected);
  refused(() => checkContactGrant(typed(toStranger!), expected), /someone other than this contact/);
  refused(() => checkContactGrant(typed(toContact!), { ...expected, maxPerPeriod: 10_000_000n }), /above the budget's cap/);
  refused(() => checkContactGrant(typed(toContact!), { ...expected, nonce: 4n }), /another kill-switch nonce/);
  // The existing card check still passes, with the nonce on the receipt.
  const shown = json(describeGrant(network, toContact!)) as unknown as ShownGrant;
  assert.equal(BigInt(shown.nonce!), nonce);
  checkGrant(typed(toContact!), shown, wallet);
  refused(() => checkGrant(typed(toContact!), { ...shown, nonce: "0x05" }, wallet), /kill-switch/);
});

test("the kill-switch is a revoke the phone signs with no prompt; anything else at the enforcer is not", () => {
  const kill = encodeIncrementNonce(network);
  checkRevoke({ transaction: { to: kill.to, data: kill.data, value: "0", chainId: network.chainId } }, wallet);
  checkRevoke({ transaction: { to: wallet, data: encodeSelfBatch([{ to: kill.to, data: kill.data }]), value: "0", chainId: network.chainId } }, wallet);
  assert.throws(() => checkRevoke({ transaction: { to: kill.to, data: kill.data, value: "1", chainId: network.chainId } }, wallet), SigningRefused);
  const sneaky = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [stranger as Address, 1n] });
  assert.throws(() => checkRevoke({ transaction: { to: wallet, data: encodeSelfBatch([{ to: kill.to, data: kill.data }, { to: usdc, data: sneaky }]), value: "0", chainId: network.chainId } }, wallet), SigningRefused);
  assert.equal(LEAF_TTL_SECONDS, 120);
});
