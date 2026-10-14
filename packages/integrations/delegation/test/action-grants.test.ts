// D38 on the phone: the budget's one-shot leaves and per-contact grants that Kawase builds pass the device checks, and
// every way a server could bend them is refused before anything is signed: another venue, a lower minimum than the
// phone's own quote, a balance watched for someone else, a longer life, a second use, a missing kill-switch, twin
// salts, a deposit for someone else, a grant to a stranger. The kill-switch call is accepted as a revoke.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";
import {
  APP_KIT_BRIDGES,
  LEAF_TTL_SECONDS as PHONE_LEAF_TTL_SECONDS,
  PERMIT2_ADDRESS,
  SigningRefused,
  checkAwayPack,
  checkContactGrant,
  checkEarnLeaves,
  checkGrant,
  checkRevoke,
  checkSendTransaction,
  checkSwapLeaves,
  type ShownGrant,
} from "@kawase/wallet";

import {
  LEAF_TTL_SECONDS,
  LeafPlanRefused,
  buildAwayPack,
  buildContactSendGrants,
  buildEarnLeaves,
  buildSwapLeaves,
  planSwapLeaves,
  simpleSwapPlan,
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

type SwapOverrides = { wallet?: Address; ops?: Address; router?: Address; amountIn?: bigint; minOut?: bigint; now?: number; nonce?: bigint };
const venue = { targets: [router], spenders: [router] };
const expectSwap = { wallet, ops, now, nonce, venue, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n };
const swapBuild = (overrides: SwapOverrides = {}, salts?: Hex[]) => {
  const amountIn = overrides.amountIn ?? 10_000_000n;
  return buildSwapLeaves({
    network,
    wallet: overrides.wallet ?? wallet,
    ops: overrides.ops ?? ops,
    tokenIn: usdc,
    tokenOut: eurc,
    amountIn,
    minOut: overrides.minOut ?? 8_500_000n,
    plan: simpleSwapPlan(usdc, overrides.router ?? router, amountIn, "0xdeadbeef"),
    nonce: overrides.nonce ?? nonce,
    now: overrides.now ?? now,
    salts,
  });
};
const swapTyped = (overrides: SwapOverrides = {}, salts?: Hex[]) => swapBuild(overrides, salts).leaves.map(typed);

test("a swap's leaves Kawase builds pass the phone's checks: approve, the pinned call, the reset", () => {
  const built = swapBuild();
  assert.equal(built.leaves.length, 3);
  const checked = checkSwapLeaves(built.leaves.map(typed), expectSwap);
  assert.equal(checked.router, router);
  assert.equal(checked.guaranteedOut, 8_500_000n);
  // The router call is pinned exactly: a leaked ops key cannot change its calldata (the residual-allowance gap).
  assert.equal(built.steps[1]!.callData, "0xdeadbeef");
  assert.equal(built.steps[2]!.callData, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, 0n] }));
});

