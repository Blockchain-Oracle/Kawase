// A Markets list (trending, meme, new, stocks & FX, long/short) from the api's shared market cache. Public data:
// guests and testnet users read mainnet's markets (R13), labelled as such by the screen. While the list is on screen
// it is read again every few seconds (prices are live from each token's deepest pair), quietly: rows roll in place.
// Between reads, every swap on an Arc mainnet row's pool moves its price and its sparkline's head as it lands
// (useLiveTrades), so a trade shows on the row about a block after it happens.
import { useIsFocused } from "expo-router";
import * as React from "react";

import type { MarketListView, MarketSegment, NetworkId, TokenSearchResult } from "@kawase/api-client";
import { CHAIN_IDS } from "@kawase/identity";

import { api } from "@/session/api";

import { lastTrade, useLiveTrades } from "./live-trades";

export function useMarket(segment: MarketSegment, network: NetworkId) {
  const [market, setMarket] = React.useState<MarketListView>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setMarket((await api.markets.list(segment, network)).market);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [segment, network]);

  React.useEffect(() => {
    setMarket((current) => (current?.segment === segment ? current : undefined));
    void refresh();
  }, [refresh, segment]);

  const focused = useIsFocused();
  React.useEffect(() => {
    if (!focused) return undefined;
    let alive = true;
    const timer = setInterval(() => {
      api.markets
        .list(segment, network)
        .then((answer) => {
          if (alive) setMarket(answer.market);
        })
        .catch(() => undefined);
    }, MARKET_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [focused, segment, network]);

  const liveTokens = React.useMemo(
    () => (market?.rows ?? []).filter((row) => row.token.chainId === CHAIN_IDS.arc).map((row) => row.token.address),
    [market],
  );
  const live = useLiveTrades(liveTokens);
  const merged = React.useMemo(() => {
    if (!market) return market;
    const pricedAt = Date.parse(market.pricedAt);
    return {
      ...market,
      rows: market.rows.map((row) => {
        const trade = lastTrade(live, row.token.address);
        if (!trade || trade.at <= pricedAt) return row;
        return {
          ...row,
          priceUsd: trade.priceUsd,
          spark: row.spark ? [...row.spark.slice(0, -1), trade.priceUsd] : row.spark,
        };
      }),
    };
  }, [market, live]);

  return { market: merged, loading, error, refresh, live: live.live };
}

const SEARCH_DEBOUNCE_MS = 300;
/** How often an open Markets list reads its prices again. */
const MARKET_POLL_MS = 8_000;

/** Token search by name, symbol or address, debounced; empty query → no results. */
export function useTokenSearch(query: string, network: NetworkId) {
  const [results, setResults] = React.useState<TokenSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  React.useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    let live = true;
    const timer = setTimeout(() => {
      api.tokens
        .search(text, network)
        .then(({ results: found }) => {
          if (live) setResults(found);
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, network]);
  return { results, searching };
}
