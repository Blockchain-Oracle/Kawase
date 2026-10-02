// The person's own side of a token page: whether it is starred (the Markets "Watchlist"), their trades' profit and
// loss, and this asset's rows from Activity. Guests have none of it (the star opens sign-in in place).
import * as React from "react";

import type { FeedItem, TokenTradesView } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const ACTIVITY_ROWS = 5;

export function useTokenMine(chainId: number, address: string) {
  const { status, user } = useSession();
  const account = status === "account";
  const [watched, setWatched] = React.useState(false);
  const [trades, setTrades] = React.useState<TokenTradesView | null>(null);
  const [activity, setActivity] = React.useState<FeedItem[]>();

  React.useEffect(() => {
    if (!account) return undefined;
    let live = true;
    void api.tokens
      .mine(chainId, address)
      .then((mine) => {
        if (!live) return;
        setWatched(mine.watched);
        setTrades(mine.trades);
      })
      .catch(() => undefined);
    const network = user?.activeNetwork;
    if (network)
      void api.activityFeed
        .list(network, address)
        .then((page) => live && setActivity(page.items.slice(0, ACTIVITY_ROWS)))
        .catch(() => live && setActivity([]));
    return () => {
      live = false;
    };
  }, [account, chainId, address, user?.activeNetwork]);

  /** Star or unstar; the change shows at once and is undone if the api says no. */
  const toggleWatch = React.useCallback(async () => {
    const next = !watched;
    setWatched(next);
    try {
      await api.tokens.watch(chainId, address, next);
    } catch {
      setWatched(!next);
    }
    return next;
  }, [address, chainId, watched]);

  return { account, watched, toggleWatch, trades, activity };
}
