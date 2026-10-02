// Real PostgreSQL claims: no model/provider calls and no money movement.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { and, asc, eq, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { createDb, threadMessages, threads, threadTurns, users } from "@kawase/db";
import { ConversationStore } from "../src/agent/conversation-store";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const { db, pool } = createDb(process.env.DATABASE_URL!, { poolSize: 4 });
const store = new ConversationStore(db);
const otherProcess = new ConversationStore(db);
const [user] = await db.insert(users).values({}).returning();
after(async () => {
  await db.delete(users).where(eq(users.id, user!.id));
  await pool.end();
});
const message = (id: string, text: string, role: "user" | "assistant" = "user"): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});
async function thread() {
  const id = randomUUID();
  await db.insert(threads).values({ id, userId: user!.id, network: "testnet" });
  return id;
}
const claim = (threadId: string, incoming: UIMessage, surface: "chat" | "voice" = "chat", process = store) =>
  process.claim({ threadId, userId: user!.id, incoming, surface });
const conflict = (code: string) => (error: unknown) => error instanceof Error && error.message === code;
async function kept(threadId: string) {
  return db.select().from(threadMessages).where(eq(threadMessages.threadId, threadId)).orderBy(asc(threadMessages.seq));
}

test("a durable request rejects duplicate and changed delivery before another execution", async () => {
  const id = await thread();
  const asked = message("voice-stable-1", "What is my balance?");
  const turn = await claim(id, asked, "voice");
  await assert.rejects(claim(id, asked, "voice", otherProcess), conflict("turn_in_progress"));
  await assert.rejects(claim(id, message(asked.id, "Send ten"), "voice"), conflict("idempotency_mismatch"));
  await store.finish(turn, [asked, message("answer-1", "Your balance is unavailable.", "assistant")], "completed");
  await assert.rejects(claim(id, asked, "voice", otherProcess), conflict("turn_already_processed"));
  assert.deepEqual(
    (await kept(id)).map((row) => row.id),
    [asked.id, "answer-1"],
  );
});

test("independent chat and voice claimers serialize one thread at the database", async () => {
  const id = await thread();
  const attempts = await Promise.allSettled([
    claim(id, message("typed", "Hello")),
    claim(id, message("spoken", "Hello"), "voice", otherProcess),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  const winner = attempts.find((result) => result.status === "fulfilled");
  assert.equal(winner?.status, "fulfilled");
  if (winner?.status !== "fulfilled") return;
  await store.finish(winner.value, [], "interrupted");
  const next = await claim(id, message("after-stop", "What happened?"), "voice", otherProcess);
  await otherProcess.finish(next, [], "completed");
  assert.equal((await kept(id)).length, 2);
});

test("an interrupted older completion cannot overwrite newer turns or tool results", async () => {
  const id = await thread();
  const first = await claim(id, message("first", "Prepare a payment"));
  const partial: UIMessage = {
    id: "draft-card",
    role: "assistant",
    parts: [{ type: "text", text: "Check the payment card." }],
  };
  await store.finish(first, [first.incoming, partial], "interrupted");
  const second = await claim(id, message("second", "Cancel that draft"));
  const response = message("new-answer", "The draft is dismissed.", "assistant");
  await store.finish(second, [...second.history, second.incoming, response], "completed");
  await store.finish(first, [message("draft-card", "Stale answer", "assistant")], "completed");
  const rows = await kept(id);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["first", "draft-card", "second", "new-answer"],
  );
  assert.deepEqual(rows[1]!.parts, partial.parts);
  const turns = await db.select().from(threadTurns).where(eq(threadTurns.threadId, id));
  assert.equal(turns.find((turn) => turn.id === first.id)?.status, "interrupted");
});

test("client-tool continuations must update the latest assistant and deduplicate their contents", async () => {
  const id = await thread();
  const first = await claim(id, message("ask", "Prepare a payment"));
  const card = message("card", "Waiting for your card tap", "assistant");
  await store.finish(first, [first.incoming, card], "completed");
  const accepted = message("card", "Card tapped", "assistant");
  const continuation = await claim(id, accepted);
  await store.finish(
    continuation,
    [first.incoming, accepted, message("receipt", "Checking submission", "assistant")],
    "completed",
  );
  await assert.rejects(claim(id, accepted), conflict("turn_already_processed"));
  await assert.rejects(claim(id, message("card", "Another result", "assistant")), conflict("intent_stale"));
  const rows = await kept(id);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["ask", "card", "receipt"],
  );
  assert.deepEqual(rows[1]!.parts, accepted.parts);
});

test("another account cannot claim a thread", async () => {
  const id = await thread();
  await assert.rejects(
    store.claim({ threadId: id, userId: randomUUID(), incoming: message("foreign", "Hello"), surface: "voice" }),
    conflict("not_found"),
  );
  assert.equal((await kept(id)).length, 0);
});

test("crash recovery preserves the checkpoint and never reexecutes the abandoned request", async () => {
  const id = await thread();
  const first = await claim(id, message("before-crash", "Prepare a payment"));
  const card: UIMessage = {
    id: "pending-card",
    role: "assistant",
    parts: [
      {
        type: "tool-send",
        toolCallId: "submitted",
        state: "output-available",
        input: {},
        output: { intentId: randomUUID(), status: "checking" },
      },
    ],
  };
  await store.checkpoint(first, card);
  assert.equal(await store.renew(first), true);
  await db
    .update(threadTurns)
    .set({ leaseUntil: sql`now() - interval '1 second'` })
    .where(and(eq(threadTurns.threadId, id), eq(threadTurns.id, first.id)));
  assert.equal(await store.renew(first), false, "expired ownership cannot be revived");
  const next = await claim(id, message("after-crash", "What is pending?"));
  await assert.rejects(claim(id, first.incoming), conflict("turn_already_processed"));
  await store.finish(first, [message(card.id, "Old result", "assistant")], "completed");
  assert.deepEqual((await kept(id)).find((row) => row.id === card.id)?.parts, card.parts);
  await store.finish(next, [], "completed");
});
