// What a payout and a gas-free send check on the phone before it signs (security review M6), on top of checks.ts:
// - a batch (a payout) runs exactly the calls its card shows, in order: relayed, as a one-time delegation pinned to
//   them for Kawase's DelegationManager on Arc; or as the wallet's own `execute` transaction to itself on Arc;
// - a gas-free send's EIP-3009 authorization moves exactly the card's amount of the card's token (USDC or EURC on Arc,
//   compiled into the app) from this wallet to the card's recipient, valid for minutes.
// The marketplace grant uses checkTransferGrant (checks.ts) like the allowance.
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, hexToBigInt, isAddressEqual, size, slice, type Address, type Hex } from "viem";

import { NETWORKS, type NetworkId } from "@kawase/networks";

import { ARC_CHAIN_IDS, SigningRefused, decodeDelegation, type Execution } from "./checks";

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
