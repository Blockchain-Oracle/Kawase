// The portfolio share card's data (Abu, 10-16: FOMO's share card, but the story of a person's money on Kawase over a
// period): built only from what Kawase already serves the signed-in wallet on the current network — the balance
// chart's snapshots (GET /portfolio `history`, the true total at each moment it was read) and the timeline's confirmed
// moves (GET /feed, the rows Activity shows). Nothing is invented: where two snapshots hold moves between them, the
// line steps at each move by its own value and the rest of the difference (prices moving) is spread evenly, so the line
// still passes through every real snapshot. A move whose value Kawase cannot price shows as a marker and a count only.
import type { AgentFeedItem, Candle, MarginPositionView, PortfolioView, TokenTradesView } from "@kawase/api-client";

import { ARC_CHAIN_IDS } from "@/safety/use-safety";

export type SharePeriod = "7d" | "30d" | "all";
export const SHARE_PERIODS: readonly SharePeriod[] = ["7d", "30d", "all"];

export type MarkerKind = "in" | "out" | "swap" | "bridge" | "earn" | "trade";
export type ShareToken = { chainId: number; address: string; symbol: string; logoUrl: string | null };

/** One moment on the line: a move (or several close together, `count`), at the value the line has just after it. */
export type ShareMarker = {
  t: number;
  v: number;
  kind: MarkerKind;
  /** What came in (a receive, a swap's output) or went out; a swap's other leg in `other`. */
  token: ShareToken | null;
  other: ShareToken | null;
  count: number;
};

export type FactKey = "received" | "sent" | "swapped" | "bridged" | "saved" | "traded" | "invested" | "avgEntry" | "avgExit" | "priceNow" | "entry" | "exit" | "putIn";
/** A fact under the figure: a dollar total (or a price), or a count when none of its moves could be priced. */
export type ShareFact = { key: FactKey; usd: number | null; count: number; price?: boolean };

/** What a token or position card is about (its name on the card, the side and leverage of a trade). */
export type CardSubject = { token: ShareToken | null; symbol: string; market?: string; side?: "long" | "short"; leverage?: number };

/**
 * One card: the person's money over a period (`period`), their trades in one token (`token`, the line is its price),
 * or one long/short (`position`, the line is the market's price). The same frame draws all three.
 */
export type CardData = {
  kind: "period" | "token" | "position";
  /** The line's unit: dollars of balance, or a price. */
  unit: "usd" | "price";
  /** The dashed level: where the balance started, the average entry, or the entry price. */
  level: number;
  subject: CardSubject | null;
  period: SharePeriod;
  network: "mainnet" | "testnet";
  /** The span the line covers (ms): the period, or less when Kawase's snapshots start later. */
  from: number;
  to: number;
  /** US dollars over time, oldest first, at least two points. */
  series: { t: number; v: number }[];
  start: number;
  end: number;
  change: number;
  /** Null when the start was too small for a percentage to mean anything. */
  changePct: number | null;
  markers: ShareMarker[];
  facts: readonly [ShareFact, ShareFact, ShareFact];
  /** Confirmed moves in the span. */
  moves: number;
};

export type PeriodCardData = CardData;

/** Why there is no card: nothing moved yet, or Kawase has a single reading of the balance. */
export type PeriodCardResult = { status: "ready"; card: CardData } | { status: "empty" };

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<Exclude<SharePeriod, "all">, number> = { "7d": 7, "30d": 30 };
/** Below this start (in dollars) a percentage is noise ("+4,000%" on 10 cents), so the card shows the dollars alone. */
const PCT_MIN_START = 1;
const PERCENT = 100;
const TEN = 10;
/** Facts in the order the card prefers them, and the three it falls back to when fewer moved. */
const FACT_ORDER: readonly FactKey[] = ["received", "sent", "swapped", "bridged", "saved", "traded"];
const FACT_FILL: readonly FactKey[] = ["received", "sent", "swapped"];
const FACT_COUNT = 3;
/** A line needs two points. */
const MIN_POINTS = 2;
const HALF_HOUR_MINUTES = 30;

const KIND_OF: Partial<Record<AgentFeedItem["kind"], MarkerKind>> = {
  receive: "in",
  send: "out",
  withdraw: "out",
  swap: "swap",
  bridge: "bridge",
  crosschain: "bridge",
  earn: "earn",
  lend: "earn",
  margin: "trade",
};
const FACT_OF: Record<MarkerKind, FactKey> = {
  in: "received",
  out: "sent",
  swap: "swapped",
  bridge: "bridged",
  earn: "saved",
  trade: "traded",
};

type Move = { t: number; kind: MarkerKind; token: ShareToken | null; other: ShareToken | null; usd: number | null; delta: number | null };


