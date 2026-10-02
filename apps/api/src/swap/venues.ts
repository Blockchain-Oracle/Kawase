// The swap fan-out (R3; cards/trade.md "Venues"): every swap asks KyberSwap (keyless aggregator, router calldata from
// the wallet itself), Circle App Kit (its adapter, Circle's signed execution parameters) and LI.FI (its diamond) for a
// fresh executable quote at once; the most delivered after fees is recommended, the rest are shown as alternatives
// with why they lost or failed. Building happens only for the chosen venue at approval, with half the shown slippage
// (the build re-prices), and each venue's calls are checked before the wallet is asked: the right contract, exactly
// the amount, the wallet as the only recipient, an on-chain minimum at least what the person was shown, no native
// value. Approve + swap then go out as one EIP-7702 batch. The one place swaps fan out: tickets, chat and
// automations all come through here.
import { erc20Abi, encodeFunctionData, getAddress, type Address, type Hex, type PublicClient } from "viem";

import { LIFI_DIAMOND_ARC, SWAP_VENUE_LABELS, SWAP_VENUE_TIMEOUT_MS, type SwapVenueId } from "@kawase/config";
import { checkSwapCalls, type SwapCall } from "@kawase/integrations-app-kit";
import { approveRouterCall, build, checkKyberSwap, isKyberSwapChain, quote as kyberQuote, KyberSwapError } from "@kawase/integrations-kyberswap";
import type { NetworkContext } from "@kawase/networks";

import type { SwapEngine } from "./engine";

export type VenueQuote = {
  venue: SwapVenueId;
  /** What the route expects to deliver, base units of tokenOut. */
  estimatedOut: bigint;
  /** What the built calls will guarantee at the shown slippage. */
  minOut: bigint;
  /** Exchanges the route goes through ("uniswapv4", "aero-cl"…), for "via …". */
  via: string[];
  /** Route fees in US dollars, when the venue says. */
  feeUsd: number | null;
};

export type VenueFailure = { venue: SwapVenueId; reason: "not_on_network" | "no_route" | "timeout" | "failed" };

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

export type SwapVenues = {
  quoteAll(input: VenueInput): Promise<{ quotes: VenueQuote[]; failures: VenueFailure[] }>;
  /** The chosen venue's calls for exactly this swap, checked; throws `VenueRefused` when they do not hold. */
  prepare(venue: SwapVenueId, input: VenueInput & { minOut: bigint }): Promise<PreparedSwap>;
};

export class VenueRefused extends Error {
  constructor(
    readonly venue: SwapVenueId,
    readonly reason: string,
  ) {
    super(`${venue}: ${reason}`);
  }
}

const LIFI = "https://li.quest/v1";
const BPS = 10_000;
const ZERO = 0n;
/** Kawase's integrator name on LI.FI and KyberSwap. */
const INTEGRATOR = "kawase";

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

const failureOf = (venue: SwapVenueId, error: unknown): VenueFailure => {
  if (error instanceof Error && error.message === "timeout") return { venue, reason: "timeout" };
  if (error instanceof KyberSwapError) return { venue, reason: error.code === "unsupported_chain" ? "not_on_network" : error.code === "no_route" ? "no_route" : error.code === "timeout" ? "timeout" : "failed" };
  if (error instanceof VenueRefused) return { venue, reason: error.reason === "not_on_network" ? "not_on_network" : "no_route" };
  return { venue, reason: /no route|not available|NO_POSSIBLE_ROUTE|1002/i.test(String(error)) ? "no_route" : "failed" };
};

type LifiQuote = {
  estimate: { toAmount: string; toAmountMin: string; approvalAddress: string; feeCosts?: { amountUSD?: string }[] };
  transactionRequest: { to: string; data: string; value: string };
  includedSteps?: { toolDetails?: { name?: string } }[];
  toolDetails?: { name?: string };
};

async function lifiQuote(input: VenueInput, slippageBps: number): Promise<LifiQuote> {
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
  const response = await fetch(`${LIFI}/quote?${query}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(SWAP_VENUE_TIMEOUT_MS) });
  const body = (await response.json().catch(() => ({}))) as LifiQuote & { message?: string };
  if (!response.ok || !body.estimate || !body.transactionRequest) throw new VenueRefused("lifi", body.message ?? "no_route");
  return body;
}

export function createSwapVenues(appKit: SwapEngine): SwapVenues {
  const quoteOne = async (venue: SwapVenueId, input: VenueInput): Promise<VenueQuote> => {
    switch (venue) {
      case "kyberswap": {
        if (!isKyberSwapChain(input.network.chainId)) throw new VenueRefused(venue, "not_on_network");
        const route = await kyberQuote({ chainId: input.network.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, sender: input.from, recipient: input.from, slippageBps: input.slippageBps, clientId: INTEGRATOR });
        return { venue, estimatedOut: route.amountOut, minOut: route.minOut, via: route.venues, feeUsd: null };
      }
      case "app_kit": {
        const quoted = await appKit.quote({ network: input.network, client: input.client, from: input.from, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: toDecimal(input.amountIn, input.decimalsIn), slippageBps: input.slippageBps, decimalsOut: input.decimalsOut });
        return { venue, estimatedOut: quoted.estimatedOut, minOut: quoted.minOut, via: [], feeUsd: null };
      }
      case "lifi": {
        const quoted = await lifiQuote(input, input.slippageBps);
        const fee = (quoted.estimate.feeCosts ?? []).reduce((sum, cost) => sum + Number(cost.amountUSD ?? 0), 0);
        const tools = (quoted.includedSteps ?? []).map((step) => step.toolDetails?.name).filter((name): name is string => Boolean(name));
        return { venue, estimatedOut: BigInt(quoted.estimate.toAmount), minOut: BigInt(quoted.estimate.toAmountMin), via: tools.length ? tools : [quoted.toolDetails?.name ?? ""].filter(Boolean), feeUsd: fee || null };
      }
    }
  };

  return {
    async quoteAll(input) {
      const venues = Object.keys(SWAP_VENUE_LABELS) as SwapVenueId[];
      const settled = await Promise.allSettled(venues.map((venue) => within(quoteOne(venue, input), SWAP_VENUE_TIMEOUT_MS)));
      const quotes: VenueQuote[] = [];
      const failures: VenueFailure[] = [];
      settled.forEach((outcome, index) => {
        const venue = venues[index]!;
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
          const quoted = await lifiQuote(input, input.slippageBps);
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
      }
    },
  };
}

export const venueLabel = (venue: SwapVenueId) => SWAP_VENUE_LABELS[venue];
