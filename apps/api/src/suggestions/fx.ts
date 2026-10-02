// The euro against the dollar, for EURC holders: the European Central Bank's daily reference rates through
// Frankfurter (frankfurter.dev, free, no key). EURC is a euro stablecoin, so its dollar value follows this rate.
// Cached for half an hour; any failure answers "unknown" and the card simply does not show.
const SOURCE = "https://api.frankfurter.dev/v1";
/** Half an hour. */
const CACHE_MS = 1_800_000;
const TIMEOUT_MS = 4_000;
const LOOKBACK_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const DATE_CHARS = 10;
const PERCENT = 100;
/** The published day before the latest. */
const PREVIOUS = -2;

export type FxMove = { rate: number; previousRate: number; changePct: number; date: string; previousDate: string };

let cached: { at: number; move: FxMove | undefined } | undefined;

/** EUR→USD on the latest published day and the published day before it. */
export async function eurUsdMove(): Promise<FxMove | undefined> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.move;
  const from = new Date(Date.now() - LOOKBACK_DAYS * MS_PER_DAY).toISOString().slice(0, DATE_CHARS);
  let move: FxMove | undefined;
  try {
    const response = await fetch(`${SOURCE}/${from}..?base=EUR&symbols=USD`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) {
      const body = (await response.json()) as { rates?: Record<string, { USD?: number }> };
      const days = Object.entries(body.rates ?? {})
        .flatMap(([date, rate]) => (typeof rate.USD === "number" ? [{ date, rate: rate.USD }] : []))
        .sort((a, b) => a.date.localeCompare(b.date));
      const last = days.at(-1);
      const before = days.at(PREVIOUS);
      if (last && before)
        move = { rate: last.rate, previousRate: before.rate, changePct: ((last.rate - before.rate) / before.rate) * PERCENT, date: last.date, previousDate: before.date };
    }
  } catch {
    move = undefined;
  }
  cached = { at: Date.now(), move };
  return move;
}
