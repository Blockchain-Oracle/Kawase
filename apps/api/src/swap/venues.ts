// The swap fan-out (R3; cards/trade.md "Venues"): every swap asks KyberSwap (keyless aggregator, router calldata from
// the wallet itself), Circle App Kit (its adapter, Circle's signed execution parameters), LI.FI (its diamond), Uniswap
// (its Trading API and Universal Router), 0x (AllowanceHolder + Settler) and Socket (its allowance holder) for a fresh
// executable quote at once; the most delivered after fees is recommended, the rest are shown as alternatives with why
// they lost or failed, and a person can pick any venue that quoted. Building happens only for the chosen venue at
// approval, with half the shown slippage (the build re-prices), and each venue's calls are checked before the wallet is
// asked: the right contract, exactly the amount, the wallet as the only recipient, an on-chain minimum at least what
// the person was shown, no native value (except USDC paid to Uniswap's router as Arc's native coin, exactly the
// amount). Socket's calldata cannot be decoded, so its target, spender, token, amount and receiver are checked and the
// receipt is witnessed. Approve + swap then go out as one EIP-7702 batch. The one place swaps fan out: tickets, chat,
// automations and the agent's route race all come through here.
import { erc20Abi, encodeFunctionData, getAddress, parseAbi, type Address, type Hex, type PublicClient } from "viem";

import { APP_KIT_QUOTE_TIMEOUT_MS, LIFI_DIAMOND_ARC, SWAP_VENUE_LABELS, SWAP_VENUE_TIMEOUT_MS } from "@kawase/config";
import { checkSwapCalls, type SwapCall } from "@kawase/integrations-app-kit";
import { BridgeProviderError, checkSocketCalls, lifiQuoteGet, socketRoutes, SOCKET_FEE_BPS, type LifiPriority, type SocketRoute } from "@kawase/integrations-bridges";
import { approveRouterCall, build, checkKyberSwap, isKyberSwapChain, quote as kyberQuote, KyberSwapError } from "@kawase/integrations-kyberswap";
import type { NetworkContext } from "@kawase/networks";

import { checkUniswapCalls, uniswapCalls, uniswapQuote, UniswapError, UNISWAP_ROUTERS } from "../routing/uniswap";
import { checkZeroExCalls, zeroExQuote, ZeroExError } from "../routing/zerox";
import type { SwapEngine } from "./engine";

/** Every swap venue Kawase asks, with the name people know it by (config holds the first three). */
export const SWAP_VENUE_NAMES = { ...SWAP_VENUE_LABELS, uniswap: "Uniswap", zerox: "0x", socket: "Socket" } as const;
export type SwapVenue = keyof typeof SWAP_VENUE_NAMES;
export const SWAP_VENUES = Object.keys(SWAP_VENUE_NAMES) as SwapVenue[];
export const isSwapVenue = (value: unknown): value is SwapVenue => typeof value === "string" && value in SWAP_VENUE_NAMES;

/** What a venue takes for itself, on top of the pools' own fees, when it says. */
export type VenueFee = {
  /** The venue's rate (Socket 20 bps, 0x's volume fee), when it states one. */
  bps: number | null;
  /** In base units of `token`. */
  amount: bigint | null;
  token: Address | null;
};

export type VenueQuote = {
  venue: SwapVenue;
  /** What the route expects to deliver, base units of tokenOut. */
  estimatedOut: bigint;
  /** What the built calls will guarantee at the shown slippage. */
  minOut: bigint;
  /** Exchanges the route goes through ("uniswapv4", "aero-cl"…), for "via …". */
  via: string[];
  /** Route fees in US dollars, when the venue says. */
  feeUsd: number | null;
  /** The venue's own cut, when it says (already netted in `estimatedOut`). */
  fee: VenueFee | null;
  /** The venue's id for this quote (Uniswap requestId, 0x zid, Socket quoteId), for support and status. */
  quoteId: string | null;
};

export type VenueFailure = { venue: SwapVenue; reason: "not_on_network" | "no_route" | "timeout" | "failed" | "needs_key" | "rate_limited" };

