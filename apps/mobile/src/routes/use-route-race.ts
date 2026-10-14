// Drives a RouteList from a live race: each snapshot replaces the last; a failure before any snapshot is "error";
// a failure after some (the connection dropped) keeps the rows and marks them "offline" (stale, with their time).
// `start` opens the stream (api-client `readRouteRace` over POST /routes/race, or the agent's tool output); calling
// `retry` asks every venue again. A newer race always wins over an older one still finishing.
import type { RouteRace } from "@kawase/api-client";
import * as React from "react";

import type { RouteListState } from "./route-list";

export type RaceSource = (signal: AbortSignal) => AsyncIterable<RouteRace> | Promise<AsyncIterable<RouteRace>>;

export function useRouteRace(start: RaceSource | null) {
  const [race, setRace] = React.useState<RouteRace | null>(null);
  const [state, setState] = React.useState<RouteListState>("live");
  const [round, setRound] = React.useState(0);

  React.useEffect(() => {
    if (!start) return;
    const controller = new AbortController();
    let got = false;
    setState("live");
    (async () => {
      try {
        for await (const snapshot of await start(controller.signal)) {
          if (controller.signal.aborted) return;
          got = true;
          setRace(snapshot);
        }
      } catch {
        if (controller.signal.aborted) return;
        setState(got ? "offline" : "error");
      }
    })();
    return () => controller.abort();
  }, [start, round]);

  const retry = React.useCallback(() => {
    setRace(null);
    setRound((value) => value + 1);
  }, []);

  return { race, state, retry };
}

/** Replays recorded snapshots with their original pacing (the gallery; also tests). */
export function replayRace(snapshots: readonly RouteRace[], speed = 1): RaceSource {
  return async function* replay(signal) {
    const started = snapshots[0]?.startedAt ? Date.parse(snapshots[0].startedAt) : Date.now();
    const now = Date.now();
    for (const snapshot of snapshots) {
      const answered = Math.max(0, ...snapshot.rows.map((row) => row.answeredMs ?? 0));
      const wait = answered / speed - (Date.now() - now);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (signal.aborted) return;
      // Re-based on now, so elapsed time and "quoted at" read as a race happening now.
      const shift = now - started;
      yield { ...snapshot, startedAt: new Date(now).toISOString(), quotedAt: new Date(Date.parse(snapshot.quotedAt) + shift).toISOString() };
    }
  };
}
