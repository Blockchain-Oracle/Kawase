// KyberSwap aggregator, keyless (docs.kyberswap.com, Aggregator API v1; checked live on Arc 2026-10-02):
//   GET  /{chain}/api/v1/routes       → the best route for an exact input (`routeSummary`, the router address)
//   POST /{chain}/api/v1/route/build  → calldata for that route, from `sender`, paying `recipient`
// The router's calldata runs from a plain EOA (the token is pulled with an ordinary ERC-20 approval), so a wallet
// sends approve + swap as one EIP-7702 batch. This adapter is generic on purpose: it quotes, builds, and checks
// that what it built pays the right person at least the minimum. Product rules (which pair, how much) live in the
// caller.
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";

const API = "https://aggregator-api.kyberswap.com";
/** Sent as `x-client-id` and `source`, as KyberSwap asks integrators to (no key is needed). */
const DEFAULT_CLIENT_ID = "kawase";
const DEFAULT_TIMEOUT_MS = 6_000;
const BPS = 10_000n;
const ZERO = 0n;
/** The API's own cap on `slippageTolerance` (in bps). */
export const KYBERSWAP_MAX_SLIPPAGE_BPS = 2_000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
/** How long a built transaction stays valid on chain unless the caller says otherwise. */
const DEADLINE_MINUTES = 20;
const DEFAULT_DEADLINE_S = DEADLINE_MINUTES * SECONDS_PER_MINUTE;

/** KyberSwap's chain slugs (its `supported-chains` list). Arc Testnet is not served. */
export const KYBERSWAP_CHAINS: Readonly<Record<number, string>> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  137: "polygon",
  5042: "arc",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
  59144: "linea",
  534352: "scroll",
};

/** MetaAggregationRouterV2, the same address on every chain it is deployed to (verified on Arc). */
export const KYBERSWAP_ROUTER: Address = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";

export const isKyberSwapChain = (chainId: number) => chainId in KYBERSWAP_CHAINS;

export type KyberQuoteInput = {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn. */
  amountIn: bigint;
  /** The address the router pulls tokenIn from (and that sends the transaction). */
  sender: Address;
  /** Who receives tokenOut. */
  recipient: Address;
  /** Tolerated move between quote and execution, in bps (the built calldata's on-chain minimum). */
  slippageBps: number;
  clientId?: string | undefined;
  timeoutMs?: number | undefined;
};

export type KyberRoute = {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /** What the route expects to deliver now. */
  amountOut: bigint;
  /** `amountOut` less the slippage: what the built calldata guarantees, or it reverts. */
  minOut: bigint;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  gas: bigint;
  gasUsd: number | null;
  /** The pools' exchanges, in route order (e.g. "uniswapv3", "aero-cl"), for "via …" on a card. */
  venues: string[];
  routerAddress: Address;
  sender: Address;
  recipient: Address;
  slippageBps: number;
  quotedAt: number;
  /** KyberSwap's own route object, passed back unchanged to `build`. */
  routeSummary: Record<string, unknown>;
};

export type KyberTransaction = {
  to: Address;
  data: Hex;
  value: bigint;
  /** KyberSwap's gas estimate for the swap call alone. */
  gas: bigint;
  amountIn: bigint;
  amountOut: bigint;
  minOut: bigint;
};

export class KyberSwapError extends Error {
  constructor(
    readonly code: "unsupported_chain" | "no_route" | "build_failed" | "timeout" | "bad_response",
    message: string,
  ) {
    super(message);
    this.name = "KyberSwapError";
  }
}

const slug = (chainId: number) => {
  const name = KYBERSWAP_CHAINS[chainId];
  if (!name) throw new KyberSwapError("unsupported_chain", `KyberSwap does not serve chain ${chainId}`);
  return name;
};

const usd = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** The minimum KyberSwap encodes for a given output and slippage (it rounds down). */
export const minimumOut = (amountOut: bigint, slippageBps: number) => (amountOut * (BPS - BigInt(slippageBps))) / BPS;

