// deBridge DLN (dln.debridge.finance, keyless): an order on the origin chain that a solver fills on the destination;
// `create-tx` returns the transaction (to DlnSource for a direct order, to the crosschain forwarder when a swap comes
// first), a flat fee paid in the origin's native coin (`fixFee`; 1 USDC on Arc) and the order id, whose status the
// API reports. On Arc, USDC is quoted as the native coin (0x0…0, 18 decimals), so a USDC order sends value = amount +
// fee and needs no approval. Checked live 2026-10-02: Arc → Base 20 USDC → 19.658 (DlnSource, ~3 s), 20 EURC →
// 19.545 EURC (forwarder). The order is nested in the forwarder's calldata, so the check holds what can be held: the
// contract (DlnSource or the forwarder, deBridge's fixed addresses, deployed on Arc), the approval, the value, and the
// recipient's address and the destination chain inside the calldata; the batch is simulated before it is signed.
import { decodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, pad, parseAbiParameters, slice, toHex, zeroAddress, type Address, type Hex } from "viem";

import { BridgeProviderError, type BridgeCall } from "./across";

const API = "https://dln.debridge.finance/v1.0";
const TIMEOUT_MS = 20_000;
const NO_VALUE = 0n;
const SELECTOR_BYTES = 4;
const WORD_BYTES = 32;
const APPROVE_AND_ORDER = 2;
const HEX_PREFIX = 2;

/** deBridge's native-coin address. */
export const DEBRIDGE_NATIVE: Address = zeroAddress;
/** DlnSource and the crosschain forwarder: the same addresses on every EVM chain deBridge serves (both on Arc). */
export const DEBRIDGE_CONTRACTS: readonly Address[] = ["0xeF4fB24aD0916217251F553c0596F8Edc630EB66", "0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251"];

export type DebridgeQuoteInput = {
  srcChainId: number;
  /** A token address, or DEBRIDGE_NATIVE. */
  srcToken: Address;
  /** In the source token's own units (18 decimals for Arc's native USDC). */
  amount: bigint;
  dstChainId: number;
  dstToken: Address;
  recipient: Address;
  /** Who may cancel or patch the order on each side: the person's own wallet. */
  authority: Address;
};

export type DebridgeQuote = {
  orderId: Hex;
  outputAmount: bigint;
  /** The flat fee, in the origin's native coin (wei-like units). */
  fixFee: bigint;
  fillSeconds: number | null;
  outputToken: { address: Address; symbol: string; decimals: number };
  /** Approve the target for exactly the amount (ERC-20s), then the order (value = fee, plus the amount for native). */
  calls: BridgeCall[];
};

async function get(path: string) {
  try {
    const response = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("deBridge", "timeout", "deBridge did not answer in time");
  }
}

export async function debridgeQuote(input: DebridgeQuoteInput): Promise<DebridgeQuote> {
  const query = new URLSearchParams({
    srcChainId: String(input.srcChainId),
    srcChainTokenIn: input.srcToken,
    srcChainTokenInAmount: input.amount.toString(),
    dstChainId: String(input.dstChainId),
    dstChainTokenOut: input.dstToken,
    dstChainTokenOutAmount: "auto",
    dstChainTokenOutRecipient: input.recipient,
    srcChainOrderAuthorityAddress: input.authority,
    dstChainOrderAuthorityAddress: input.authority,
  });
  const { ok, body } = await get(`/dln/order/create-tx?${query}`);
  const tx = body.tx as { to?: string; data?: Hex; value?: string; allowanceTarget?: string } | undefined;
  const out = (body.estimation as { dstChainTokenOut?: { address?: string; symbol?: string; decimals?: number; amount?: string } } | undefined)?.dstChainTokenOut;
  if (!ok || !tx?.to || !tx.data || !out?.amount || typeof body.orderId !== "string") {
    const message = String(body.errorMessage ?? "no quote");
    throw new BridgeProviderError("deBridge", /too (low|small)|minimum/i.test(message) ? "amount_too_low" : "no_quote", message);
  }
  const target = getAddress(tx.to);
  const native = input.srcToken === DEBRIDGE_NATIVE;
  const calls: BridgeCall[] = [];
  if (!native) calls.push({ to: input.srcToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [getAddress(tx.allowanceTarget ?? target), input.amount] }), value: NO_VALUE });
  calls.push({ to: target, data: tx.data, value: BigInt(tx.value ?? "0") });
  const delay = (body.order as { approximateFulfillmentDelay?: number } | undefined)?.approximateFulfillmentDelay;
  return {
    orderId: body.orderId as Hex,
    outputAmount: BigInt(out.amount),
    fixFee: BigInt(String(body.fixFee ?? "0")),
    fillSeconds: typeof delay === "number" ? delay : null,
    outputToken: { address: getAddress(out.address ?? input.dstToken), symbol: String(out.symbol ?? ""), decimals: Number(out.decimals ?? 0) },
    calls,
  };
}

