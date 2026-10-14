/**
 * The intent journal (Senryo's `intent-journal.ts` and recovery, generalised from trades to every money action): each
 * signed intent is written here after the signature and before the send, and taken out once its status settles. What is
 * left after a kill, a reload or a lost answer is read again on the next launch (`useIntentRecovery`): unknown, then
 * checking, then settled or refused. Checking only READS the status by id; nothing is ever sent twice, which is the
 * rule behind "it survives a kill and never resends". Kept in memory and mirrored to device storage; the sync reads the
 * kit needs come from memory, hydrated once at launch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export type IntentKind = "send" | "swap" | "bridge" | "earn" | "buy" | "trade" | "service" | "other";
export type JournalNetwork = "mainnet" | "testnet";

/** What the flow knows about an action before it is signed. */
export interface JournalMark {
  /** In words, for the recovery message: "Swap 2 USDC to EURC", "Send 5 USDC to Ada". */
  what: string;
  kind: IntentKind;
  network: JournalNetwork;
}

export interface JournalEntry extends JournalMark {
  /** The intent's id or digest: what the status is read by. */
  id: string;
  /** Lower-case wallet address. */
  owner: string;
  sentAt: number;
  txHash?: string;
}

const KEY = "kawase.intents.v1";
const MAX_ENTRIES = 20;
/** An intent's deadline is minutes; a day covers any launch gap worth telling about. */
const MAX_AGE_MS = 86_400_000;
const SERVER_ERROR = 500;

let entries: JournalEntry[] = [];
let hydrating: Promise<void> | undefined;
let version = 0;
const listeners = new Set<() => void>();
const lost = new Set<string>();

const valid = (e: unknown): e is JournalEntry =>
  typeof e === "object" &&
  e !== null &&
  typeof (e as JournalEntry).id === "string" &&
  typeof (e as JournalEntry).sentAt === "number" &&
  Date.now() - (e as JournalEntry).sentAt < MAX_AGE_MS;

const bump = () => {
  version += 1;
  for (const listener of listeners) listener();
};

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))).catch(() => undefined);
}

/** Reads the stored journal into memory once (at launch). Reading never throws; a damaged store is an empty journal. */
export function hydrateJournal(): Promise<void> {
  hydrating ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const stored = Array.isArray(parsed) ? parsed.filter(valid) : [];
      // Anything written before the read finished stays; stored entries fill in around it.
      const have = new Set(entries.map((e) => e.id));
      entries = [...stored.filter((e) => !have.has(e.id)), ...entries];
      bump();
    })
    .catch(() => undefined);
  return hydrating;
}

export function subscribeJournal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const journalVersion = (): number => version;

/** Written before the send: an action the device signed is never forgotten by a crash between the two. */
export function journalIntent(entry: JournalEntry): void {
  entries = [...entries.filter((e) => e.id !== entry.id), entry].slice(-MAX_ENTRIES);
  persist();
  bump();
}

export function forgetIntent(id: string): void {
  if (!entries.some((e) => e.id === id)) return;
  entries = entries.filter((e) => e.id !== id);
  lost.delete(id);
  persist();
  bump();
}

/** The hash of the transaction once it is known, so recovery can read the chain as well as the status. */
export function noteTxHash(id: string, txHash: string): void {
  if (!entries.some((e) => e.id === id)) return;
  entries = entries.map((e) => (e.id === id ? { ...e, txHash } : e));
  persist();
  bump();
}

export function intentsOf(network: JournalNetwork, owner: string): JournalEntry[] {
  const who = owner.toLowerCase();
  return entries.filter((e) => e.network === network && e.owner === who);
}

/** The send's answer was lost in this run (the network, or the server failing mid-way): recovery speaks for it. */
export function answerLost(id: string): void {
  lost.add(id);
  bump();
}

export const wasLost = (id: string): boolean => lost.has(id);

/** A 4xx answer names why the server refused: the intent did not go through, so the journal lets go of it. */
const refusedBy = (error: unknown): boolean => {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" && status >= 400 && status < SERVER_ERROR;
};

/**
 * Sends a signed intent with the journal around it: written before the send; a server that answers (taken, or refused in
 * words with a 4xx) settles what the journal needs to say, a refusal taking it out; an answer lost on the way (the
 * network, a 5xx) leaves it for recovery and returns null.
 */
export async function sendJournalled<T>(mark: JournalMark, id: string, owner: string, send: () => Promise<T>): Promise<T | null> {
  journalIntent({ ...mark, id, owner: owner.toLowerCase(), sentAt: Date.now() });
  try {
    return await send();
  } catch (error) {
    if (refusedBy(error)) {
      forgetIntent(id);
      throw error;
    }
    answerLost(id);
    return null;
  }
}

// ── Recovery ───────────────────────────────────────────────────────────────────────────────────────────────

const LAUNCHED_AT = Date.now();
const POLL_MS = 5000;
const MAX_POLLS = 24;

/** What reading an intent's status said. "pending" is read again; the rest end it. */
export type IntentReading = "settled" | "failed" | "missing" | "pending" | "unreadable";

export type RecoveryNote = {
  entry: JournalEntry;
  outcome: Exclude<IntentReading, "pending">;
  /** Why this device did not see it: the app was closed, or only the answer was lost on the way. */
  unseen: "closed" | "lost";
};

/**
 * Reads, once per launch and then every few seconds, each journalled intent whose ending this device did not see (from
 * before this launch, or whose answer was lost in this run). `check` is the app's own read of an intent's status by id
 * (it must only read). A settled, failed or missing intent leaves the journal and is said once through `onNote`; an
 * unreadable one stays, and the person can ask again with the returned `recheck`. This run's other intents are followed
 * quietly (their own flows speak) and leave the journal once they settle.
 */
export function useIntentRecovery(options: {
  network: JournalNetwork;
  owner: string | undefined;
  check: (entry: JournalEntry) => Promise<IntentReading>;
  onNote: (note: RecoveryNote) => void;
}): { pending: readonly JournalEntry[]; recheck: () => void } {
  const { network, owner, check, onNote } = options;
  const current = useSyncExternalStore(subscribeJournal, journalVersion, journalVersion);
  const open = useMemo(() => (owner ? intentsOf(network, owner) : []), [network, owner, current]);
  const said = useRef(new Set<string>());
  const polls = useRef(new Map<string, number>());
  const latest = useRef({ check, onNote });
  latest.current = { check, onNote };
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void hydrateJournal();
  }, []);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const read = async (entry: JournalEntry) => {
      const count = (polls.current.get(entry.id) ?? 0) + 1;
      polls.current.set(entry.id, count);
      let reading: IntentReading;
      try {
        reading = await latest.current.check(entry);
      } catch {
        reading = "unreadable";
      }
      if (!alive) return;
      if (reading === "pending" && count < MAX_POLLS) {
        timers.push(setTimeout(() => void read(entry), POLL_MS));
        return;
      }
      if (reading === "pending" || reading === "unreadable") return;
      forgetIntent(entry.id);
      const unseen = entry.sentAt < LAUNCHED_AT ? "closed" : wasLost(entry.id) ? "lost" : null;
      if (unseen && !said.current.has(entry.id)) {
        said.current.add(entry.id);
        latest.current.onNote({ entry, outcome: reading, unseen });
      }
    };
    for (const entry of open) if (!polls.current.has(entry.id)) void read(entry);
    return () => {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [open, tick]);

  const recheck = () => {
    polls.current.clear();
    setTick((n) => n + 1);
  };
  return { pending: open, recheck };
}
