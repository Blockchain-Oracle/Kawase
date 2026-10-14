// What the phone checks before it signs a budget action's one-shot leaves (D38, docs pack budget.md §9), whatever the
// server sent. The server proposes the leaves; the phone decodes every caveat itself (checks.ts) and compares them
// with what it expects on its own: its own quote's minimum, the venue on its allowlist, its own clock. Only a leaf that
// passes is signed with no Face ID; anything else is refused, never shown as "inside the budget".
//
// A swap is two leaves redeemed together by the ops wallet:
//  - approve: ExactExecution of `tokenIn.approve(router, amountIn)`, no value, the router on the allowlist;
//  - swap:    AllowedTargets [router], ValueLte 0, the wallet's tokenOut up by at least the phone's own minimum, the
//             wallet's tokenIn down by at most amountIn.
// Both: from this wallet, to the ops wallet, Redeemer [ops], LimitedCalls 1, a Timestamp no later than now + 120 s
// (+ slack), the Nonce kill-switch, and a salt of their own. An earn move is the same with the vault's ERC-4626 call
// pinned exactly (receiver and owner the wallet) and the share/asset balance changes.
import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, isAddressEqual, parseAbi, type Address } from "viem";

import { SigningRefused, decodeDelegation, receiptOf, type DecodedCaveat, type DecodedDelegation } from "./checks";

/** A leaf lives this long (action-grants.ts LEAF_TTL_SECONDS); the phone allows a little clock skew on top. */
export const LEAF_TTL_SECONDS = 120;
export const LEAF_CLOCK_SLACK_SECONDS = 30;

const ZERO = 0n;
/** A swap leaf watches two balances (output up, input down); a deposit is two leaves (approve, deposit). */
const SWAP_BALANCE_CHECKS = 2;
const DEPOSIT_LEAVES = 2;
const TRANSFER_SELECTOR = "0xa9059cbb";
/** Terms every leaf carries; anything else must be named by the leaf's kind. */
const COMMON: readonly DecodedCaveat["type"][] = ["redeemer", "limitedCalls", "timestamp", "nonce"];
const ERC4626_ABI = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
]);

type TypedDataLike = Parameters<typeof decodeDelegation>[0];

const refuse = (reason: string): never => {
  throw new SigningRefused(reason);
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const find = <T extends DecodedCaveat["type"]>(decoded: DecodedDelegation, type: T) =>
  decoded.caveats.filter((caveat): caveat is Extract<DecodedCaveat, { type: T }> => caveat.type === type);

const one = <T extends DecodedCaveat["type"]>(decoded: DecodedDelegation, type: T, name: string) => {
  const found = find(decoded, type);
  if (found.length !== 1) refuse(`a leaf without exactly one ${name}`);
  return found[0]!;
};

export type LeafExpectation = {
  /** This wallet: the only delegator, and the only recipient any balance change may watch. */
  wallet: Address;
  /** Kawase's ops wallet, compiled into the app per network: the only delegate and redeemer. */
  ops: Address;
  /** Unix seconds on the phone's own clock. */
  now: number;
  /** The wallet's current NonceEnforcer nonce, when the phone has read it; otherwise only its presence is required. */
  nonce?: bigint | undefined;
};

/** What every leaf must be: one use, only ops, short-lived, bound to the kill-switch, nothing the phone cannot read. */
function checkLeafCommon(decoded: DecodedDelegation, expected: LeafExpectation, allowed: readonly DecodedCaveat["type"][]) {
  if (!isAddressEqual(decoded.delegate, expected.ops)) refuse("a leaf for someone other than Kawase's ops wallet");
  const stray = decoded.caveats.find((caveat) => !allowed.includes(caveat.type) && !COMMON.includes(caveat.type));
  if (stray) refuse(`a leaf with a ${stray.type} term`);
  const redeemer = one(decoded, "redeemer", "redeemer");
  if (redeemer.redeemers.length !== 1 || !isAddressEqual(redeemer.redeemers[0]!, expected.ops)) refuse("a leaf someone else could redeem");
  if (one(decoded, "limitedCalls", "use limit").limit !== 1) refuse("a leaf that could be used more than once");
  const timestamp = one(decoded, "timestamp", "expiry");
  if (timestamp.before === 0 || timestamp.before > expected.now + LEAF_TTL_SECONDS + LEAF_CLOCK_SLACK_SECONDS) refuse("a leaf that lives too long");
  if (timestamp.before <= expected.now) refuse("a leaf that has already expired");
  const nonce = one(decoded, "nonce", "kill-switch");
  if (expected.nonce !== undefined && nonce.nonce !== expected.nonce) refuse("a leaf bound to another kill-switch nonce");
  const balance = find(decoded, "erc20BalanceChange");
  if (balance.some((change) => !isAddressEqual(change.recipient, expected.wallet))) refuse("a leaf that watches someone else's balance");
  // Two balance changes on one token in one delegation lock each other (enforcer-is-locked): never what Kawase sends.
  if (new Set(balance.map((change) => change.token.toLowerCase())).size !== balance.length) refuse("a leaf that watches one token twice");
}


/** Each leaf has its own salt: limits and balance caches are keyed by the delegation, so twins would share them. */
function checkSalts(typedData: readonly TypedDataLike[]) {
  const salts = typedData.map((entry) => String(entry.message?.salt ?? ""));
  if (salts.some((salt) => salt === "" || salt === "0") || new Set(salts).size !== salts.length) refuse("leaves without salts of their own");
}

function checkApprove(decoded: DecodedDelegation, token: Address, spender: Address, amount: bigint) {
  const exact = one(decoded, "exactExecution", "pinned call").execution;
  if (!isAddressEqual(exact.target, token) || exact.value !== ZERO) refuse("an approval of another token");
  const expectedCall = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  if (!same(exact.callData, expectedCall)) refuse("an approval of another spender or amount");
}

const increase = (decoded: DecodedDelegation, token: Address) => find(decoded, "erc20BalanceChange").find((change) => change.direction === "increase" && isAddressEqual(change.token, token));
const decrease = (decoded: DecodedDelegation, token: Address) => find(decoded, "erc20BalanceChange").find((change) => change.direction === "decrease" && isAddressEqual(change.token, token));

// ── Swap ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SwapLeafExpectation = LeafExpectation & {
  /** Venue contracts the person's budget allows (the venue allowlist, as contracts on this network). */
  routers: readonly Address[];
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /** The least the phone accepts: from its own quote, less the budget's slippage. Never the server's number. */
  minOut: bigint;
};

