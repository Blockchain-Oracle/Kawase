// What a payout and a gas-free send check on the phone before it signs (security review M6), on top of checks.ts:
// - a batch (a payout) runs exactly the calls its card shows, in order: relayed, as a one-time delegation pinned to
//   them for Kawase's DelegationManager on Arc; or as the wallet's own `execute` transaction to itself on Arc;
// - a gas-free send's EIP-3009 authorization moves exactly the card's amount of the card's token (USDC or EURC on Arc,
//   compiled into the app) from this wallet to the card's recipient, valid for minutes.
// The marketplace grant uses checkTransferGrant (checks.ts) like the allowance.
//
// And what the phone checks before it signs a budget action's one-shot leaves (D38, docs pack budget.md §9), whatever
// the server sent. The server proposes the leaves; the phone decodes every caveat itself (checks.ts) and compares them
// with what it expects on its own: its own quote's minimum, the venue on its allowlist, its own clock. Only a leaf that
// passes is signed with no Face ID; anything else is refused, never shown as "inside the budget".
//  - a swap is two leaves redeemed together by the ops wallet: approve (ExactExecution of `tokenIn.approve(router,
//    amountIn)`) and swap (AllowedTargets [router], ValueLte 0, tokenOut up by at least the phone's own minimum,
//    tokenIn down by at most amountIn);
//  - both: from this wallet, to the ops wallet, Redeemer [ops], LimitedCalls 1, a Timestamp no later than now + 120 s
//    (+ slack), the Nonce kill-switch, and a salt of their own;
//  - an earn move is the same with the vault's ERC-4626 call pinned exactly (receiver and owner the wallet) and the
//    share/asset balance changes; a per-contact send grant pays only its saved contact.
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  parseAbi,
  recoverTypedDataAddress,
  size,
  slice,
  type Address,
  type Hex,
} from "viem";

import { CANONICAL_TOKENS, NETWORKS, TESTNET_PRICE_TWINS, type CanonicalToken, type NetworkId } from "@kawase/networks";

import { ARC_CHAIN_IDS, SigningRefused, decodeDelegation, receiptOf, type DecodedCaveat, type DecodedDelegation, type Execution } from "./checks";

/** One call the card shows (a payout line is `token.transfer(to, amount)`). */
export type ShownCall = { to: Address; data: Hex; value?: bigint | undefined };

type TypedDataLike = { domain?: Record<string, unknown> | undefined; primaryType?: string | undefined; message?: Record<string, unknown> | undefined };
type BatchTransaction = { to: string; data: Hex; value: string; chainId: number };

const ZERO = 0n;
const ADDRESS_BYTES = 20;
const WORD_BYTES = 32;
const MS_PER_SECOND = 1000;
/** A one-time batch delegation or a gas-free authorization lasts minutes; one valid for longer is not Kawase's. */
const MAX_VALID_SECONDS = 3600;
const EXECUTE_ABI = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "mode", type: "bytes32" }, { name: "executionCalldata", type: "bytes" }], outputs: [] }] as const;
const EXECUTIONS = [{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }] as const;
/** ERC-7579 mode bytes: the first byte is the call type (0x00 single, 0x01 batch). */
const CALL_TYPE_BATCH = "0x01";
/** The tokens Kawase's relayer carries gas-free: USDC and EURC on each Arc network. */
const RELAYABLE = Object.values(NETWORKS).flatMap((network) => [network.addresses.usdc, network.addresses.eurc]);

const refuse = (reason: string): never => {
  throw new SigningRefused(reason);
};
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);

function sameCalls(executions: readonly Execution[], calls: readonly ShownCall[]) {
  if (executions.length !== calls.length) refuse("a batch with other calls than its card");
  executions.forEach((execution, index) => {
    const call = calls[index]!;
    if (!isAddressEqual(execution.target, call.to) || execution.value !== (call.value ?? ZERO) || execution.callData.toLowerCase() !== call.data.toLowerCase())
      refuse("a batch with other calls than its card");
  });
}