test("the phone refuses a swap leaf that differs from what it expects", () => {
  refused(() => checkSwapLeaves(swapTyped({ router: otherRouter }), expectSwap), /allowlist/);
  refused(() => checkSwapLeaves(swapTyped({ minOut: 8_000_000n }), expectSwap), /less than the phone's own quote/);
  refused(() => checkSwapLeaves(swapTyped({ amountIn: 11_000_000n }), expectSwap), /approval of another spender or amount/);
  refused(() => checkSwapLeaves(swapTyped({ ops: stranger }), expectSwap), /someone other than Kawase's ops wallet/);
  refused(() => checkSwapLeaves(swapTyped({ now: now + 3600 }), expectSwap), /lives too long/);
  refused(() => checkSwapLeaves(swapTyped({ now: now - 3600 }), expectSwap), /already expired/);
  refused(() => checkSwapLeaves(swapTyped({ nonce: 2n }), expectSwap), /another kill-switch nonce/);
  const salt = randomSalt();
  refused(() => checkSwapLeaves(swapTyped({}, [salt, salt, randomSalt()]), expectSwap), /salts of their own/);
  refused(() => checkSwapLeaves(swapTyped({ wallet: stranger }), expectSwap), /another wallet/);
  // Without the reset, the allowance would outlive the swap.
  refused(() => checkSwapLeaves(swapTyped().slice(0, 2), expectSwap), /allowance the swap leaves standing/);
  // Without its approval, the swap would spend an older allowance.
  refused(() => checkSwapLeaves(swapTyped().slice(1), expectSwap), /older allowance|leaves standing/);
});

test("a swap leaf with its output watched for someone else, or used twice, is refused", () => {
  const built = swapBuild();
  const [approve, swapLeaf, reset] = built.leaves as [Delegation, Delegation, Delegation];
  const balance = swapLeaf.caveats.find((caveat) => caveat.terms.length === 2 + 73 * 2 && caveat.terms.startsWith("0x00"))!;
  const redirected: Delegation = {
    ...swapLeaf,
    caveats: swapLeaf.caveats.map((caveat) => (caveat === balance ? { ...caveat, terms: (caveat.terms.slice(0, 44) + stranger.slice(2).toLowerCase() + caveat.terms.slice(84)) as Hex } : caveat)),
  };
  refused(() => checkSwapLeaves([typed(approve), typed(redirected), typed(reset)], expectSwap), /someone else's balance/);
  const limit = swapLeaf.caveats.find((caveat) => caveat.terms === `0x${"0".repeat(63)}1` && caveat !== balance)!;
  const twice: Delegation = { ...swapLeaf, caveats: swapLeaf.caveats.map((caveat) => (caveat === limit ? { ...caveat, terms: `0x${"0".repeat(63)}2` as Hex } : caveat)) };
  refused(() => checkSwapLeaves([typed(approve), typed(twice), typed(reset)], expectSwap), /more than once|kill-switch/);
  const noKill: Delegation = { ...swapLeaf, caveats: swapLeaf.caveats.slice(0, -1) };
  refused(() => checkSwapLeaves([typed(approve), typed(noKill), typed(reset)], expectSwap), /kill-switch/);
});

test("every venue's calls become leaves: Uniswap through Permit2, 0x and Socket allowance holders, native USDC", () => {
  const universal = privateKeyToAccount(generatePrivateKey()).address;
  const permit = encodeFunctionData({ abi: parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]), functionName: "approve", args: [usdc, universal, 10_000_000n, 1_800_000_000] });
  const calls = [
    { to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2_ADDRESS, 10_000_000n] }), value: 0n },
    { to: PERMIT2_ADDRESS, data: permit, value: 0n },
    { to: universal, data: "0xc0ffee" as Hex, value: 0n },
  ];
  const plan = planSwapLeaves(calls, { tokenIn: usdc, amountIn: 10_000_000n, permit2: PERMIT2_ADDRESS });
  assert.equal(plan.approvals.length, 2);
  assert.equal(plan.resets.length, 1);
  const built = buildSwapLeaves({ network, wallet, ops, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n, plan, nonce, now });
  const uniswap = { targets: [universal], spenders: [PERMIT2_ADDRESS] };
  checkSwapLeaves(built.leaves.map(typed), { ...expectSwap, venue: uniswap });
  // A permit to another spender is refused, on the server and on the phone.
  const sneaky = encodeFunctionData({ abi: parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]), functionName: "approve", args: [usdc, stranger, 10_000_000n, 1_800_000_000] });
  assert.throws(() => planSwapLeaves([calls[0]!, { ...calls[1]!, data: sneaky }, calls[2]!], { tokenIn: usdc, amountIn: 10_000_000n, permit2: PERMIT2_ADDRESS }), LeafPlanRefused);
  // A venue whose spender is not its target, with an increaseAllowance first: the plan approves exactly and resets.
  const holder = privateKeyToAccount(generatePrivateKey()).address;
  const increase = encodeFunctionData({ abi: parseAbi(["function increaseAllowance(address spender, uint256 increment)"]), functionName: "increaseAllowance", args: [holder, 10_000_000n] });
  const socketPlan = planSwapLeaves([{ to: usdc, data: increase, value: 0n }, { to: holder, data: "0xabcdef" as Hex, value: 0n }], { tokenIn: usdc, amountIn: 10_000_000n, permit2: PERMIT2_ADDRESS });
  const socketLeaves = buildSwapLeaves({ network, wallet, ops, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n, plan: socketPlan, nonce, now });
  checkSwapLeaves(socketLeaves.leaves.map(typed), { ...expectSwap, venue: { targets: [holder], spenders: [holder] } });
  // USDC paid as Arc's native coin (Uniswap): one leaf, exactly the amount at 18 decimals, and nothing else.
  const nativePlan = planSwapLeaves([{ to: universal, data: "0xc0ffee" as Hex, value: 10_000_000n * 10n ** 12n }], { tokenIn: usdc, amountIn: 10_000_000n, permit2: PERMIT2_ADDRESS });
  const native = buildSwapLeaves({ network, wallet, ops, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n, plan: nativePlan, nonce, now });
  assert.equal(native.leaves.length, 1);
  checkSwapLeaves(native.leaves.map(typed), { ...expectSwap, venue: uniswap, usdc });
  refused(() => checkSwapLeaves(native.leaves.map(typed), { ...expectSwap, venue: uniswap }), /native value/);
  const tooMuch = buildSwapLeaves({ network, wallet, ops, tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n, minOut: 8_500_000n, plan: { ...nativePlan, swap: { ...nativePlan.swap, value: 11_000_000n * 10n ** 12n } }, nonce, now });
  refused(() => checkSwapLeaves(tooMuch.leaves.map(typed), { ...expectSwap, venue: uniswap, usdc }), /native value/);
});