function priceOf(portfolio: PortfolioView, token: { address: string; symbol: string }): number | null {
  const address = token.address.toLowerCase();
  const holding = [...portfolio.assets, ...portfolio.hidden].find((entry) => entry.token.address.toLowerCase() === address);
  if (holding?.priceUsd !== null && holding?.priceUsd !== undefined) return holding.priceUsd;
  const symbol = token.symbol.toUpperCase();
  // Circle's dollar is a dollar; its euro, when not held, at the euro's price from any EURC the person holds.
  if (symbol === "USDC") return 1;
  const eurc = portfolio.assets.find((entry) => entry.token.symbol.toUpperCase() === "EURC");
  if (symbol === "EURC" && eurc?.priceUsd) return eurc.priceUsd;
  return null;
}

const usdOf = (portfolio: PortfolioView, token: AgentFeedItem["token"], amount: string | null): number | null => {
  if (!token || !amount) return null;
  const price = priceOf(portfolio, token);
  if (price === null) return null;
  const units = Number(amount) / TEN ** token.decimals;
  return Number.isFinite(units) ? units * price : null;
};

const shareToken = (network: "mainnet" | "testnet", token: AgentFeedItem["token"]): ShareToken | null =>
  token ? { chainId: ARC_CHAIN_IDS[network], address: token.address, symbol: token.symbol, logoUrl: token.logoUrl ?? null } : null;

