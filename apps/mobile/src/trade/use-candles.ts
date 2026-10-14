// The chart's candles for one margin market: the asset's deepest pool on Arc mainnet (the only network Kawase Margin
// runs on), per range. Read once per market and range and kept stable, so a positions or price poll never redraws
// the candles; the live price moves the last bar instead. A failed read keeps the last good candles, marked stale.
import * as React from "react";

import type { Candle, ChartRange } from "@kawase/api-client";

import { api } from "@/session/api";

const ARC_MAINNET = 5042;

export const TRADE_RANGES: readonly ChartRange[] = ["1H", "1D", "1W", "1M"];

export function useCandles(asset: string | undefined, range: ChartRange) {
  const [candles, setCandles] = React.useState<Candle[]>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!asset) return undefined;
    let live = true;
    setFailed(false);
    api.tokens
      .chart(ARC_MAINNET, asset, range)
      .then((result) => {
        if (live) setCandles(result.candles);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [asset, range, attempt]);
  // A new market starts from its own skeleton, never the last market's bars.
  React.useEffect(() => setCandles(undefined), [asset]);
  return { candles, failed, retry: () => setAttempt((value) => value + 1) };
}
