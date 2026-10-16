// The card for the signed-in wallet on the current network. A period card reads the portfolio (its balance snapshots
// and prices) and the timeline Home and Activity already read (one shared feed cache, no extra poll). A token card adds
// the person's trades in it and its price chart; a position card the long/short and its market's chart. A guest has no
// card; a read that fails says so with a retry; nothing in the period says why.
import type { Candle, ChartRange, MarginPositionView, TokenTradesView } from "@kawase/api-client";
import * as React from "react";

import { useAgentFeed } from "@/home/use-agent-feed";
import { useMarginPositions } from "@/margin/use-margin";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { MARKER_GAP_SHARE } from "./layout";
import { buildPeriodCard, buildPositionCard, buildTokenCard, type CardData, type PeriodCardResult, type SharePeriod, type ShareToken } from "./model";

export type ShareCardState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "empty" }
  | { status: "ready"; card: CardData };

export type ShareCardTarget = { period: SharePeriod; token?: { chainId: number; address: string } | undefined; position?: string | undefined };

const RANGE: Record<SharePeriod, ChartRange> = { "7d": "1W", "30d": "1M", all: "ALL" };
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 31;

/** The chart range that covers a span. */
const rangeFor = (ms: number): ChartRange => (ms <= DAY_MS ? "1D" : ms <= WEEK_DAYS * DAY_MS ? "1W" : ms <= MONTH_DAYS * DAY_MS ? "1M" : "1Y");

type Extra =
  | { kind: "token"; token: ShareToken & { decimals: number }; trades: TokenTradesView | null; candles: Candle[] }
  | { kind: "position"; position: MarginPositionView; token: ShareToken | null; candles: Candle[] };

export function useShareCard(target: ShareCardTarget): ShareCardState {
  const { status, user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const { portfolio, error, refresh } = usePortfolio();
  const agent = useAgentFeed();
  const margin = useMarginPositions();
  const [extra, setExtra] = React.useState<Extra | null>(null);
  const [extraFailed, setExtraFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const items = React.useMemo(() => agent.feed?.groups.flatMap((group) => group.items) ?? [], [agent.feed]);
  const agentRefresh = agent.refresh;
  const tokenKey = target.token ? `${target.token.chainId}:${target.token.address}` : null;
  const position = target.position ? margin.positions?.find((entry) => entry.id === target.position) : undefined;

  // A token's trades and chart, or a position's market chart, read here (the period card needs neither).
  React.useEffect(() => {
    setExtra(null);
    setExtraFailed(false);
    if (status !== "account") return undefined;
    let live = true;
    const done = (value: Extra | null) => live && setExtra(value);
    const fail = () => live && setExtraFailed(true);
    if (target.token) {
      const { chainId, address } = target.token;
      void Promise.all([api.tokens.get(chainId, address), api.tokens.mine(chainId, address), api.tokens.chart(chainId, address, RANGE[target.period])])
        .then(([detail, mine, chart]) =>
          done({
            kind: "token",
            token: { chainId, address, symbol: detail.token.token.symbol, logoUrl: detail.token.token.logoUrl ?? null, decimals: detail.token.token.decimals },
            trades: mine.trades,
            candles: chart.candles,
          }),
        )
        .catch(fail);
    } else if (position) {
      const span = (position.closedAt ? Date.parse(position.closedAt) : Date.now()) - Date.parse(position.openedAt);
      void api.tokens
        .search(position.asset, network)
        .then(async ({ results }) => {
          const found = results[0]?.token;
          if (!found) return done({ kind: "position", position, token: null, candles: [] });
          const chart = await api.tokens.chart(found.chainId, found.address, rangeFor(span));
          return done({ kind: "position", position, token: { chainId: found.chainId, address: found.address, symbol: found.symbol, logoUrl: found.logoUrl ?? null }, candles: chart.candles });
        })
        .catch(fail);
    }
    return () => {
      live = false;
    };
    // `position` is read by id; its live P&L changing must not refetch the chart.
  }, [status, tokenKey, target.period, position?.id, network, attempt]);

  const retry = React.useCallback(() => {
    void refresh();
    void agentRefresh();
    void margin.refresh();
    setAttempt((n) => n + 1);
  }, [refresh, agentRefresh, margin]);

  const result = React.useMemo((): PeriodCardResult | null => {
    const now = Date.now();
    if (target.token) {
      if (extra?.kind !== "token" || !agent.feed) return null;
      if (!extra.trades) return { status: "empty" };
      return buildTokenCard({ period: target.period, network, token: extra.token, trades: extra.trades, candles: extra.candles, items, now, markerGap: MARKER_GAP_SHARE });
    }
    if (target.position) {
      if (margin.positions && !position) return { status: "empty" };
      if (extra?.kind !== "position") return null;
      return buildPositionCard({ position: extra.position, token: extra.token, candles: extra.candles, now });
    }
    return portfolio && agent.feed ? buildPeriodCard({ period: target.period, portfolio, items, now, markerGap: MARKER_GAP_SHARE }) : null;
  }, [target.token, target.position, target.period, extra, agent.feed, items, network, portfolio, margin.positions, position]);

  if (status !== "account") return { status: "guest" };
  if (result) return result.status === "ready" ? { status: "ready", card: result.card } : { status: "empty" };
  if (extraFailed || (error && !portfolio && !target.token && !target.position) || (agent.error && !agent.feed)) return { status: "error", retry };
  return { status: "loading" };
}
