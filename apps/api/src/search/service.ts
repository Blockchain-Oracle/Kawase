// Search across all of a person's conversations (cards/agent-business.md: "search across all threads"): Postgres
// full-text search ('simple' configuration, every language) over each message's words, the cards it showed and their
// inputs (`thread_messages.search_text`, migration 0072), with a substring match for scripts the word parser does not
// split (中文) and for partial words; titles count too. Results are grouped per conversation, best match first.
import { sql } from "drizzle-orm";

import type { Db } from "@kawase/db";
import type { HistoryHit, HistorySearchOutput } from "@kawase/api-client";

export const QUERY_MAX = 100;
/** Messages read before grouping, and conversations returned. */
const ROWS = 80;
const HITS_DEFAULT = 20;
/** Characters of context on each side of the match. */
const SNIPPET_SIDE = 60;
const SNIPPET_AFTER = 120;

/** `%` and `_` are literal in what the person typed. */
const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** The words around the first place the query (or one of its words) appears. */
export function snippetOf(text: string, query: string): string {
  const lower = text.toLowerCase();
  const needles = [query.toLowerCase(), ...query.toLowerCase().split(/\s+/)].filter(Boolean);
  const at = needles.map((needle) => lower.indexOf(needle)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, at - SNIPPET_SIDE);
  const end = Math.min(text.length, at + SNIPPET_AFTER);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

type Row = {
  thread_id: string;
  message_id: string | null;
  role: "user" | "assistant" | null;
  at: Date | string;
  text: string;
  parts: unknown;
  title: string | null;
  network: "mainnet" | "testnet";
  last_message_at: Date | string;
  rank: number;
};

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

/** The words a person saw in the message; the searchable text also holds card names and inputs. */
function shown(row: Row, query: string): string {
  const parts = Array.isArray(row.parts) ? (row.parts as { type?: string; text?: string }[]) : [];
  const words = parts.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join(" ");
  const lower = words.toLowerCase();
  const found = [query, ...query.split(/\s+/)].some((needle) => needle && lower.includes(needle.toLowerCase()));
  return snippetOf(found || !row.text ? words || row.text : row.text, query);
}

export class SearchService {
  constructor(private readonly db: Db) {}

  async search(userId: string, raw: string, limit = HITS_DEFAULT): Promise<HistorySearchOutput> {
    const query = raw.trim().slice(0, QUERY_MAX);
    if (!query) return { query, hits: [] };
    const pattern = likePattern(query);
    const result = await this.db.execute<Row>(sql`
      with q as (select websearch_to_tsquery('simple', ${query}) as tsq)
      select m.thread_id, m.id as message_id, m.role, m.created_at as at, m.search_text as text, m.parts,
             t.title, t.network, t.last_message_at,
             ts_rank(to_tsvector('simple', m.search_text), q.tsq) + case when m.search_text ilike ${pattern} then 0.5 else 0 end as rank
      from thread_messages m
      join threads t on t.id = m.thread_id, q
      where m.user_id = ${userId}
        and (to_tsvector('simple', m.search_text) @@ q.tsq or m.search_text ilike ${pattern})
      union all
      select t.id, null, null, t.last_message_at, coalesce(t.title, ''), null, t.title, t.network, t.last_message_at, 1.0
      from threads t
      where t.user_id = ${userId} and t.title ilike ${pattern}
      order by rank desc, at desc
      limit ${ROWS}
    `);
    const byThread = new Map<string, HistoryHit>();
    for (const row of result.rows) {
      const known = byThread.get(row.thread_id);
      if (known) {
        if (row.message_id) known.matches += 1;
        // A title match alone is replaced by the first message that matches.
        if (!known.messageId && row.message_id) Object.assign(known, { messageId: row.message_id, role: row.role, at: iso(row.at), snippet: shown(row, query) });
        continue;
      }
      byThread.set(row.thread_id, {
        threadId: row.thread_id,
        title: row.title,
        network: row.network,
        lastMessageAt: iso(row.last_message_at),
        messageId: row.message_id,
        role: row.role,
        at: iso(row.at),
        snippet: shown(row, query),
        matches: row.message_id ? 1 : 0,
      });
    }
    return { query, hits: [...byThread.values()].slice(0, limit) };
  }
}