test("a leaf is never accepted as a standing grant, and an unsigned leaf is never redeemed", () => {
  const built = swapBuild();
  const swapLeaf = built.leaves[1]!;
  const shown = json(describeGrant(network, swapLeaf)) as unknown as ShownGrant;
  refused(() => checkGrant(typed(swapLeaf), shown, wallet), /terms its card does not show|could not read/);
  assert.throws(() => encodeRedeemLeaves(network, built.steps), /not signed/);
  const signed = built.steps.map((step) => ({ ...step, grant: withSignature(step.grant, "0x01") }));
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

test("the away pack: contacts, vaults and a move to the wallet itself pass the phone's checks; anything else is refused", () => {
  const bridge = APP_KIT_BRIDGES[network.chainId]!;
  const pack = buildAwayPack({ network, wallet, ops, nonce, now, expiresAt: now + 30 * 86_400, usdc, contacts: [contact], perContactPerWeek: 20_000_000n, vaults: [vault], bridge: { contract: bridge, domains: [6] } });
  assert.deepEqual(pack.map((entry) => entry.purpose), ["contact_send", "vault_approve", "vault_deposit", "vault_withdraw", "bridge_allowance", "bridge_burn"]);
  const offers = pack.map((entry) => ({ purpose: entry.purpose, subject: entry.subject, typedData: typed(entry.grant) }));
  const expected = { wallet, ops, nonce, usdc, chainId: network.chainId, latestEnd: now + 31 * 86_400, contacts: [contact], perContactPerWeek: 20_000_000n, vaults: [vault] };
  checkAwayPack(offers, expected);
  refused(() => checkAwayPack(offers, { ...expected, contacts: [] }), /not a saved contact/);
  refused(() => checkAwayPack(offers, { ...expected, vaults: [] }), /vault outside the budget/);
  refused(() => checkAwayPack(offers, { ...expected, nonce: nonce + 1n }), /kill-switch/);
  refused(() => checkAwayPack(offers, { ...expected, perContactPerWeek: 1n }), /above the budget's cap/);
  refused(() => checkAwayPack(offers, { ...expected, latestEnd: now }), /lives too long/);
  // A move whose mint goes to someone else.
  const elsewhere = buildAwayPack({ network, wallet, ops, nonce, now, expiresAt: now + 86_400, usdc, contacts: [], perContactPerWeek: 1n, vaults: [], bridge: { contract: stranger, domains: [6] } });
  refused(() => checkAwayPack(elsewhere.map((entry) => ({ purpose: entry.purpose, subject: entry.subject, typedData: typed(entry.grant) })), expected), /another spender|another contract/);
});

test("a send the phone signs silently moves exactly its card", () => {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [contact, 5_000_000n] });
  checkSendTransaction({ to: usdc, data, value: "0", chainId: network.chainId }, { token: usdc, to: contact, amount: 5_000_000n });
  refused(() => checkSendTransaction({ to: usdc, data, value: "0", chainId: network.chainId }, { token: usdc, to: stranger, amount: 5_000_000n }), /someone else/);
  refused(() => checkSendTransaction({ to: eurc, data, value: "0", chainId: network.chainId }, { token: usdc, to: contact, amount: 5_000_000n }), /another contract/);
  refused(() => checkSendTransaction({ to: usdc, data, value: "1", chainId: network.chainId }, { token: usdc, to: contact, amount: 5_000_000n }), /native value/);
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

test("the phone allows exactly the leaf life the builder gives (the two packages keep their own copy)", () => {
  assert.equal(PHONE_LEAF_TTL_SECONDS, LEAF_TTL_SECONDS);
});
