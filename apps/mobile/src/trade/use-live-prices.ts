// The long/short markets' live prices (GET /markets/live/prices, NDJSON; the api relays Coinbase's public ticker): the
// terminal's tabs, hero price and chart head move several times a second for BTC and ETH instead of with the 15 s
// markets read. One stream while the screen is focused; if it drops it opens again after a short wait, and the venue's
// oracle price (the markets read) stands in meanwhile. Native streams through expo/fetch, as the live trades do.
import { readNdjson, type LivePrice, type LivePriceMessage } from "@kawase/api-client";
import { useIsFocused } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import * as React from "react";
import { Platform } from "react-native";

import { API_URL } from "@/session/api";

const PRICES_PATH = "/markets/live/prices";
const RETRY_MS = 3_000;

export type LivePrices = { prices: Readonly<Record<string, LivePrice>>; live: boolean };

const streamingFetch = (): typeof globalThis.fetch =>
  Platform.OS === "web" ? globalThis.fetch.bind(globalThis) : (expoFetch as unknown as typeof globalThis.fetch);

/** Live prices for `markets` (venue symbols: "cirBTC", "WETH", "EURC"); an empty list opens nothing. */
export function useLivePrices(markets: readonly string[]): LivePrices {
  const focused = useIsFocused();
  const key = [...new Set(markets)].sort().join(",");
  const [state, setState] = React.useState<LivePrices>({ prices: {}, live: false });

  React.useEffect(() => {
    if (!key || !focused) {
      setState((current) => (current.live ? { ...current, live: false } : current));
      return undefined;
    }
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      try {
        const response = await streamingFetch()(`${API_URL}${PRICES_PATH}?markets=${encodeURIComponent(key)}`, {
          headers: { accept: "application/x-ndjson" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`prices ${response.status}`);
        for await (const message of readNdjson<LivePriceMessage>(response.body)) {
          if (controller.signal.aborted) return;
          if (message.type === "snapshot") setState((current) => ({ live: true, prices: { ...current.prices, ...message.prices } }));
          else if (message.type === "price")
            setState((current) => ({ live: true, prices: { ...current.prices, [message.market]: { price: message.price, at: message.at } } }));
        }
      } catch {
        // A quiet retry: the last prices stay on screen, marked not live.
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
