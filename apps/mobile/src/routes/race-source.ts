// The live route race for a screen: POST /routes/race streams one RouteRace per line (NDJSON) as venues answer, and
// `useRouteRace(liveRace(request))` turns it into RouteList state. Native streams through expo/fetch (React Native's
// own fetch buffers the whole body, so rows would only appear at the end); the web uses the browser's fetch. The
// session token rides as a bearer header, like the chat. A guest races too (value first, sign last).
import { readRouteRace, type RouteRace, type RouteRaceRequest } from "@kawase/api-client";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import { API_URL } from "@/session/api";
import { sessionStorage } from "@/session/storage";

import type { RaceSource } from "./use-route-race";

const RACE_PATH = "/routes/race";

/** Why a race could not start, from the api's problem reply (`validation` with a reason, `network_unavailable`…). */
export class RaceStartError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(code ?? `race ${status}`);
    this.name = "RaceStartError";
  }
}

const streamingFetch = (): typeof globalThis.fetch => (Platform.OS === "web" ? globalThis.fetch.bind(globalThis) : (expoFetch as unknown as typeof globalThis.fetch));

/** A RaceSource for `request`; pass a stable value (useMemo) so the race starts once per ask. */
export function liveRace(request: RouteRaceRequest): RaceSource {
  return async function* race(signal): AsyncGenerator<RouteRace> {
    const token = await sessionStorage.getToken();
    const response = await streamingFetch()(`${API_URL}${RACE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) {
      // RFC 9457 problem: the code ends `type`; a race input error adds `reason` (unknown_token, same_token…).
      const problem = (await response.json().catch(() => null)) as { type?: string; reason?: string } | null;
      throw new RaceStartError(response.status, problem?.reason ?? problem?.type?.split("/").pop() ?? null);
    }
    yield* readRouteRace(response.body);
  };
}
