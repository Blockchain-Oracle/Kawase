import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { threadMessages, threads, threadTurns, type Db } from "@kawase/db";
import { HTTP, problem } from "../http/problem";

export type TurnClaim = { threadId: string; id: string; userId: string; incoming: UIMessage; history: UIMessage[] };

/** Short row-lock transactions serialize claims and commits; no DB connection is held during model generation. */
export class ConversationStore {
  constructor(private readonly db: Db) {}

  async claim(input: {
    threadId: string;
    userId: string;
    incoming: UIMessage;
    surface: "chat" | "voice";
  }): Promise<TurnClaim> {
    const hash = createHash("sha256")
      .update(JSON.stringify({ role: input.incoming.role, parts: input.incoming.parts }))
      .digest("hex");
    // Client-tool continuations update the last assistant message. Each distinct continuation has its own claim.
    const id = input.incoming.role === "assistant" ? `${input.incoming.id}:${hash}` : input.incoming.id;
    return this.db.transaction(async (tx) => {
      const [thread] = await tx.select().from(threads).where(eq(threads.id, input.threadId)).for("update");
      if (!thread || thread.userId !== input.userId) throw problem(HTTP.notFound, "not_found");
      // Only release an abandoned claim. Its identity stays committed, so it can never execute again.
      await tx
        .update(threadTurns)
        .set({ status: "interrupted", finishedAt: new Date() })
        .where(
          and(
            eq(threadTurns.threadId, input.threadId),
            eq(threadTurns.status, "running"),
            sql`${threadTurns.leaseUntil} <= now()`,
          ),
        );
      const [previous] = await tx
        .select()
        .from(threadTurns)
        .where(and(eq(threadTurns.threadId, input.threadId), eq(threadTurns.id, id)));
      if (previous) {
        if (previous.inputHash !== hash) throw problem(HTTP.conflict, "idempotency_mismatch");
        throw problem(HTTP.conflict, previous.status === "running" ? "turn_in_progress" : "turn_already_processed");
      }
      const [running] = await tx
        .select()
        .from(threadTurns)
        .where(and(eq(threadTurns.threadId, input.threadId), eq(threadTurns.status, "running")));
      if (running) throw problem(HTTP.conflict, "turn_in_progress");
      const rows = await tx
        .select()
        .from(threadMessages)
        .where(eq(threadMessages.threadId, input.threadId))
        .orderBy(asc(threadMessages.seq));
      const history = rows.map((row) => ({
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: row.parts as UIMessage["parts"],
        ...(row.metadata ? { metadata: row.metadata } : {}),
      }));
      const last = rows.at(-1);
      if (input.incoming.role === "assistant" && (last?.role !== "assistant" || last.id !== input.incoming.id))
        throw problem(HTTP.conflict, "intent_stale");
      if (input.incoming.role === "user" && rows.some((row) => row.id === input.incoming.id))
        throw problem(HTTP.conflict, "turn_already_processed");
      await tx
        .insert(threadTurns)
        .values({
          threadId: input.threadId,
          id,
          userId: input.userId,
          inputHash: hash,
          surface: input.surface,
          status: "running",
        });
      await tx
        .insert(threadMessages)
        .values({
          threadId: input.threadId,
          userId: input.userId,
          id: input.incoming.id,
          seq: input.incoming.role === "assistant" ? last!.seq : (last?.seq ?? -1) + 1,
          role: input.incoming.role,
          parts: input.incoming.parts,
          metadata: input.incoming.metadata,
        })
        .onConflictDoUpdate({
          target: [threadMessages.threadId, threadMessages.id],
          set: { parts: input.incoming.parts, metadata: input.incoming.metadata },
        });
      return { ...input, id, history };
    });
  }

  async checkpoint(claim: TurnClaim, message: UIMessage) {
    await this.commit(claim, [message]);
  }

  async renew(claim: TurnClaim): Promise<boolean> {
    const rows = await this.db
      .update(threadTurns)
      .set({ leaseUntil: sql`now() + interval '90 seconds'` })
      .where(
        and(
          eq(threadTurns.threadId, claim.threadId),
          eq(threadTurns.id, claim.id),
          eq(threadTurns.status, "running"),
          sql`${threadTurns.leaseUntil} > now()`,
        ),
      )
      .returning({ id: threadTurns.id });
    return rows.length > 0;
  }

  async finish(claim: TurnClaim, messages: UIMessage[], status: "completed" | "interrupted" | "failed") {
    await this.commit(claim, messages, status);
  }

  private async commit(claim: TurnClaim, messages: UIMessage[], status?: "completed" | "interrupted" | "failed") {
    await this.db.transaction(async (tx) => {
      const [thread] = await tx.select().from(threads).where(eq(threads.id, claim.threadId)).for("update");
      if (!thread) return;
      const [turn] = await tx
        .select()
        .from(threadTurns)
        .where(and(eq(threadTurns.threadId, claim.threadId), eq(threadTurns.id, claim.id)));
      if (turn?.status !== "running" || turn.leaseUntil <= new Date()) return;
      const [last] = await tx
        .select({ seq: threadMessages.seq })
        .from(threadMessages)
        .where(eq(threadMessages.threadId, claim.threadId))
        .orderBy(desc(threadMessages.seq))
        .limit(1);
      let next = (last?.seq ?? -1) + 1;
      const original = new Set(claim.history.map((message) => message.id));
      for (const message of messages) {
        if (original.has(message.id) && message.id !== claim.incoming.id) continue;
        await tx
          .insert(threadMessages)
          .values({
            threadId: claim.threadId,
            userId: thread.userId,
            id: message.id,
            seq: next++,
            role: message.role,
            parts: message.parts,
            metadata: message.metadata,
          })
          .onConflictDoUpdate({
            target: [threadMessages.threadId, threadMessages.id],
            set: { parts: message.parts, metadata: message.metadata },
          });
      }
      if (status)
        await tx
          .update(threadTurns)
          .set({ status, finishedAt: new Date() })
          .where(and(eq(threadTurns.threadId, claim.threadId), eq(threadTurns.id, claim.id)));
      await tx.update(threads).set({ lastMessageAt: new Date() }).where(eq(threads.id, claim.threadId));
    });
  }
}