export type DebridgeCheckReason = "wrong_shape" | "wrong_target" | "wrong_approval" | "wrong_value" | "wrong_recipient" | "wrong_destination";

export function checkDebridgeCalls(
  calls: readonly BridgeCall[],
  expected: { token: Address; amount: bigint; fixFee: bigint; recipient: Address; destinationChainId: number },
): { ok: true } | { ok: false; reason: DebridgeCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const native = same(expected.token, DEBRIDGE_NATIVE);
  const order = calls[calls.length - 1];
  if (!order || calls.length !== (native ? 1 : APPROVE_AND_ORDER)) return { ok: false, reason: "wrong_shape" };
  if (!DEBRIDGE_CONTRACTS.some((address) => same(address, order.to))) return { ok: false, reason: "wrong_target" };
  if (order.value !== expected.fixFee + (native ? expected.amount : NO_VALUE)) return { ok: false, reason: "wrong_value" };
  if (!native) {
    const approve = calls[0]!;
    try {
      const [spender, value] = decodeAbiParameters(parseAbiParameters("address, uint256"), slice(approve.data, SELECTOR_BYTES));
      if (approve.value !== NO_VALUE || !same(approve.to, expected.token) || slice(approve.data, 0, SELECTOR_BYTES) !== "0x095ea7b3" || !same(spender, order.to) || value !== expected.amount)
        return { ok: false, reason: "wrong_approval" };
    } catch {
      return { ok: false, reason: "wrong_approval" };
    }
  }
  const data = order.data.toLowerCase();
  if (!data.includes(expected.recipient.slice(HEX_PREFIX).toLowerCase())) return { ok: false, reason: "wrong_recipient" };
  if (!data.includes(pad(toHex(expected.destinationChainId), { size: WORD_BYTES }).slice(HEX_PREFIX))) return { ok: false, reason: "wrong_destination" };
  return { ok: true };
}

export type DebridgeStatus = { status: "pending" | "delivered" | "refunded"; fillTx: Hex | null };

const DELIVERED = new Set(["Fulfilled", "SentUnlock", "ClaimedUnlock"]);
const REFUNDED = new Set(["OrderCancelled", "SentOrderCancel", "ClaimedOrderCancel"]);

/** An order's state by its id; the fill transaction from deBridge's order record when it is there. */
export async function debridgeStatus(orderId: Hex): Promise<DebridgeStatus> {
  const { body } = await get(`/dln/order/${orderId}/status`);
  const status = String(body.status ?? "");
  if (REFUNDED.has(status)) return { status: "refunded", fillTx: null };
  if (!DELIVERED.has(status)) return { status: "pending", fillTx: null };
  const { body: record } = await get(`/dln/order/${orderId}`).catch(() => ({ body: {} as Record<string, unknown> }));
  const fill = (record.fulfilledDstEventMetadata as { transactionHash?: { stringValue?: string } } | undefined)?.transactionHash?.stringValue;
  return { status: "delivered", fillTx: (fill as Hex | undefined) ?? null };
}
