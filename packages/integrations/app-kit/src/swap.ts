// Swaps through Circle App Kit, signed by the user's own wallet (spike 3, re-done for the D33 wallet).
//
// The kit does what it is good at: the quote, the route, Circle's signed execution parameters and the calldata for
// its adapter contract. It never signs. Kawase hands the kit a signing strategy that only *captures* the prepared
// calls and stops the kit there; the api then checks the calls, wraps them into one transaction the wallet sends
// to itself (EIP-7702 batch: approve + swap, all or nothing), and the person approves that one transaction with
// Face ID. Broadcasting, tracking and the receipt witness stay Kawase's, like a send.
import { AppKit } from "@circle-fin/app-kit";
import { Arc, ArcTestnet } from "@circle-fin/app-kit/chains";
import { createViemAdapter, type EvmCallsPayload, type SigningStrategy } from "@circle-fin/adapter-viem-v2/next";
import { decodeFunctionData, erc20Abi, parseAbi, type Address, type Hex, type PublicClient } from "viem";

import type { NetworkContext } from "@kawase/networks";

export type SwapCall = { to: Address; data: Hex; value: bigint };

export type SwapQuote = {
  /** Base units of the output token the route expects to deliver. */
  estimatedOut: bigint;
  /** Base units the route guarantees at the quoted slippage (the stop limit). */
  minOut: bigint;
  /** Fees taken by the route, in base units of their token. */
  fees: { token: string; amount: string; type: string }[];
};

export type SwapInput = {
  network: NetworkContext;
  /** Reads for the kit (allowance, decimals), on the same RPC the api uses. */
  client: PublicClient;
  apiKey: string;
  from: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Decimal amount of the input token, e.g. "5" or "0.25". */
  amountIn: string;
  slippageBps: number;
};

const KIT_CHAINS = { Arc, Arc_Testnet: ArcTestnet } as const;
const ZERO = 0n;
/** An approval and the swap, or the swap alone when an allowance already exists. */
const MAX_CALLS = 2;

/** Thrown by the capture strategy to stop the kit once the calls are in hand. */
class Captured extends Error {
  constructor() {
    super("kawase: calls captured");
  }
}

export function kitChain(network: NetworkContext) {
  return KIT_CHAINS[network.appKitChain];
}

/** The App Kit adapter contract every swap call must go to (and the only spender an approval may name). */
export function swapAdapterContract(network: NetworkContext): Address {
  const adapter = kitChain(network).kitContracts?.adapter;
  if (!adapter) throw new Error(`App Kit has no adapter contract on ${network.appKitChain}`);
  return adapter as Address;
}

export function adapterFor(input: Pick<SwapInput, "network" | "client" | "from">, signing: SigningStrategy) {
  const chain = kitChain(input.network);
  return createViemAdapter({
    capabilities: { addressContext: "user-controlled", supportedChains: [chain] },
    getPublicClient: () => input.client as never,
    signing,
    address: input.from,
  });
}

/** A strategy that refuses everything; quotes never sign. */
const NEVER_SIGN: SigningStrategy = {
  manifest: { name: "kawase-quote", supportedPayloadFamilies: ["evm-calls"], broadcasts: true, atomicBatch: true },
  execute: () => Promise.reject(new Error("kawase: a quote never signs")),
};

/** Circle's USD price per token on this chain (the market reference a quote is compared with). */
export async function marketPrices(network: NetworkContext, apiKey: string, tokens: readonly Address[]): Promise<Map<string, number>> {
  const kit = new AppKit();
  const result = (await kit.getTokenRates({ chain: network.appKitChain, addresses: [...tokens], apiKey } as never)) as unknown as {
    rates: Record<string, Record<string, { priceUSD: string }>>;
  };
  const rates = result.rates[network.appKitChain] ?? {};
  return new Map(Object.entries(rates).map(([address, rate]) => [address.toLowerCase(), Number(rate.priceUSD)]));
}

