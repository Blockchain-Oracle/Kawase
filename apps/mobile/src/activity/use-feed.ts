// The Activity feed on the device: one row per outcome on the active network (every token, Kawase's own runs, steps
// waiting for the person), kept per network so a switch never relabels another network's rows; a failed refresh
// keeps the rows from the last good read and says so.
import * as React from "react";

import type { FeedPage } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useFeed(network: "mainnet" | "testnet") {
  const { status } = useSession();
  const [pages, setPages] = React.useState<Partial<Record<string, FeedPage>>>({});
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [stale, setStale] = React.useState(false);
  const account = status === "account";
  const page = pages[network];

  const refresh = React.useCallback(async () => {
    if (!account) {
      setState("ready");
      return;
    }
    try {
      const next = await api.activityFeed.list(network);
      setPages((current) => ({ ...current, [network]: next }));
      setState("ready");
      setStale(false);
    } catch {
      setState("error");
      setStale(true);
    }
  }, [account, network]);

  return {
    items: page?.items ?? [],
    needsYou: page?.needsYou ?? 0,
    more: page?.more ?? false,
    status: page ? "ready" : state,
    stale: Boolean(page) && stale,
    refresh,
    account,
  } as const;
}
