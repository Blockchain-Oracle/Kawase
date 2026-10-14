// A draft's stored routes as the one RouteList race (plan decision 6), so the swap and move reviews, the yield list and
// the chat cards show the venues the api actually asked for this version, with no second round of quotes. The same
// shapes as the api's routing/mappers.ts (which serves POST /routes/race): marks are packages/identity keys, facts are
// structured so the app words them. Pure functions, no React.
import type {
  CrossChainDraftView,
  CrossChainRouteView,
  RouteFact,
  RouteQuote,
  RouteRace,
  SwapIntent,
  SwapRouteView,
  YieldOptionsView,
  YieldOptionView,
} from "@kawase/api-client";
import { getVenueIdentity, providerKey, venueKey } from "@kawase/identity";

const MAX_FACTS = 4;
const BPS = 10_000;
const TEN = 10n;
const NONE = 0n;
const USDC = { symbol: "USDC", decimals: 6 } as const;
/** A swap on Arc settles in its block (under a second). */
const SWAP_SECONDS = 1;

const facts = (...list: (RouteFact | null | undefined | false)[]): RouteFact[] =>
  list.filter((fact): fact is RouteFact => Boolean(fact)).slice(0, MAX_FACTS);

/** A venue's name as people know it (the identity registry first). */
export const venueName = (venue: string, fallback?: string) => getVenueIdentity(venue)?.name ?? fallback ?? venue;

function swapRow(route: SwapRouteView, out: { symbol: string; decimals: number }): RouteQuote {
  const quoted = route.status !== "unavailable" && route.estimatedOut !== null;
  return {
    venue: route.venue,
    mark: venueKey(route.venue),
    label: venueName(route.venue, route.label),
    status: quoted ? "quoted" : route.reason === "not_on_network" || route.reason === "needs_key" ? "unavailable" : "failed",
    receive: quoted ? { amount: route.estimatedOut!, symbol: out.symbol, decimals: out.decimals } : null,
    net: quoted ? route.estimatedOut : null,
    feeUsd: route.feeUsd,
    etaSeconds: quoted ? SWAP_SECONDS : null,
    detail: route.via.slice(0, MAX_FACTS),
    executable: quoted,
    reason: quoted ? null : route.reason,
    facts: facts(
      route.via.length > 0 && { kind: "via", value: route.via.join(" · ") },
      route.feeBps !== null && route.feeBps !== undefined && { kind: "venue_fee_bps", value: route.feeBps },
      route.minOut !== null && { kind: "min_receive", value: route.minOut },
    ),
    minReceive: route.minOut,
    feeBps: route.feeBps ?? null,
    quoteId: route.quoteId ?? null,
  };
}

/** The richest delivery wins: the ranking key the api uses for swaps (venue fees are already netted). */
const byNet = (a: RouteQuote, b: RouteQuote) => {
  if (a.net === null) return b.net === null ? 0 : 1;
  if (b.net === null) return -1;
  const gap = BigInt(b.net) - BigInt(a.net);
  return gap > NONE ? 1 : gap < NONE ? -1 : 0;
};

/**
 * A swap version's venues. `best` is the most delivered (so "Δ to best" stays honest when the person picked another);
 * the picked one is the draft's `venue`, passed to the list as `selected`.
 */
export function swapRace(intent: SwapIntent): RouteRace | null {
  const draft = intent.draft;
  if (!draft) return null;
  const out = draft.tokens?.out ?? { symbol: draft.tokenOut, decimals: USDC.decimals };
  const rows = (draft.routes ?? []).map((route) => swapRow(route, out)).sort(byNet);
  const best = rows.find((row) => row.status === "quoted" && row.executable)?.venue ?? null;
  const decimalsIn = draft.tokens?.in.decimals ?? USDC.decimals;
  return {
    kind: "swap",
    rows,
    best,
    done: true,
    quotedAt: draft.quotedAt,
    startedAt: draft.quotedAt,
    ask: { amount: draft.amountIn, symbol: draft.tokenIn, decimals: decimalsIn, to: draft.tokenOut },
  };
}

