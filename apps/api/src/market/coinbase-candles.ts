// Candles for the long/short majors from Coinbase Exchange's public REST api (no key; the same products the live
// ticker relays: cirBTC → BTC-USD, WETH → ETH-USD, EURC → EURC-USDC). GeckoTerminal allows about ten calls a minute
// and an api restart empties its cache, so on 10-15 every cirBTC range answered "the price history source is busy"
// and the Long/Short chart said it didn't load. Coinbase allows several requests a second per address; a pool's
// candles stay GeckoTerminal's for every other token, and these fall back to it if Coinbase fails.
import type { Candle, ChartRange } from "@kawase/api-client";

import { productFor } from "./ticker";

const COINBASE_REST = "https://api.exchange.coinbase.com";
const TIMEOUT_MS = 5_000;
const MS_PER_SECOND = 1_000;
/** Coinbase answers at most 300 candles a request; a year and "all" are its last 300 days. */
const SHAPE: Record<ChartRange, { granularity: number; spanSeconds: number; ttlMs: number }> = {
  "1H": { granularity: 60, spanSeconds: 3_600, ttlMs: 30_000 },
  "1D": { granularity: 900, spanSeconds: 86_400, ttlMs: 60_000 },
  "1W": { granularity: 3_600, spanSeconds: 604_800, ttlMs: 300_000 },
  "1M": { granularity: 21_600, spanSeconds: 2_592_000, ttlMs: 600_000 },
  "1Y": { granularity: 86_400, spanSeconds: 25_920_000, ttlMs: 3_600_000 },
  ALL: { granularity: 86_400, spanSeconds: 25_920_000, ttlMs: 3_600_000 },
};

const held = new Map<string, { at: number; candles: Candle[] }>();

/**
 * The market's candles for `range`, oldest first, or null when the symbol has no exchange product (the caller uses
 * the pool's history). Throws when Coinbase fails and nothing is held; a held answer is served until its time is up.
 */
export async function coinbaseCandles(symbol: string, range: ChartRange, fetchImpl: typeof fetch = fetch): Promise<Candle[] | null> {
  const product = productFor(symbol);
  if (!product) return null;
  const shape = SHAPE[range];
  const key = `${product}:${range}`;
  const kept = held.get(key);
  if (kept && Date.now() - kept.at < shape.ttlMs) return kept.candles;
  const end = new Date();
  const start = new Date(end.getTime() - shape.spanSeconds * MS_PER_SECOND);
  try {
    const response = await fetchImpl(
      `${COINBASE_REST}/products/${product}/candles?granularity=${shape.granularity}&start=${start.toISOString()}&end=${end.toISOString()}`,
      // Coinbase asks every client to name itself.
      { headers: { accept: "application/json", "user-agent": "Kawase/1.0 (+https://getkawase.xyz)" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) throw new Error(`coinbase candles ${response.status}`);
    const rows = (await response.json()) as [number, number, number, number, number, number][];
    // Each row is [time, low, high, open, close, volume], newest first.
    const candles = rows.map(([t, l, h, o, c, v]) => ({ t, o, h, l, c, v })).sort((a, b) => a.t - b.t);
    held.set(key, { at: Date.now(), candles });
    return candles;
  } catch (error) {
    if (kept) return kept.candles;
    throw error;
  }
}
