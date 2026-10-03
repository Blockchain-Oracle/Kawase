// What the phone checks before it signs, whatever the server sent (security review M6). The addresses and chain ids
// are compiled into the app (@kawase/networks), never taken from a response:
// - an EIP-7702 authorization only ever points the wallet at MetaMask's EIP7702StatelessDeleGator, on Arc;
// - a delegation is only ever signed for Kawase's DelegationManager on Arc, from this wallet, with caveats the phone
//   decodes itself (an enforcer it does not know is refused);
// - a flow then compares what it decoded with what its confirm card shows (checkGrant, checkRevoke).
import { decodeAbiParameters, decodeFunctionData, getAddress, hexToBigInt, isAddressEqual, size, slice, toFunctionSelector, type Address, type Hex } from "viem";

import { DELEGATION_FRAMEWORK, NETWORKS } from "@kawase/networks";

/** The only chains this wallet signs an authorization or a delegation for. */
export const ARC_CHAIN_IDS: readonly number[] = Object.values(NETWORKS).map((network) => network.chainId);

const ADDRESS_BYTES = 20;
const WORD_BYTES = 32;
const SELECTOR_BYTES = 4;
const HALF_WORD_BYTES = 16;
/** Period terms carry three words: amount, period length, start. */
const PERIOD_WORDS = 3;
/** ERC20PeriodTransferEnforcer terms: token (20) + amount, period, start (32 each). */
const PERIOD_TRANSFER_BYTES = ADDRESS_BYTES + PERIOD_WORDS * WORD_BYTES;
/** ERC20TransferAmountEnforcer terms: token (20) + amount (32). */
const TRANSFER_AMOUNT_BYTES = ADDRESS_BYTES + WORD_BYTES;
/** NativeTokenPeriodTransferEnforcer terms: amount, period, start (32 each). */
const NATIVE_PERIOD_BYTES = PERIOD_WORDS * WORD_BYTES;
const ZERO = 0n;
/** A delegation signed by its delegator directly (not a re-delegation of another one). */
const ROOT_AUTHORITY = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const DELEGATION_DOMAIN_NAME = "DelegationManager";
const TRANSFER_SELECTOR = toFunctionSelector("transfer(address,uint256)");
const DISABLE_DELEGATION_ABI = [
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          { name: "caveats", type: "tuple[]", components: [{ name: "enforcer", type: "address" }, { name: "terms", type: "bytes" }, { name: "args", type: "bytes" }] },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;
/** The DeleGator's `execute(bytes32 mode, bytes executionCalldata)`: how the wallet runs a batch it sends to itself. */
const EXECUTE_ABI = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "mode", type: "bytes32" }, { name: "executionCalldata", type: "bytes" }], outputs: [] }] as const;
const EXECUTIONS = [{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }] as const;
/** ERC-7579 mode bytes: the first byte is the call type (0x00 single, 0x01 batch). */
const CALL_TYPE_BATCH = "0x01";

/** The phone would not sign this: it is not what the app shows, or not something Kawase ever asks for. */
export class SigningRefused extends Error {
  constructor(readonly reason: string) {
    super(`refused to sign: ${reason}`);
    this.name = "SigningRefused";
  }
}

const refuse = (reason: string): never => {
  throw new SigningRefused(reason);
};
const same = (a: unknown, b: string) => typeof a === "string" && a.length > 0 && a.toLowerCase() === b.toLowerCase();

// ── 7702 authorization ────────────────────────────────────────────────────────────────────────────────────────────

/** Only MetaMask's EIP7702StatelessDeleGator, only on Arc (chain id 0 would be every chain). */
export function checkAuthorization(authorization: { address?: string | undefined; contractAddress?: string | undefined; chainId: number }) {
  const target = authorization.contractAddress ?? authorization.address;
  if (!same(target, DELEGATION_FRAMEWORK.eip7702StatelessDeleGator)) refuse("the setup names a contract other than the DeleGator");
  if (!ARC_CHAIN_IDS.includes(authorization.chainId)) refuse("the setup is for a chain other than Arc");
}

// ── Delegations ───────────────────────────────────────────────────────────────────────────────────────────────────

export type Execution = { target: Address; value: bigint; callData: Hex };

