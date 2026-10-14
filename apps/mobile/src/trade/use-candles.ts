// The chart's candles for one asset (a margin market on Arc mainnet, or any token page's chain) per range. Read once
// per asset and range and kept stable, so a positions or price poll never redraws the candles; the live price moves
// the last bar instead. A failed read keeps the last good candles, marked stale with the time they were read.
import * as React from "react";

import type { Candle, ChartRange } from "@kawase/api-client";
import { CHAIN_IDS } from "@kawase/identity";

import { api } from "@/session/api";

export const TRADE_RANGES: readonly ChartRange[] = ["1H", "1D", "1W", "1M"];

/** Short ranges keep drawing: their candles are read again this often while the chart is on screen. */
const REFRESH_MS: Partial<Record<ChartRange, number>> = { "1H": 30_000, "1D": 60_000 };
/** A read that fails is tried again by itself (the market source is busy for a moment) before the page says so. */
const FIRST_RETRY_MS = 1_500;
const SECOND_RETRY_MS = 4_000;
const RETRY_AFTER_MS = [FIRST_RETRY_MS, SECOND_RETRY_MS];

export function useCandles(asset: string | undefined, range: ChartRange, chainId: number = CHAIN_IDS.arc) {
  const [candles, setCandles] = React.useState<Candle[]>();
  const [asOf, setAsOf] = React.useState<number>();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!asset) return undefined;
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const read = (tries: number) => {
      api.tokens
        .chart(chainId, asset, range)
        .then((result) => {
          if (!live) return;
          setCandles(result.candles);
          setAsOf(Date.now());
          setFailed(false);
        })
        .catch(() => {
          if (!live) return;
          const wait = RETRY_AFTER_MS[tries];
          if (wait === undefined) setFailed(true);
          else retry = setTimeout(() => read(tries + 1), wait);
        });
    };
    read(0);
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
    };
  }, [asset, chainId, range, attempt, tick]);
  // Short ranges are read again while they are on screen, so the line keeps up with the market.
  React.useEffect(() => {
    const every = REFRESH_MS[range];
    if (!asset || !every) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), every);
    return () => clearInterval(timer);
  }, [asset, range]);
  // A new asset or range starts from its own skeleton, never the last one's bars.
  React.useEffect(() => setCandles(undefined), [asset, chainId, range]);
  return { candles, failed, asOf, retry: () => setAttempt((value) => value + 1) };
}