export type VenueInput = {
  network: NetworkContext;
  client: PublicClient;
  from: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  decimalsIn: number;
  decimalsOut: number;
  slippageBps: number;
};

export type PreparedSwap = { calls: SwapCall[]; guaranteedOut: bigint };

/** One venue's answer as it arrives (the route race reads these one by one). */
export type VenueAttempt = { venue: SwapVenue; result: Promise<VenueQuote> };

export type SwapVenues = {
  /** Every venue (or only `only`), each with its own promise and timeout, in the order asked. */
  quoteEach(input: VenueInput, only?: readonly SwapVenue[]): VenueAttempt[];
  /** Every venue (or only `only`, when re-checking the chosen one at approval), best first. */
  quoteAll(input: VenueInput, only?: readonly SwapVenue[]): Promise<{ quotes: VenueQuote[]; failures: VenueFailure[] }>;
  /** The chosen venue's calls for exactly this swap, checked; throws `VenueRefused` when they do not hold. */
  prepare(venue: SwapVenue, input: VenueInput & { minOut: bigint }): Promise<PreparedSwap>;
};

/** API keys for the keyed venues; a venue without its key reports `needs_key` and the others decide. */
export type VenueKeys = { uniswap?: string | undefined; zerox?: string | undefined };

export class VenueRefused extends Error {
  constructor(
    readonly venue: SwapVenue,
    readonly reason: string,
  ) {
    super(`${venue}: ${reason}`);
  }
}

const BPS = 10_000;
const ZERO = 0n;
/** Kawase's integrator name on LI.FI and KyberSwap. */
const INTEGRATOR = "kawase";
/** 0x's Settler registry (the same on every chain): the current Settler for taker swaps is `ownerOf(2)`, the one before it `prev(2)`. */
const ZEROX_REGISTRY: Address = "0x00000000000004533Fe15556B1E086BB1A72cEae";
const ZEROX_TAKER_FEATURE = 2n;
const SETTLERS_TTL_MS = 600_000;
const registryAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)", "function prev(uint128 tokenId) view returns (address)"]);

const toDecimal = (units: bigint, decimals: number) => {
  const text = units.toString().padStart(decimals + 1, "0");
  const whole = text.slice(0, text.length - decimals) || "0";
  const fraction = decimals > 0 ? text.slice(text.length - decimals).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
};

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export const failureOf = (venue: SwapVenue, error: unknown): VenueFailure => {
  if (error instanceof Error && error.message === "timeout") return { venue, reason: "timeout" };
  if (error instanceof KyberSwapError) return { venue, reason: error.code === "unsupported_chain" ? "not_on_network" : error.code === "no_route" ? "no_route" : error.code === "timeout" ? "timeout" : "failed" };
  if (error instanceof UniswapError || error instanceof ZeroExError) return { venue, reason: error.code === "no_route" ? "no_route" : error.code === "timeout" ? "timeout" : error.code === "needs_key" ? "needs_key" : "failed" };
  if (error instanceof BridgeProviderError) return { venue, reason: error.code === "rate_limited" ? "rate_limited" : error.code === "timeout" ? "timeout" : "no_route" };
  if (error instanceof VenueRefused) return { venue, reason: error.reason === "not_on_network" ? "not_on_network" : error.reason === "needs_key" ? "needs_key" : "no_route" };
  return { venue, reason: /no route|not available|NO_POSSIBLE_ROUTE|1002/i.test(String(error)) ? "no_route" : "failed" };
};

type LifiQuote = {
  estimate: { toAmount: string; toAmountMin: string; approvalAddress: string; feeCosts?: { amountUSD?: string; amount?: string; percentage?: string; token?: { address?: string } }[] };
  transactionRequest: { to: string; data: string; value: string };
  includedSteps?: { toolDetails?: { name?: string } }[];
  toolDetails?: { name?: string };
};