export type DecodedCaveat =
  | { type: "erc20PeriodTransfer"; token: Address; amount: bigint; periodSeconds: number; startsAt: number }
  | { type: "erc20TransferAmount"; token: Address; maxAmount: bigint }
  | { type: "nativeTokenPeriodTransfer"; amount: bigint; periodSeconds: number; startsAt: number }
  | { type: "allowedTargets"; targets: Address[] }
  | { type: "allowedMethods"; selectors: Hex[] }
  | { type: "allowedCalldata"; startIndex: number; value: Hex }
  | { type: "exactCalldata"; callData: Hex }
  | { type: "exactExecution"; execution: Execution }
  | { type: "exactExecutionBatch"; executions: Execution[] }
  | { type: "timestamp"; after: number; before: number }
  | { type: "redeemer"; redeemers: Address[] }
  | { type: "valueLte"; maxValue: bigint }
  | { type: "limitedCalls"; limit: number };

export type DecodedDelegation = { delegate: Address; delegator: Address; caveats: DecodedCaveat[] };

const chunks = (terms: Hex, bytes: number) => {
  if (size(terms) === 0 || size(terms) % bytes !== 0) refuse("caveat terms of the wrong length");
  return Array.from({ length: size(terms) / bytes }, (_, index) => slice(terms, index * bytes, (index + 1) * bytes));
};
const word = (terms: Hex, at: number) => hexToBigInt(slice(terms, at, at + WORD_BYTES));
const exactly = (terms: Hex, bytes: number) => {
  if (size(terms) !== bytes) refuse("caveat terms of the wrong length");
};

/** One caveat's terms, read with the layout its enforcer expects (MetaMask Delegation Framework v1.3.0). */
function decodeCaveat(enforcer: string, terms: Hex): DecodedCaveat {
  const known = DELEGATION_FRAMEWORK.enforcers;
  const is = (address: string) => isAddressEqual(enforcer as Address, address as Address);
  if (is(known.erc20PeriodTransfer)) {
    exactly(terms, PERIOD_TRANSFER_BYTES);
    return { type: "erc20PeriodTransfer", token: getAddress(slice(terms, 0, ADDRESS_BYTES)), amount: word(terms, ADDRESS_BYTES), periodSeconds: Number(word(terms, ADDRESS_BYTES + WORD_BYTES)), startsAt: Number(word(terms, ADDRESS_BYTES + (PERIOD_WORDS - 1) * WORD_BYTES)) };
  }
  if (is(known.erc20TransferAmount)) {
    exactly(terms, TRANSFER_AMOUNT_BYTES);
    return { type: "erc20TransferAmount", token: getAddress(slice(terms, 0, ADDRESS_BYTES)), maxAmount: word(terms, ADDRESS_BYTES) };
  }
  if (is(known.nativeTokenPeriodTransfer)) {
    exactly(terms, NATIVE_PERIOD_BYTES);
    return { type: "nativeTokenPeriodTransfer", amount: word(terms, 0), periodSeconds: Number(word(terms, WORD_BYTES)), startsAt: Number(word(terms, (PERIOD_WORDS - 1) * WORD_BYTES)) };
  }
  if (is(known.allowedTargets)) return { type: "allowedTargets", targets: chunks(terms, ADDRESS_BYTES).map((address) => getAddress(address)) };
  if (is(known.redeemer)) return { type: "redeemer", redeemers: chunks(terms, ADDRESS_BYTES).map((address) => getAddress(address)) };
  if (is(known.allowedMethods)) return { type: "allowedMethods", selectors: chunks(terms, SELECTOR_BYTES) };
  if (is(known.allowedCalldata)) {
    if (size(terms) <= WORD_BYTES) refuse("caveat terms of the wrong length");
    return { type: "allowedCalldata", startIndex: Number(word(terms, 0)), value: slice(terms, WORD_BYTES) };
  }
  if (is(known.exactCalldata)) return { type: "exactCalldata", callData: terms };
  if (is(known.timestamp)) {
    exactly(terms, WORD_BYTES);
    return { type: "timestamp", after: Number(hexToBigInt(slice(terms, 0, HALF_WORD_BYTES))), before: Number(hexToBigInt(slice(terms, HALF_WORD_BYTES, WORD_BYTES))) };
  }
  if (is(known.valueLte)) {
    exactly(terms, WORD_BYTES);
    return { type: "valueLte", maxValue: word(terms, 0) };
  }
  if (is(known.limitedCalls)) {
    exactly(terms, WORD_BYTES);
    return { type: "limitedCalls", limit: Number(word(terms, 0)) };
  }
  if (is(known.exactExecution)) {
    if (size(terms) < ADDRESS_BYTES + WORD_BYTES) refuse("caveat terms of the wrong length");
    const callData = size(terms) > ADDRESS_BYTES + WORD_BYTES ? slice(terms, ADDRESS_BYTES + WORD_BYTES) : "0x";
    return { type: "exactExecution", execution: { target: getAddress(slice(terms, 0, ADDRESS_BYTES)), value: word(terms, ADDRESS_BYTES), callData } };
  }
  if (is(known.exactExecutionBatch)) {
    const [executions] = decodeAbiParameters(EXECUTIONS, terms);
    return { type: "exactExecutionBatch", executions: executions.map((entry) => ({ target: getAddress(entry.target), value: entry.value, callData: entry.callData })) };
  }
  return refuse(`a caveat this app does not know (${enforcer})`);
}

