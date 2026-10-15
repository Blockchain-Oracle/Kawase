/**
 * The download buttons as they stand right now (ported from Mitoshi's `server/store-release.ts`): the TestFlight link
 * is offered only while Apple's join page says the beta takes testers. A public link exists before Apple's beta review
 * passes, and leading an iPhone to "This beta isn't accepting any new testers" is a dead end. Apple's page is read off
 * the request path (`lib/testflight-gate.ts`): a visitor never waits on it after a process's first request, a failed
 * read is retried 30 s later, and an unverified link is never offered. Each change of answer is a `[download]` log line.
 */
import { readStoreRelease, type StoreRelease } from "@/lib/release";
import { createTestflightGate, type TestflightGate } from "@/lib/testflight-gate";

/** One gate per process, kept on `globalThis` so every bundle that imports this module (and a dev reload) shares it. */
const KEY = Symbol.for("kawase.download.testflight-gate");
type Holder = { [KEY]?: TestflightGate };

function gate(): TestflightGate {
  const holder = globalThis as Holder;
  holder[KEY] ??= createTestflightGate({ fetch: (input, init) => fetch(input, init), log: (line) => console.info(`[download] ${line}`) });
  return holder[KEY];
}

export async function liveStoreRelease(): Promise<StoreRelease> {
  const release = readStoreRelease();
  if (!release.testflight) return release;
  const state = await gate().state(release.testflight);
  return state === "open" ? release : { ...release, testflight: null, inReview: state === "closed" };
}
