// The route race (plan decision 7): every venue for one request is asked at once, and a RouteRace snapshot is yielded
// each time one answers, so the agent's run card and the RouteList light rows up as quotes land; a final snapshot
// says `done`. Each venue gets 4 s (App Kit, which retries "no route yet" itself, gets its own longer cap); one that
// has not answered by then is a failed row (`timeout`) and the others
// decide. `best` is the highest net among executable quoted rows. The race only reads: nothing here builds or signs.
import type { RouteKind, RouteQuote, RouteRace } from "@kawase/api-client";

/** A venue that has not answered by then is out of this race. */
export const RACE_VENUE_TIMEOUT_MS = 4_000;

/**
 * One thing being asked: the rows it fills (one per venue, or several for a source that answers for many, such as
 * the yield list) shown as `checking` until `result` settles.
 */
export type RaceAttempt = {
  pending: RouteQuote[];
  result: Promise<RouteQuote[]>;
  /** This attempt's own cap, for a venue known to answer slowly (Circle App Kit); the race's default otherwise. */
  timeoutMs?: number | undefined;
};

export type RaceOptions = {
  timeoutMs?: number;
  ask?: RouteRace["ask"];
  /** For tests: the clock. */
  now?: () => number;
};

/** A row still being asked. */
export const checkingRow = (venue: string, mark: string, label: string): RouteQuote => ({
  venue,
  mark,
  label,
  status: "checking",
  receive: null,
  net: null,
  feeUsd: null,
  etaSeconds: null,
  detail: [],
  executable: false,
  reason: null,
});

/** A row that did not answer in time, or answered with no route. */
export const failedRow = (row: RouteQuote, reason: string, status: "failed" | "unavailable" = "failed"): RouteQuote => ({ ...row, status, receive: null, net: null, executable: false, reason });

const RANK: Record<RouteQuote["status"], number> = { quoted: 0, checking: 1, failed: 2, unavailable: 3 };

const NO_NET = -1n;
const EVEN = 0n;
const netOf = (row: RouteQuote) => (row.net === null ? NO_NET : BigInt(row.net));

/** Executable quotes by net (ties: the faster), then quotes Kawase cannot execute, then rows still checking, then failures. */
export function rankRows(rows: readonly RouteQuote[]): RouteQuote[] {
  return [...rows].sort((a, b) => {
    const tier = (row: RouteQuote) => (row.status === "quoted" ? (row.executable ? 0 : 1) : 1 + RANK[row.status]);
    const byTier = tier(a) - tier(b);
    if (byTier !== 0) return byTier;
    if (a.status !== "quoted" || b.status !== "quoted") return 0;
    const diff = netOf(b) - netOf(a);
    if (diff !== EVEN) return diff > EVEN ? 1 : -1;
    return (a.etaSeconds ?? Number.POSITIVE_INFINITY) - (b.etaSeconds ?? Number.POSITIVE_INFINITY);
  });
}

export const bestOf = (rows: readonly RouteQuote[]): string | null => rankRows(rows).find((row) => row.status === "quoted" && row.executable && row.net !== null)?.venue ?? null;

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Fires every attempt and yields: first every row `checking`, then one snapshot each time an attempt settles
 * (answered, failed or timed out), then a final `done` snapshot.
 */
export async function* raceRoutes(kind: RouteKind, attempts: readonly RaceAttempt[], options: RaceOptions = {}): AsyncGenerator<RouteRace> {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? RACE_VENUE_TIMEOUT_MS;
  const startedAt = new Date(now()).toISOString();
  let quotedAt = startedAt;
  const slots: RouteQuote[][] = attempts.map((attempt) => attempt.pending);
  const snapshot = (done: boolean): RouteRace => {
    const rows = rankRows(slots.flat());
    return { kind, rows, best: bestOf(rows), done, quotedAt, startedAt, ...(options.ask ? { ask: options.ask } : {}) };
  };

  yield snapshot(attempts.length === 0);
  if (attempts.length === 0) return;

  const started = now();
  type Settled = { index: number; rows: RouteQuote[] };
  const waiting = new Map<number, Promise<Settled>>();
  attempts.forEach((attempt, index) => {
    waiting.set(
      index,
      within(attempt.result, attempt.timeoutMs ?? timeoutMs).then(
        (rows): Settled => ({ index, rows: rows.map((row) => ({ ...row, answeredMs: row.answeredMs ?? now() - started })) }),
        (error: unknown): Settled => ({ index, rows: attempt.pending.map((row) => failedRow(row, error instanceof Error && error.message === "timeout" ? "timeout" : "failed")) }),
      ),
    );
  });
  while (waiting.size > 0) {
    const settled = await Promise.race(waiting.values());
    waiting.delete(settled.index);
    slots[settled.index] = settled.rows;
    if (settled.rows.some((row) => row.status === "quoted")) quotedAt = new Date(now()).toISOString();
    yield snapshot(waiting.size === 0);
  }
}

/** Runs a race to the end and returns its last snapshot (for callers that only want the result). */
export async function finishRace(race: AsyncGenerator<RouteRace>): Promise<RouteRace | undefined> {
  let last: RouteRace | undefined;
  for await (const snapshot of race) last = snapshot;
  return last;
}