/** The calls inside the wallet's own `execute(mode, executionCalldata)`: one packed call, or several ABI-encoded. */
function executionsOf(data: Hex): Execution[] {
  let call;
  try {
    call = decodeFunctionData({ abi: EXECUTE_ABI, data });
  } catch {
    return refuse("a batch that calls something else");
  }
  const [mode, packed] = call.args;
  if (slice(mode, 0, 1) === CALL_TYPE_BATCH) {
    const [executions] = decodeAbiParameters(EXECUTIONS, packed);
    return executions.map((entry) => ({ target: getAddress(entry.target), value: entry.value, callData: entry.callData }));
  }
  if (size(packed) < ADDRESS_BYTES + WORD_BYTES) refuse("a batch that calls something else");
  const callData = size(packed) > ADDRESS_BYTES + WORD_BYTES ? slice(packed, ADDRESS_BYTES + WORD_BYTES) : "0x";
  return [{ target: getAddress(slice(packed, 0, ADDRESS_BYTES)), value: hexToBigInt(slice(packed, ADDRESS_BYTES, ADDRESS_BYTES + WORD_BYTES)), callData }];
}

/**
 * A batch runs exactly `calls`, in order. Relayed: a delegation from this wallet for Kawase's DelegationManager on Arc,
 * pinned to exactly these calls, usable once, only by its delegate, for minutes. Sent by the wallet itself: a
 * transaction on Arc to the wallet's own address, moving no value, whose `execute` runs exactly these calls.
 */
export function checkBatch(request: { typedData: TypedDataLike } | { transaction: BatchTransaction }, calls: readonly ShownCall[], wallet: Address) {
  if (calls.length === 0) refuse("a batch with nothing in it");
  if ("typedData" in request) {
    const decoded = decodeDelegation(request.typedData, wallet);
    const pinned = decoded.caveats.flatMap((caveat) => (caveat.type === "exactExecution" ? [caveat.execution] : caveat.type === "exactExecutionBatch" ? caveat.executions : []));
    if (!decoded.caveats.some((caveat) => caveat.type === "exactExecution" || caveat.type === "exactExecutionBatch")) refuse("a batch that is not pinned to its calls");
    if (!decoded.caveats.some((caveat) => caveat.type === "limitedCalls" && caveat.limit === 1)) refuse("a batch that could be used more than once");
    const redeemers = decoded.caveats.flatMap((caveat) => (caveat.type === "redeemer" ? caveat.redeemers : []));
    if (redeemers.length === 0 || !redeemers.every((address) => isAddressEqual(address, decoded.delegate))) refuse("a batch someone else could redeem");
    const until = decoded.caveats.find((caveat) => caveat.type === "timestamp");
    if (!until || until.type !== "timestamp" || until.before === 0 || until.before > nowSeconds() + MAX_VALID_SECONDS) refuse("a batch valid for longer than minutes");
    sameCalls(pinned, calls);
    return;
  }
  const { transaction } = request;
  if (!ARC_CHAIN_IDS.includes(transaction.chainId)) refuse("a batch for a chain other than Arc");
  if (BigInt(transaction.value) !== ZERO) refuse("a batch that moves native value");
  if (!isAddressEqual(transaction.to as Address, wallet)) refuse("a batch sent somewhere else");
  sameCalls(executionsOf(transaction.data), calls);
}

/** What a gas-free send's card shows: the token, the recipient and the amount in the token's base units. */
export type ShownTransfer = { token: string; to: string; amount: bigint | string };

/**
 * A gas-free send's EIP-3009 `TransferWithAuthorization` moves exactly what its card shows: USDC or EURC on Arc (the
 * addresses compiled into the app), from this wallet, to the card's recipient, the card's amount, valid for minutes.
 */
export function checkTransferAuthorization(typedData: TypedDataLike, shown: ShownTransfer, wallet: Address) {
  const { domain, message } = typedData;
  if (typedData.primaryType !== "TransferWithAuthorization") refuse("a gas-free send under another type name");
  if (!ARC_CHAIN_IDS.includes(Number(domain?.chainId))) refuse("a gas-free send for a chain other than Arc");
  const token = typeof domain?.verifyingContract === "string" ? domain.verifyingContract : "";
  if (!RELAYABLE.some((address) => address.toLowerCase() === token.toLowerCase())) refuse("a gas-free send of a token other than USDC or EURC");
  if (token.toLowerCase() !== shown.token.toLowerCase()) refuse("a gas-free send of another token than its card");
  if (typeof message?.from !== "string" || !isAddressEqual(message.from as Address, wallet)) refuse("a gas-free send from another wallet");
  if (typeof message?.to !== "string" || message.to.toLowerCase() !== shown.to.toLowerCase()) refuse("a gas-free send to someone other than its card");
  if (BigInt(String(message?.value ?? "-1")) !== BigInt(shown.amount)) refuse("a gas-free send of another amount than its card");
  const validBefore = Number(message?.validBefore ?? 0);
  if (!(validBefore > 0) || validBefore > nowSeconds() + MAX_VALID_SECONDS) refuse("a gas-free send valid for longer than minutes");
}

