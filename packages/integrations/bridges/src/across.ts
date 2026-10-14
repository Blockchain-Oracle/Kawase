// Across (app.across.to, keyless). The swap API returns, for an exact input, the approval and the SpokePool
// `deposit` a wallet sends on the origin chain; a relayer fills on the destination within seconds. Checked live on
// Arc 2026-10-02: Arc → Base 50 USDC, 49.991 out, ~2 s, SpokePool 0x9b4A…4A84, `deposit(bytes32 depositor, bytes32
// recipient, bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256
// destinationChainId, bytes32 exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32
// exclusivityParameter, bytes message)`. What was built is decoded and checked before it is signed.
import { decodeFunctionData, encodeFunctionData, erc20Abi, pad, parseAbi, type Address, type Hex } from "viem";

const API = "https://app.across.to/api";
const TIMEOUT_MS = 8_000;
const NO_VALUE = 0n;
const APPROVE_AND_DEPOSIT = 2;

const spokeAbi = parseAbi([
  "function deposit(bytes32 depositor, bytes32 recipient, bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, bytes32 exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityParameter, bytes message) payable",
]);

export type BridgeCall = { to: Address; data: Hex; value: bigint };

export type AcrossQuoteInput = {
  originChainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  amount: bigint;
  depositor: Address;
  recipient: Address;
};

export type AcrossQuote = {
  outputAmount: bigint;
  minOutputAmount: bigint;
  fillSeconds: number | null;
  spokePool: Address;
  /** Approve the SpokePool for exactly the amount, then deposit. */
  calls: BridgeCall[];
};

export class BridgeProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: "no_quote" | "amount_too_low" | "timeout" | "refused" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "BridgeProviderError";
  }
}

async function get(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("Across", "timeout", "Across did not answer in time");
  }
}

export async function acrossQuote(input: AcrossQuoteInput): Promise<AcrossQuote> {
  const query = new URLSearchParams({
    tradeType: "exactInput",
    amount: input.amount.toString(),
    inputToken: input.inputToken,
    outputToken: input.outputToken,
    originChainId: String(input.originChainId),
    destinationChainId: String(input.destinationChainId),
    depositor: input.depositor,
    recipient: input.recipient,
  });
  const { ok, body } = await get(`${API}/swap/approval?${query}`);
  const swap = body.swapTx as { to?: Address; data?: Hex; value?: string; chainId?: number } | undefined;
  if (body.code === "AMOUNT_TOO_LOW") throw new BridgeProviderError("Across", "amount_too_low", String(body.message ?? "amount too low"));
  if (!ok || !swap?.to || !swap.data || typeof body.expectedOutputAmount !== "string") throw new BridgeProviderError("Across", "no_quote", String(body.message ?? "no quote"));
  return {
    outputAmount: BigInt(body.expectedOutputAmount),
    minOutputAmount: BigInt(String(body.minOutputAmount ?? body.expectedOutputAmount)),
    fillSeconds: typeof body.expectedFillTime === "number" ? body.expectedFillTime : null,
    spokePool: swap.to,
    calls: [
      { to: input.inputToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [swap.to, input.amount] }), value: NO_VALUE },
      { to: swap.to, data: swap.data, value: BigInt(swap.value ?? "0") },
    ],
  };
}

export type AcrossCheckReason = "wrong_shape" | "wrong_spoke_pool" | "wrong_depositor" | "wrong_recipient" | "wrong_tokens" | "wrong_amount" | "below_minimum" | "wrong_destination" | "native_value" | "has_message";

/** The deposit pays exactly `recipient` on `destinationChainId` at least `minOutput`, from the wallet, with no hook. */
export function checkAcrossCalls(
  calls: readonly BridgeCall[],
  expected: { spokePool: Address; depositor: Address; recipient: Address; inputToken: Address; outputToken: Address; amount: bigint; minOutput: bigint; destinationChainId: number },
): { ok: true } | { ok: false; reason: AcrossCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const word = (address: Address) => pad(address, { size: 32 }).toLowerCase();
  const [approve, deposit] = calls;
  if (calls.length !== APPROVE_AND_DEPOSIT || !approve || !deposit) return { ok: false, reason: "wrong_shape" };
  if (!same(deposit.to, expected.spokePool)) return { ok: false, reason: "wrong_spoke_pool" };
  if (approve.value !== NO_VALUE || deposit.value !== NO_VALUE) return { ok: false, reason: "native_value" };
  const approval = decodeFunctionData({ abi: erc20Abi, data: approve.data });
  if (approval.functionName !== "approve" || !same(approve.to, expected.inputToken) || !same(approval.args[0] as Address, expected.spokePool) || approval.args[1] !== expected.amount)
    return { ok: false, reason: "wrong_shape" };
  const decoded = decodeFunctionData({ abi: spokeAbi, data: deposit.data });
  const [depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, destinationChainId, , , , , message] = decoded.args;
  if (depositor.toLowerCase() !== word(expected.depositor)) return { ok: false, reason: "wrong_depositor" };
  if (recipient.toLowerCase() !== word(expected.recipient)) return { ok: false, reason: "wrong_recipient" };
  if (inputToken.toLowerCase() !== word(expected.inputToken) || outputToken.toLowerCase() !== word(expected.outputToken)) return { ok: false, reason: "wrong_tokens" };
  if (inputAmount !== expected.amount) return { ok: false, reason: "wrong_amount" };
  if (outputAmount < expected.minOutput) return { ok: false, reason: "below_minimum" };
  if (destinationChainId !== BigInt(expected.destinationChainId)) return { ok: false, reason: "wrong_destination" };
  if (message !== "0x") return { ok: false, reason: "has_message" };
  return { ok: true };
}

export type AcrossStatus = { status: "pending" | "filled" | "expired" | "refunded" | "unknown"; fillTxHash: Hex | null };

/** A deposit's fill, by the origin transaction's hash. */
export async function acrossStatus(originChainId: number, depositTxHash: Hex): Promise<AcrossStatus> {
  const { body } = await get(`${API}/deposit/status?originChainId=${originChainId}&depositTxHash=${depositTxHash}&depositTxnRef=${depositTxHash}`);
  const status = String(body.status ?? "unknown");
  const known = ["pending", "filled", "expired", "refunded"] as const;
  return {
    status: (known as readonly string[]).includes(status) ? (status as AcrossStatus["status"]) : "unknown",
    fillTxHash: (body.fillTx as Hex | undefined) ?? (body.fillTxHash as Hex | undefined) ?? null,
  };
}
