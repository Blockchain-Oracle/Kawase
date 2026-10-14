// LI.FI (li.quest, keyless): any token to any token across chains, through the bridge it finds best (Relay, Across,
// Polymer… with a swap on either side). A quote returns one transaction to its Diamond (plus the approval for ERC-20s);
// destination calls are refused in the query, so `BridgeData.receiver` is the real recipient and is checked. Every
// LI.FI bridge facet (`startBridgeTokensVia*`, `swapAndStartBridgeTokensVia*`) takes `BridgeData` first:
// (bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver,
// uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall). The Diamond's address
// per chain is LI.FI's own (`/v1/chains` → diamondAddress, read 2026-10-02); the call must go there. Checked live
// 2026-10-02: Arc → Base WETH (swap on Arc, Relay), EURC, cirBTC → cbBTC, TOLLY → USDC; Base ETH → Arc WETH.
import { decodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, parseAbiParameters, slice, zeroAddress, type Address, type Hex } from "viem";

import { BridgeProviderError, type BridgeCall } from "./across";

const API = "https://li.quest/v1";
const TIMEOUT_MS = 10_000;
const BPS = 10_000;
const NO_VALUE = 0n;
const SELECTOR_BYTES = 4;
const INTEGRATOR = "kawase";
const APPROVE_AND_CALL = 2;
/** LI.FI's address for a chain's native coin. */
export const LIFI_NATIVE: Address = zeroAddress;

/** LI.FI's Diamond on each chain it serves for Kawase (its `/v1/chains` diamondAddress). */
export const LIFI_DIAMONDS: Readonly<Record<number, Address>> = {
  5042: "0xA4072583658Fae592A3506A42431cb6316a8d40b",
  5042002: "0xFf70F4A1d11995621854F3692acF286d8aCd04b2",
  1: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  8453: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  42161: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  10: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  137: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  43114: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
};

const bridgeData = parseAbiParameters("(bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall)");

export type LifiToken = { address: Address; symbol: string; decimals: number; priceUsd: number | null };

export type LifiQuoteInput = {
  fromChainId: number;
  toChainId: number;
  /** A token address (LIFI_NATIVE for the native coin). */
  fromToken: Address;
  toToken: Address;
  amount: bigint;
  from: Address;
  to: Address;
  slippageBps: number;
  /** "execute" for the quote an approval builds its calls from (it may use the reserved budget). */
  priority?: LifiPriority;
};

export type LifiQuote = {
  /** The bridge LI.FI chose ("relaydepository", "across"…), which its status endpoint needs. */
  tool: string;
  steps: string[];
  outputAmount: bigint;
  minOutputAmount: bigint;
  fillSeconds: number | null;
  toToken: LifiToken;
  /** Fees taken from the amount and gas the wallet pays, in US dollars, when LI.FI says. */
  feeUsd: number | null;
  /** Gas the origin transaction costs, in the origin's native coin, when LI.FI says. */
  gasCost: bigint | null;
  /** Approve the Diamond for exactly the amount (ERC-20s), then its call (native value only for a native coin). */
  calls: BridgeCall[];
};

async function get(path: string) {
  try {
    const response = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, status: response.status, retryAfter: response.headers.get("retry-after"), body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("LI.FI", "timeout", "LI.FI did not answer in time");
  }
}

// LI.FI's keyless allowance is 75 `/quote` calls per 2 hours (docs.li.fi/api-reference/rate-limits), shared by every
// swap and move this process quotes. Previews (screens, the agent's route race) may use all but a reserve that is
// kept for the quote an approval builds from; the same question within 15 s is answered from memory; a 429 stops
// LI.FI quotes until its retry-after (or a doubling back-off) passes, so the other venues answer instead.
const QUOTE_WINDOW_MS = 7_200_000;
const QUOTE_LIMIT = 75;
const EXECUTE_RESERVE = 15;
const QUOTE_CACHE_MS = 15_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 1_800_000;
const MS_PER_SECOND = 1_000;
const HTTP_TOO_MANY = 429;

/** "preview": a quote to show; "execute": the quote the calls are built from at approval. */
export type LifiPriority = "preview" | "execute";

type Answer = Awaited<ReturnType<typeof get>>;
const quoteBudget = { spent: [] as number[], blockedUntil: 0, strikes: 0, cache: new Map<string, { at: number; value: Answer }>() };