type TypedDataLike = { domain?: Record<string, unknown> | undefined; primaryType?: string | undefined; message?: Record<string, unknown> | undefined };

/** The typed data is a delegation for Kawase's DelegationManager on Arc. */
export function isDelegationTypedData(typedData: TypedDataLike) {
  return typedData.primaryType === "Delegation" || same(typedData.domain?.verifyingContract, DELEGATION_FRAMEWORK.delegationManager);
}

/**
 * A delegation the wallet is asked to sign, decoded on the phone: for Kawase's DelegationManager on Arc, signed by this
 * wallet directly (never a re-delegation), every caveat one the phone can read.
 */
export function decodeDelegation(typedData: TypedDataLike, wallet: Address): DecodedDelegation {
  const { domain, message } = typedData;
  if (typedData.primaryType !== "Delegation") refuse("a delegation under another type name");
  if (!same(domain?.verifyingContract, DELEGATION_FRAMEWORK.delegationManager) || domain?.name !== DELEGATION_DOMAIN_NAME) refuse("a delegation for another contract");
  if (!ARC_CHAIN_IDS.includes(Number(domain?.chainId))) refuse("a delegation for a chain other than Arc");
  if (!message || !same(message.delegator, wallet)) refuse("a delegation from another wallet");
  if (!same(message!.authority, ROOT_AUTHORITY)) refuse("a re-delegation");
  if (typeof message!.delegate !== "string") refuse("a delegation without a delegate");
  const caveats = (message!.caveats ?? []) as { enforcer: string; terms: Hex }[];
  if (!Array.isArray(caveats) || caveats.length === 0) refuse("a delegation without limits");
  return { delegate: getAddress(message!.delegate as string), delegator: getAddress(message!.delegator as string), caveats: caveats.map((caveat) => decodeCaveat(caveat.enforcer, caveat.terms)) };
}

/** What every typed-data signature on the phone passes: a delegation must decode (above); anything else is untouched. */
export function checkTypedData(typedData: TypedDataLike, wallet: Address) {
  if (isDelegationTypedData(typedData)) decodeDelegation(typedData, wallet);
}

/** The receipt a confirm card shows (`GrantReceipt` from the api), as strings. */
export type ShownGrant = {
  redeemer: string;
  token?: string | undefined;
  amountPerPeriod?: string | undefined;
  periodSeconds?: number | undefined;
  startsAt?: number | undefined;
  expiresAt?: number | undefined;
  targets: string[];
  methods: string[];
  recipient?: string | undefined;
  /** Every pinned argument word, by its byte offset in calldata: the whole word, and its low 20 bytes as an address. */
  pins?: { startIndex: number; address: string; value?: string | undefined }[] | undefined;
  maxNativeValue?: string | undefined;
  redeemers: string[];
  maxCalls?: number | undefined;
  unknownCaveats: string[];
};

const FIRST_ARGUMENT_OFFSET = 4;
type Pin = { startIndex: number; address: string; value: string };

/**
 * A pin's words, each on its own, as the api's receipt lists them: one pin may cover several ABI words (a struct's
 * fields in a row) or only the top of one; a whole word's low 20 bytes are its address.
 */
