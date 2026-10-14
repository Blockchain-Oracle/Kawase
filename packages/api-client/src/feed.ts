// The agent's feed (D37, "watch it work"): one read model over what Kawase did, what waits for the person, what it
// skipped and why, what it is watching (with the next run's countdown) and what it found. Built by the api from
// automation runs, history and receipts, Needs you, the agent's own proposals and For you; no new money logic.
// Groups follow Mitoshi's DecisionTimeline: Done · Held · Skipped · Watching · Found.
import type { AgentHealth, AgentNetwork } from "./agent-types";
import type { FeedToken } from "./activity-feed";
import type { Suggestion } from "./intelligence";

export type AgentFeedGroup = "done" | "held" | "skipped" | "watching" | "found";
export const AGENT_FEED_GROUPS: readonly AgentFeedGroup[] = ["done", "held", "skipped", "watching", "found"];

/** Who started it: the agent in a chat or by voice, an automation, or the person on a screen. */
export type AgentFeedOrigin = "agent" | "automation" | "you";

/** What the row is about, for its mark and its verb. */
export type AgentFeedKind = "send" | "swap" | "bridge" | "earn" | "margin" | "crosschain" | "lend" | "withdraw" | "automation" | "practice" | "suggestion";

export type AgentFeedItem = {
  /** Stable across reads: "<source>:<id>". */
  id: string;
  group: AgentFeedGroup;
  source: "activity" | "proposal" | "automation" | "suggestion";
  kind: AgentFeedKind;
  origin: AgentFeedOrigin;
  network: AgentNetwork;
  /** When it happened; for a watched automation, when it runs next. */
  at: string;
  /** done: confirmed or practised ("would have"); skipped: skipped or failed (a failure says money did not move). */
  outcome: "confirmed" | "practiced" | "in_flight" | "waiting" | "skipped" | "failed" | "scheduled" | "suggested";
  /** The main leg (what went out or came in), when there is one. */
  token: FeedToken | null;
  amount: string | null;
  /** A swap's other leg. */
  other: { token: FeedToken; amount: string } | null;
  /** As the person asked, for a proposal that is not priced yet ("2", "USDC", "EURC"). */
  asked: { amount: string | null; from: string | null; to: string | null } | null;
  /** Who or where: a contact's name, a chain, a vault. */
  counterparty: string | null;
  /** A reason code (policy codes, as Activity uses) and its display values. */
  reason: string | null;
  reasonParams: Record<string, string> | null;
  txHash: string | null;
  explorerUrl: string | null;
  intentId: string | null;
  automationId: string | null;
  runId: string | null;
  needsYouId: string | null;
  /** The conversation that made it, for "Open in chat". */
  threadId: string | null;
  /** Found: the For-you card, rendered as Home's For-you row. */
  suggestion: Suggestion | null;
};

export type AgentFeed = {
  network: AgentNetwork;
  groups: { group: AgentFeedGroup; count: number; items: AgentFeedItem[] }[];
  /** The next scheduled run, for the countdown ring (Mitoshi NextDecision); null when nothing is scheduled. */
  next: { automationId: string; at: string; kind: string } | null;
  /** Sources that could not be read this time: their rows are missing, the rest is current. */
  partial: ("activity" | "suggestions")[];
  generatedAt: string;
};

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export type FeedApi = { get: (network?: AgentNetwork) => Promise<AgentFeed> };

/** Whether the agent's model answers now (the app's offline state, before the person types). */
export type AgentHealthApi = { health: () => Promise<{ health: AgentHealth }> };

/**
 * The front door's endpoints: the feed and the agent's health. The lead spreads this into the client
 * (`...feedEndpoints(call)` in index.ts), giving `api.feed.get()` and `api.agentHealth.health()`.
 */
export function feedEndpoints(call: Call): { feed: FeedApi; agentHealth: AgentHealthApi } {
  return {
    feed: { get: (network) => call<AgentFeed>("GET", `/feed${network ? `?network=${network}` : ""}`) },
    agentHealth: { health: () => call<{ health: AgentHealth }>("GET", "/agent/health") },
  };
}