/** The timeline's confirmed moves of money, oldest first, each with its value and what it did to the balance. */
function movesOf(portfolio: PortfolioView, items: readonly AgentFeedItem[]): Move[] {
  const network = portfolio.network;
  return items
    .filter((item) => item.group === "done" && item.outcome === "confirmed" && item.network === network)
    .flatMap((item): Move[] => {
      const kind = KIND_OF[item.kind];
      if (!kind) return [];
      const t = Date.parse(item.at);
      if (!Number.isFinite(t)) return [];
      // A swap is valued by what went out for it; everything else by its main leg.
      const usd = kind === "swap" && item.other ? usdOf(portfolio, item.other.token, item.other.amount) : usdOf(portfolio, item.token, item.amount);
      // What it does to the balance Kawase counts: money in adds, money out (a send, a bridge away) takes; a swap,
      // a deposit to earn or a trade keeps it in the portfolio (its price drift is in the snapshots).
      const delta = usd === null ? null : kind === "in" ? usd : kind === "out" || kind === "bridge" ? -usd : 0;
      return [{ t, kind, token: shareToken(network, item.token), other: item.other ? shareToken(network, item.other.token) : null, usd, delta }];
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * The line between real snapshots: at each move it steps by the move's own value; the remainder of the difference
 * between the two snapshots (prices, anything unpriced) is spread over the gap. Returns the points and each move's
 * value just after it (where its marker sits).
 */
function stepLine(snapshots: { t: number; v: number }[], moves: Move[]): { points: { t: number; v: number }[]; after: number[] } {
  const points: { t: number; v: number }[] = [];
  const after: number[] = moves.map(() => Number.NaN);
  let index = 0;
  for (let i = 0; i < snapshots.length; i += 1) {
    const a = snapshots[i]!;
    points.push(a);
    const b = snapshots[i + 1];
    if (!b) break;
    const inGap: number[] = [];
    while (index < moves.length && moves[index]!.t < b.t) {
      if (moves[index]!.t >= a.t) inGap.push(index);
      index += 1;
    }
    if (inGap.length === 0) continue;
    const known = inGap.reduce((sum, m) => sum + (moves[m]!.delta ?? 0), 0);
    const drift = b.v - a.v - known;
    const span = b.t - a.t || 1;
    let stepped = 0;
    for (const m of inGap) {
      const move = moves[m]!;
      const before = a.v + stepped + (drift * (move.t - a.t)) / span;
      stepped += move.delta ?? 0;
      const next = a.v + stepped + (drift * (move.t - a.t)) / span;
      points.push({ t: move.t, v: before }, { t: move.t, v: next });
      after[m] = next;
    }
  }
  return { points, after };
}

/**
 * Moves too close to read apart share one marker, measured from the group's first move (not chained from move to move,
 * which would fold a whole busy hour into one coin): the marker sits at that first move, wearing the most valuable
 * move's face, with a count.
 */
function groupMarkers(moves: Move[], after: number[], minGapMs: number): ShareMarker[] {
  const markers: (ShareMarker & { best: number })[] = [];
  moves.forEach((move, i) => {
    const v = after[i]!;
    if (!Number.isFinite(v)) return;
    const last = markers.at(-1);
    const worth = move.usd ?? 0;
    if (last && move.t - last.t < minGapMs) {
      last.count += 1;
      if (worth > last.best) Object.assign(last, { kind: move.kind, token: move.token, other: move.other, best: worth });
      return;
    }
    markers.push({ t: move.t, v, kind: move.kind, token: move.token, other: move.other, count: 1, best: worth });
  });
  return markers.map((marker) => ({ t: marker.t, v: marker.v, kind: marker.kind, token: marker.token, other: marker.other, count: marker.count }));
}

function factsOf(moves: Move[]): readonly [ShareFact, ShareFact, ShareFact] {
  const totals = new Map<FactKey, ShareFact>();
  for (const move of moves) {
    const key = FACT_OF[move.kind];
    const fact = totals.get(key) ?? { key, usd: null, count: 0 };
    fact.count += 1;
    if (move.usd !== null) fact.usd = (fact.usd ?? 0) + move.usd;
    totals.set(key, fact);
  }
  const chosen = FACT_ORDER.filter((key) => totals.has(key)).slice(0, FACT_COUNT);
  for (const key of FACT_FILL) if (chosen.length < FACT_COUNT && !chosen.includes(key)) chosen.push(key);
  const [a, b, c] = chosen.map((key) => totals.get(key) ?? { key, usd: 0, count: 0 });
  return [a!, b!, c!];
}

/** The card for a period, or why there is none yet. `minGapMs`: how close two moves can be and still get two markers. */
export function buildPeriodCard(input: {
  period: SharePeriod;
  portfolio: PortfolioView;
  items: readonly AgentFeedItem[];
  now: number;
  /** As a share of the span: two moves closer than this share one marker. */
  markerGap: number;
}): PeriodCardResult {
  const { period, portfolio, now } = input;
  const history = portfolio.history
    .map((point) => ({ t: Date.parse(point.t), v: point.usd }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  const allMoves = movesOf(portfolio, input.items);
  const wanted = period === "all" ? (history[0]?.t ?? now) : now - PERIOD_DAYS[period] * DAY_MS;
  // The line starts where the period does when a snapshot reaches back that far (the last reading before it holds
  // until the first one inside), else at Kawase's first snapshot.
  const before = history.filter((point) => point.t <= wanted).at(-1);
  const inside = history.filter((point) => point.t > wanted && point.t <= now);
  const snapshots = before ? [{ t: wanted, v: before.v }, ...inside] : inside;
  const last = snapshots.at(-1);
  if (!last || last.t < now) snapshots.push({ t: now, v: portfolio.totalUsd });
  const from = snapshots[0]!.t;
  const moves = allMoves.filter((move) => move.t >= from && move.t <= now);
  if (snapshots.length < MIN_POINTS || (moves.length === 0 && snapshots.every((point) => point.v === snapshots[0]!.v))) return { status: "empty" };
  const { points, after } = stepLine(snapshots, moves);
  const start = points[0]!.v;
  const end = points.at(-1)!.v;
  const change = end - start;
  return {
    status: "ready",
    card: {
      kind: "period",
      unit: "usd",
      level: start,
      subject: null,
      period,
      network: portfolio.network,
      from,
      to: now,
      series: points,
      start,
      end,
      change,
      changePct: start >= PCT_MIN_START ? (change / start) * PERCENT : null,
      markers: groupMarkers(moves, after, (now - from) * input.markerGap),
      facts: factsOf(moves),
      moves: moves.length,
    },
  };
}

// ── A token's card: the person's trades in it over its price (FOMO's card) ────────────────────────────────────────
const SECONDS_BEFORE = 1e12;
const MS_PER_SECOND = 1000;
const MINUTE_MS = 60_000;
/** Before a position's open, this share of its life (at least half an hour) of price, so the entry is a moment on the line. */
const LEAD_SHARE = 0.12;
const LEAD_MIN_MS = HALF_HOUR_MINUTES * MINUTE_MS;
const PRICE_DECIMALS = 1e8;
const USDC_UNITS = 1e6;

const candleSeries = (candles: readonly Candle[], from: number, to: number) =>
  candles
    .map((candle) => ({ t: candle.t < SECONDS_BEFORE ? candle.t * MS_PER_SECOND : candle.t, v: candle.c }))
    .filter((point) => Number.isFinite(point.v) && point.t >= from && point.t <= to)
    .sort((a, b) => a.t - b.t);

/** The price line at a moment (the candle at or before it). */
const priceAt = (series: { t: number; v: number }[], t: number) => series.filter((point) => point.t <= t).at(-1)?.v ?? series[0]?.v ?? 0;

export function buildTokenCard(input: {
  period: SharePeriod;
  network: "mainnet" | "testnet";
  token: ShareToken & { decimals: number };
  trades: TokenTradesView;
  candles: readonly Candle[];
  items: readonly AgentFeedItem[];
  now: number;
  markerGap: number;
}): PeriodCardResult {
  const { token, trades, now } = input;
  const address = token.address.toLowerCase();
  const from = input.period === "all" ? 0 : now - PERIOD_DAYS[input.period] * DAY_MS;
  const series = candleSeries(input.candles, from, now);
  if (series.length < MIN_POINTS || trades.trades === 0) return { status: "empty" };
  const start = series[0]!.t;
  // Each swap into or out of the token: a buy (it came in) or a sell (it went out), at the price of that moment.
  const moves = input.items
    .filter((item) => item.group === "done" && item.outcome === "confirmed" && item.kind === "swap")
    .flatMap((item) => {
      const t = Date.parse(item.at);
      const bought = item.token?.address.toLowerCase() === address;
      const sold = item.other?.token.address.toLowerCase() === address;
      if (!Number.isFinite(t) || t < start || (!bought && !sold)) return [];
      return [{ t, kind: (bought ? "in" : "out") as MarkerKind, usd: null, delta: 0, token: null, other: null }];
    })
    .sort((a, b) => a.t - b.t);
  const markers = groupMarkers(
    moves,
    moves.map((move) => priceAt(series, move.t)),
    (now - start) * input.markerGap,
  );
  const held = Number(trades.held) / TEN ** token.decimals;
  const soldUnits = Number(trades.sold) / TEN ** token.decimals;
  const change = trades.realizedUsd + (trades.unrealizedUsd ?? 0);
  const avgExit = soldUnits > 0 && trades.avgCostUsd !== null ? (trades.realizedUsd + trades.avgCostUsd * soldUnits) / soldUnits : null;
  const last = series.at(-1)!.v;
  return {
    status: "ready",
    card: {
      kind: "token",
      unit: "price",
      level: trades.avgCostUsd ?? series[0]!.v,
      subject: { token, symbol: token.symbol },
      period: input.period,
      network: input.network,
      from: start,
      to: now,
      series,
      start: series[0]!.v,
      end: last,
      change,
      changePct: trades.costBasisUsd > 0 ? (change / trades.costBasisUsd) * PERCENT : null,
      markers,
      facts: [
        { key: "invested", usd: trades.costBasisUsd, count: trades.trades },
        { key: "avgEntry", usd: trades.avgCostUsd, count: 0, price: true },
        held > 0 ? { key: "priceNow", usd: last, count: 0, price: true } : { key: "avgExit", usd: avgExit, count: 0, price: true },
      ],
      moves: moves.length,
    },
  };
}

// ── A long or a short: the market's price from the open to the close (or now) ──────────────────────────────────────
export function buildPositionCard(input: { position: MarginPositionView; token: ShareToken | null; candles: readonly Candle[]; now: number }): PeriodCardResult {
  const { position } = input;
  const opened = Date.parse(position.openedAt);
  const closed = position.closedAt ? Date.parse(position.closedAt) : input.now;
  // A little of the price before the open, so the entry is a moment on the line rather than its first point.
  const lead = Math.max((closed - opened) * LEAD_SHARE, LEAD_MIN_MS);
  const series = candleSeries(input.candles, opened - lead, closed);
  if (series.length < MIN_POINTS || !Number.isFinite(opened)) return { status: "empty" };
  const entry = Number(position.entryPrice) / PRICE_DECIMALS;
  const exit = Number(position.markPrice) / PRICE_DECIMALS;
  const ended = position.status !== "open";
  const markers: ShareMarker[] = [
    { t: opened, v: entry, kind: "trade", token: null, other: null, count: 1 },
    ...(ended ? [{ t: closed, v: exit, kind: "out" as MarkerKind, token: null, other: null, count: 1 }] : []),
  ];
  return {
    status: "ready",
    card: {
      kind: "position",
      unit: "price",
      level: entry,
      subject: { token: input.token, symbol: position.asset, market: position.market, side: position.side === "short" ? "short" : "long", leverage: position.leverage },
      period: "all",
      network: position.network,
      from: series[0]!.t,
      to: closed,
      series,
      start: series[0]!.v,
      end: series.at(-1)!.v,
      change: position.pnlUsd,
      changePct: position.pnlPercent,
      markers,
      facts: [
        { key: "putIn", usd: Number(position.margin) / USDC_UNITS, count: 0 },
        { key: "entry", usd: entry, count: 0, price: true },
        { key: ended ? "exit" : "priceNow", usd: exit, count: 0, price: true },
      ],
      moves: markers.length,
    },
  };
}
