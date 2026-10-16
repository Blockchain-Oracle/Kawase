// Ported from Mitoshi (crypto-world-fair web/src/lib/testflight-gate.ts): the same logic, its numbers named for this repo's lint.
// Whether `/download` may offer the TestFlight link (D-230): Apple's join page, read off the request path. Apple's page
// is slow (5 s to first byte from a desk on 2026-10-13, and one read stalled mid-body for minutes), so no visitor waits
// on it: a request reads the last verified answer from memory, and a read of Apple's page runs in the background when
// that answer is older than `freshMs`. A failed read costs nothing but a retry `retryMs` later; the last verified
// answer stands meanwhile (for at most `keepMs`), and with none the link is "unknown" — never offered, so an unverified
// link can't lead the page. Only the first request a process serves waits, at most `coldWaitMs`, for the first read.
// Pure (the fetch, the clock and the log are passed in) so every path is tested (`testflight-gate.test.ts`).
import { testflightState, type TestflightState } from "./release";

const HTTP_OK = 200;
const MINUTE_MS = 60_000;
const FRESH_MINUTES = 5;
const KEEP_MINUTES = 60;
/** How much of an unexpected error's message a log line carries. */
const WHY_CHARS = 160;

/** undici's reason under "fetch failed" (ENOTFOUND, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT…). */
function causeCode(error: TypeError): string | undefined {
  const cause = error.cause as { code?: unknown } | undefined;
  return typeof cause?.code === "string" ? cause.code : undefined;
}

export interface TestflightGateOptions {
  fetch: typeof fetch;
  now?: () => number;
  /** One read's whole budget, body included. */
  timeoutMs?: number;
  /** How long a verified answer stands before it is read again (in the background). */
  freshMs?: number;
  /** After a failed read, how long before the next one. */
  retryMs?: number;
  /** How long a verified answer outlives failed reads before it turns unknown. */
  keepMs?: number;
  /** How long the first request of a process waits for the first read. */
  coldWaitMs?: number;
  /** Told each read's outcome when it changes the answer, or fails. */
  log?: (line: string) => void;
}

export interface TestflightGate {
  /** The answer to offer now: open only when Apple's page said so recently. Waits only on a process's first call. */
  state(link: string): Promise<TestflightState>;
  /** The read in flight, if any (tests). */
  settled(): Promise<void>;
}

interface Verified {
  link: string;
  state: "open" | "closed";
  at: number;
}

/** One read of Apple's page: its answer, or why it couldn't be read. Never throws. */
export async function readTestflight(link: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ state: TestflightState; why?: string }> {
  try {
    const res = await fetchImpl(link, { headers: { "accept-language": "en-US,en;q=0.9" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const html = res.status === HTTP_OK ? await res.text() : "";
    const state = testflightState(link, res.status, html);
    return state === "unknown" ? { state, why: res.status === HTTP_OK ? "an unrecognised page" : `status ${res.status}` } : { state };
  } catch (error) {
    // Only a TypeError is the network ("fetch failed"); anything else is said as thrown, never as "no connection"
    // (Next's static-render error was logged that way for hours on 10-16, `server/store-release.ts`).
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { state: "unknown", why: `no answer in ${timeoutMs} ms` };
    if (error instanceof TypeError) return { state: "unknown", why: `no connection (${causeCode(error) ?? error.message})` };
    return { state: "unknown", why: `the read threw ${name || "a non-error"}: ${String(error instanceof Error ? error.message : error).slice(0, WHY_CHARS)}` };
  }
}

export function createTestflightGate({
  fetch: fetchImpl,
  now = Date.now,
  timeoutMs = 8_000,
  freshMs = FRESH_MINUTES * MINUTE_MS,
  retryMs = 30_000,
  keepMs = KEEP_MINUTES * MINUTE_MS,
  coldWaitMs = 2_000,
  log = () => {},
}: TestflightGateOptions): TestflightGate {
  let verified: Verified | null = null;
  let triedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;

  function read(link: string): Promise<void> {
    if (inflight) return inflight;
    triedAt = now();
    inflight = readTestflight(link, fetchImpl, timeoutMs)
      .then(({ state, why }) => {
        if (state === "unknown") {
          const kept = verified?.link === link && now() - verified.at < keepMs ? verified.state : null;
          log(`TestFlight join page unread (${why}); ${kept ? `keeping "${kept}"` : "not offering the link"}`);
          return;
        }
        if (verified?.link !== link || verified.state !== state) log(`TestFlight join page: ${state}`);
        verified = { link, state, at: now() };
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  /** The process's first read, bounded by `coldWaitMs`: the requests that arrive before it ends wait on it, no others. */
  let warmup: Promise<void> | null = null;

  return {
    async state(link) {
      const t = now();
      const known = verified?.link === link ? verified : null;
      if ((!known || t - known.at >= freshMs) && t - triedAt >= retryMs) {
        const pending = read(link);
        warmup ??= new Promise<void>((done) => {
          const timer = setTimeout(done, coldWaitMs);
          void pending.then(() => {
            clearTimeout(timer);
            done();
          });
        });
      }
      if (warmup) await warmup;
      const current = verified?.link === link ? verified : null;
      return current && now() - current.at < keepMs ? current.state : "unknown";
    },
    settled: () => inflight ?? Promise.resolve(),
  };
}