/** USDC or EURC on an Arc network, from the addresses compiled into the app (never from a response). */
export function arcStablecoin(network: NetworkId, symbol: string): Address | undefined {
  const upper = symbol.toUpperCase();
  if (upper !== "USDC" && upper !== "EURC") return undefined;
  return NETWORKS[network].addresses[upper === "USDC" ? "usdc" : "eurc"];
}

/** The calls a payout's lines make: one `token.transfer(address, amount)` each, in order (what its card lists). */
export function transferCalls(token: Address, lines: readonly { address: string; amount: string }[]): ShownCall[] {
  return lines.map((line) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(line.address), BigInt(line.amount)] }) }));
}

// ── Budget leaves (D38) ───────────────────────────────────────────────────────────────────────────────────────────

/** A leaf lives this long (action-grants.ts LEAF_TTL_SECONDS); the phone allows a little clock skew on top. */
export const LEAF_TTL_SECONDS = 120;
export const LEAF_CLOCK_SLACK_SECONDS = 30;

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


/**
 * A delegation's typed data as the api sends it (JSON: the salt as a decimal string) back in the shape the wallet
 * signs (the salt as a bigint). Everything else is already hex, numbers or strings.
 */
export function reviveDelegationTypedData<T extends { message?: Record<string, unknown> | undefined }>(typedData: T): T {
  const message = typedData.message;
  if (!message || typeof message.salt !== "string") return typedData;
  return { ...typedData, message: { ...message, salt: BigInt(message.salt) } };
}

/** The balance-change terms a leaf carries, for a receipt line ("Output had to land in your wallet: at least …"). */
export function leafGuarantees(decoded: DecodedDelegation): { token: Address; amount: bigint; direction: "increase" | "decrease" }[] {
  return find(decoded, "erc20BalanceChange").map((change) => ({ token: change.token, amount: change.amount, direction: change.direction }));
}

// ── The signed budget (D38) ───────────────────────────────────────────────────────────────────────────────────────

/** What a budget can let Kawase do with no prompt. Perps opens, borrowing and new people are never in it. */
export const BUDGET_CATEGORIES = ["swap", "bridge", "earn", "x402", "send"] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

/**
 * The person's weekly budget as their wallet signs it (EIP-712, one Face ID): dollars a week, dollars an action, the
 * categories and the venues. Amounts are US dollars in 6-decimal base units (like USDC). The phone checks the
 * signature itself before it trusts a budget the server returns, so the server can never raise one.
 */
export type BudgetPolicy = {
  wallet: Address;
  chainId: number;
  weeklyCap: bigint;
  perActionCap: bigint;
  categories: BudgetCategory[];
  /** Venue ids ("kyberswap", "app_kit", "lifi", "cctp", a vault address…), lower-case. */
  venues: string[];
  /** Unix seconds. */
  issuedAt: number;
  /** Goes up by one with every new budget the wallet signs. */
  version: number;
};

const BUDGET_DOMAIN_NAME = "Kawase Budget";
const BUDGET_DOMAIN_VERSION = "1";
export const BUDGET_TYPES = {
  Budget: [
    { name: "wallet", type: "address" },
    { name: "weeklyCap", type: "uint256" },
    { name: "perActionCap", type: "uint256" },
    { name: "categories", type: "string[]" },
    { name: "venues", type: "string[]" },
    { name: "issuedAt", type: "uint64" },
    { name: "version", type: "uint32" },
  ],
} as const;

/** The typed data the wallet signs for a budget (no verifying contract: it is a statement, never sent to a chain). */
export function budgetTypedData(policy: BudgetPolicy) {
  return {
    domain: { name: BUDGET_DOMAIN_NAME, version: BUDGET_DOMAIN_VERSION, chainId: policy.chainId },
    types: BUDGET_TYPES,
    primaryType: "Budget" as const,
    message: {
      wallet: policy.wallet,
      weeklyCap: policy.weeklyCap,
      perActionCap: policy.perActionCap,
      categories: policy.categories,
      venues: policy.venues,
      issuedAt: BigInt(policy.issuedAt),
      version: policy.version,
    },
  };
}

