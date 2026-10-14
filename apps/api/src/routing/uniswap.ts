// Uniswap Trading API (trade-api.gateway.uniswap.org/v1, `x-api-key`, ~6 rps). Classic routes only (V2/V3/V4 pools
// through the Universal Router); UniswapX orders are not asked for. Checked live on Arc mainnet 2026-10-14:
// - USDC in: Arc's USDC is also its native coin, so the router is paid as native value (10 USDC = 10e18 wei) and no
//   approval is needed (`isTokenApprovalApplicable: false`).
// - Any other token in: Permit2. With `generatePermitAsTransaction` the permit is a plain transaction
//   (`Permit2.approve(token, router, amount, expiration)`), so approve-to-Permit2 + permit + swap fit one EIP-7702
//   batch with no signature.
// The swap is `execute(commands, inputs, deadline)` at the router: Kawase decodes every command and V4 action, holds
// every recipient to the wallet (or the router's own placeholders that mean "the caller" / "the router"), the input
// to exactly the amount, and sums the route's own on-chain minimums.
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, parseAbi, parseAbiParameters, type Address, type Hex } from "viem";

const API = "https://trade-api.gateway.uniswap.org/v1";
const TIMEOUT_MS = 6_000;
const RETRY_AFTER_MS = 400;
const HTTP_SERVER_ERROR = 500;
const NO_VALUE = 0n;
/** Arc's native face of USDC has 18 decimals, its ERC-20 face 6. */
const NATIVE_SCALE = 10n ** 12n;
const PERCENT = 100;
const BPS = 10_000;

/** The Universal Router 2.1.2 on each chain Kawase swaps on (Uniswap's supported-chains page; read live 2026-10-14). */
export const UNISWAP_ROUTERS: Readonly<Record<number, Address>> = { 5042: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650" };
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
/** The router's placeholders: MSG_SENDER (the wallet, in a 7702 batch) and ADDRESS_THIS (the router, swept later). */
const MSG_SENDER: Address = "0x0000000000000000000000000000000000000001";
const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable", "function execute(bytes commands, bytes[] inputs) payable"]);
const permit2Abi = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);

// Universal Router commands Kawase accepts (anything else is refused).
const CMD = { V3_SWAP_EXACT_IN: 0x00, SWEEP: 0x04, V2_SWAP_EXACT_IN: 0x08, V4_SWAP: 0x10 } as const;
// V4 router actions Kawase accepts.
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SWAP_EXACT_IN: 0x07, SETTLE: 0x0b, SETTLE_ALL: 0x0c, TAKE: 0x0e, TAKE_ALL: 0x0f } as const;
const COMMAND_MASK = 0x3f;

export class UniswapError extends Error {
  constructor(
    readonly code: "no_route" | "timeout" | "needs_key" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "UniswapError";
  }
}

export type UniswapQuoteInput = {
  apiKey: string;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  wallet: Address;
  slippageBps: number;
  /** The chain's native-and-ERC-20 USDC (Arc), whose swaps pay the router as native value. */
  nativeUsdc?: Address | undefined;
};

export type UniswapQuote = {
  requestId: string;
  estimatedOut: bigint;
  minOut: bigint;
  /** Pools the route crosses ("v4 0.018%"), for "via …". */
  via: string[];
  gasFeeUsd: number | null;
  /** The pool fees the route pays, as a fraction of the amount (0.00018), when the route says. */
  poolFeeRate: number | null;
  /** The opaque quote `/swap` builds from, and the permit transaction when one is needed. */
  quote: Record<string, unknown>;
  permitTransaction: { to: Address; data: Hex; value: bigint } | null;
  nativeIn: boolean;
};

type Call = { to: Address; data: Hex; value: bigint };

/**
 * One POST, asked once more when Uniswap says the failure was its own and passing ("A routing dependency timed out
 * or failed; the request may succeed on retry", seen live 2026-10-14 on /swap): a 5xx or that wording.
 */
async function post(path: string, apiKey: string, body: unknown) {
  const first = await postOnce(path, apiKey, body);
  const transient = first.status >= HTTP_SERVER_ERROR || /may succeed on retry|timed out/i.test(String(first.body.detail ?? ""));
  if (first.ok || !transient) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  return postOnce(path, apiKey, body);
}