const toBaseUnits = (decimal: string, decimals: number) => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0").slice(0, decimals));
};

/** A fresh quote: what the route expects to deliver and the least it guarantees. */
export async function quoteSwap(input: SwapInput & { decimalsOut: number }): Promise<SwapQuote> {
  const kit = new AppKit();
  const estimate = await withRouteRetry(() => kit.estimateSwap({
    from: { adapter: adapterFor(input, NEVER_SIGN), chain: input.network.appKitChain },
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn,
    config: { apiKey: input.apiKey, slippageBps: input.slippageBps },
  } as never));
  const result = estimate as unknown as {
    estimatedOutput: { amount: string };
    stopLimit: { amount: string };
    fees?: { token: string; amount: string; type: string }[];
  };
  return {
    estimatedOut: toBaseUnits(result.estimatedOutput.amount, input.decimalsOut),
    minOut: toBaseUnits(result.stopLimit.amount, input.decimalsOut),
    fees: result.fees ?? [],
  };
}

/**
 * The exact calls for one swap. The kit fetches Circle's signed execution parameters for this slippage and builds
 * approve + swap; the capture strategy takes them and stops. (A separate stop limit is not sent: Circle's service
 * refuses one it cannot route unpredictably on testnet, 331001; the minimum the calls guarantee is read back from
 * the calldata by `checkSwapCalls` instead.)
 */
export const prepareSwap = (input: SwapInput): Promise<SwapCall[]> => withRouteRetry(() => prepareOnce(input));

/**
 * Circle's service answers "No route available" (331001) for a route it finds a moment later: seen on Arc testnet
 * for the same pair, amount and slippage within seconds, mostly after several calls in a row (2026-10-01). Both the
 * estimate and the build call it, so both retry with a growing pause.
 */
export async function withRouteRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= ROUTE_ATTEMPTS || !noRouteYet(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, ROUTE_RETRY_MS * attempt));
    }
  }
}

const ROUTE_ATTEMPTS = 4;
const ROUTE_RETRY_MS = 600;
const noRouteYet = (error: unknown) => {
  const body = (error as { cause?: { trace?: { responseBody?: { code?: number } } } }).cause?.trace?.responseBody;
  return body?.code === NO_ROUTE_CODE || /No route available/i.test(error instanceof Error ? error.message : "");
};
const NO_ROUTE_CODE = 331001;

/**
 * Runs a kit operation with a strategy that only captures: the first `evm-calls` payload (the whole batch, since
 * the strategy declares `atomicBatch`) is kept and the kit is stopped there, before anything is signed.
 */
export async function capturedCalls(input: Pick<SwapInput, "network" | "client" | "from">, run: (adapter: ReturnType<typeof adapterFor>) => Promise<unknown>): Promise<SwapCall[]> {
  let captured: EvmCallsPayload | undefined;
  const capture: SigningStrategy = {
    manifest: { name: "kawase-capture", supportedPayloadFamilies: ["evm-calls"], broadcasts: true, atomicBatch: true },
    execute: (payload) => {
      if (payload.type === "evm-calls" && !captured) captured = payload;
      return Promise.reject(new Captured());
    },
  };
  try {
    await run(adapterFor(input, capture));
  } catch (error) {
    if (!captured) throw error;
  }
  if (!captured) throw new Error("App Kit finished without asking to sign");
  return captured.calls.map((call) => ({ to: call.to, data: call.data ?? "0x", value: call.value ?? ZERO }));
}

const prepareOnce = (input: SwapInput): Promise<SwapCall[]> =>
  capturedCalls(input, (adapter) =>
    new AppKit().swap({
      from: { adapter, chain: input.network.appKitChain },
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      config: { apiKey: input.apiKey, slippageBps: input.slippageBps, allowanceStrategy: "approve" },
    } as never),
  );

const APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 increment)",
]);

