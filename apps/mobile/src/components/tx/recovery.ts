/**
 * The reader behind `useIntentRecovery`, kept free of React and storage so its rules can be tested on their own. It lives
 * as long as the hook is mounted, NOT as long as one journal version: a journal write (an intent settling, a hash being
 * noted, an answer being lost) only tells it which entries are open now. Reads already in flight keep going and are
 * still reported; a poll timer is cancelled only when its entry leaves the journal or the reader is disposed. Every read
 * goes through `check`, which only reads a status by id: nothing is ever sent twice.
 */
import type { IntentReading, JournalEntry, RecoveryNote } from "./journal-types";

export type RecoveryReaderDeps = {
  check: (entry: JournalEntry) => Promise<IntentReading>;
  onNote: (note: RecoveryNote) => void;
  /** Whether the entry is still in the journal (the flow itself may have settled it while the read was out). */
  has: (id: string) => boolean;
  forget: (id: string) => void;
  /** Why this device did not see the ending, or null for this run's own intents (their flows settle them; not read). */
  unseenOf: (entry: JournalEntry) => RecoveryNote["unseen"] | null;
  pollMs: number;
  maxPolls: number;
};

export type RecoveryReader = {
  /** The entries open now; starts a read for each one not being read, cancels the polls of those that left. */
  sync: (open: readonly JournalEntry[]) => void;
  /** Reads every open entry again, the unreadable ones included. */
  recheck: () => void;
  dispose: () => void;
};

export function createRecoveryReader(deps: RecoveryReaderDeps): RecoveryReader {
  let disposed = false;
  let open: readonly JournalEntry[] = [];
  /** Entries with a read in flight or a poll scheduled. */
  const busy = new Set<string>();
  /** Entries whose read ended without settling them (unreadable, or pending past the last poll): read again on recheck. */
  const parked = new Set<string>();
  const counts = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const said = new Set<string>();

  const read = async (entry: JournalEntry): Promise<void> => {
    busy.add(entry.id);
    const count = (counts.get(entry.id) ?? 0) + 1;
    counts.set(entry.id, count);
    let reading: IntentReading;
    try {
      reading = await deps.check(entry);
    } catch {
      reading = "unreadable";
    }
    if (disposed) return;
    if (reading === "pending" && count < deps.maxPolls && deps.has(entry.id)) {
      timers.set(
        entry.id,
        setTimeout(() => {
          timers.delete(entry.id);
          if (disposed || !deps.has(entry.id)) {
            busy.delete(entry.id);
            return;
          }
          // The latest copy: a hash noted since the last read helps the check.
          void read(open.find((e) => e.id === entry.id) ?? entry);
        }, deps.pollMs),
      );
      return;
    }
    busy.delete(entry.id);
    if (reading === "pending" || reading === "unreadable") {
      parked.add(entry.id);
      return;
    }
    // Settled elsewhere while the read was out (the flow's own receipt): it already spoke.
    if (!deps.has(entry.id)) return;
    const unseen = deps.unseenOf(entry);
    deps.forget(entry.id);
    if (unseen && !said.has(entry.id)) {
      said.add(entry.id);
      deps.onNote({ entry, outcome: reading, unseen });
    }
  };

  const sync = (next: readonly JournalEntry[]) => {
    if (disposed) return;
    open = next;
    const ids = new Set(next.map((e) => e.id));
    for (const [id, timer] of timers) {
      if (ids.has(id)) continue;
      clearTimeout(timer);
      timers.delete(id);
      busy.delete(id);
    }
    for (const id of parked) if (!ids.has(id)) parked.delete(id);
    // Only endings this device did not see: this run's own intents are settled by their flows (a read racing the send
    // could find the intent "missing" and drop it from the journal while it is still on its way). Once an answer is
    // lost, the journal write that says so re-syncs and the entry is read from then on.
    for (const entry of next) {
      if (busy.has(entry.id) || parked.has(entry.id) || deps.unseenOf(entry) === null) continue;
      void read(entry);
    }
  };

  return {
    sync,
    recheck: () => {
      parked.clear();
      counts.clear();
      sync(open);
    },
    dispose: () => {
      disposed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