async function postOnce(path: string, apiKey: string, body: unknown) {
  if (!apiKey) throw new UniswapError("needs_key", "UNISWAP_API_KEY is not set");
  try {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    throw new UniswapError("timeout", "Uniswap did not answer in time");
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function uniswapQuote(input: UniswapQuoteInput): Promise<UniswapQuote> {
  if (!UNISWAP_ROUTERS[input.chainId]) throw new UniswapError("no_route", "Uniswap's router is not on this chain");
  const { ok, body } = await post("/quote", input.apiKey, {
    type: "EXACT_INPUT",
    amount: input.amountIn.toString(),
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    tokenInChainId: input.chainId,
    tokenOutChainId: input.chainId,
    swapper: input.wallet,
    recipient: input.wallet,
    slippageTolerance: (input.slippageBps / BPS) * PERCENT,
    routingPreference: "BEST_PRICE",
    protocols: ["V2", "V3", "V4"],
    generatePermitAsTransaction: true,
    permitAmount: "EXACT",
  });
  const quote = body.quote as { output?: { amount?: string; minimumAmount?: string; recipient?: string }; gasFeeUSD?: string; route?: { type?: string; fee?: string }[][] } | undefined;
  if (!ok || body.routing !== "CLASSIC" || !quote?.output?.amount || !quote.output.minimumAmount) {
    const message = String(body.detail ?? body.errorCode ?? "no route");
    throw new UniswapError(/no route|NO_ROUTE|not found/i.test(message) ? "no_route" : "failed", message);
  }
  if (quote.output.recipient && !same(quote.output.recipient, input.wallet)) throw new UniswapError("failed", "the quote pays someone else");
  const permit = body.permitTransaction as { to?: string; data?: Hex; value?: string } | null | undefined;
  const pools = (quote.route ?? []).flat();
  const fees = pools.map((pool) => Number(pool.fee ?? NaN)).filter((fee) => Number.isFinite(fee));
  return {
    requestId: String(body.requestId ?? ""),
    estimatedOut: BigInt(quote.output.amount),
    minOut: BigInt(quote.output.minimumAmount),
    via: pools.map((pool) => `${String(pool.type ?? "").replace(/-pool$/, "")} ${(Number(pool.fee ?? 0) / BPS).toFixed(3)}%`),
    gasFeeUsd: quote.gasFeeUSD ? Number(quote.gasFeeUSD) : null,
    // Uniswap fees are in hundredths of a basis point (180 = 0.018%).
    poolFeeRate: fees.length ? fees.reduce((sum, fee) => sum + fee, 0) / (BPS * PERCENT) : null,
    quote: body.quote as Record<string, unknown>,
    permitTransaction: permit?.to && permit.data ? { to: getAddress(permit.to), data: permit.data, value: BigInt(permit.value ?? "0") } : null,
    nativeIn: Boolean(input.nativeUsdc && same(input.tokenIn, input.nativeUsdc)),
  };
}

/** The calls for a quote: [approve exactly to Permit2, the permit transaction,] the router's `execute`. */
export async function uniswapCalls(apiKey: string, quoted: UniswapQuote, tokenIn: Address, amountIn: bigint): Promise<Call[]> {
  const { ok, body } = await post("/swap", apiKey, { quote: quoted.quote, simulateTransaction: false });
  const swap = body.swap as { to?: string; data?: Hex; value?: string } | undefined;
  if (!ok || !swap?.to || !swap.data) throw new UniswapError("failed", String(body.detail ?? "no swap"));
  const main: Call = { to: getAddress(swap.to), data: swap.data, value: BigInt(swap.value ?? "0") };
  if (quoted.nativeIn) return [main];
  const approve: Call = { to: tokenIn, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2, amountIn] }), value: NO_VALUE };
  return quoted.permitTransaction ? [approve, quoted.permitTransaction, main] : [approve, main];
}

export type UniswapCheckReason = "wrong_shape" | "wrong_target" | "wrong_approval" | "wrong_permit" | "native_value" | "wrong_command" | "wrong_recipient" | "wrong_amount" | "below_minimum" | "unreadable";

/**
 * The approval (exactly `amountIn` to Permit2, then Permit2's allowance of exactly `amountIn` to the router) unless
 * USDC goes in as native value (exactly `amountIn` at 18 decimals); then the router's `execute` with only the
 * commands and actions Kawase reads, every payout to the wallet, the input exactly `amountIn`, and the sum of the
 * route's minimums at least `minOut`.
 */
