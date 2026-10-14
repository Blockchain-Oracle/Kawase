// Gas.zip (backend.gas.zip, keyless): sends a chain's own gas coin (ETH on Base, Arbitrum…) for a deposit of the
// origin's native coin. On Arc the native coin is USDC (18 decimals on the native face), so "1 USDC of gas to Base"
// is one native-value transaction. Arc works only as a source: Base → Arc answered "Insufficient Liquidity" (docs
// pack, 2026-10-14). The quote names the deposit contract and its calldata `deposit(uint256 chains, bytes32 to)`,
// where `chains` packs Gas.zip's short ids (Base 54, Arbitrum 57) and `to` holds the receiver left-aligned; it is
// decoded and checked. Arc limits from `/v2/chains`: 0.015 to 750 USD in. Delivery is guaranteed for ~60 s after the
// quote when `from` and `to` are given.
import { decodeFunctionData, getAddress, parseAbi, slice, type Address, type Hex } from "viem";

import { BridgeProviderError, type BridgeCall } from "./across";

const API = "https://backend.gas.zip/v2";
const TIMEOUT_MS = 8_000;
const NO_VALUE = 0n;
const ADDRESS_BYTES = 20;

/** The deposit contract the Arc quote names (read live 2026-10-14; Gas.zip's docs do not list Arc's yet). */
export const GASZIP_DEPOSIT: Readonly<Record<number, Address>> = { 5042: "0x9E22ebeC84c7e4C4bD6D4aE7FF6f4D436D6D8390" };
/** Gas.zip's own short id per destination chain (its `/v2/chains` `short`). */
export const GASZIP_SHORT_IDS: Readonly<Record<number, number>> = { 1: 255, 8453: 54, 42161: 57, 10: 55, 137: 17, 43114: 15, 130: 362 };

const depositAbi = parseAbi(["function deposit(uint256 chains, bytes32 to) payable"]);

export type GasZipQuoteInput = {
  originChainId: number;
  destinationChainId: number;
  /** Native wei on the origin (Arc: USDC at 18 decimals). */
  amountWei: bigint;
  from: Address;
  to: Address;
};

export type GasZipQuote = {
  /** The destination's native coin that arrives, in its wei. */
  outputAmount: bigint;
  outputDecimals: number;
  outputUsd: number | null;
  etaSeconds: number | null;
  /** Unix seconds; re-quote after. */
  expires: number;
  /** One native-value call to the deposit contract. */
  calls: BridgeCall[];
};

async function get(path: string) {
  try {
    const response = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("Gas.zip", "timeout", "Gas.zip did not answer in time");
  }
}

export async function gasZipQuote(input: GasZipQuoteInput): Promise<GasZipQuote> {
  if (!GASZIP_DEPOSIT[input.originChainId]) throw new BridgeProviderError("Gas.zip", "no_quote", "not a Gas.zip origin Kawase uses");
  const { ok, body } = await get(`/quotes/${input.originChainId}/${input.amountWei}/${input.destinationChainId}?from=${input.from}&to=${input.to}`);
  const quote = (body.quotes as { chain?: number; expected?: number | string; decimals?: number; usd?: number; speed?: number }[] | undefined)?.find((entry) => entry.chain === input.destinationChainId);
  const deposit = body.contractDepositTxn as { to?: string; data?: Hex; value?: string } | undefined;
  if (!ok || !quote?.expected || !deposit?.to || !deposit.data) {
    const message = String(body.error ?? body.message ?? "no quote");
    throw new BridgeProviderError("Gas.zip", /min|low|small/i.test(message) ? "amount_too_low" : "no_quote", message);
  }
  return {
    // `expected` is a JSON number above 2^53 for large amounts; its string form keeps every digit it has.
    outputAmount: BigInt(typeof quote.expected === "string" ? quote.expected : Math.floor(quote.expected).toLocaleString("fullwide", { useGrouping: false })),
    outputDecimals: quote.decimals ?? 18,
    outputUsd: typeof quote.usd === "number" ? quote.usd : null,
    etaSeconds: typeof quote.speed === "number" ? quote.speed : null,
    expires: Number(body.expires ?? 0),
    calls: [{ to: getAddress(deposit.to), data: deposit.data, value: BigInt(deposit.value ?? "0") }],
  };
}

export type GasZipCheckReason = "wrong_shape" | "wrong_target" | "wrong_value" | "wrong_destination" | "wrong_recipient" | "expired" | "unreadable";

/** One deposit to the contract Kawase pins, carrying exactly `amountWei`, for exactly the destination and the receiver. */
export function checkGasZipCalls(
  calls: readonly BridgeCall[],
  expected: { originChainId: number; destinationChainId: number; amountWei: bigint; recipient: Address; expires?: number; now?: number },
): { ok: true } | { ok: false; reason: GasZipCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const call = calls[0];
  const contract = GASZIP_DEPOSIT[expected.originChainId];
  const short = GASZIP_SHORT_IDS[expected.destinationChainId];
  if (calls.length !== 1 || !call || !contract || short === undefined) return { ok: false, reason: "wrong_shape" };
  if (!same(call.to, contract)) return { ok: false, reason: "wrong_target" };
  if (call.value !== expected.amountWei || call.value === NO_VALUE) return { ok: false, reason: "wrong_value" };
  if (expected.expires && (expected.now ?? Math.floor(Date.now() / 1000)) > expected.expires) return { ok: false, reason: "expired" };
  try {
    const { args } = decodeFunctionData({ abi: depositAbi, data: call.data });
    if (args[0] !== BigInt(short)) return { ok: false, reason: "wrong_destination" };
    if (!same(slice(args[1], 0, ADDRESS_BYTES), expected.recipient)) return { ok: false, reason: "wrong_recipient" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true };
}

export type GasZipStatus = { status: "pending" | "delivered" | "refunded" | "failed"; destinationTx: Hex | null };

/** A deposit's progress by the origin transaction's hash. */
export async function gasZipStatus(txHash: Hex): Promise<GasZipStatus> {
  const { body } = await get(`/deposit/${txHash}`);
  const outbound = (body.txs as { status?: string; hash?: Hex }[] | undefined)?.[0] ?? (body.deposit as { status?: string } | undefined);
  const status = String((outbound as { status?: string } | undefined)?.status ?? "PENDING").toUpperCase();
  if (status === "CONFIRMED" || status === "COMPLETED" || status === "SUCCESS") return { status: "delivered", destinationTx: (outbound as { hash?: Hex }).hash ?? null };
  if (status === "REFUNDED") return { status: "refunded", destinationTx: null };
  if (status === "FAILED" || status === "CANCELLED") return { status: "failed", destinationTx: null };
  return { status: "pending", destinationTx: null };
}
