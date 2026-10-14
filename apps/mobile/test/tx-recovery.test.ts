import assert from "node:assert/strict";
import { test } from "node:test";

import type { IntentReading, JournalEntry, RecoveryNote } from "../src/components/tx/journal-types";
import { createRecoveryReader } from "../src/components/tx/recovery";

const SEVERAL_POLLS_MS = 5;
const READ_TWICE = 2;

const entry = (id: string): JournalEntry => ({
  id,
  owner: "0x1",
  what: `Send ${id}`,
  kind: "send",
  network: "testnet",
  sentAt: 0,
});

/** A tiny journal and a check whose answers the test releases by hand. */
function harness() {
  let journal = [entry("a"), entry("b")];
  const notes: RecoveryNote[] = [];
  const asked: string[] = [];
  const waiting = new Map<string, (reading: IntentReading) => void>();
  const reader = createRecoveryReader({
    check: (e) => {
      asked.push(e.id);
      return new Promise((resolve) => waiting.set(e.id, resolve));
    },
    onNote: (note) => notes.push(note),
    has: (id) => journal.some((e) => e.id === id),
    forget: (id) => {
      journal = journal.filter((e) => e.id !== id);
      // A journal write re-syncs the reader, as the hook's effect does on every version bump.
      reader.sync(journal);
    },
    unseenOf: () => "closed",
    pollMs: 1,
    maxPolls: 3,
  });
  const answer = async (id: string, reading: IntentReading) => {
    const resolve = waiting.get(id);
    assert.ok(resolve, `no read out for ${id}`);
    waiting.delete(id);
    resolve(reading);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { reader, notes, asked, answer, waiting, journal: () => journal };
}

test("two stale intents: the first settling does not drop the second's read", async () => {
  const h = harness();
  h.reader.sync(h.journal());
  assert.deepEqual(h.asked, ["a", "b"]);
  await h.answer("a", "settled");
  // The write that forgot "a" re-synced the reader; "b" was not asked twice, and its read still counts.
  assert.deepEqual(h.asked, ["a", "b"]);
  await h.answer("b", "failed");
  assert.deepEqual(
    h.notes.map((n) => [n.entry.id, n.outcome]),
    [
      ["a", "settled"],
      ["b", "failed"],
    ],
  );
  assert.equal(h.journal().length, 0);
});

test("an unrelated journal write does not stop a pending intent's polling", async () => {
  const h = harness();
  h.reader.sync(h.journal());
  await h.answer("a", "pending");
  h.reader.sync([...h.journal()]); // a noteTxHash or answerLost elsewhere
  await new Promise((r) => setTimeout(r, SEVERAL_POLLS_MS));
  assert.equal(h.asked.filter((id) => id === "a").length, READ_TWICE);
  await h.answer("a", "settled");
  assert.deepEqual(
    h.notes.map((n) => n.entry.id),
    ["a"],
  );
});

test("an unreadable intent stays until recheck, which reads it again; disposing drops late answers", async () => {
  const h = harness();
  h.reader.sync(h.journal());
  await h.answer("a", "unreadable");
  h.reader.sync(h.journal());
  assert.equal(h.asked.filter((id) => id === "a").length, 1);
  h.reader.recheck();
  assert.equal(h.asked.filter((id) => id === "a").length, READ_TWICE);
  h.reader.dispose();
  await h.answer("a", "settled");
  await h.answer("b", "settled");
  assert.equal(h.notes.length, 0);
});

test("this run's own intent is not read while its flow is in flight, and is read once its answer is lost", async () => {
  const lost = new Set<string>();
  const asked: string[] = [];
  const notes: RecoveryNote[] = [];
  const own = { ...entry("c"), sentAt: Date.now() };
  let journal = [own];
  const reader = createRecoveryReader({
    check: async (e) => {
      asked.push(e.id);
      return "settled";
    },
    onNote: (note) => notes.push(note),
    has: (id) => journal.some((e) => e.id === id),
    forget: (id) => {
      journal = journal.filter((e) => e.id !== id);
    },
    unseenOf: (e) => (lost.has(e.id) ? "lost" : null),
    pollMs: 1,
    maxPolls: 3,
  });
  reader.sync(journal);
  assert.deepEqual(asked, []);
  lost.add("c");
  reader.sync(journal);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, ["c"]);
  assert.deepEqual(
    notes.map((n) => [n.entry.id, n.unseen]),
    [["c", "lost"]],
  );
});
