// Socket v3 (public-backend.socket.tech, keyless, a shared rate limit; the dedicated tier once configured): one API for swaps on a chain and moves between
// chains. A quote lists routes (0x, KyberSwap, Bitget for swaps; Across, CCTP V2, Relay, Socket Intents, Symbiosis for
// moves), each with its approval and one transaction to Socket's own allowance holder. Checked live on Arc mainnet
// 2026-10-14: every route's transaction is `exec(operator, token, amount, target, data)` at 0x50c4…5909 (the approval's
// spender) with Socket's executor 0x50cF…5c4a as operator and target, value 0; the inner data cannot be decoded. Every
// route carries Socket's 20 bps fee (`feeDetails.feeBps`), already netted in `output.amount`; asking for 0 bps is
// refused. So Kawase checks what it can (the allowance holder, the executor, the token and exact amount, no native
// value, the receiver it asked for present in the calldata, the quote's own minimum) and witnesses the receipt.
import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, parseAbi, type Address, type Hex } from "viem";

import { BridgeProviderError, type BridgeCall } from "./across";

const API = "https://public-backend.socket.tech/v3";
const TIMEOUT_MS = 8_000;
const NO_VALUE = 0n;
const PERCENT = 100;
const BPS = 10_000;
const APPROVE_AND_CALL = 2;
const ADDRESS_HEX = 40;
const HEX_PREFIX = 2;
const MS_PER_SECOND = 1_000;
const DOUBLING = 2;

/** Socket's allowance holder (the approval's spender and the call's target) and its executor, read live 2026-10-14. */
export const SOCKET_ALLOWANCE_HOLDER: Address = "0x50c4E75a512F2A14A7b304787Adf79C4531A5909";
export const SOCKET_EXECUTOR: Address = "0x50cFe7c1938dB66A1a6D2e86D36F39FBef3d5c4a";
/** Socket's address for a chain's native coin (ETH on Base); the zero address finds no route. */
export const SOCKET_NATIVE: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** Socket's fee on the public tier, taken from the input and netted in the output. */
export const SOCKET_FEE_BPS = 20;

const execAbi = parseAbi(["function exec(address operator, address token, uint256 amount, address target, bytes data)"]);

export type SocketQuoteInput = {
  originChainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  amount: bigint;
  user: Address;
  receiver: Address;
  slippageBps: number;
  /** Building calls to sign: ask Socket again instead of the 15 s memory (the quote previews read). */
  fresh?: boolean | undefined;
};

export type SocketRoute = {
  quoteId: string;
  /** Unix seconds after which the route must be re-asked. */
  expiresAt: number;
  /** What the route goes through ("0x", "Kyberswap", "Across", "CCTP V2"), for "via …". */
  via: string;
  outputAmount: bigint;
  minOutputAmount: bigint;
  etaSeconds: number | null;
  /** Socket's own fee, in the input token's base units, and its rate. */
  fee: { amount: bigint; bps: number; token: Address };
  spender: Address;
  /** Approve the allowance holder for exactly the amount, then its `exec` call. */
  calls: BridgeCall[];
};

type RawRoute = {
  quoteId?: string;
  expiresAt?: number;
  estimatedTime?: number;
  output?: { amount?: string; minAmountOut?: string; priceInUsd?: number; token?: { decimals?: number } };
  approval?: { spenderAddress?: string; amount?: string; tokenAddress?: string } | null;
  txData?: { kind?: string; object?: { chainId?: number; to?: string; data?: Hex; value?: string } };
  routeDetails?: {
    dexDetails?: { protocol?: { displayName?: string } } | null;
    bridgeDetails?: { protocol?: { displayName?: string } } | null;
    feeDetails?: { feeBps?: number; feeAmount?: string; feeToken?: { address?: string; decimals?: number } } | null;
  };
};

/**
 * Which Socket tier is asked: the shared public one (keyless) until the api calls `configureSocket` with a dedicated
 * key and the affiliate id issued with it (dedicated-backend.socket.tech, `x-api-key` + `affiliate`, 20 rps; docs
 * "Get API access"). Both are needed; one alone keeps the public tier.
 */
const DEDICATED_API = "https://dedicated-backend.socket.tech/v3";
const access: { base: string; headers: Record<string, string> } = { base: API, headers: {} };

