// The agent's feed on the device (D37 "watch it work"): GET /feed for the active network, shared by Home and Activity
// (one cache per network, so switching tabs shows the last read at once and never relabels the other network's rows).
// A failed refresh keeps the last good feed and marks it stale with its time; it is read again when the screen comes
// back into view, every few seconds while a run is live or a row is still in flight, and quietly otherwise.
import { useFocusEffect } from "expo-router";
import * as React from "react";

import type { AgentFeed, AgentFeedItem } from "@kawase/api-client";

import { diagnose, type Diagnosis } from "@/components/kit";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

type Network = "mainnet" | "testnet";

/** While something moves (a live run, a row in flight): read again this often. */
const LIVE_POLL_MS = 4_000;
/** At rest: the countdowns and new automation runs still arrive. */
const REST_POLL_MS = 30_000;

type Entry = { feed: AgentFeed; at: number };
const cache = new Map<Network, Entry>();
const listeners = new Set<() => void>();
const readers = new Set<() => Promise<void>>();
const publish = () => listeners.forEach((listener) => listener());

/** Rows still moving on the chain, which keep the feed reading fast. */
const inFlight = (feed: AgentFeed | undefined) => Boolean(feed?.groups.some((group) => group.items.some((item) => item.outcome === "in_flight")));

export type AgentFeedState = {
  feed: AgentFeed | undefined;
  /** The first read has not answered yet (no cached feed to show). */
  loading: boolean;
  /** The last read failed: what is shown is from `asOf`. */
  error: Diagnosis | null;
  asOf: number | undefined;
  refresh: () => Promise<void>;
  /** A guest has no feed: Home shows markets and the composer instead. */
  guest: boolean;
};

export function useAgentFeed(options: { live?: boolean } = {}): AgentFeedState {
  const { status, user } = useSession();
  const network: Network = user?.activeNetwork ?? "testnet";
  const account = status === "account";
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  const [error, setError] = React.useState<Diagnosis | null>(null);
  const [reading, setReading] = React.useState(false);

  React.useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!account) return;
    setReading(true);
    try {
      const feed = await api.feed.get(network);
      cache.set(network, { feed, at: Date.now() });
      setError(null);
      publish();
    } catch (failure) {
      setError(diagnose(failure));
    } finally {
      setReading(false);
    }
  }, [account, network]);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  React.useEffect(() => {
    readers.add(refresh);
    return () => {
      readers.delete(refresh);
    };
  }, [refresh]);

  const entry = account ? cache.get(network) : undefined;
  const fast = options.live === true || inFlight(entry?.feed);
  React.useEffect(() => {
    if (!account) return undefined;
    const timer = setInterval(() => void refresh(), fast ? LIVE_POLL_MS : REST_POLL_MS);
    return () => clearInterval(timer);
  }, [account, fast, refresh]);

  return {
    feed: entry?.feed,
    loading: account && !entry && (reading || error === null),
    error,
    asOf: entry?.at,
    refresh,
    guest: !account,
  };
}

/** Ask every mounted feed to read again (a run just ended, a fix just landed). */
export function invalidateAgentFeed() {
  readers.forEach((read) => void read());
}

/** Every row of the feed, in the feed's own group order, as one list. */
export const allRows = (feed: AgentFeed | undefined): AgentFeedItem[] => feed?.groups.flatMap((group) => group.items) ?? [];