export type CheckedSwapLeaves = { approve: DecodedDelegation; swap: DecodedDelegation; router: Address; guaranteedOut: bigint };

/** The two leaves of a swap (approve, then swap), as typed data, checked against what the phone expects. */
export function checkSwapLeaves(typedData: readonly [TypedDataLike, TypedDataLike], expected: SwapLeafExpectation): CheckedSwapLeaves {
  const approve = decodeDelegation(typedData[0], expected.wallet);
  const swap = decodeDelegation(typedData[1], expected.wallet);
  checkSalts(typedData);
  checkLeafCommon(approve, expected, ["exactExecution"]);
  checkLeafCommon(swap, expected, ["allowedTargets", "valueLte", "erc20BalanceChange"]);

  const targets = one(swap, "allowedTargets", "target list").targets;
  if (targets.length !== 1) refuse("a swap leaf that can call more than its venue");
  const router = getAddress(targets[0]!);
  if (!expected.routers.some((allowed) => isAddressEqual(allowed, router))) refuse("a venue outside the budget's allowlist");
  if (one(swap, "valueLte", "value limit").maxValue !== ZERO) refuse("a swap leaf that can move native value");
  checkApprove(approve, expected.tokenIn, router, expected.amountIn);

  const out = increase(swap, expected.tokenOut);
  const spent = decrease(swap, expected.tokenIn);
  if (!out || !spent || find(swap, "erc20BalanceChange").length !== SWAP_BALANCE_CHECKS) refuse("a swap leaf without its output and spend checks");
  if (out!.amount < expected.minOut) refuse("a swap leaf that accepts less than the phone's own quote");
  if (out!.amount === ZERO) refuse("a swap leaf that accepts nothing back");
  if (spent!.amount > expected.amountIn) refuse("a swap leaf that can spend more than the amount");
  return { approve, swap, router, guaranteedOut: out!.amount };
}

// ── Earn ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type EarnLeafExpectation = LeafExpectation & {
  action: "deposit" | "withdraw";
  /** Vaults the budget allows. */
  vaults: readonly Address[];
  vault: Address;
  /** The vault's asset (USDC). */
  asset: Address;
  amount: bigint;
  /** Deposit: least shares back. Withdraw: least asset back. From the phone's own preview read. */
  minOut: bigint;
  /** Withdraw only: most shares burned. */
  maxSharesIn?: bigint | undefined;
};