export function configureSocket(keys: { apiKey?: string | undefined; affiliate?: string | undefined }): "dedicated" | "public" {
  if (keys.apiKey && keys.affiliate) {
    access.base = DEDICATED_API;
    access.headers = { "x-api-key": keys.apiKey, affiliate: keys.affiliate };
    return "dedicated";
  }
  access.base = API;
  access.headers = {};
  return "public";
}

async function get(path: string) {
  try {
    const response = await fetch(`${access.base}${path}`, { headers: { accept: "application/json", ...access.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: response.ok, status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new BridgeProviderError("Socket", "timeout", "Socket did not answer in time");
  }
}

// The public tier's limit is shared by every caller (Cloudflare answers 429, "error code: 1015", when it is hit). The
// same question within 15 s is answered from memory (a swap preview and the route race often ask it twice), and a
// 429 pauses Socket quotes with a doubling back-off so the other venues answer instead of Socket failing slowly.
const QUOTE_CACHE_MS = 15_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 600_000;
const HTTP_TOO_MANY = 429;
type Answer = Awaited<ReturnType<typeof get>>;
const quoteState = { blockedUntil: 0, strikes: 0, cache: new Map<string, { at: number; value: Answer }>() };

async function quoteGet(query: string, fresh = false): Promise<Answer> {
  const now = Date.now();
  const cached = quoteState.cache.get(query);
  if (!fresh && cached && now - cached.at < QUOTE_CACHE_MS) return cached.value;
  if (quoteState.blockedUntil > now) return { ok: false, status: HTTP_TOO_MANY, body: {} };
  const answer = await get(`/swap/quote?${query}`);
  if (answer.status === HTTP_TOO_MANY) {
    quoteState.strikes += 1;
    quoteState.blockedUntil = now + Math.min(BACKOFF_BASE_MS * DOUBLING ** (quoteState.strikes - 1), BACKOFF_MAX_MS);
    return answer;
  }
  quoteState.strikes = 0;
  if (answer.ok) {
    for (const [stale, entry] of quoteState.cache) if (now - entry.at >= QUOTE_CACHE_MS) quoteState.cache.delete(stale);
    quoteState.cache.set(query, { at: now, value: answer });
  }
  return answer;
}

function toRoute(raw: RawRoute, input: SocketQuoteInput): SocketRoute | undefined {
  const tx = raw.txData?.object;
  if (raw.txData?.kind !== "evm_tx" || !tx?.to || !tx.data || !raw.output?.amount || !raw.output.minAmountOut || !raw.quoteId) return undefined;
  if (tx.chainId !== undefined && tx.chainId !== input.originChainId) return undefined;
  const spender = getAddress(raw.approval?.spenderAddress ?? tx.to);
  const fee = raw.routeDetails?.feeDetails;
  const feeUnits = BigInt(fee?.feeAmount ?? "0");
  const calls: BridgeCall[] = [
    { to: input.inputToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, input.amount] }), value: NO_VALUE },
    { to: getAddress(tx.to), data: tx.data, value: BigInt(tx.value ?? "0") },
  ];
  return {
    quoteId: raw.quoteId,
    expiresAt: raw.expiresAt ?? 0,
    via: raw.routeDetails?.bridgeDetails?.protocol?.displayName ?? raw.routeDetails?.dexDetails?.protocol?.displayName ?? "Socket",
    outputAmount: BigInt(raw.output.amount),
    minOutputAmount: BigInt(raw.output.minAmountOut),
    etaSeconds: typeof raw.estimatedTime === "number" ? raw.estimatedTime : null,
    fee: { amount: feeUnits, bps: fee?.feeBps ?? SOCKET_FEE_BPS, token: getAddress(fee?.feeToken?.address ?? input.inputToken) },
    spender,
    calls,
  };
}

