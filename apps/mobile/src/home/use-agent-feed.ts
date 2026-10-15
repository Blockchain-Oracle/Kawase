// The agent's feed on the device (D37 "watch it work"): GET /feed for the active network, shared by Home and Activity
// (one cache per network, so switching tabs shows the last read at once and never relabels the other network's rows).
// A failed refresh keeps the last good feed and marks it stale with its time; it is read again when the screen comes
// back into view, every few seconds while a run is live or a row is still in flight, and quietly otherwise.
// A cold open (the app started, the page reloaded) shows the last feed this device read for this account and network
// at once, from AsyncStorage, while the fresh read (1–4 s: the explorer and the suggestions) lands over it.
import AsyncStorage from "@react-native-async-storage/async-storage";
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
const inFlight = (feed: AgentFeed | undefined) =>
  Boolean(feed?.groups.some((group) => group.items.some((item) => item.outcome === "in_flight")));

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

const inflight = new Map<Network, Promise<AgentFeed>>();

const storageKey = (userId: string, network: Network) => `kawase.feed.${userId}.${network}`;
const restored = new Set<string>();

/** The last feed this device saw, once per account and network, unless a fresh one is already here. */
async function restore(userId: string, network: Network) {
  const key = storageKey(userId, network);
  if (restored.has(key)) return;
  restored.add(key);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw || cache.has(network)) return;
    const saved = JSON.parse(raw) as Entry;
    if (saved?.feed?.groups) {
      cache.set(network, saved);
      publish();
    }
  } catch {
    // Nothing saved, or unreadable: the read shows its skeleton as before.
  }
}

/** What the person may take off the feed: a held proposal (it is cancelled) or a found suggestion. Done money stays. */
export const dismissible = (item: AgentFeedItem) => item.source === "proposal" || item.source === "suggestion";

/**
 * Takes an item off every cached feed at once (Home and Activity both), then tells the api; a refusal (it ran in the
 * meantime, or the network failed) puts it back. Returns whether it went.
 */
export async function dismissFeedItem(item: AgentFeedItem): Promise<boolean> {
  const before = new Map(cache);
  for (const [network, entry] of cache) {
    const groups = entry.feed.groups.map((group) => {
      const items = group.items.filter((entry) => entry.id !== item.id);
      return items.length === group.items.length ? group : { ...group, items, count: Math.max(0, group.count - 1) };
    });
    cache.set(network, { ...entry, feed: { ...entry.feed, groups } });
  }
  publish();
  try {
    await api.feed.dismiss(item.id);
    return true;
  } catch {
    for (const [network, entry] of before) cache.set(network, entry);
    publish();
    return false;
  }
}

/** The api answered without the wallet history (that source was slow): its read goes on and lands in seconds. */
const lostHistory = (feed: AgentFeed): boolean => feed.partial.includes("activity");

export function useAgentFeed(options: { live?: boolean } = {}): AgentFeedState {
  const { status, user } = useSession();
  const network: Network = user?.activeNetwork ?? "testnet";
  const account = status === "account";
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  const [error, setError] = React.useState<Diagnosis | null>(null);
  const [reading, setReading] = React.useState(false);

  const userId = account ? user?.id : undefined;
  React.useEffect(() => {
    if (userId) void restore(userId, network);
  }, [userId, network]);

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
      // Home and Activity are both mounted and poll on the same clock: a read already on its way is shared, not sent
      // twice (the api saw two identical /feed calls every 30 s per person).
      let read = inflight.get(network);
      if (!read) {
        read = api.feed.get(network).finally(() => inflight.delete(network));
        inflight.set(network, read);
      }
      const feed = await read;
      // A read whose wallet history timed out (the api names it partial and keeps reading) must not wipe the rows the
      // last full read showed: those stay, and the fast poll below picks up the full answer seconds later.
      const previous = cache.get(network);
      if (!(lostHistory(feed) && previous && !lostHistory(previous.feed))) {
        const entry = { feed, at: Date.now() };
        cache.set(network, entry);
        if (user?.id) void AsyncStorage.setItem(storageKey(user.id, network), JSON.stringify(entry)).catch(() => undefined);
      }
      setError(null);
      publish();
    } catch (failure) {
      setError(diagnose(failure));
    } finally {
      setReading(false);
    }
  }, [account, network, user?.id]);

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
  // Live while a run moves, and while the history is still being read (the api fills its cache within seconds).
  const fast = options.live === true || inFlight(entry?.feed) || (entry !== undefined && lostHistory(entry.feed));
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
export const allRows = (feed: AgentFeed | undefined): AgentFeedItem[] =>
  feed?.groups.flatMap((group) => group.items) ?? [];
