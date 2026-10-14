// The chart's candles for one asset (a margin market on Arc mainnet, or any token page's chain) per range. Read once
// per asset and range and kept stable, so a positions or price poll never redraws the candles; the live price moves
// the last bar instead. A failed read keeps the last good candles, marked stale with the time they were read.
import * as React from "react";

import type { Candle, ChartRange } from "@kawase/api-client";
import { CHAIN_IDS } from "@kawase/identity";

import { api } from "@/session/api";

export const TRADE_RANGES: readonly ChartRange[] = ["1H", "1D", "1W", "1M"];

export function useCandles(asset: string | undefined, range: ChartRange, chainId: number = CHAIN_IDS.arc) {
  const [candles, setCandles] = React.useState<Candle[]>();
  const [asOf, setAsOf] = React.useState<number>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!asset) return undefined;
    let live = true;
    setFailed(false);
    api.tokens
      .chart(chainId, asset, range)
      .then((result) => {
        if (!live) return;
        setCandles(result.candles);
        setAsOf(Date.now());
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [asset, chainId, range, attempt]);
  // A new asset starts from its own skeleton, never the last one's bars.
  React.useEffect(() => setCandles(undefined), [asset, chainId]);
  return { candles, failed, asOf, retry: () => setAttempt((value) => value + 1) };
}