/** A vault move's leaves (deposit: approve then deposit; withdraw: one), checked against what the phone expects. */
export function checkEarnLeaves(typedData: readonly TypedDataLike[], expected: EarnLeafExpectation): DecodedDelegation[] {
  if (!expected.vaults.some((allowed) => isAddressEqual(allowed, expected.vault))) refuse("a vault outside the budget's allowlist");
  const decoded = typedData.map((entry) => decodeDelegation(entry, expected.wallet));
  checkSalts(typedData);
  const pinned = (leaf: DecodedDelegation) => one(leaf, "exactExecution", "pinned call").execution;
  if (expected.action === "deposit") {
    if (decoded.length !== DEPOSIT_LEAVES) refuse("a deposit that is not approve + deposit");
    const [approve, deposit] = decoded as [DecodedDelegation, DecodedDelegation];
    checkLeafCommon(approve, expected, ["exactExecution"]);
    checkLeafCommon(deposit, expected, ["exactExecution", "erc20BalanceChange"]);
    checkApprove(approve, expected.asset, expected.vault, expected.amount);
    const call = pinned(deposit);
    if (!isAddressEqual(call.target, expected.vault) || call.value !== ZERO) refuse("a deposit into another contract");
    const args = decodeFunctionData({ abi: ERC4626_ABI, data: call.callData });
    if (args.functionName !== "deposit" || args.args[0] !== expected.amount || !isAddressEqual(args.args[1], expected.wallet)) refuse("a deposit of another amount, or for someone else");
    const shares = increase(deposit, expected.vault);
    const spent = decrease(deposit, expected.asset);
    if (!shares || shares.amount < expected.minOut || shares.amount === ZERO) refuse("a deposit that accepts too few shares");
    if (!spent || spent.amount > expected.amount) refuse("a deposit that can spend more than the amount");
    return decoded;
  }
  if (decoded.length !== 1) refuse("a withdraw that is more than one call");
  const [withdraw] = decoded as [DecodedDelegation];
  checkLeafCommon(withdraw, expected, ["exactExecution", "erc20BalanceChange"]);
  const call = pinned(withdraw);
  if (!isAddressEqual(call.target, expected.vault) || call.value !== ZERO) refuse("a withdraw from another contract");
  const args = decodeFunctionData({ abi: ERC4626_ABI, data: call.callData });
  if (args.functionName !== "withdraw" || args.args[0] !== expected.amount || !isAddressEqual(args.args[1], expected.wallet) || !isAddressEqual(args.args[2], expected.wallet))
    refuse("a withdraw of another amount, or to someone else");
  const got = increase(withdraw, expected.asset);
  const burned = decrease(withdraw, expected.vault);
  if (!got || got.amount < expected.minOut || got.amount === ZERO) refuse("a withdraw that accepts too little back");
  if (expected.maxSharesIn === undefined || !burned || burned.amount > expected.maxSharesIn) refuse("a withdraw that can burn too many shares");
  return decoded;
}

// ── Per-contact send grants (the away pack) ───────────────────────────────────────────────────────────────────────

export type ContactGrantExpectation = {
  wallet: Address;
  ops: Address;
  token: Address;
  /** A saved contact's address: the only one the grant may pay. */
  recipient: Address;
  /** The most per period the budget allows for sends to a contact. */
  maxPerPeriod: bigint;
  nonce?: bigint | undefined;
};

/** A standing send grant: one token, `transfer` only, only to this saved contact, capped, ops only, kill-switch bound. */
export function checkContactGrant(typedData: TypedDataLike, expected: ContactGrantExpectation): DecodedDelegation {
  const decoded = decodeDelegation(typedData, expected.wallet);
  const receipt = receiptOf(decoded);
  if (!isAddressEqual(decoded.delegate, expected.ops)) refuse("a grant for someone other than Kawase's ops wallet");
  if (receipt.redeemers.length !== 1 || !isAddressEqual(receipt.redeemers[0] as Address, expected.ops)) refuse("a grant someone else could redeem");
  if (!receipt.token || !isAddressEqual(receipt.token as Address, expected.token)) refuse("a grant of another token");
  if (receipt.targets.length !== 1 || !isAddressEqual(receipt.targets[0] as Address, expected.token)) refuse("a grant that can call more than its token");
  if (receipt.methods.length !== 1 || receipt.methods[0]!.toLowerCase() !== TRANSFER_SELECTOR) refuse("a grant that can do more than transfer");
  if (!receipt.recipient || !isAddressEqual(receipt.recipient as Address, expected.recipient)) refuse("a grant that pays someone other than this contact");
  if (receipt.pins.length !== 1) refuse("a grant with pins its card does not show");
  if (BigInt(receipt.amountPerPeriod ?? "0") > expected.maxPerPeriod) refuse("a grant above the budget's cap");
  if (BigInt(receipt.maxNativeValue ?? "0") !== ZERO) refuse("a grant that can move native value");
  if (receipt.nonce === undefined) refuse("a grant without the kill-switch");
  if (expected.nonce !== undefined && BigInt(receipt.nonce!) !== expected.nonce) refuse("a grant bound to another kill-switch nonce");
  if (decoded.caveats.some((caveat) => caveat.type === "exactExecution" || caveat.type === "exactExecutionBatch" || caveat.type === "exactCalldata" || caveat.type === "erc20BalanceChange"))
    refuse("a grant with terms its card does not show");
  return decoded;
}


/** The balance-change terms a leaf carries, for a receipt line ("Output had to land in your wallet: at least …"). */
export function leafGuarantees(decoded: DecodedDelegation): { token: Address; amount: bigint; direction: "increase" | "decrease" }[] {
  return find(decoded, "erc20BalanceChange").map((change) => ({ token: change.token, amount: change.amount, direction: change.direction }));
}