/** Every route Socket offers for exactly `amount`, most delivered first. */
export async function socketRoutes(input: SocketQuoteInput): Promise<SocketRoute[]> {
  const query = new URLSearchParams({
    userOps: "tx",
    originChainId: String(input.originChainId),
    destinationChainId: String(input.destinationChainId),
    inputToken: input.inputToken,
    outputToken: input.outputToken,
    inputAmount: input.amount.toString(),
    userAddress: input.user,
    receiverAddress: input.receiver,
    slippage: String((input.slippageBps / BPS) * PERCENT),
  });
  const { ok, status, body } = await quoteGet(query.toString(), input.fresh === true);
  if (status === HTTP_TOO_MANY) throw new BridgeProviderError("Socket", "rate_limited", "Socket's shared public limit is reached");
  const result = body.result as { routes?: RawRoute[] } | undefined;
  const routes = (result?.routes ?? []).map((raw) => toRoute(raw, input)).filter((route): route is SocketRoute => Boolean(route));
  if (!ok || routes.length === 0) {
    const message = String((body as { message?: string }).message ?? "no route");
    throw new BridgeProviderError("Socket", /too (low|small)|minimum/i.test(message) ? "amount_too_low" : "no_quote", message);
  }
  return routes.sort((a, b) => (b.outputAmount > a.outputAmount ? 1 : b.outputAmount < a.outputAmount ? -1 : 0));
}

/** Socket's best route (the most delivered). */
export async function socketQuote(input: SocketQuoteInput): Promise<SocketRoute> {
  const [best] = await socketRoutes(input);
  return best!;
}

export type SocketCheckReason = "wrong_shape" | "wrong_target" | "wrong_approval" | "wrong_operator" | "wrong_amount" | "native_value" | "receiver_missing" | "expired" | "unreadable";

/**
 * Approve exactly `amount` of `token` to Socket's allowance holder, then one `exec` at that holder through Socket's
 * executor for exactly that token and amount, no native value, and the receiver Kawase asked for named in the calldata.
 */
export function checkSocketCalls(
  calls: readonly BridgeCall[],
  expected: { token: Address; amount: bigint; receiver: Address; expiresAt?: number; now?: number },
): { ok: true } | { ok: false; reason: SocketCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (calls.length !== APPROVE_AND_CALL) return { ok: false, reason: "wrong_shape" };
  const [approve, main] = calls as [BridgeCall, BridgeCall];
  if (!same(main.to, SOCKET_ALLOWANCE_HOLDER)) return { ok: false, reason: "wrong_target" };
  if (main.value !== NO_VALUE || approve.value !== NO_VALUE) return { ok: false, reason: "native_value" };
  if (expected.expiresAt && (expected.now ?? Math.floor(Date.now() / MS_PER_SECOND)) > expected.expiresAt) return { ok: false, reason: "expired" };
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    if (decoded.functionName !== "approve" || !same(approve.to, expected.token) || !same(decoded.args[0], SOCKET_ALLOWANCE_HOLDER) || decoded.args[1] !== expected.amount) return { ok: false, reason: "wrong_approval" };
  } catch {
    return { ok: false, reason: "wrong_approval" };
  }
  try {
    const { args } = decodeFunctionData({ abi: execAbi, data: main.data });
    const [operator, token, amount, target, inner] = args;
    if (!same(operator, SOCKET_EXECUTOR) || !same(target, SOCKET_EXECUTOR)) return { ok: false, reason: "wrong_operator" };
    if (!same(token, expected.token) || amount !== expected.amount) return { ok: false, reason: "wrong_amount" };
    // Opaque inner calldata: at least the receiver Kawase asked for must be in it as an ABI word.
    if (!inner.toLowerCase().includes(expected.receiver.slice(HEX_PREFIX).toLowerCase().padStart(ADDRESS_HEX, "0"))) return { ok: false, reason: "receiver_missing" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true };
}

export type SocketStatus = { status: "pending" | "delivered" | "refunded" | "failed"; destinationTx: Hex | null; received: bigint | null };

/** A route's progress by its quote id. */
export async function socketStatus(quoteId: string): Promise<SocketStatus> {
  const { body } = await get(`/swap/status?quoteId=${encodeURIComponent(quoteId)}`);
  const result = (body.result ?? body) as { status?: string; destinationTransactionHash?: Hex; outputAmount?: string } | undefined;
  const status = String(result?.status ?? "PENDING").toUpperCase();
  if (status === "COMPLETED") return { status: "delivered", destinationTx: result?.destinationTransactionHash ?? null, received: result?.outputAmount ? BigInt(result.outputAmount) : null };
  if (status === "REFUNDED") return { status: "refunded", destinationTx: null, received: null };
  if (status === "FAILED" || status === "EXPIRED") return { status: "failed", destinationTx: null, received: null };
  return { status: "pending", destinationTx: null, received: null };
}