async function lifiQuote(input: VenueInput, slippageBps: number, priority: LifiPriority): Promise<LifiQuote> {
  if (input.network.isRealMoney === false) throw new VenueRefused("lifi", "not_on_network");
  const query = new URLSearchParams({
    fromChain: String(input.network.chainId),
    toChain: String(input.network.chainId),
    fromToken: input.tokenIn,
    toToken: input.tokenOut,
    fromAmount: input.amountIn.toString(),
    fromAddress: input.from,
    toAddress: input.from,
    slippage: String(slippageBps / BPS),
    integrator: INTEGRATOR,
  });
  const { ok, body } = await lifiQuoteGet(query, priority);
  const quoted = body as unknown as LifiQuote & { message?: string };
  if (!ok || !quoted.estimate || !quoted.transactionRequest) throw new VenueRefused("lifi", quoted.message ?? "no_route");
  return quoted;
}

/** Socket's best same-chain route, held to its own minimum (Socket takes 20 bps, netted in the amounts). */
async function socketSwap(input: VenueInput, slippageBps: number): Promise<SocketRoute> {
  if (input.network.isRealMoney === false) throw new VenueRefused("socket", "not_on_network");
  const [best] = await socketRoutes({ originChainId: input.network.chainId, destinationChainId: input.network.chainId, inputToken: input.tokenIn, outputToken: input.tokenOut, amount: input.amountIn, user: input.from, receiver: input.from, slippageBps });
  return best!;
}

