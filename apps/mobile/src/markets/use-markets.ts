// A Markets list (trending, meme, new, stocks & FX, long/short) from the api's shared market cache. Public data:
// guests and testnet users read mainnet's markets (R13), labelled as such by the screen.
import * as React from "react";

import type { MarketListView, MarketSegment, NetworkId, TokenSearchResult } from "@kawase/api-client";

import { api } from "@/session/api";

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

  return { market, loading, error, refresh };
}

const SEARCH_DEBOUNCE_MS = 300;

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