export function checkUniswapCalls(
  calls: readonly Call[],
  expected: { chainId: number; tokenIn: Address; tokenOut: Address; amountIn: bigint; recipient: Address; minOut: bigint; nativeIn: boolean },
): { ok: true; guaranteedOut: bigint } | { ok: false; reason: UniswapCheckReason } {
  const router = UNISWAP_ROUTERS[expected.chainId];
  const main = calls[calls.length - 1];
  if (!router || !main) return { ok: false, reason: "wrong_shape" };
  if (!same(main.to, router)) return { ok: false, reason: "wrong_target" };
  if (expected.nativeIn) {
    if (calls.length !== 1) return { ok: false, reason: "wrong_shape" };
    if (main.value !== expected.amountIn * NATIVE_SCALE) return { ok: false, reason: "native_value" };
  } else {
    if (calls.length < 2 || calls.length > 3 || main.value !== NO_VALUE) return { ok: false, reason: calls.length < 2 || calls.length > 3 ? "wrong_shape" : "native_value" };
    const approve = calls[0]!;
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: approve.data });
      if (decoded.functionName !== "approve" || approve.value !== NO_VALUE || !same(approve.to, expected.tokenIn) || !same(decoded.args[0], PERMIT2) || decoded.args[1] !== expected.amountIn) return { ok: false, reason: "wrong_approval" };
    } catch {
      return { ok: false, reason: "wrong_approval" };
    }
    if (calls.length === 3) {
      const permit = calls[1]!;
      try {
        const { args } = decodeFunctionData({ abi: permit2Abi, data: permit.data });
        if (!same(permit.to, PERMIT2) || permit.value !== NO_VALUE || !same(args[0], expected.tokenIn) || !same(args[1], router) || args[2] !== expected.amountIn) return { ok: false, reason: "wrong_permit" };
      } catch {
        return { ok: false, reason: "wrong_permit" };
      }
    }
  }

  const payee = (address: string) => same(address, expected.recipient) || same(address, MSG_SENDER) || same(address, ADDRESS_THIS);
  const paysWallet = (address: string) => same(address, expected.recipient) || same(address, MSG_SENDER);
  let guaranteed = NO_VALUE;
  let spent = NO_VALUE;
  try {
    const { args } = decodeFunctionData({ abi: routerAbi, data: main.data });
    const commands = (args[0] as Hex).slice(2).match(/../g) ?? [];
    const inputs = args[1] as readonly Hex[];
    if (commands.length === 0 || commands.length !== inputs.length) return { ok: false, reason: "unreadable" };
    for (let index = 0; index < commands.length; index++) {
      const command = parseInt(commands[index]!, 16) & COMMAND_MASK;
      const data = inputs[index]!;
      if (command === CMD.V4_SWAP) {
        const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), data);
        const list = actions.slice(2).match(/../g) ?? [];
        if (list.length !== params.length) return { ok: false, reason: "unreadable" };
        for (let step = 0; step < list.length; step++) {
          const action = parseInt(list[step]!, 16);
          const param = params[step]!;
          if (action === ACT.SWAP_EXACT_IN) {
            const [swap] = decodeAbiParameters(parseAbiParameters("(address currencyIn, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint256[] maxHopSlippage, uint128 amountIn, uint128 amountOutMinimum)"), param);
            if (!same(swap.currencyIn, expected.tokenIn) || !same(swap.path[swap.path.length - 1]?.intermediateCurrency ?? "", expected.tokenOut)) return { ok: false, reason: "wrong_amount" };
            spent += swap.amountIn;
            guaranteed += swap.amountOutMinimum;
          } else if (action === ACT.SWAP_EXACT_IN_SINGLE) {
            const [swap] = decodeAbiParameters(parseAbiParameters("((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)"), param);
            const [from, to] = swap.zeroForOne ? [swap.poolKey.currency0, swap.poolKey.currency1] : [swap.poolKey.currency1, swap.poolKey.currency0];
            if (!same(from, expected.tokenIn) || !same(to, expected.tokenOut)) return { ok: false, reason: "wrong_amount" };
            spent += swap.amountIn;
            guaranteed += swap.amountOutMinimum;
          } else if (action === ACT.TAKE) {
            const [, recipient] = decodeAbiParameters(parseAbiParameters("address, address, uint256"), param);
            if (!paysWallet(recipient)) return { ok: false, reason: "wrong_recipient" };
          } else if (action !== ACT.SETTLE && action !== ACT.SETTLE_ALL && action !== ACT.TAKE_ALL) {
            // TAKE_ALL pays the caller (the wallet); SETTLE/SETTLE_ALL pay the pool. Anything else is not read.
            return { ok: false, reason: "wrong_command" };
          }
        }
      } else if (command === CMD.V3_SWAP_EXACT_IN || command === CMD.V2_SWAP_EXACT_IN) {
        const [recipient, amountIn, amountOutMin] = decodeAbiParameters(parseAbiParameters(command === CMD.V3_SWAP_EXACT_IN ? "address, uint256, uint256, bytes, bool" : "address, uint256, uint256, address[], bool"), data);
        if (!payee(recipient)) return { ok: false, reason: "wrong_recipient" };
        spent += amountIn;
        guaranteed += amountOutMin;
      } else if (command === CMD.SWEEP) {
        const [, recipient] = decodeAbiParameters(parseAbiParameters("address, address, uint256"), data);
        if (!paysWallet(recipient)) return { ok: false, reason: "wrong_recipient" };
      } else {
        return { ok: false, reason: "wrong_command" };
      }
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (spent !== expected.amountIn) return { ok: false, reason: "wrong_amount" };
  if (guaranteed < expected.minOut) return { ok: false, reason: "below_minimum" };
  return { ok: true, guaranteedOut: guaranteed };
}
