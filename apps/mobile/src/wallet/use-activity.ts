// The wallet's money history on one network, from the api (which reads the chain's explorer). Results are kept per
// (account, network), shared by Home and the Activity tab, so switching networks shows that network's own last
// rows — or a skeleton — and never the other network's rows under its header. Every read carries a number; a reply
// that is not the newest for its (account, network) is dropped, so a slow answer cannot overwrite a newer one. A
// failed refresh keeps the rows already shown for that network and marks them stale (Codex review R04). The api reads
// one page; whether older movements exist, and the explorer page that has them all, travel with the rows (R15).
import * as React from "react";

import type { ActivityItem, NetworkId } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type ActivityState = {
  status: "idle" | "loading" | "ready" | "error";
  items: ActivityItem[];
  /** The rows are from an earlier read: the last refresh failed. */
  stale: boolean;
  /** Older movements exist beyond these rows; all of them are at `historyUrl`. */
  more: boolean;
  historyUrl: string | null;
};

type Entry = { items: ActivityItem[]; loaded: boolean; failed: boolean; more: boolean; historyUrl: string | null };

// One copy per (account, network) for the whole app, and the newest read of each.
const entries = new Map<string, Entry>();
const newest = new Map<string, number>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let reads = 0;

const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function read(key: string, network: NetworkId) {
  reads += 1;
  const id = reads;
  newest.set(key, id);
  inFlight.add(key);
  emit();
  try {
    const { items, more, historyUrl } = await api.wallet.activity(network);
    if (newest.get(key) !== id) return;
    // Rows always say which network they belong to; anything else is not shown here.
    entries.set(key, { items: items.filter((item) => item.network === network), loaded: true, failed: false, more: Boolean(more), historyUrl: historyUrl ?? null });
  } catch {
    if (newest.get(key) !== id) return;
    const previous = entries.get(key);
    entries.set(key, { ...(previous ?? { items: [], loaded: false, more: false, historyUrl: null }), failed: true });
  } finally {
    if (newest.get(key) === id) inFlight.delete(key);
    emit();
  }
}

export function useActivity(network: NetworkId) {
  const { status, user, stale } = useSession();
  const key = status === "account" && user ? `${user.id}:${network}` : undefined;
  // The store is read only through useSyncExternalStore's snapshots. The React Compiler memoizes plain reads of
  // module state by their inputs (here `key`), so `entries.get(key)` in render would stay at its first value; a
  // snapshot is re-read by React on every change. Entries are replaced, never mutated, so a snapshot is stable.
  const entry = React.useSyncExternalStore(
    subscribe,
    () => (key ? entries.get(key) : undefined),
    () => undefined,
  );
  const reading = React.useSyncExternalStore(
    subscribe,
    () => (key ? inFlight.has(key) : false),
    () => false,
  );

  const refresh = React.useCallback(async () => {
    if (key) await read(key, network);
  }, [key, network]);

  // Read on mount, on a new account or network, and again when the connection comes back (the session stops being stale).
  React.useEffect(() => {
    if (!stale) void refresh();
  }, [refresh, stale]);

  const none = { items: [], stale: false, more: false, historyUrl: null };
  let state: ActivityState;
  if (!key) state = { status: status === "loading" ? "loading" : "ready", ...none };
  else if (!entry?.loaded) state = { status: entry?.failed && !reading ? "error" : "loading", ...none };
  else state = { status: entry.failed ? "error" : "ready", items: entry.items, stale: entry.failed, more: entry.more, historyUrl: entry.historyUrl };

  return { ...state, network, refresh };
}