/** How much of LI.FI's keyless allowance is left in the current window, and whether it is backing off. */
export function lifiQuoteBudget(now = Date.now()) {
  quoteBudget.spent = quoteBudget.spent.filter((at) => now - at < QUOTE_WINDOW_MS);
  return { used: quoteBudget.spent.length, limit: QUOTE_LIMIT, reserve: EXECUTE_RESERVE, blockedUntil: quoteBudget.blockedUntil > now ? quoteBudget.blockedUntil : null };
}

/** A `/quote` within the keyless budget: cached for previews, refused (rate_limited) rather than spending the reserve. */
export async function lifiQuoteGet(query: URLSearchParams, priority: LifiPriority = "preview"): Promise<Answer> {
  const now = Date.now();
  const key = query.toString();
  const cached = quoteBudget.cache.get(key);
  if (priority === "preview" && cached && now - cached.at < QUOTE_CACHE_MS) return cached.value;
  const budget = lifiQuoteBudget(now);
  if (budget.blockedUntil) throw new BridgeProviderError("LI.FI", "rate_limited", "LI.FI is backing off");
  if (budget.used >= QUOTE_LIMIT - (priority === "preview" ? EXECUTE_RESERVE : 0)) throw new BridgeProviderError("LI.FI", "rate_limited", "LI.FI's keyless quotes are used up for now");
  quoteBudget.spent.push(now);
  const answer = await get(`/quote?${key}`);
  if (answer.status === HTTP_TOO_MANY) {
    const retry = Number(answer.retryAfter);
    quoteBudget.strikes += 1;
    quoteBudget.blockedUntil = now + (Number.isFinite(retry) && retry > 0 ? retry * MS_PER_SECOND : Math.min(BACKOFF_BASE_MS * 2 ** (quoteBudget.strikes - 1), BACKOFF_MAX_MS));
    throw new BridgeProviderError("LI.FI", "rate_limited", "LI.FI asked to slow down");
  }
  quoteBudget.strikes = 0;
  if (answer.ok) {
    for (const [stale, entry] of quoteBudget.cache) if (now - entry.at >= QUOTE_CACHE_MS) quoteBudget.cache.delete(stale);
    quoteBudget.cache.set(key, { at: now, value: answer });
  }
  return answer;
}

/** A token on a chain by symbol or address ("WETH" on Base), as LI.FI lists it. */
export async function lifiToken(chainId: number, token: string): Promise<LifiToken | undefined> {
  const { ok, body } = await get(`/token?chain=${chainId}&token=${encodeURIComponent(token)}`);
  if (!ok || typeof body.address !== "string" || typeof body.decimals !== "number") return undefined;
  return { address: getAddress(body.address), symbol: String(body.symbol ?? token), decimals: body.decimals, priceUsd: body.priceUSD ? Number(body.priceUSD) : null };
}

export async function lifiQuote(input: LifiQuoteInput): Promise<LifiQuote> {
  const query = new URLSearchParams({
    fromChain: String(input.fromChainId),
    toChain: String(input.toChainId),
    fromToken: input.fromToken,
    toToken: input.toToken,
    fromAmount: input.amount.toString(),
    fromAddress: input.from,
    toAddress: input.to,
    slippage: String(input.slippageBps / BPS),
    integrator: INTEGRATOR,
    allowDestinationCall: "false",
  });
  const { ok, body } = await lifiQuoteGet(query, input.priority);
  const estimate = body.estimate as { toAmount?: string; toAmountMin?: string; approvalAddress?: string; executionDuration?: number; feeCosts?: { amountUSD?: string }[]; gasCosts?: { amountUSD?: string; amount?: string }[] } | undefined;
  const request = body.transactionRequest as { to?: string; data?: Hex; value?: string } | undefined;
  const toToken = (body.action as { toToken?: { address?: string; symbol?: string; decimals?: number; priceUSD?: string } } | undefined)?.toToken;
  if (!ok || !estimate?.toAmount || !estimate.toAmountMin || !request?.to || !request.data || !toToken?.address) {
    const message = String(body.message ?? "no quote");
    throw new BridgeProviderError("LI.FI", /too low|minimum/i.test(message) ? "amount_too_low" : "no_quote", message);
  }
  const target = getAddress(request.to);
  const native = input.fromToken === LIFI_NATIVE;
  const costs = [...(estimate.feeCosts ?? []), ...(estimate.gasCosts ?? [])].reduce((sum, cost) => sum + Number(cost.amountUSD ?? 0), 0);
  const calls: BridgeCall[] = [];
  if (!native) calls.push({ to: input.fromToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [getAddress(estimate.approvalAddress ?? target), input.amount] }), value: NO_VALUE });
  calls.push({ to: target, data: request.data, value: BigInt(request.value ?? "0") });
  return {
    tool: String(body.tool ?? ""),
    steps: ((body.includedSteps as { type?: string; tool?: string }[] | undefined) ?? []).filter((step) => step.type !== "protocol").map((step) => `${step.type}:${step.tool}`),
    outputAmount: BigInt(estimate.toAmount),
    minOutputAmount: BigInt(estimate.toAmountMin),
    fillSeconds: typeof estimate.executionDuration === "number" ? estimate.executionDuration : null,
    toToken: { address: getAddress(toToken.address), symbol: String(toToken.symbol ?? ""), decimals: Number(toToken.decimals ?? 0), priceUsd: toToken.priceUSD ? Number(toToken.priceUSD) : null },
    feeUsd: costs || null,
    gasCost: estimate.gasCosts?.length ? estimate.gasCosts.reduce((sum, cost) => sum + BigInt(cost.amount ?? "0"), NO_VALUE) : null,
    calls,
  };
}

