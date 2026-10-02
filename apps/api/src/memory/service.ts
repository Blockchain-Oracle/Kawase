// Memory (cards/agent-business.md): the facts a person asked Kawase to keep, whether memory is on, and the bounded
// slice the agent reads on each turn. The person owns every fact: Settings → Memory lists, edits and forgets them,
// and off means nothing is read or saved.
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { agentPreferences, memoryFacts, type Db } from "@kawase/db";
import type { MemoryFact, MemoryView } from "@kawase/api-client";

/** One fact stays short: the agent reads all of them on every turn. */
export const FACT_MAX = 200;
/** How many facts a person can keep. */
export const FACTS_LIMIT = 100;
/** What one turn reads: the most recently used or added facts, within a character budget. */
const TURN_FACTS = 30;
const TURN_CHARS = 2_400;

type Row = typeof memoryFacts.$inferSelect;

const view = (row: Row): MemoryFact => ({
  id: row.id,
  fact: row.fact,
  sourceThreadId: row.sourceThreadId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

/** One line, trimmed, inner whitespace collapsed. */
export const cleanFact = (text: string) => text.replace(/\s+/g, " ").trim();

export type RememberResult = { status: "saved"; fact: MemoryFact; updated: boolean } | { status: "memory_off" } | { status: "full"; limit: number };

export class MemoryService {
  constructor(private readonly db: Db) {}

  async enabled(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ enabled: agentPreferences.memoryEnabled }).from(agentPreferences).where(eq(agentPreferences.userId, userId));
    return row?.enabled ?? true;
  }

  async view(userId: string): Promise<MemoryView> {
    const [enabled, rows] = await Promise.all([
      this.enabled(userId),
      this.db.select().from(memoryFacts).where(eq(memoryFacts.userId, userId)).orderBy(desc(memoryFacts.createdAt)),
    ]);
    return { enabled, facts: rows.map(view) };
  }

  async setEnabled(userId: string, enabled: boolean): Promise<MemoryView> {
    await this.db
      .insert(agentPreferences)
      .values({ userId, memoryEnabled: enabled })
      .onConflictDoUpdate({ target: agentPreferences.userId, set: { memoryEnabled: enabled, updatedAt: new Date() } });
    return this.view(userId);
  }

  /**
   * Saves a fact, or refreshes the same one already kept (compared without regard to case). The agent saves only
   * while memory is on; Settings can add one either way (`force`).
   */
  async remember(userId: string, text: string, sourceThreadId: string | null, force = false): Promise<RememberResult> {
    const fact = cleanFact(text).slice(0, FACT_MAX);
    if (!force && !(await this.enabled(userId))) return { status: "memory_off" };
    const [same] = await this.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.userId, userId), eq(sql`lower(${memoryFacts.fact})`, fact.toLowerCase())))
      .limit(1);
    if (same) {
      const [row] = await this.db.update(memoryFacts).set({ updatedAt: new Date() }).where(eq(memoryFacts.id, same.id)).returning();
      return { status: "saved", fact: view(row!), updated: true };
    }
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(memoryFacts)
      .where(eq(memoryFacts.userId, userId));
    if (count >= FACTS_LIMIT) return { status: "full", limit: FACTS_LIMIT };
    const [row] = await this.db.insert(memoryFacts).values({ userId, fact, sourceThreadId }).returning();
    return { status: "saved", fact: view(row!), updated: false };
  }

  async edit(userId: string, id: string, text: string): Promise<MemoryFact | undefined> {
    const fact = cleanFact(text).slice(0, FACT_MAX);
    const [row] = await this.db
      .update(memoryFacts)
      .set({ fact, updatedAt: new Date() })
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId)))
      .returning();
    return row ? view(row) : undefined;
  }

  async forget(userId: string, id: string): Promise<Pick<MemoryFact, "id" | "fact"> | undefined> {
    const [row] = await this.db
      .delete(memoryFacts)
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId)))
      .returning({ id: memoryFacts.id, fact: memoryFacts.fact });
    return row;
  }

  async forgetAll(userId: string): Promise<number> {
    const rows = await this.db.delete(memoryFacts).where(eq(memoryFacts.userId, userId)).returning({ id: memoryFacts.id });
    return rows.length;
  }

  /** The facts one turn reads (none while memory is off): recently used or added first, within a budget. */
  async forTurn(userId: string): Promise<MemoryFact[]> {
    if (!(await this.enabled(userId))) return [];
    const rows = await this.db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.userId, userId))
      .orderBy(sql`greatest(${memoryFacts.lastUsedAt}, ${memoryFacts.updatedAt}) desc`)
      .limit(TURN_FACTS);
    const picked: MemoryFact[] = [];
    let chars = 0;
    for (const row of rows) {
      chars += row.fact.length;
      if (chars > TURN_CHARS) break;
      picked.push(view(row));
    }
    return picked;
  }

  async markUsed(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(memoryFacts)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(memoryFacts.userId, userId), inArray(memoryFacts.id, ids)));
  }
}