/** The budget's numbers make sense: a per-action cap above zero and within the week, only known categories. */
export function isSaneBudget(policy: BudgetPolicy): boolean {
  return (
    ARC_CHAIN_IDS.includes(policy.chainId) &&
    policy.perActionCap > ZERO &&
    policy.perActionCap <= policy.weeklyCap &&
    policy.categories.every((category) => BUDGET_CATEGORIES.includes(category)) &&
    new Set(policy.categories).size === policy.categories.length
  );
}

/** A budget the person's wallet really signed, with sane numbers. */
export async function verifyBudget(policy: BudgetPolicy, signature: Hex): Promise<boolean> {
  if (!isSaneBudget(policy)) return false;
  try {
    const signer = await recoverTypedDataAddress({ ...budgetTypedData(policy), signature });
    return isAddressEqual(signer, policy.wallet);
  } catch {
    return false;
  }
}

// ── What the app compiles in for the budget guard (never taken from a response) ──────────────────────────────────

const MAINNET_CHAIN_ID = NETWORKS.mainnet.chainId;
const TESTNET_CHAIN_ID = NETWORKS.testnet.chainId;

/**
 * Kawase's ops wallet on each Arc network (Circle developer-controlled wallets; the api's OPS_WALLET_ADDRESS_*): the
 * only delegate and the only redeemer a budget leaf or a contact grant may name. A leaf for anyone else is refused.
 */
export const KAWASE_OPS_WALLETS: Readonly<Record<number, Address>> = {
  [MAINNET_CHAIN_ID]: getAddress("0x2afa6cb26f360adecbd8a014030a8aff17ae8b3b"),
  [TESTNET_CHAIN_ID]: getAddress("0x2d9b5452178316e064d10e1424e8acf65a71b6b9"),
};

/**
 * The contract each swap venue's leaf may call (its router), per Arc network. A venue missing here is never silent,
 * whatever the budget lists: the phone cannot tell its router from anyone else's.
 *  - kyberswap: MetaAggregationRouterV2 (@kawase/integrations-kyberswap KYBERSWAP_ROUTER; KyberSwap does not serve testnet);
 *  - app_kit:   Circle App Kit's swap adapter (`swapAdapterContract`, read from the kit 2026-10-14);
 *  - lifi:      LI.FI's diamond on Arc mainnet (@kawase/config LIFI_DIAMOND_ARC).
 */
export const BUDGET_SWAP_ROUTERS: Readonly<Record<number, Readonly<Record<string, readonly Address[]>>>> = {
  [MAINNET_CHAIN_ID]: {
    kyberswap: [getAddress("0x6131B5fae19EA4f9D964eAc0408E4408b66337b5")],
    app_kit: [getAddress("0x7FB8c7260b63934d8da38aF902f87ae6e284a845")],
    lifi: [getAddress("0xA4072583658Fae592A3506A42431cb6316a8d40b")],
  },
  [TESTNET_CHAIN_ID]: {
    app_kit: [getAddress("0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b")],
  },
};

/** The Arc network a chain id is, if it is one. */
export function arcNetworkOf(chainId: number): NetworkId | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId)?.id;
}

/** Kawase's ops wallet on this chain, or undefined off Arc. */
export const opsWalletFor = (chainId: number): Address | undefined => KAWASE_OPS_WALLETS[chainId];

/** The routers of one swap venue on this chain (empty when the app does not know the venue there). */
export function venueRouters(chainId: number, venue: string): readonly Address[] {
  return BUDGET_SWAP_ROUTERS[chainId]?.[venue.toLowerCase()] ?? [];
}

/** A token Kawase vouches for on this chain (the compiled registry), or undefined. */
export function vouchedToken(chainId: number, address: string): CanonicalToken | undefined {
  const network = arcNetworkOf(chainId);
  if (!network) return undefined;
  return CANONICAL_TOKENS[network].find((token) => same(token.address, address));
}

/**
 * Where to price a token independently: itself on mainnet; a test token's mainnet twin on testnet (test money has no
 * market of its own, so it is valued at the real token's price, as the api does).
 */
export function priceSourceOf(chainId: number, token: Address): { chainId: number; token: Address } | undefined {
  if (chainId === MAINNET_CHAIN_ID) return { chainId, token };
  if (chainId !== TESTNET_CHAIN_ID) return undefined;
  const twin = TESTNET_PRICE_TWINS[token.toLowerCase()];
  return twin ? { chainId: MAINNET_CHAIN_ID, token: twin } : undefined;
}