export function createSwapVenues(appKit: SwapEngine, keys: VenueKeys = appKit.venueKeys ?? {}): SwapVenues {
  const settlers = new Map<number, { at: number; addresses: Address[] }>();
  /** The 0x Settlers the registry vouches for on this chain now (current and previous), cached for ten minutes. */
  const zeroExSettlers = async (input: VenueInput): Promise<Address[]> => {
    const cached = settlers.get(input.network.chainId);
    if (cached && Date.now() - cached.at < SETTLERS_TTL_MS) return cached.addresses;
    const [current, previous] = await Promise.all([
      input.client.readContract({ address: ZEROX_REGISTRY, abi: registryAbi, functionName: "ownerOf", args: [ZEROX_TAKER_FEATURE] }),
      input.client.readContract({ address: ZEROX_REGISTRY, abi: registryAbi, functionName: "prev", args: [ZEROX_TAKER_FEATURE] }).catch(() => undefined),
    ]);
    const addresses = [current, previous].filter((address): address is Address => Boolean(address) && address !== "0x0000000000000000000000000000000000000000").map((address) => getAddress(address));
    settlers.set(input.network.chainId, { at: Date.now(), addresses });
    return addresses;
  };
  const nativeUsdc = (input: VenueInput) => input.network.addresses.usdc;

  const quoteOne = async (venue: SwapVenue, input: VenueInput): Promise<VenueQuote> => {
    switch (venue) {
      case "kyberswap": {
        if (!isKyberSwapChain(input.network.chainId)) throw new VenueRefused(venue, "not_on_network");
        const route = await kyberQuote({ chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, sender: input.from, recipient: input.from, slippageBps: input.slippageBps, clientId: INTEGRATOR });
        return { venue, estimatedOut: route.amountOut, minOut: route.minOut, via: route.venues, feeUsd: null, fee: null, quoteId: null };
      }
      case "app_kit": {
        const quoted = await appKit.quote({ network: input.network, client: input.client, from: input.from, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: toDecimal(input.amountIn, input.decimalsIn), slippageBps: input.slippageBps, decimalsOut: input.decimalsOut });
        // Circle's provider fee on App Kit swaps is always 2 bps (docs.arc.io app-kit swap fees).
        return { venue, estimatedOut: quoted.estimatedOut, minOut: quoted.minOut, via: [], feeUsd: null, fee: { bps: 2, amount: null, token: null }, quoteId: null };
      }
      case "lifi": {
        const quoted = await lifiQuote(input, input.slippageBps, "preview");
        const fee = (quoted.estimate.feeCosts ?? []).reduce((sum, cost) => sum + Number(cost.amountUSD ?? 0), 0);
        const tools = (quoted.includedSteps ?? []).map((step) => step.toolDetails?.name).filter((name): name is string => Boolean(name));
        const own = quoted.estimate.feeCosts?.[0];
        return {
          venue,
          estimatedOut: BigInt(quoted.estimate.toAmount),
          minOut: BigInt(quoted.estimate.toAmountMin),
          via: tools.length ? tools : [quoted.toolDetails?.name ?? ""].filter(Boolean),
          feeUsd: fee || null,
          fee: own ? { bps: own.percentage ? Math.round(Number(own.percentage) * BPS) : null, amount: own.amount ? BigInt(own.amount) : null, token: own.token?.address ? getAddress(own.token.address) : null } : null,
          quoteId: null,
        };
      }
      case "uniswap": {
        if (input.network.isRealMoney === false || !UNISWAP_ROUTERS[input.network.chainId]) throw new VenueRefused(venue, "not_on_network");
        if (!keys.uniswap) throw new VenueRefused(venue, "needs_key");
        const quoted = await uniswapQuote({ apiKey: keys.uniswap, chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, wallet: input.from, slippageBps: input.slippageBps, nativeUsdc: nativeUsdc(input) });
        return { venue, estimatedOut: quoted.estimatedOut, minOut: quoted.minOut, via: quoted.via, feeUsd: quoted.gasFeeUsd, fee: { bps: 0, amount: ZERO, token: null }, quoteId: quoted.requestId || null };
      }
      case "zerox": {
        if (input.network.isRealMoney === false) throw new VenueRefused(venue, "not_on_network");
        if (!keys.zerox) throw new VenueRefused(venue, "needs_key");
        const quoted = await zeroExQuote({ apiKey: keys.zerox, chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, wallet: input.from, slippageBps: input.slippageBps });
        const bps = quoted.fee && quoted.fee.token.toLowerCase() === input.tokenIn.toLowerCase() && input.amountIn > ZERO ? Number((quoted.fee.amount * BigInt(BPS)) / input.amountIn) : null;
        return { venue, estimatedOut: quoted.estimatedOut, minOut: quoted.minOut, via: quoted.via, feeUsd: null, fee: quoted.fee ? { bps, amount: quoted.fee.amount, token: quoted.fee.token } : null, quoteId: quoted.zid || null };
      }
      case "socket": {
        const route = await socketSwap(input, input.slippageBps);
        return { venue, estimatedOut: route.outputAmount, minOut: route.minOutputAmount, via: [route.via], feeUsd: null, fee: { bps: route.fee.bps || SOCKET_FEE_BPS, amount: route.fee.amount, token: route.fee.token }, quoteId: route.quoteId };
      }
    }
  };

  const quoteEach = (input: VenueInput, only?: readonly SwapVenue[]): VenueAttempt[] =>
    SWAP_VENUES.filter((venue) => !only || only.includes(venue)).map((venue) => ({ venue, result: within(quoteOne(venue, input), venue === "app_kit" ? APP_KIT_QUOTE_TIMEOUT_MS : SWAP_VENUE_TIMEOUT_MS) }));

  return {
    quoteEach,

    async quoteAll(input, only) {
      const attempts = quoteEach(input, only);
      const settled = await Promise.allSettled(attempts.map((attempt) => attempt.result));
      const quotes: VenueQuote[] = [];
      const failures: VenueFailure[] = [];
      settled.forEach((outcome, index) => {
        const venue = attempts[index]!.venue;
        if (outcome.status === "fulfilled" && outcome.value.estimatedOut > ZERO) quotes.push(outcome.value);
        else failures.push(outcome.status === "rejected" ? failureOf(venue, outcome.reason) : { venue, reason: "no_route" });
      });
      // The most delivered wins; the stop limit breaks a tie (the safer promise).
      quotes.sort((a, b) => (b.estimatedOut === a.estimatedOut ? Number(b.minOut - a.minOut) : b.estimatedOut > a.estimatedOut ? 1 : -1));
      return { quotes, failures };
    },

    async prepare(venue, input) {
      switch (venue) {
        case "kyberswap": {
          const route = await kyberQuote({ chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, sender: input.from, recipient: input.from, slippageBps: input.slippageBps, clientId: INTEGRATOR });
          const transaction = await build(route, { slippageBps: input.slippageBps, clientId: INTEGRATOR });
          const check = checkKyberSwap(transaction, { tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, recipient: input.from, minOut: input.minOut });
          if (!check.ok) throw new VenueRefused(venue, check.reason);
          return { calls: [approveRouterCall(input.tokenIn, input.amountIn), { to: transaction.to, data: transaction.data, value: transaction.value }], guaranteedOut: check.decoded.minReturnAmount };
        }
        case "app_kit": {
          const calls = await appKit.prepare({ network: input.network, client: input.client, from: input.from, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: toDecimal(input.amountIn, input.decimalsIn), slippageBps: input.slippageBps });
          const check = checkSwapCalls(input.network, calls, { from: input.from, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, minOut: input.minOut });
          if (!check.ok) throw new VenueRefused(venue, check.reason);
          return { calls, guaranteedOut: check.guaranteedOut };
        }
        case "lifi": {
          const quoted = await lifiQuote(input, input.slippageBps, "execute");
          const target = getAddress(quoted.transactionRequest.to);
          const spender = getAddress(quoted.estimate.approvalAddress);
          const guaranteedOut = BigInt(quoted.estimate.toAmountMin);
          // LI.FI's calldata is its diamond's; Kawase holds it to the diamond, no native value, the quote's own
          // minimum and the wallet as the receiver it asked for, and witnesses what arrived from the receipt.
          if (target !== getAddress(LIFI_DIAMOND_ARC) || spender !== target) throw new VenueRefused(venue, "wrong_target");
          if (BigInt(quoted.transactionRequest.value || "0") !== ZERO) throw new VenueRefused(venue, "native_value");
          if (guaranteedOut < input.minOut) throw new VenueRefused(venue, "below_minimum");
          const approve = { to: input.tokenIn, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, input.amountIn] }), value: ZERO };
          return { calls: [approve, { to: target, data: quoted.transactionRequest.data as Hex, value: ZERO }], guaranteedOut };
        }
        case "uniswap": {
          if (!keys.uniswap) throw new VenueRefused(venue, "needs_key");
          const quoted = await uniswapQuote({ apiKey: keys.uniswap, chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, wallet: input.from, slippageBps: input.slippageBps, nativeUsdc: nativeUsdc(input) });
          if (quoted.minOut < input.minOut) throw new VenueRefused(venue, "below_minimum");
          const calls = await uniswapCalls(keys.uniswap, quoted, input.tokenIn, input.amountIn);
          const check = checkUniswapCalls(calls, { chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, recipient: input.from, minOut: input.minOut, nativeIn: quoted.nativeIn });
          if (!check.ok) throw new VenueRefused(venue, check.reason);
          return { calls, guaranteedOut: check.guaranteedOut };
        }
        case "zerox": {
          if (!keys.zerox) throw new VenueRefused(venue, "needs_key");
          const [quoted, allowed] = await Promise.all([
            zeroExQuote({ apiKey: keys.zerox, chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, wallet: input.from, slippageBps: input.slippageBps }),
            zeroExSettlers(input),
          ]);
          const check = checkZeroExCalls(quoted.calls, { tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, recipient: input.from, minOut: input.minOut, settlers: allowed });
          if (!check.ok) throw new VenueRefused(venue, check.reason);
          return { calls: quoted.calls, guaranteedOut: check.guaranteedOut };
        }
        case "socket": {
          const route = await socketSwap(input, input.slippageBps);
          // Opaque calldata: the quote's own minimum stands for the on-chain one, and the receipt is witnessed.
          if (route.minOutputAmount < input.minOut) throw new VenueRefused(venue, "below_minimum");
          const check = checkSocketCalls(route.calls, { token: input.tokenIn, amount: input.amountIn, receiver: input.from, expiresAt: route.expiresAt });
          if (!check.ok) throw new VenueRefused(venue, check.reason);
          return { calls: route.calls, guaranteedOut: route.minOutputAmount };
        }
      }
    },
  };
}

export const venueLabel = (venue: SwapVenue) => SWAP_VENUE_NAMES[venue];
