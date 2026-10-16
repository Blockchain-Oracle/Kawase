/**
 * The download buttons as they stand right now (ported from Mitoshi's `server/store-release.ts`): the TestFlight link
 * is offered only while Apple's join page says the beta takes testers. A public link exists before Apple's beta review
 * passes, and leading an iPhone to "This beta isn't accepting any new testers" is a dead end. Apple's page is read off
 * the request path (`lib/testflight-gate.ts`): a visitor never waits on it after a process's first request, a failed
 * read is retried 30 s later, and an unverified link is never offered. Each change of answer is a `[download]` log line.
 *
 * The gate is made at server boot (`instrumentation.ts`), and its reads run in the context captured there, outside every
 * render. A read starts inside whichever render finds the answer stale, and `/` is regenerated every minute (Coolify's
 * health probe asks for it every 5 s), so `/` was always that render; Next's fetch refuses a no-store fetch in a static
 * render ("Page changed from static to dynamic at runtime"). On 10-16 every read after a process's first failed that
 * way for hours, logged as "no connection", and both cards said "Coming to iPhone" while Apple's page was open. Outside
 * a render Next's fetch is the plain one.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readStoreRelease, type StoreRelease } from "@/lib/release";
import { createTestflightGate, type TestflightGate } from "@/lib/testflight-gate";

/** One gate per process, kept on `globalThis` so every bundle that imports this module (and a dev reload) shares it. */
const KEY = Symbol.for("kawase.download.testflight-gate");
type Holder = { [KEY]?: TestflightGate };

type Runner = <R>(fn: () => R) => R;

function gate(outsideRenders: Runner = (fn) => fn()): TestflightGate {
  const holder = globalThis as Holder;
  holder[KEY] ??= createTestflightGate({
    fetch: (input, init) => outsideRenders(() => fetch(input, init)),
    log: (line) => console.info(`[download] ${line}`),
  });
  return holder[KEY];
}

/** Server boot, before any request (`instrumentation.ts`): the gate, its reads bound to this context, and its first read. */
export function startTestflightGate(): void {
  const link = readStoreRelease().testflight;
  const started = gate(AsyncLocalStorage.snapshot());
  if (link) void started.state(link);
}

export async function liveStoreRelease(): Promise<StoreRelease> {
  const release = readStoreRelease();
  if (!release.testflight) return release;
  const state = await gate().state(release.testflight);
  return state === "open" ? release : { ...release, testflight: null, inReview: state === "closed" };
}
