// The agent's intelligence layer (A5): memory, history search, proactive suggestions, Arc knowledge and the extra
// generative cards. Client-safe shapes shared by the api, the server-only agent package and the app.
import type { AgentNetwork } from "./agent-types";

/** One remembered fact, as Settings → Memory lists it. */
export type MemoryFact = {
  id: string;
  fact: string;
  /** The conversation it was remembered in (null: added in Settings, or that conversation was deleted). */
  sourceThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type MemoryView = { enabled: boolean; facts: MemoryFact[] };

/** What remember_fact and forget_fact return (the chat's memory card). */
export type MemoryToolOutput =
  | { status: "saved"; fact: MemoryFact; updated: boolean }
  | { status: "forgotten"; fact: Pick<MemoryFact, "id" | "fact"> }
  | { status: "not_found" }
  | { status: "memory_off" }
  | { status: "full"; limit: number }
  | { status: "refused"; reason: "not_from_person" | "address_not_typed" | "too_long" };

/** A fact the agent relied on in a reply, attached to that reply's metadata (the "From memory" line). */
export type MemoryUsed = { id: string; fact: string };

/** The metadata Kawase attaches to an assistant message. */
export type AgentMessageMetadata = { memoryUsed?: MemoryUsed[] | undefined };

/** A conversation that matches a search, with the best-matching words around the match. */
export type HistoryHit = {
  threadId: string;
  title: string | null;
  network: AgentNetwork;
  lastMessageAt: string;
  /** The matching message: who wrote it, when, and the words around the match. */
  messageId: string | null;
  role: "user" | "assistant" | null;
  at: string;
  snippet: string;
  /** How many messages in that conversation match. */
  matches: number;
};

/** What search_history returns (the chat's search card). */
export type HistorySearchOutput = { query: string; hits: HistoryHit[] };

/** The kinds of "For you" suggestion (cards/agent-business.md, Proactive suggestions). */
export const SUGGESTION_KINDS = ["idle_cash", "expiring_request", "stuck_bridge", "health_drop", "big_move"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/**
 * A suggestion's one action: open chat with the kind's prompt prefilled (the app words it in the person's language
 * from the facts), open a screen, or share a link.
 */
export type SuggestionAction =
  | { type: "chat" }
  | { type: "thread"; threadId: string }
  | { type: "route"; path: string }
  | { type: "share"; url: string };

/**
 * One proactive card. `facts` are display values the app puts into the kind's sentence (amount, asset, apy, vault,
 * chain, change…), already formatted; the id is stable for the same situation, so a dismissal holds.
 */
export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  network: AgentNetwork;
  facts: Record<string, string>;
  action: SuggestionAction;
  /** Higher first. */
  priority: number;
};

export type SuggestionsView = { network: AgentNetwork; suggestions: Suggestion[]; muted: SuggestionKind[] };

export type { AgentNetwork };

/** The client's `call`, as the factory below receives it. */
type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

/** The intelligence routes, spread into the api client. */
export function intelligenceApi(call: Call) {
  return {
    memory: {
      /** Every fact and whether memory is on. */
      get: () => call<MemoryView>("GET", "/memory"),
      setEnabled: (enabled: boolean) => call<MemoryView>("PUT", "/memory/settings", { enabled }),
      add: (fact: string) => call<{ fact: MemoryFact }>("POST", "/memory/facts", { fact }),
      edit: (id: string, fact: string) => call<{ fact: MemoryFact }>("PATCH", `/memory/facts/${id}`, { fact }),
      forget: (id: string) => call<void>("DELETE", `/memory/facts/${id}`),
      forgetAll: () => call<void>("DELETE", "/memory/facts"),
    },
    /** Every conversation's words, the cards they showed and what those were asked, searched on the server. */
    search: (query: string) => call<HistorySearchOutput>("GET", `/search?q=${encodeURIComponent(query)}`),
    suggestions: {
      /** Home's "For you": computed now from holdings, positions and events on the active network. */
      list: () => call<SuggestionsView>("GET", "/suggestions"),
      dismiss: (id: string) => call<void>("POST", `/suggestions/${encodeURIComponent(id)}/dismiss`, {}),
      /** "Don't show this kind" (and back). */
      mute: (kind: SuggestionKind, muted: boolean) => call<{ muted: SuggestionKind[] }>("PUT", `/suggestions/kinds/${kind}`, { muted }),
    },
  };
}