function pinsOf(startIndex: number, value: Hex): Pin[] {
  const out: Pin[] = [];
  for (let offset = 0; offset < size(value); offset += WORD_BYTES) {
    const word = slice(value, offset, Math.min(offset + WORD_BYTES, size(value)));
    out.push({ startIndex: startIndex + offset, address: size(word) === WORD_BYTES ? slice(word, WORD_BYTES - ADDRESS_BYTES, WORD_BYTES) : "0x", value: word });
  }
  return out;
}

/** The same receipt, worked out on the phone from the delegation itself. */
export function receiptOf(decoded: DecodedDelegation): Omit<ShownGrant, "unknownCaveats"> & { pins: Pin[] } {
  const receipt: Omit<ShownGrant, "unknownCaveats"> & { pins: Pin[] } = { redeemer: decoded.delegate, targets: [], methods: [], redeemers: [], pins: [] };
  for (const caveat of decoded.caveats) {
    switch (caveat.type) {
      case "erc20PeriodTransfer":
        Object.assign(receipt, { token: caveat.token, amountPerPeriod: caveat.amount.toString(), periodSeconds: caveat.periodSeconds, startsAt: caveat.startsAt });
        break;
      case "allowedTargets":
        receipt.targets = caveat.targets;
        break;
      case "allowedMethods":
        receipt.methods = caveat.selectors;
        break;
      case "timestamp":
        receipt.expiresAt = caveat.before;
        break;
      case "redeemer":
        receipt.redeemers = caveat.redeemers;
        break;
      case "valueLte":
        receipt.maxNativeValue = caveat.maxValue.toString();
        break;
      case "limitedCalls":
        receipt.maxCalls = caveat.limit;
        break;
      case "allowedCalldata":
        for (const pin of pinsOf(caveat.startIndex, caveat.value)) {
          receipt.pins.push(pin);
          if (pin.startIndex === FIRST_ARGUMENT_OFFSET) receipt.recipient = pin.address;
        }
        break;
      default:
        break;
    }
  }
  return receipt;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((entry, index) => entry.toLowerCase() === b[index]!.toLowerCase());
const sameOptional = (a: string | number | undefined, b: string | number | undefined) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/**
 * A grant matches the receipt its card shows: the same redeemer, token, amount, period, end, targets, methods, pinned
 * arguments and recipient, decoded on the phone from the bytes to be signed. It is redeemable only by its delegate,
 * never moves native value, and carries no exact-call terms (those are a relayed batch's, not a grant's). A receipt
 * with terms the api could not read is not signed.
 */
export function checkGrant(typedData: TypedDataLike, shown: ShownGrant, wallet: Address): DecodedDelegation {
  const decoded = decodeDelegation(typedData, wallet);
  const mine = receiptOf(decoded);
  if (shown.unknownCaveats.length > 0) refuse("the card shows terms it could not read");
  if (decoded.caveats.some((caveat) => caveat.type === "exactCalldata" || caveat.type === "exactExecution" || caveat.type === "exactExecutionBatch" || caveat.type === "nativeTokenPeriodTransfer"))
    refuse("a grant with terms its card does not show");
  // Whole words when the card's receipt carries them, addresses otherwise.
  const words = (pins: readonly { startIndex: number; address: string; value?: string | undefined }[], whole: boolean) =>
    pins.map((pin) => `${pin.startIndex}:${(whole ? (pin.value ?? "") : pin.address).toLowerCase()}`);
  const whole = Boolean(shown.pins?.every((pin) => pin.value !== undefined));
  const checks: [string, boolean][] = [
    ["redeemer", sameOptional(mine.redeemer, shown.redeemer)],
    ["redeemers", sameList(mine.redeemers, shown.redeemers)],
    ["token", sameOptional(mine.token, shown.token)],
    ["amount", sameOptional(mine.amountPerPeriod, shown.amountPerPeriod)],
    ["period", sameOptional(mine.periodSeconds, shown.periodSeconds)],
    ["expiry", sameOptional(mine.expiresAt, shown.expiresAt)],
    ["targets", sameList(mine.targets, shown.targets)],
    ["methods", sameList(mine.methods, shown.methods)],
    ["recipient", sameOptional(mine.recipient, shown.recipient)],
    ["pinned arguments", shown.pins === undefined || sameList(words(mine.pins, whole), words(shown.pins, whole))],
    ["native value", sameOptional(mine.maxNativeValue ?? "0", shown.maxNativeValue ?? "0")],
    ["uses", shown.maxCalls === undefined || mine.maxCalls === shown.maxCalls],
  ];
  const differs = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (differs.length > 0) refuse(`the grant differs from its card in: ${differs.join(", ")}`);
  if (mine.redeemers.length === 0 || !mine.redeemers.every((address) => isAddressEqual(address as Address, decoded.delegate))) refuse("a grant someone else could redeem");
  if (BigInt(mine.maxNativeValue ?? "0") !== ZERO) refuse("a grant that can move native value");
  return decoded;
}

/**
 * A spending grant (the everyday allowance, an automation's send, the marketplace top-up): everything checkGrant
 * checks, and it can only `transfer` its one token.
 */
export function checkTransferGrant(typedData: TypedDataLike, shown: ShownGrant, wallet: Address): DecodedDelegation {
  const decoded = checkGrant(typedData, shown, wallet);
  const mine = receiptOf(decoded);
  if (!mine.token || mine.targets.length === 0 || !mine.targets.every((target) => isAddressEqual(target as Address, mine.token as Address))) refuse("a grant that can call more than its token");
  if (mine.methods.length !== 1 || mine.methods[0]!.toLowerCase() !== TRANSFER_SELECTOR) refuse("a grant that can do more than transfer");
  return decoded;
}

/** The disableDelegation calls in a batch, each turning off a delegation from this wallet, with no value. */
function checkDisables(executions: readonly Execution[], wallet: Address) {
  if (executions.length === 0) refuse("a revoke with nothing in it");
  for (const execution of executions) {
    if (!isAddressEqual(execution.target, DELEGATION_FRAMEWORK.delegationManager as Address) || execution.value !== ZERO) refuse("a revoke that calls something else");
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: DISABLE_DELEGATION_ABI, data: execution.callData });
    } catch {
      return refuse("a revoke that calls something else");
    }
    if (!isAddressEqual(decoded.args[0].delegator, wallet)) refuse("a revoke of another wallet's grant");
  }
}

