// Home's live run, remembered (the run card survives an app kill): which conversation the composer's last request went
// to, on which network, and when. On a cold start Home reads the thread back from the api and draws the run card from
// what was stored — the intent's own state, read from the api, decides the phase; nothing is asked or sent again.
// A run the person closed, or one older than a day, is not brought back (its receipt is in the feed).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";

type Network = "mainnet" | "testnet";

export type RunPointer = {
  threadId: string;
  network: Network;
  startedAt: number;
  /** Set only on the device that started it, until the first send went out (never restored from storage). */
  prompt?: string | undefined;
};

const KEY = "kawase.home.run.v1";
/** Older than this, a run is history (the feed has it), not something to resume on Home. */
const KEEP_MS = 86_400_000;

type Stored = Partial<Record<Network, Omit<RunPointer, "prompt">>>;

let memory: Stored | undefined;
const listeners = new Set<() => void>();

async function read(): Promise<Stored> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function write(next: Stored) {
  memory = next;
  listeners.forEach((listener) => listener());
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** The run on Home for this network: undefined while storage is read, null when there is none. */
export function useRunPointer(network: Network) {
  const [pointer, setPointer] = React.useState<RunPointer | null | undefined>(undefined);
  const prompts = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    let alive = true;
    const sync = () =>
      void read().then((stored) => {
        if (!alive) return;
        const entry = stored[network];
        const fresh = entry && Date.now() - entry.startedAt < KEEP_MS ? entry : null;
        setPointer(fresh ? { ...fresh, prompt: prompts.current.get(fresh.threadId) } : null);
      });
    sync();
    listeners.add(sync);
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, [network]);

  /** A new run in a new conversation, asking `prompt` first. */
  const start = React.useCallback(
    (threadId: string, prompt: string) => {
      prompts.current.set(threadId, prompt);
      void read().then((stored) => write({ ...stored, [network]: { threadId, network, startedAt: Date.now() } }));
    },
    [network],
  );

  /** The person closed the run (its receipt stays in the feed). */
  const clear = React.useCallback(() => {
    prompts.current.clear();
    void read().then((stored) => {
      const next = { ...stored };
      delete next[network];
      write(next);
    });
  }, [network]);

  /** The first send went out: never ask it again from here. */
  const asked = React.useCallback((threadId: string) => {
    prompts.current.delete(threadId);
  }, []);

  return { pointer, start, clear, asked };
}
