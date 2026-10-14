// One row shape for every "which venue?" choice: swap venues, bridges, yield, buy providers and perps.
// Owned by the Routes lane (plan compressed-dreaming-yao, decision 6). Fields are only ever added, never renamed,
// because the agent's race card, the swap/move/earn/buy screens and the feed all draw from it.

/** What is being routed. */
export type RouteKind = "swap" | "bridge" | "yield" | "buy" | "perp";

/** checking: asked, no answer yet (the row shimmers) · quoted: an answer arrived · failed / unavailable: say why in `reason`. */
export type RouteQuoteStatus = "checking" | "quoted" | "failed" | "unavailable";

/** An amount in its own token's base units, with what it takes to show it. */
export type RouteAmount = { amount: string; symbol: string; decimals: number };

/**
 * One fact for the row's disclosure, worded by the app in the person's language (the `routes` namespace), so the
 * server never sends prose. `via` and `arrives_as` carry proper names; amounts are base units of `receive`.
 */
export type RouteFact =
  | { kind: "via"; value: string }
  | { kind: "venue_fee_bps"; value: number }
  | { kind: "min_receive"; value: string }
  | { kind: "trust"; value: "burn_mint" | "solver" | "aggregator" | "pool" }
  | { kind: "gas_usd"; value: number }
  | { kind: "arrives_as"; value: string }
  | { kind: "flat_fee"; value: string }
  | { kind: "tvl_usd"; value: number }
  | { kind: "risk"; value: "blue_chip" | "curated" | "rwa_credit" | "advanced" };

export type RouteQuote = {
  /** Stable venue id: kyberswap, lifi, app_kit, uniswap, zerox, socket, cctp, across, relay, debridge, gaszip, morpho, aave, merkl, circle_onramp, coinbase_onramp, kawase_margin. */
  venue: string;
  /** Key of the venue's real logo in packages/identity (e.g. "venue:kyberswap", "provider:circle"). */
  mark: string;
  /** The venue's name as people know it. */
  label: string;
  status: RouteQuoteStatus;
  /** What the person ends up with on this route, when quoted. */
  receive: RouteAmount | null;
  /** receive minus every cost the person pays on top, in receive's base units: the ranking key. */
  net: string | null;
  /** Everything taken along the way, in dollars, when known. */
  feeUsd: number | null;
  etaSeconds: number | null;
  /** Yield routes: the rate in basis points per year. */
  apyBps?: number | null | undefined;
  /** Facts for the one disclosure under the row ("via Uniswap v4", "Circle burns and mints"), at most four. */
  detail: string[];
  /** Kawase can execute this route now. A route that can't is never shown as a choice. */
  executable: boolean;
  /** Why it isn't quoted or executable: timeout, no_route, not_on_network, amount_too_low, needs_key… */
  reason: string | null;
  /** The disclosure's facts, structured so the app words them (preferred over `detail`). */
  facts?: RouteFact[] | undefined;
  /** The least the route guarantees, in receive's base units, when it says. */
  minReceive?: string | null | undefined;
  /** The venue's own cut in basis points (Socket 20, 0x's volume fee, Circle 2), already netted in `receive`. */
  feeBps?: number | null | undefined;
  /** The venue's id for this quote (Uniswap requestId, 0x zid, Socket quoteId), for support and status. */
  quoteId?: string | null | undefined;
  /** How long the venue took to answer, for the race card's "answered in". */
  answeredMs?: number | null | undefined;
};

/** A race in progress or finished: rows arrive as venues answer; `best` moves to the leader. */
export type RouteRace = {
  kind: RouteKind;
  rows: RouteQuote[];
  /** The venue Kawase would pick now (highest net among executable quoted rows). */
  best: string | null;
  /** All venues have answered or timed out. */
  done: boolean;
  /** ISO time of the last quote; quotes older than ~30 s are re-asked before anything moves. */
  quotedAt: string;
  /** ISO time the race started (rows that have not answered show elapsed time from here). */
  startedAt?: string | undefined;
  /** What was asked, for the card's title: the amount in and its symbol, and what comes out. */
  ask?: { amount: string; symbol: string; decimals: number; to: string; chain?: string | null } | undefined;
};

/** What the route race is asked: a swap on Arc, a move out of Arc, or where an asset can earn. */
export type RouteRaceRequest =
  | { kind: "swap"; tokenIn: string; tokenOut: string; amount: string }
  | {
      kind: "bridge";
      destination: string;
      amount: string;
      asset?: string | null | undefined;
      toAsset?: string | null | undefined;
      recipient?: string | null | undefined;
    }
  | { kind: "yield"; asset: string; amount?: string | null | undefined };

/** The race endpoint answers one JSON snapshot per line (NDJSON) as venues answer, the last with `done: true`. */
export async function* readRouteRace(body: ReadableStream<Uint8Array>): AsyncGenerator<RouteRace> {
  yield* readNdjson<RouteRace>(body);
}

/** One JSON value per line (NDJSON), as the stream delivers them: the route race, live trades. */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as T;
}
