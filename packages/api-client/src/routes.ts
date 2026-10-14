// One row shape for every "which venue?" choice: swap venues, bridges, yield, buy providers and perps.
// Owned by the Routes lane (plan compressed-dreaming-yao, decision 6). Fields are only ever added, never renamed,
// because the agent's race card, the swap/move/earn/buy screens and the feed all draw from it.

/** What is being routed. */
export type RouteKind = "swap" | "bridge" | "yield" | "buy" | "perp";

/** checking: asked, no answer yet (the row shimmers) · quoted: an answer arrived · failed / unavailable: say why in `reason`. */
export type RouteQuoteStatus = "checking" | "quoted" | "failed" | "unavailable";

/** An amount in its own token's base units, with what it takes to show it. */
export type RouteAmount = { amount: string; symbol: string; decimals: number };

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
};
