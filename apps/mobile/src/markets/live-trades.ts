// Live trades for a set of Arc mainnet tokens (GET /markets/live, NDJSON): the last ~30 minutes on connect, then each
// swap as it lands, about a block after it happens. One stream per screen while it is focused; if it drops it opens
// again after a short wait. Native streams through expo/fetch (React Native's fetch buffers the whole body); the web
// uses the browser's fetch. Public data: no session needed.
import { readNdjson, type LiveTrade, type LiveTradeMessage } from "@kawase/api-client";
import { useIsFocused } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import * as React from "react";
import { Platform } from "react-native";

import { API_URL } from "@/session/api";

const LIVE_PATH = "/markets/live";
const RETRY_MS = 3_000;
/** Trades kept per token on the client (the api sends at most this many in a snapshot too). */
const KEEP = 400;

export type LiveState = {
  /** Trades per token (lowercase address), oldest first. */
  trades: Readonly<Record<string, readonly LiveTrade[]>>;
  /** Whether the stream is open now. */
  live: boolean;
};

const streamingFetch = (): typeof globalThis.fetch =>
  Platform.OS === "web" ? globalThis.fetch.bind(globalThis) : (expoFetch as unknown as typeof globalThis.fetch);

/** Live trades for `tokens` (addresses, any case); an empty list opens nothing. */
export function useLiveTrades(tokens: readonly string[]): LiveState {
  const focused = useIsFocused();
  const key = [...new Set(tokens.map((token) => token.toLowerCase()))].sort().join(",");
  const [state, setState] = React.useState<LiveState>({ trades: {}, live: false });

  React.useEffect(() => {
    if (!key || !focused) {
      setState((current) => (current.live ? { ...current, live: false } : current));
      return undefined;
    }
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      try {
        const response = await streamingFetch()(`${API_URL}${LIVE_PATH}?tokens=${key}`, {
          headers: { accept: "application/x-ndjson" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`live ${response.status}`);
        for await (const message of readNdjson<LiveTradeMessage>(response.body)) {
          if (controller.signal.aborted) return;
          if (message.type === "snapshot") setState({ trades: message.trades, live: true });
          else if (message.type === "trade") {
            const token = message.trade.token.toLowerCase();
            setState((current) => ({
              live: true,
              trades: { ...current.trades, [token]: [...(current.trades[token] ?? []), message.trade].slice(-KEEP) },
            }));
          }
        }
      } catch {
        // Fall through to a quiet retry: the last trades stay on screen, marked not live.
      }
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, live: false }));
      retry = setTimeout(() => void open(), RETRY_MS);
    };
    void open();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [key, focused]);

  return state;
}

/** The newest trade for a token, if any. */
export function lastTrade(state: LiveState, token: string): LiveTrade | undefined {
  return state.trades[token.toLowerCase()]?.at(-1);
}
