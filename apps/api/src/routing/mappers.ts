// From each service's own quote shape to the one RouteQuote row (plan decision 6): live swap venue answers, the swap
// and move drafts' stored routes, and the yield list. Marks are packages/identity keys; facts are structured so the
// app words them in the person's language.
import type { CrossChainRouteView, RouteFact, RouteQuote, SwapRouteView, YieldOptionView } from "@kawase/api-client";
import { getVenueIdentity, providerKey, venueKey } from "@kawase/identity";

import { SWAP_VENUE_NAMES, isSwapVenue, type VenueFailure, type VenueQuote } from "../swap/venues";

const BPS = 10_000;
const DECIMAL_BASE = 10;
const MAX_FACTS = 4;
/** A year's earnings are shown on this many units of the asset when no amount was given. */
const YIELD_UNITS_WITHOUT_AMOUNT = 1;

export type TokenMeta = { symbol: string; decimals: number };

/** A venue's name as people know it (identity first, then the swap list). */
export const venueName = (venue: string) => getVenueIdentity(venue)?.name ?? (isSwapVenue(venue) ? SWAP_VENUE_NAMES[venue] : venue);

const facts = (...list: (RouteFact | null | undefined | false)[]): RouteFact[] => list.filter((fact): fact is RouteFact => Boolean(fact)).slice(0, MAX_FACTS);

/** A swap venue's live answer. Venue fees are already netted in `estimatedOut`, so receive and net are the same. */
export function routeFromVenueQuote(quote: VenueQuote, out: TokenMeta): RouteQuote {
  return {
    venue: quote.venue,
    mark: venueKey(quote.venue),
    label: venueName(quote.venue),
    status: "quoted",
    receive: { amount: quote.estimatedOut.toString(), symbol: out.symbol, decimals: out.decimals },
    net: quote.estimatedOut.toString(),
    feeUsd: quote.feeUsd,
    // A swap on Arc settles in its block (under a second).
    etaSeconds: 1,
    detail: quote.via.slice(0, MAX_FACTS),
    executable: true,
    reason: null,
    facts: facts(quote.via.length > 0 && { kind: "via", value: quote.via.join(" · ") }, quote.fee?.bps !== null && quote.fee?.bps !== undefined && { kind: "venue_fee_bps", value: quote.fee.bps }, { kind: "min_receive", value: quote.minOut.toString() }),
    minReceive: quote.minOut.toString(),
    feeBps: quote.fee?.bps ?? null,
    quoteId: quote.quoteId,
  };
}

/** A swap venue that could not quote. */
export function routeFromVenueFailure(failure: VenueFailure): RouteQuote {
  return { venue: failure.venue, mark: venueKey(failure.venue), label: venueName(failure.venue), status: failure.reason === "not_on_network" || failure.reason === "needs_key" ? "unavailable" : "failed", receive: null, net: null, feeUsd: null, etaSeconds: null, detail: [], executable: false, reason: failure.reason };
}

/** A route stored on a swap draft (SwapDraftView.routes), for screens that show a draft's choice. */
export function routeFromSwapView(route: SwapRouteView, out: TokenMeta): RouteQuote {
  const quoted = route.status !== "unavailable" && route.estimatedOut !== null;
  return {
    venue: route.venue,
    mark: venueKey(route.venue),
    label: route.label,
    status: quoted ? "quoted" : "unavailable",
    receive: quoted ? { amount: route.estimatedOut!, symbol: out.symbol, decimals: out.decimals } : null,
    net: quoted ? route.estimatedOut : null,
    feeUsd: route.feeUsd,
    etaSeconds: quoted ? 1 : null,
    detail: route.via.slice(0, MAX_FACTS),
    executable: quoted,
    reason: quoted ? null : route.reason,
    facts: facts(route.via.length > 0 && { kind: "via", value: route.via.join(" · ") }, route.feeBps !== null && route.feeBps !== undefined && { kind: "venue_fee_bps", value: route.feeBps }, route.minOut !== null && { kind: "min_receive", value: route.minOut }),
    minReceive: route.minOut,
    feeBps: route.feeBps ?? null,
    quoteId: route.quoteId ?? null,
  };
}

/** A route stored on a move draft (CrossChainDraftView.routes); `asset` is what leaves, for the fee in dollars. */
export function routeFromCrossChainView(route: CrossChainRouteView, input: { decimals: number; usdPerUnit: number | null }): RouteQuote {
  const output = route.output ?? { symbol: "USDC", decimals: 6, chainId: 0, address: "" };
  const fee = route.fee !== null && input.usdPerUnit !== null ? (Number(route.fee) / DECIMAL_BASE ** input.decimals) * input.usdPerUnit : null;
  const quoted = route.received !== null;
  return {
    venue: route.provider,
    mark: venueKey(route.provider),
    label: venueName(route.provider),
    status: quoted ? "quoted" : route.reason === "not_on_arc_testnet" ? "unavailable" : "failed",
    receive: quoted ? { amount: route.received!, symbol: output.symbol, decimals: output.decimals } : null,
    net: route.net,
    feeUsd: fee,
    etaSeconds: route.etaSeconds,
    detail: [route.via, ...(route.steps ?? [])].filter((entry): entry is string => Boolean(entry)).slice(0, MAX_FACTS),
    executable: route.executable,
    reason: route.reason,
    facts: facts(Boolean(route.via) && { kind: "via", value: route.via! }, { kind: "trust", value: route.trust }, Boolean(route.nativeFee) && { kind: "flat_fee", value: route.nativeFee! }, route.output && { kind: "arrives_as", value: route.output.symbol }),
  };
}

/** A place to earn (YieldOptionView): what a year would bring on `amount` (base units of the asset), ranked by it. */
export function routeFromYield(option: YieldOptionView, asset: TokenMeta, amount: bigint | null): RouteQuote {
  const principal = amount ?? BigInt(DECIMAL_BASE) ** BigInt(asset.decimals) * BigInt(YIELD_UNITS_WITHOUT_AMOUNT);
  const apyBps = Math.round(option.rate * BPS);
  const yearly = (principal * BigInt(Math.max(apyBps, 0))) / BigInt(BPS);
  const protocol = option.protocol.toLowerCase();
  const venue = option.kind === "aave_v4" ? "aave" : option.kind === "morpho_vault" ? "morpho" : "merkl";
  return {
    venue: `${venue}:${option.id}`,
    mark: providerKey(option.kind === "lp" ? (protocol === "aero" ? "aero" : "merkl") : protocol === "aave" ? "aave" : "morpho"),
    label: option.name,
    status: "quoted",
    receive: { amount: yearly.toString(), symbol: asset.symbol, decimals: asset.decimals },
    net: yearly.toString(),
    feeUsd: null,
    // Deposits land in the same block; withdrawals depend on the source's liquidity (in the facts).
    etaSeconds: 1,
    apyBps,
    detail: [option.curator, option.protocol].filter((entry): entry is string => Boolean(entry)),
    executable: option.executable && option.note !== "advanced",
    reason: option.note,
    facts: facts({ kind: "risk", value: option.risk }, option.tvlUsd !== null && { kind: "tvl_usd", value: option.tvlUsd }, Boolean(option.curator) && { kind: "via", value: option.curator! }),
  };
}
