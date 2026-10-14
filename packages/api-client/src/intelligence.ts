// The agent's intelligence layer (A5): memory, history search, proactive suggestions, Arc knowledge and the extra
// generative cards. Client-safe shapes shared by the api, the server-only agent package and the app.
import type { AgentNetwork, SendHold } from "./agent-types";
import type { PaymentRequest, RequestReminder } from "./types";

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
  | { status: "refused"; reason: "not_from_person" | "address_not_typed" | "too_long" }
  /** Not saved yet (H2): it names an @handle the person did not write, or outside content was read first; the card asks. */
  | { status: "confirm"; fact: string; reason: SendHold };

/**
 * What remind_payment returns: the request reminded (its card, with how: in Kawase, already today, or a link to share
 * again), the open requests to choose from when several match, or why none.
 */
export type RemindPaymentOutput =
  | { status: "reminded"; request: PaymentRequest; reminded: RequestReminder; who: string | null }
  | { status: "choose"; requests: { requestId: string; who: string | null; amount: string; note: string | null }[] }
  | { status: "not_found" | "needs_sign_in" };

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
export const SUGGESTION_KINDS = ["idle_cash", "expiring_request", "stuck_bridge", "health_drop", "big_move", "better_route", "trending_token", "service_pick"] as const;
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

/** show_chart: a price or the portfolio over a range, as the chart card draws it (values in US dollars). */
export type ChartRangeId = "1D" | "1W" | "1M" | "1Y";
export type ChartOutput =
  | {
      status: "ready";
      kind: "portfolio" | "token";
      network: AgentNetwork;
      range: ChartRangeId;
      /** "Portfolio", or the token's symbol. */
      title: string;
      /** For a token: what the card needs to fetch other ranges. */
      token?: { chainId: number; address: string; symbol: string; name: string; logoUrl: string | null } | undefined;
      /** Oldest first; `t` is milliseconds since 1970. */
      points: { t: number; v: number }[];
      last: number;
      changePct: number | null;
    }
  | { status: "not_found"; query: string; network: AgentNetwork }
  | { status: "empty"; kind: "portfolio" | "token"; title: string; network: AgentNetwork; range: ChartRangeId };

/** explain_choice: why the agent picked this route, vault or venue, next to what else it asked (R3). */
export type DecisionOption = {
  name: string;
  status: "chosen" | "quoted" | "unavailable";
  /** What the person would get with it, formatted ("19.98 USDC", "4.2% a year"). */
  value: string | null;
  fee: string | null;
  eta: string | null;
  /** Why it was not chosen or could not quote (a code the app words: no_quote, timeout, lower_out, lower_yield…). */
  reason: string | null;
};
export type DecisionView =
  | {
      status: "ready";
      about: "bridge" | "swap" | "earn";
      network: AgentNetwork;
      /** What was decided ("20 USDC to Base", "10 USDC → EURC", "Deposit 50 USDC"). */
      subject: string;
      /** How the winner was picked: most_received, highest_yield. */
      basis: "most_received" | "highest_yield";
      options: DecisionOption[];
      quotedAt: string | null;
    }
  | { status: "none"; about: "bridge" | "swap" | "earn"; network: AgentNetwork };

/** propose_setting_change: one preference, now and after; the card's Apply makes the change on the device. */
export type SettingId = "memory" | "replyLanguage" | "theme";
export type SettingDiff =
  | { status: "proposed"; setting: SettingId; now: string; after: string; reason: string | null }
  | { status: "unchanged"; setting: SettingId; now: string }
  | { status: "needs_sign_in"; setting: SettingId };

/** get_status: whether what Kawase depends on is answering now. */
export type DependencyState = "ok" | "slow" | "down";
export type DependencyLine = {
  id: "kawase_api" | "database" | "arc_testnet" | "arc_mainnet" | "circle" | "prices" | "fx";
  state: DependencyState;
  ms: number | null;
  /** A short fact ("block 12,345,678 · 1 s old"), English. */
  detail: string | null;
};
export type StatusView = { checkedAt: string; overall: DependencyState; items: DependencyLine[] };

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
    /** Whether what Kawase depends on is answering now (public, cached briefly). */
    status: () => call<StatusView>("GET", "/status"),
  };
}