async function call(url: string, init: RequestInit & { clientId: string; timeoutMs: number }) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", "x-client-id": init.clientId, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new KyberSwapError(timedOut ? "timeout" : "bad_response", timedOut ? "KyberSwap did not answer in time" : String(error));
  }
  const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string; data?: Record<string, unknown> };
  return { ok: response.ok && body.code === 0 && Boolean(body.data), body };
}

/** A fresh route for exactly `amountIn` of tokenIn. Throws `KyberSwapError("no_route")` when nothing routes it. */
export async function quote(input: KyberQuoteInput): Promise<KyberRoute> {
  if (input.slippageBps < 0 || input.slippageBps > KYBERSWAP_MAX_SLIPPAGE_BPS) throw new RangeError("slippageBps out of range");
  const query = new URLSearchParams({ tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn.toString() });
  const clientId = input.clientId ?? DEFAULT_CLIENT_ID;
  const { ok, body } = await call(`${API}/${slug(input.chainId)}/api/v1/routes?${query}`, {
    method: "GET",
    clientId,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const summary = body.data?.routeSummary as Record<string, unknown> | undefined;
  if (!ok || !summary || typeof summary.amountOut !== "string") throw new KyberSwapError("no_route", body.message ?? "no route");
  const amountOut = BigInt(summary.amountOut);
  if (amountOut <= ZERO) throw new KyberSwapError("no_route", "the route delivers nothing");
  const hops = (summary.route as { exchange?: string }[][] | undefined) ?? [];
  const venues = [...new Set(hops.flat().map((hop) => hop.exchange).filter((name): name is string => Boolean(name)))];
  return {
    chainId: input.chainId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn,
    amountOut,
    minOut: minimumOut(amountOut, input.slippageBps),
    amountInUsd: usd(summary.amountInUsd),
    amountOutUsd: usd(summary.amountOutUsd),
    gas: BigInt(typeof summary.gas === "string" ? summary.gas : "0"),
    gasUsd: usd(summary.gasUsd),
    venues,
    routerAddress: (body.data?.routerAddress as Address | undefined) ?? KYBERSWAP_ROUTER,
    sender: input.sender,
    recipient: input.recipient,
    slippageBps: input.slippageBps,
    quotedAt: Date.now(),
    routeSummary: summary,
  };
}

/**
 * Router calldata for a route: from `route.sender`, paying `route.recipient`.
 * `slippageBps` here may be tighter than the quote's: build re-prices the route, so a caller that must guarantee the
 * minimum it showed builds with less slippage than it showed (and re-quotes if the check still fails).
 */
export async function build(route: KyberRoute, options: { slippageBps?: number; deadlineS?: number; clientId?: string; timeoutMs?: number } = {}): Promise<KyberTransaction> {
  const slippageBps = options.slippageBps ?? route.slippageBps;
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID;
  const deadline = Math.floor(Date.now() / MS_PER_SECOND) + (options.deadlineS ?? DEFAULT_DEADLINE_S);
  const { ok, body } = await call(`${API}/${slug(route.chainId)}/api/v1/route/build`, {
    method: "POST",
    clientId,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    body: JSON.stringify({
      routeSummary: route.routeSummary,
      sender: route.sender,
      recipient: route.recipient,
      slippageTolerance: slippageBps,
      deadline,
      source: clientId,
    }),
  });
  const data = body.data;
  if (!ok || !data || typeof data.data !== "string" || typeof data.routerAddress !== "string") throw new KyberSwapError("build_failed", body.message ?? "build failed");
  const transaction: KyberTransaction = {
    to: data.routerAddress as Address,
    data: data.data as Hex,
    value: BigInt(typeof data.transactionValue === "string" ? data.transactionValue : "0"),
    gas: BigInt(typeof data.gas === "string" ? data.gas : "0"),
    amountIn: BigInt(String(data.amountIn ?? route.amountIn)),
    amountOut: BigInt(String(data.amountOut ?? route.amountOut)),
    minOut: 0n,
  };
  const decoded = decodeSwap(transaction.data);
  transaction.minOut = decoded?.minReturnAmount ?? minimumOut(transaction.amountOut, slippageBps);
  return transaction;
}

const routerAbi = parseAbi([
  "struct SwapDescriptionV2 { address srcToken; address dstToken; address[] srcReceivers; uint256[] srcAmounts; address[] feeReceivers; uint256[] feeAmounts; address dstReceiver; uint256 amount; uint256 minReturnAmount; uint256 flags; bytes permit; }",
  "struct SwapExecutionParams { address callTarget; address approveTarget; bytes targetData; SwapDescriptionV2 desc; bytes clientData; }",
  "function swap(SwapExecutionParams execution) payable returns (uint256 returnAmount, uint256 gasUsed)",
]);

export type DecodedSwap = { srcToken: Address; dstToken: Address; dstReceiver: Address; amount: bigint; minReturnAmount: bigint; feeAmounts: readonly bigint[] };

/** What the router calldata itself promises, read from it (not from the API's summary). Undefined when it is not a `swap`. */
export function decodeSwap(data: Hex): DecodedSwap | undefined {
  try {
    const decoded = decodeFunctionData({ abi: routerAbi, data });
    if (decoded.functionName !== "swap") return undefined;
    const { desc } = decoded.args[0];
    return {
      srcToken: desc.srcToken,
      dstToken: desc.dstToken,
      dstReceiver: desc.dstReceiver,
      amount: desc.amount,
      minReturnAmount: desc.minReturnAmount,
      feeAmounts: desc.feeAmounts,
    };
  } catch {
    return undefined;
  }
}

export type KyberCheckReason = "wrong_router" | "not_a_swap" | "wrong_tokens" | "wrong_amount" | "wrong_recipient" | "below_minimum" | "native_value" | "fee_taken";

/**
 * Before anything is signed: the calldata goes to the router, spends exactly `amountIn` of tokenIn, pays only
 * `recipient`, promises at least `minOut` on chain, takes no extra fee and sends no native value.
 */
export function checkKyberSwap(
  transaction: Pick<KyberTransaction, "to" | "data" | "value">,
  /** `value` only when tokenIn is a chain's native-coin sentinel; ERC-20 swaps (Arc's USDC included) send none. */
  expected: { tokenIn: Address; tokenOut: Address; amountIn: bigint; recipient: Address; minOut: bigint; value?: bigint },
): { ok: true; decoded: DecodedSwap } | { ok: false; reason: KyberCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(transaction.to, KYBERSWAP_ROUTER)) return { ok: false, reason: "wrong_router" };
  if (transaction.value !== (expected.value ?? ZERO)) return { ok: false, reason: "native_value" };
  const decoded = decodeSwap(transaction.data);
  if (!decoded) return { ok: false, reason: "not_a_swap" };
  if (!same(decoded.srcToken, expected.tokenIn) || !same(decoded.dstToken, expected.tokenOut)) return { ok: false, reason: "wrong_tokens" };
  if (decoded.amount !== expected.amountIn) return { ok: false, reason: "wrong_amount" };
  if (!same(decoded.dstReceiver, expected.recipient)) return { ok: false, reason: "wrong_recipient" };
  if (decoded.minReturnAmount < expected.minOut) return { ok: false, reason: "below_minimum" };
  if (decoded.feeAmounts.some((fee) => fee > ZERO)) return { ok: false, reason: "fee_taken" };
  return { ok: true, decoded };
}

/** The approval the router needs first: exactly `amount`, so nothing is left approved after the swap. */
export const approveRouterCall = (token: Address, amount: bigint) => ({
  to: token,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [KYBERSWAP_ROUTER, amount] }),
  value: 0n,
});
