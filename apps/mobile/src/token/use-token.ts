// One token's page and its chart, from the api (public market data; the holding when signed in). While the page is
// on screen its market is read again every few seconds (the api's live layer is seconds old), quietly: no skeleton,
// the price rolls to its new value.
import { useIsFocused } from "expo-router";
import * as React from "react";

import type { Candle, ChartRange, TokenDetailView } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useToken(chainId: number, address: string) {
  const { user } = useSession();
  const [detail, setDetail] = React.useState<TokenDetailView>();
  const [error, setError] = React.useState<"not_found" | "failed">();
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setDetail((await api.tokens.get(chainId, address)).token);
      setError(undefined);
    } catch (failure) {
      setError((failure as { status?: number }).status === HTTP_NOT_FOUND ? "not_found" : "failed");
    } finally {
      setLoading(false);
    }
    // The holding depends on the session's network.
  }, [chainId, address, user?.activeNetwork]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live: a quiet read every few seconds while the page is on screen; a miss keeps what is shown.
  const focused = useIsFocused();
  React.useEffect(() => {
    if (!focused) return undefined;
    let alive = true;
    const timer = setInterval(() => {
      api.tokens
        .get(chainId, address)
        .then((answer) => {
          if (alive) setDetail(answer.token);
        })
        .catch(() => undefined);
    }, LIVE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [focused, chainId, address, user?.activeNetwork]);
  return { detail, error, loading, refresh };
}

const HTTP_NOT_FOUND = 404;
/** How often an open token page reads its market again. */
const LIVE_POLL_MS = 5_000;

export function useTokenChart(chainId: number, address: string, range: ChartRange) {
  const [candles, setCandles] = React.useState<Candle[]>();
  React.useEffect(() => {
    let live = true;
    setCandles(undefined);
    api.tokens
      .chart(chainId, address, range)
      .then((answer) => {
        if (live) setCandles(answer.candles);
      })
      .catch(() => {
        if (live) setCandles([]);
      });
    return () => {
      live = false;
    };
  }, [chainId, address, range]);
  return candles;
}