export type LifiCheckReason = "wrong_shape" | "wrong_target" | "wrong_approval" | "native_value" | "wrong_recipient" | "wrong_destination" | "has_destination_call" | "unreadable";

/**
 * The calls go to the Diamond LI.FI publishes for this chain, approve exactly `amount` to it (ERC-20) or send exactly
 * `amount` as value (native), and the bridge leg pays `recipient` on `destinationChainId` with no destination call.
 */
export function checkLifiCalls(
  calls: readonly BridgeCall[],
  expected: { chainId: number; token: Address; amount: bigint; recipient: Address; destinationChainId: number },
): { ok: true } | { ok: false; reason: LifiCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const diamond = LIFI_DIAMONDS[expected.chainId];
  const native = same(expected.token, LIFI_NATIVE);
  const main = calls[calls.length - 1];
  if (!diamond || !main || calls.length !== (native ? 1 : APPROVE_AND_CALL)) return { ok: false, reason: "wrong_shape" };
  if (!same(main.to, diamond)) return { ok: false, reason: "wrong_target" };
  if (native ? main.value !== expected.amount : main.value !== NO_VALUE) return { ok: false, reason: "native_value" };
  if (!native) {
    const approve = calls[0]!;
    if (approve.value !== NO_VALUE || !same(approve.to, expected.token)) return { ok: false, reason: "wrong_approval" };
    try {
      const [spender, value] = decodeAbiParameters(parseAbiParameters("address, uint256"), slice(approve.data, SELECTOR_BYTES));
      if (slice(approve.data, 0, SELECTOR_BYTES) !== "0x095ea7b3" || !same(spender, diamond) || value !== expected.amount) return { ok: false, reason: "wrong_approval" };
    } catch {
      return { ok: false, reason: "wrong_approval" };
    }
  }
  try {
    const [data] = decodeAbiParameters(bridgeData, slice(main.data, SELECTOR_BYTES));
    if (data.hasDestinationCall) return { ok: false, reason: "has_destination_call" };
    if (!same(data.receiver, expected.recipient)) return { ok: false, reason: "wrong_recipient" };
    if (data.destinationChainId !== BigInt(expected.destinationChainId)) return { ok: false, reason: "wrong_destination" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true };
}

export type LifiStatus = { status: "pending" | "delivered" | "refunded" | "failed"; receivingTx: Hex | null; received: bigint | null };

/** A transfer's progress by the origin transaction's hash. */
export async function lifiStatus(input: { txHash: Hex; fromChainId: number; toChainId: number; tool: string }): Promise<LifiStatus> {
  const query = new URLSearchParams({ txHash: input.txHash, fromChain: String(input.fromChainId), toChain: String(input.toChainId), bridge: input.tool });
  const { body } = await get(`/status?${query}`);
  const receiving = body.receiving as { txHash?: Hex; amount?: string } | undefined;
  const status = String(body.status ?? "PENDING");
  const substatus = String(body.substatus ?? "");
  if (status === "DONE" && substatus === "REFUNDED") return { status: "refunded", receivingTx: receiving?.txHash ?? null, received: null };
  if (status === "DONE") return { status: "delivered", receivingTx: receiving?.txHash ?? null, received: receiving?.amount ? BigInt(receiving.amount) : null };
  if (status === "FAILED" || status === "INVALID") return { status: "failed", receivingTx: null, received: null };
  return { status: "pending", receivingTx: null, received: null };
}
