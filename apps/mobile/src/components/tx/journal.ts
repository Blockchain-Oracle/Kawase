/**
 * The intent journal (Senryo's `intent-journal.ts` and recovery, generalised from trades to every money action): each
 * signed intent is written here after the signature and before the send, and taken out once its status settles. What is
 * left after a kill, a reload or a lost answer is read again on the next launch (`useIntentRecovery`): unknown, then
 * checking, then settled or refused. Checking only READS the status by id; nothing is ever sent twice, which is the
 * rule behind "it survives a kill and never resends". Kept in memory and mirrored to device storage; the sync reads the
 * kit needs come from memory, hydrated once at launch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { isClientRefusal } from "./tx-state";
import type { IntentReading, JournalEntry, JournalMark, JournalNetwork, RecoveryNote } from "./journal-types";
import { createRecoveryReader, type RecoveryReader } from "./recovery";

export type {
  IntentKind,
  IntentReading,
  JournalEntry,
  JournalMark,
  JournalNetwork,
  RecoveryNote,
} from "./journal-types";

const KEY = "kawase.intents.v1";
const MAX_ENTRIES = 20;
/** An intent's deadline is minutes; a day covers any launch gap worth telling about. */
const MAX_AGE_MS = 86_400_000;

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
      const wroteEarly = have.size > 0;
      entries = [...stored.filter((e) => !have.has(e.id)), ...entries].slice(-MAX_ENTRIES);
      // A write before the read finished stored only this run's entries: store the merged journal at once, so a kill
      // now cannot lose the older ones.
      if (wroteEarly) persist();
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

/**
 * Sends a signed intent with the journal around it: written before the send; a server that answers (taken, or refused in
 * words with a 4xx) settles what the journal needs to say, a refusal taking it out; an answer lost on the way (the
 * network, a 5xx) leaves it for recovery and returns null.
 */
export async function sendJournalled<T>(
  mark: JournalMark,
  id: string,
  owner: string,
  send: () => Promise<T>,
): Promise<T | null> {
  journalIntent({ ...mark, id, owner: owner.toLowerCase(), sentAt: Date.now() });
  try {
    return await send();
  } catch (error) {
    if (isClientRefusal(error)) {
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

const inJournal = (id: string): boolean => entries.some((e) => e.id === id);
const unseenOf = (entry: JournalEntry): RecoveryNote["unseen"] | null =>
  entry.sentAt < LAUNCHED_AT ? "closed" : wasLost(entry.id) ? "lost" : null;

/**
 * Reads, once per launch and then every few seconds, each journalled intent whose ending this device did not see (from
 * before this launch, or whose answer was lost in this run). `check` is the app's own read of an intent's status by id
 * (it must only read). A settled, failed or missing intent leaves the journal and is said once through `onNote`; an
 * unreadable one stays, and the person can ask again with the returned `recheck`. This run's other intents are left to
 * their own flows, which take them out of the journal when they settle, until an answer is lost. The reader outlives journal writes (see
 * `recovery.ts`): a write while a read is out never drops that read.
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
  const latest = useRef({ check, onNote });
  latest.current = { check, onNote };
  const reader = useRef<RecoveryReader | null>(null);

  useEffect(() => {
    void hydrateJournal();
  }, []);

  // One reader per mount; journal writes only re-sync it.
  useEffect(() => {
    const created = createRecoveryReader({
      check: (entry) => latest.current.check(entry),
      onNote: (note) => latest.current.onNote(note),
      has: inJournal,
      forget: forgetIntent,
      unseenOf,
      pollMs: POLL_MS,
      maxPolls: MAX_POLLS,
    });
    reader.current = created;
    return () => {
      created.dispose();
      if (reader.current === created) reader.current = null;
    };
  }, []);

  useEffect(() => {
    reader.current?.sync(open);
  }, [open]);

  const recheck = () => reader.current?.recheck();
  return { pending: open, recheck };
}