/**
 * An on-chain revoke does only that: every call is `DelegationManager.disableDelegation` of one of this wallet's grants.
 * Relayed (a one-time delegation pinned to exactly those calls, once) or a transaction the wallet sends itself.
 */
export function checkRevoke(request: { typedData: TypedDataLike } | { transaction: { to: string; data: Hex; value: string; chainId: number } }, wallet: Address) {
  if ("typedData" in request) {
    const decoded = decodeDelegation(request.typedData, wallet);
    const pinned = decoded.caveats.flatMap((caveat) => (caveat.type === "exactExecution" ? [caveat.execution] : caveat.type === "exactExecutionBatch" ? caveat.executions : []));
    if (!decoded.caveats.some((caveat) => caveat.type === "exactExecution" || caveat.type === "exactExecutionBatch")) refuse("a revoke that is not pinned to its calls");
    if (!decoded.caveats.some((caveat) => caveat.type === "limitedCalls" && caveat.limit === 1)) refuse("a revoke that could be used more than once");
    checkDisables(pinned, wallet);
    return;
  }
  const { transaction } = request;
  if (!ARC_CHAIN_IDS.includes(transaction.chainId)) refuse("a revoke for a chain other than Arc");
  if (BigInt(transaction.value) !== ZERO) refuse("a revoke that moves money");
  if (isAddressEqual(transaction.to as Address, DELEGATION_FRAMEWORK.delegationManager as Address)) return checkDisables([{ target: transaction.to as Address, value: ZERO, callData: transaction.data }], wallet);
  if (!isAddressEqual(transaction.to as Address, wallet)) refuse("a revoke sent somewhere else");
  // The wallet's own batch: execute(mode, executionCalldata), one call packed or several ABI-encoded.
  let call;
  try {
    call = decodeFunctionData({ abi: EXECUTE_ABI, data: transaction.data });
  } catch {
    return refuse("a revoke that calls something else");
  }
  const [mode, packed] = call.args;
  if (slice(mode, 0, 1) === CALL_TYPE_BATCH) {
    const [executions] = decodeAbiParameters(EXECUTIONS, packed);
    return checkDisables(executions.map((entry) => ({ target: entry.target, value: entry.value, callData: entry.callData })), wallet);
  }
  return checkDisables([{ target: getAddress(slice(packed, 0, ADDRESS_BYTES)), value: word(packed, ADDRESS_BYTES), callData: slice(packed, ADDRESS_BYTES + WORD_BYTES) }], wallet);
}