function moveRow(route: CrossChainRouteView): RouteQuote {
  const output = route.output ?? { ...USDC, chainId: 0, address: "" };
  const quoted = route.received !== null;
  return {
    venue: route.provider,
    mark: venueKey(route.provider),
    label: venueName(route.provider),
    status: quoted ? "quoted" : route.reason === "not_on_arc_testnet" ? "unavailable" : "failed",
    receive: quoted ? { amount: route.received!, symbol: output.symbol, decimals: output.decimals } : null,
    net: route.net,
    // The fee is in the asset that leaves; its dollar value is not known here, so the disclosure says it as a flat fee.
    feeUsd: null,
    etaSeconds: route.etaSeconds,
    detail: [route.via, ...(route.steps ?? [])].filter((entry): entry is string => Boolean(entry)).slice(0, MAX_FACTS),
    executable: route.executable,
    reason: route.executable ? null : route.reason,
    facts: facts(
      Boolean(route.via) && { kind: "via", value: route.via! },
      { kind: "trust", value: route.trust },
      Boolean(route.nativeFee) && { kind: "flat_fee", value: route.nativeFee! },
      route.convertFirst && { kind: "via", value: venueName(route.convertFirst.venue) },
    ),
  };
}

/** A move version's bridges, ranked by what arrives net of anything paid on top. */
export function moveRace(draft: CrossChainDraftView): RouteRace {
  const rows = draft.routes.map(moveRow).sort(byNet);
  const best = rows.find((row) => row.status === "quoted" && row.executable)?.venue ?? null;
  const input = draft.input ?? { ...USDC, chainId: draft.source.chainId, address: "" };
  return {
    kind: "bridge",
    rows,
    best,
    done: true,
    quotedAt: draft.quotedAt,
    startedAt: draft.quotedAt,
    ask: { amount: draft.amount, symbol: input.symbol, decimals: input.decimals, to: draft.output?.symbol ?? input.symbol, chain: draft.destination.name },
  };
}

/** Where a yield option is shown and picked: its protocol's id and mark (Aave, Morpho, Merkl or Aero for LP). */
export function yieldVenue(option: YieldOptionView): { venue: string; mark: string } {
  const protocol = option.protocol.trim().toLowerCase();
  if (option.kind === "aave_v4") return { venue: `aave:${option.id}`, mark: providerKey("aave") };
  if (option.kind === "morpho_vault") return { venue: `morpho:${option.id}`, mark: providerKey("morpho") };
  return { venue: `lp:${option.id}`, mark: providerKey(protocol === "aero" ? "aero" : "merkl") };
}

/** Base units of a decimal amount ("12.5"), or null when it is not one. */
function units(amount: string | null, decimals: number): bigint | null {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) return null;
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole) * TEN ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/**
 * Every place an asset can earn as RouteList rows: the rate is the figure, a year's earnings on the amount (when one was
 * asked) the second line, the risk a chip, the size and curator behind the chevron. Advanced (LP) sources are listed
 * below with why, never as a choice. `decimals` is the asset's.
 */
export function yieldRace(view: YieldOptionsView, decimals: number = USDC.decimals): RouteRace {
  const principal = units(view.amount, decimals);
  const rows: RouteQuote[] = view.options.map((option) => {
    const { venue, mark } = yieldVenue(option);
    const apyBps = Math.round(option.rate * BPS);
    const yearly = principal === null ? null : (principal * BigInt(Math.max(apyBps, 0))) / BigInt(BPS);
    const executable = option.executable && option.note !== "advanced";
    return {
      venue,
      mark,
      label: option.name,
      status: "quoted",
      receive: yearly === null ? null : { amount: yearly.toString(), symbol: view.asset, decimals },
      net: yearly?.toString() ?? String(apyBps),
      feeUsd: null,
      etaSeconds: null,
      apyBps,
      detail: [option.curator, option.protocol].filter((entry): entry is string => Boolean(entry)),
      executable,
      reason: executable ? null : option.note,
      facts: facts(
        { kind: "risk", value: option.risk },
        option.tvlUsd !== null && { kind: "tvl_usd", value: option.tvlUsd },
        Boolean(option.curator) && { kind: "via", value: option.curator! },
      ),
    };
  });
  const best = view.best ? rows.find((row) => row.venue.endsWith(`:${view.best}`) && row.executable)?.venue ?? null : null;
  return {
    kind: "yield",
    rows,
    best: best ?? rows.find((row) => row.executable)?.venue ?? null,
    done: true,
    quotedAt: new Date().toISOString(),
    ...(principal !== null ? { ask: { amount: principal.toString(), symbol: view.asset, decimals, to: view.asset } } : {}),
  };
}