/** The App Kit adapter's `execute` (from @circle-fin/adapter-viem-v2's `adapterContractAbi`). */
const ADAPTER_ABI = parseAbi([
  "struct Instruction { address target; bytes data; uint256 value; address tokenIn; uint256 amountToApprove; address tokenOut; uint256 minTokenOut; }",
  "struct TokenRecipient { address token; address beneficiary; }",
  "struct ExecutionParams { Instruction[] instructions; TokenRecipient[] tokens; uint256 execId; uint256 deadline; bytes metadata; }",
  "struct TokenInput { uint8 permitType; address token; uint256 amount; bytes permitCalldata; }",
  "function execute(ExecutionParams params, TokenInput[] tokenInputs, bytes signature) payable",
]);

export type SwapCallCheck =
  | { ok: true; guaranteedOut: bigint; deadline: bigint }
  | { ok: false; reason: string };

const SECONDS = 1000;

/**
 * The calls may do only this: optionally let the App Kit adapter take exactly `amountIn` of `tokenIn`, then call
 * the adapter's `execute`, with no native value, taking exactly `amountIn`, sending every output to the wallet
 * itself, and guaranteeing at least `minOut` of `tokenOut` before a deadline that has not passed. Anything else is
 * refused before the wallet is ever asked; what arrives is witnessed again from the receipt.
 */
export function checkSwapCalls(
  network: NetworkContext,
  calls: readonly SwapCall[],
  expected: { from: Address; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint },
  now = Date.now(),
): SwapCallCheck {
  const adapter = swapAdapterContract(network).toLowerCase();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (calls.length === 0 || calls.length > MAX_CALLS) return { ok: false, reason: `expected 1–2 calls, got ${calls.length}` };
  if (calls.some((call) => call.value !== ZERO)) return { ok: false, reason: "a call carries native value" };
  const swap = calls[calls.length - 1]!;
  if (swap.to.toLowerCase() !== adapter) return { ok: false, reason: "the swap call is not to the App Kit adapter" };
  if (calls.length === MAX_CALLS) {
    const approve = calls[0]!;
    if (!same(approve.to, expected.tokenIn)) return { ok: false, reason: "the approval is for another token" };
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: [...APPROVE_ABI, ...erc20Abi.filter((item) => item.type === "function" && item.name === "approve")], data: approve.data });
    } catch {
      return { ok: false, reason: "the first call is not an approval" };
    }
    const [spender, value] = decoded.args as readonly [Address, bigint];
    if (spender.toLowerCase() !== adapter) return { ok: false, reason: "the approval names another spender" };
    if (value !== expected.amountIn) return { ok: false, reason: "the approval is not exactly the swap amount" };
  }

  let execute;
  try {
    execute = decodeFunctionData({ abi: ADAPTER_ABI, data: swap.data });
  } catch {
    return { ok: false, reason: "the swap call is not the adapter's execute" };
  }
  const [params, tokenInputs] = execute.args;
  if (params.tokens.some((entry) => !same(entry.beneficiary, expected.from))) return { ok: false, reason: "an output goes to someone else" };
  if (!params.tokens.some((entry) => same(entry.token, expected.tokenOut))) return { ok: false, reason: "the output token is not the one asked for" };
  const taken = tokenInputs.filter((entry) => same(entry.token, expected.tokenIn)).reduce((sum, entry) => sum + entry.amount, ZERO);
  if (tokenInputs.some((entry) => !same(entry.token, expected.tokenIn)) || taken !== expected.amountIn)
    return { ok: false, reason: "the swap takes something other than exactly the amount" };
  const guaranteedOut = params.instructions
    .filter((instruction) => same(instruction.tokenOut, expected.tokenOut))
    .reduce((best, instruction) => (instruction.minTokenOut > best ? instruction.minTokenOut : best), ZERO);
  if (guaranteedOut < expected.minOut) return { ok: false, reason: "below_minimum" };
  if (params.deadline * BigInt(SECONDS) <= BigInt(now)) return { ok: false, reason: "the route's deadline has passed" };
  return { ok: true, guaranteedOut, deadline: params.deadline };
}
