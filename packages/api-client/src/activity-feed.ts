// Activity everywhere (cards/automate-safety.md "Look back"; surfaces.md Activity): one row per outcome, of every
// kind and every token — what the chain moved (Alchemy's transfer history), merged with what Kawase itself decided
// (its sends, swaps, bridges, earn and margin moves, automation runs and skips, practice runs, steps waiting for the
// person, payments still being checked) — each with a way to its "why".
import type { WhyView } from "./history";
import type { NetworkId } from "./types";
import type { WithdrawalView } from "./withdraw";

export type FeedKind = "receive" | "send" | "swap" | "bridge" | "earn" | "margin" | "automation" | "request_paid" | "faucet" | "practice" | "withdraw" | "other";
export type FeedStatus = "confirmed" | "checking" | "skipped" | "failed" | "practiced" | "waiting";
export type FeedToken = { address: string; symbol: string; decimals: number };

export type FeedItem = {
  id: string;
  network: NetworkId;
  kind: FeedKind;
  direction: "in" | "out" | "none";
  status: FeedStatus;
  at: string;
  /** The main leg: what came in (a receive, a swap's output) or went out. */
  token: FeedToken | null;
  amount: string | null;
  /** A swap's other leg: what went out for it. */
  other: { token: FeedToken; amount: string } | null;
  counterparty: string | null;
  counterpartyLabel: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | null;
  contactName: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  /** Kawase's own record behind the row, when there is one. */
  intentId: string | null;
  /** Set when an automation made it (also for a payroll line). */
  fromAutomation: boolean;
  automationId: string | null;
  runId: string | null;
  needsYouId: string | null;
  /** Why it was skipped, failed or waits (a reason code) and its display values. */
  reason: string | null;
  reasonParams: Record<string, string> | null;
  bridge: { chainId: number } | null;
  earn: { action: "deposit" | "withdraw"; vault: string } | null;
  /** A withdrawal: one row for all its steps ("Withdrawn to Kraken"), which open into the steps (money-out.md). */
  withdrawal?: WithdrawalView | null | undefined;
};

export type FeedPage = {
  network: NetworkId;
  items: FeedItem[];
  /** Steps waiting for the person here (the Needs-you badge). */
  needsYou: number;
  /** The chain has older movements than this page. */
  more: boolean;
  /** Where the history came from: Alchemy's transfers (every token), or the explorer's (USDC and EURC only). */
  source: "alchemy" | "explorer";
};

export type ActivityFeedApi = {
  list: (network: NetworkId) => Promise<FeedPage>;
  /** Why an automation run went the way it did (no transaction needed: a skip, a practice run, a step waiting). */
  runWhy: (runId: string) => Promise<{ why: WhyView }>;
};
