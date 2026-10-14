// One cache for every external market source (LI.FI, GeckoTerminal, GoPlus, FX): each answer is fetched once and
// served to every client until it is due; a fetch already in flight is shared; when a source is down, slow or out
// of budget, the last good answer is served with its time (surfaces.md: "rate-limited data: the last snapshot with
// its time"). Bounded in size, oldest first out.
import { MARKET_FETCH_TIMEOUT_MS, MARKET_STALE_MAX_MS } from "@kawase/config";

const MAX_ENTRIES = 4_000;
const MINUTE_MS = 60_000;

type Entry = { value: unknown; at: number };

export type Cached<T> = { value: T; at: number; stale: boolean };

export class OutOfBudget extends Error {
  constructor(source: string) {
    super(`${source}: call budget spent`);
  }
}

/** A sliding one-minute window of calls, so a shared free tier is never exceeded (GeckoTerminal: ~10 a minute). */
export class CallBudget {
  private readonly calls: number[] = [];
  private pausedUntil = 0;

  constructor(
    readonly source: string,
    private readonly perMinute: number,
  ) {}

  /** The source refused (429): no calls until `ms` from now. */
  cooldown(ms: number) {
    this.pausedUntil = Date.now() + ms;
  }

  take(): boolean {
    const now = Date.now();
    if (now < this.pausedUntil) return false;
    while (this.calls.length > 0 && now - this.calls[0]! > MINUTE_MS) this.calls.shift();
    if (this.calls.length >= this.perMinute) return false;
    this.calls.push(now);
    return true;
  }
}

export class MarketCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** A fresh answer, or the last good one when the source fails (marked stale), or the failure when there is none. */
  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
    const entry = this.entries.get(key);
    const now = Date.now();
    if (entry && now - entry.at < ttlMs) return { value: entry.value as T, at: entry.at, stale: false };
    try {
      const value = await this.load(key, load);
      return { value, at: this.entries.get(key)?.at ?? Date.now(), stale: false };
    } catch (error) {
      if (entry && now - entry.at < MARKET_STALE_MAX_MS) return { value: entry.value as T, at: entry.at, stale: true };
      throw error;
    }
  }

  /** The value only; failures without a stale answer become `fallback`. */
  async value<T>(key: string, ttlMs: number, load: () => Promise<T>, fallback: T): Promise<T> {
    return this.get(key, ttlMs, load).then(
      (cached) => cached.value,
      () => fallback,
    );
  }

  /** What is held for a key, however old, or undefined. */
  peek<T>(key: string): Cached<T> | undefined {
    const entry = this.entries.get(key);
    return entry ? { value: entry.value as T, at: entry.at, stale: false } : undefined;
  }

  /** Store an answer fetched as part of a batch (one call that answers many keys). */
  set(key: string, value: unknown) {
    this.entries.delete(key);
    this.entries.set(key, { value, at: Date.now() });
    if (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }

  private load<T>(key: string, load: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

/** GET a JSON document with a timeout; a non-2xx answer is an error. */
export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(MARKET_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return (await response.json()) as T;
}
