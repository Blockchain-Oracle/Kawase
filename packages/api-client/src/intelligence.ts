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
  };
}
