// 0x Swap API v2, AllowanceHolder flow (api.0x.org, headers `0x-api-key` + `0x-version: v2`, ~5 rps). Checked live on
// Arc mainnet 2026-10-14: the transaction is `exec(operator, token, amount, target, data)` at the AllowanceHolder
// 0x0000…2734 with 0x's Settler as operator and target, and the Settler call opens with
// `(recipient, buyToken, minAmountOut)`, so Kawase holds the recipient, the token bought and the on-chain minimum to
// what was asked. 0x takes a volume fee on Arc (`fees.zeroExFee`, 15 bps in the sell token), already netted in
// `buyAmount`.
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, parseAbi, parseAbiParameters, slice, type Address, type Hex } from "viem";

const API = "https://api.0x.org";
const TIMEOUT_MS = 6_000;
const NO_VALUE = 0n;
const SELECTOR_BYTES = 4;
const APPROVE_AND_CALL = 2;

/** 0x's AllowanceHolder (the same address on every Cancun chain; Arc's quote names it, 2026-10-14). */
export const ZEROX_ALLOWANCE_HOLDER: Address = "0x0000000000001fF3684f28c67538d4D072C22734";

const execAbi = parseAbi(["function exec(address operator, address token, uint256 amount, address target, bytes data) payable"]);

export class ZeroExError extends Error {
  constructor(
    readonly code: "no_route" | "timeout" | "needs_key" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "ZeroExError";
  }
}

export type ZeroExQuoteInput = { apiKey: string; chainId: number; tokenIn: Address; tokenOut: Address; amountIn: bigint; wallet: Address; slippageBps: number };

export type ZeroExQuote = {
  zid: string;
  estimatedOut: bigint;
  minOut: bigint;
  /** Sources the route fills from ("Uniswap_V4"), for "via …". */
  via: string[];
  /** 0x's own fee, in `token` base units. */
  fee: { amount: bigint; token: Address } | null;
  spender: Address;
  calls: { to: Address; data: Hex; value: bigint }[];
};

export async function zeroExQuote(input: ZeroExQuoteInput): Promise<ZeroExQuote> {
  if (!input.apiKey) throw new ZeroExError("needs_key", "ZEROX_API_KEY is not set");
  const query = new URLSearchParams({
    chainId: String(input.chainId),
    sellToken: input.tokenIn,
    buyToken: input.tokenOut,
    sellAmount: input.amountIn.toString(),
    taker: input.wallet,
    recipient: input.wallet,
    slippageBps: String(input.slippageBps),
  });
  let body: Record<string, unknown>;
  let ok: boolean;
  try {
    const response = await fetch(`${API}/swap/allowance-holder/quote?${query}`, { headers: { "0x-api-key": input.apiKey, "0x-version": "v2", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    ok = response.ok;
    body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    throw new ZeroExError("timeout", "0x did not answer in time");
  }
  const transaction = body.transaction as { to?: string; data?: Hex; value?: string } | undefined;
  if (!ok || body.liquidityAvailable === false || !transaction?.to || !transaction.data || !body.buyAmount || !body.minBuyAmount) {
    throw new ZeroExError(body.liquidityAvailable === false ? "no_route" : "failed", String(body.message ?? body.name ?? "no quote"));
  }
  const spender = getAddress(String((body.issues as { allowance?: { spender?: string } } | undefined)?.allowance?.spender ?? body.allowanceTarget ?? transaction.to));
  const zeroExFee = (body.fees as { zeroExFee?: { amount?: string; token?: string } | null } | undefined)?.zeroExFee;
  const fills = ((body.route as { fills?: { source?: string }[] } | undefined)?.fills ?? []).map((fill) => String(fill.source ?? "")).filter(Boolean);
  return {
    zid: String(body.zid ?? ""),
    estimatedOut: BigInt(String(body.buyAmount)),
    minOut: BigInt(String(body.minBuyAmount)),
    via: [...new Set(fills)],
    fee: zeroExFee?.amount && zeroExFee.token ? { amount: BigInt(zeroExFee.amount), token: getAddress(zeroExFee.token) } : null,
    spender,
    calls: [
      { to: input.tokenIn, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, input.amountIn] }), value: NO_VALUE },
      { to: getAddress(transaction.to), data: transaction.data, value: BigInt(transaction.value ?? "0") },
    ],
  };
}

export type ZeroExCheckReason = "wrong_shape" | "wrong_target" | "wrong_approval" | "native_value" | "wrong_amount" | "wrong_recipient" | "wrong_token" | "below_minimum" | "unreadable";

/**
 * Approve exactly `amountIn` to the AllowanceHolder, then its `exec` for exactly that token and amount into a Settler
 * whose slippage guard pays the wallet at least `minOut` of `tokenOut`; no native value.
 */
export function checkZeroExCalls(
  calls: readonly { to: Address; data: Hex; value: bigint }[],
  expected: { tokenIn: Address; tokenOut: Address; amountIn: bigint; recipient: Address; minOut: bigint; settlers: readonly Address[] },
): { ok: true; guaranteedOut: bigint } | { ok: false; reason: ZeroExCheckReason } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (calls.length !== APPROVE_AND_CALL) return { ok: false, reason: "wrong_shape" };
  const [approve, main] = calls as [(typeof calls)[number], (typeof calls)[number]];
  if (!same(main.to, ZEROX_ALLOWANCE_HOLDER)) return { ok: false, reason: "wrong_target" };
  if (main.value !== NO_VALUE || approve.value !== NO_VALUE) return { ok: false, reason: "native_value" };
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    if (decoded.functionName !== "approve" || !same(approve.to, expected.tokenIn) || !same(decoded.args[0], ZEROX_ALLOWANCE_HOLDER) || decoded.args[1] !== expected.amountIn) return { ok: false, reason: "wrong_approval" };
  } catch {
    return { ok: false, reason: "wrong_approval" };
  }
  try {
    const { args } = decodeFunctionData({ abi: execAbi, data: main.data });
    const [operator, token, amount, target, inner] = args;
    if (!same(operator, target) || !expected.settlers.some((settler) => same(settler, target))) return { ok: false, reason: "wrong_target" };
    if (!same(token, expected.tokenIn) || amount !== expected.amountIn) return { ok: false, reason: "wrong_amount" };
    const [slippage] = decodeAbiParameters(parseAbiParameters("(address recipient, address buyToken, uint256 minAmountOut), bytes[], bytes32"), slice(inner, SELECTOR_BYTES));
    if (!same(slippage.recipient, expected.recipient)) return { ok: false, reason: "wrong_recipient" };
    if (!same(slippage.buyToken, expected.tokenOut)) return { ok: false, reason: "wrong_token" };
    if (slippage.minAmountOut < expected.minOut) return { ok: false, reason: "below_minimum" };
    return { ok: true, guaranteedOut: slippage.minAmountOut };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
