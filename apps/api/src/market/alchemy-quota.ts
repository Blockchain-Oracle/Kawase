// One pause for every Alchemy API Kawase calls (Portfolio, Prices, Transfers). Over its monthly quota Alchemy answers
// 429 "Monthly capacity limit exceeded" to everything, so after one such answer the next reads skip it and go straight
// to their fallbacks (balances read on chain, the explorer, the other price sources) until the pause ends; then one
// read asks again. A throughput 429 pauses only briefly. Per process, in memory: a restart simply asks once more.
import { ALCHEMY_QUOTA_PAUSE_MS, ALCHEMY_THROTTLE_PAUSE_MS } from "@kawase/config";

const TOO_MANY_REQUESTS = 429;
const MONTHLY = /capacity/i;

let pausedUntil = 0;

/** Thrown instead of calling Alchemy while it is paused; callers already treat any throw as "use the fallback". */
export class AlchemyPausedError extends Error {
  constructor() {
    super("alchemy paused after a 429 (quota or throughput)");
  }
}

export function assertAlchemyOpen(): void {
  if (Date.now() < pausedUntil) throw new AlchemyPausedError();
}

/** Every Alchemy answer passes through here: a 429 starts the pause (longer when the month's capacity is spent). */
export function noteAlchemyAnswer(status: number, text = ""): void {
  if (status !== TOO_MANY_REQUESTS) return;
  pausedUntil = Date.now() + (MONTHLY.test(text) ? ALCHEMY_QUOTA_PAUSE_MS : ALCHEMY_THROTTLE_PAUSE_MS);
}

/** For tests: forget any pause. */
export function resetAlchemyPause(): void {
  pausedUntil = 0;
}
