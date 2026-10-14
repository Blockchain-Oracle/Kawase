// The agent's feed (D37 "watch it work", Mitoshi's DecisionTimeline/NextDecision): a read model, no new money logic.
// It joins what already records Kawase's work —
//   - Activity's rows (ActivityFeedService): sends, swaps, bridges, earn and margin moves, automation runs (done,
//     skipped, failed, practised, waiting in Needs you) and payments still being checked;
//   - the agent's and the person's open proposals (intents waiting for a tap);
//   - automations that are on (Watching, with the next run's countdown);
//   - For you (Found: what Kawase noticed, one tap to act) —
// and groups it Done · Held · Skipped · Watching · Found. Money that merely arrived is Activity's, not the agent's.
// A source that cannot be read leaves its rows out and is named in `partial`; the rest is still served.
import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";

import { AGENT_FEED_GROUPS, type AgentFeed, type AgentFeedGroup, type AgentFeedItem, type AgentFeedKind, type AgentFeedOrigin, type FeedItem, type FeedPage, type FeedToken, type SuggestionsView } from "@kawase/api-client";
import { automations, intents, type AutomationAction, type AutoSaveAction, type DcaAction, type Db, type RuleAction } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { getNetwork, type NetworkId } from "@kawase/networks";

import type { SessionUser } from "../types";

/** Rows per group (the feed is a glance; Activity keeps the full history). */
const GROUP_ROWS = 30;
/** Open proposals still worth showing: the newest few. */
const PROPOSALS = 20;
const OPEN_STATES = ["ready_for_approval", "input_required", "auth_required"] as const;
const AGENT_SURFACES = new Set(["chat", "voice"]);
const USDC_DECIMALS = 6;

type IntentRow = { id: string; kind: string; originSurface: string; threadId: string | null; state: string; request: Record<string, unknown>; createdAt: Date };

/** Activity's status → the feed's group and outcome. */
const BY_STATUS: Record<FeedItem["status"], { group: AgentFeedGroup; outcome: AgentFeedItem["outcome"] }> = {
  confirmed: { group: "done", outcome: "confirmed" },
  practiced: { group: "done", outcome: "practiced" },
  checking: { group: "watching", outcome: "in_flight" },
  waiting: { group: "held", outcome: "waiting" },
  skipped: { group: "skipped", outcome: "skipped" },
  failed: { group: "skipped", outcome: "failed" },
};

/** Activity's kinds that are Kawase's own work (a receive or a faucet drip is the world's, not the agent's). */
const KAWASE_KINDS = new Set<FeedItem["kind"]>(["send", "swap", "bridge", "earn", "margin", "automation", "practice", "withdraw"]);

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

function blank(partial: Pick<AgentFeedItem, "id" | "group" | "source" | "kind" | "origin" | "network" | "at" | "outcome">): AgentFeedItem {
  return {
    ...partial,
    token: null,
    amount: null,
    other: null,
    asked: null,
    counterparty: null,
    reason: null,
    reasonParams: null,
    txHash: null,
    explorerUrl: null,
    intentId: null,
    automationId: null,
    runId: null,
    needsYouId: null,
    threadId: null,
    suggestion: null,
  };
}

export type FeedSources = {
  /** Activity's merged rows (the chain plus Kawase's outcomes). */
  activity: { list(user: SessionUser, network: NetworkId): Promise<FeedPage> };
  /** For you; Found stays empty without it. */
  suggestions?: { list(user: SessionUser): Promise<SuggestionsView> } | undefined;
};

export class FeedService {
  constructor(
    private readonly db: Db,
    private readonly sources: FeedSources,
    private readonly log: Logger,
  ) {}

  async get(user: SessionUser, network: NetworkId, now: Date = new Date()): Promise<AgentFeed> {
    const partial: AgentFeed["partial"] = [];
    const [activity, proposals, watched, found] = await Promise.all([
      this.sources.activity.list(user, network).catch((error: unknown) => {
        this.log.warn({ err: error }, "feed: activity unavailable");
        partial.push("activity");
        return null;
      }),
      this.openProposals(user, network, now),
      this.watched(user, network),
      // For you reads the session's network; on the other one it has nothing to say here.
      network === user.activeNetwork && this.sources.suggestions
        ? this.sources.suggestions.list(user).catch((error: unknown) => {
            this.log.warn({ err: error }, "feed: suggestions unavailable");
            partial.push("suggestions");
            return null;
          })
        : Promise.resolve(null),
    ]);

    const fromActivity = activity ? await this.fromActivity(user, network, activity.items) : [];
    const shown = new Set(fromActivity.map((item) => item.intentId).filter(Boolean));
    const items = [
      ...fromActivity,
      ...proposals.filter((item) => !shown.has(item.intentId)),
      ...watched.items,
      ...(found?.suggestions ?? []).map((suggestion) => ({
        ...blank({ id: `suggestion:${suggestion.id}`, group: "found", source: "suggestion", kind: "suggestion", origin: "agent", network, at: now.toISOString(), outcome: "suggested" }),
        suggestion,
      })),
    ];

    const groups = AGENT_FEED_GROUPS.map((group) => {
      const inGroup = items.filter((item) => item.group === group);
      // Watching counts down: soonest first. Found keeps For you's priority. Everything else: newest first.
      const sorted =
        group === "watching" ? inGroup.sort((a, b) => a.at.localeCompare(b.at)) : group === "found" ? inGroup : inGroup.sort((a, b) => b.at.localeCompare(a.at));
      return { group, count: inGroup.length, items: sorted.slice(0, GROUP_ROWS) };
    });
    return { network, groups, next: watched.next, partial, generatedAt: now.toISOString() };
  }

  /** Activity's rows that are Kawase's work, named by who started them. */
  private async fromActivity(user: SessionUser, network: NetworkId, rows: FeedItem[]): Promise<AgentFeedItem[]> {
    const mine = rows.filter((row) => KAWASE_KINDS.has(row.kind) || row.intentId || row.runId);
    const ids = [...new Set(mine.map((row) => row.intentId).filter((id): id is string => Boolean(id)))];
    const origins = new Map<string, { surface: string; threadId: string | null }>();
    if (ids.length > 0) {
      const found = await this.db
        .select({ id: intents.id, surface: intents.originSurface, threadId: intents.threadId })
        .from(intents)
        .where(and(eq(intents.userId, user.id), inArray(intents.id, ids)));
      for (const row of found) origins.set(row.id, { surface: row.surface, threadId: row.threadId });
    }
    return mine.map((row) => {
      const { group, outcome } = BY_STATUS[row.status];
      const origin = row.intentId ? origins.get(row.intentId) : undefined;
      const by: AgentFeedOrigin = row.fromAutomation || row.runId ? "automation" : origin && AGENT_SURFACES.has(origin.surface) ? "agent" : origin?.surface === "automation" ? "automation" : "you";
      return {
        ...blank({ id: `activity:${row.id}`, group, source: "activity", kind: row.kind as AgentFeedKind, origin: by, network, at: row.at, outcome }),
        token: row.token,
        amount: row.amount,
        other: row.other,
        counterparty: row.contactName ?? row.counterparty,
        reason: row.reason,
        reasonParams: row.reasonParams,
        txHash: row.txHash,
        explorerUrl: row.explorerUrl,
        intentId: row.intentId,
        automationId: row.automationId,
        runId: row.runId,
        needsYouId: row.needsYouId,
        threadId: origin?.threadId ?? null,
      };
    });
  }

  /** Proposals waiting for the person's tap (the agent's in a chat, or one they started on a screen). */
  private async openProposals(user: SessionUser, network: NetworkId, now: Date): Promise<AgentFeedItem[]> {
    const rows: IntentRow[] = await this.db
      .select({ id: intents.id, kind: intents.kind, originSurface: intents.originSurface, threadId: intents.threadId, state: intents.state, request: intents.request, createdAt: intents.createdAt })
      .from(intents)
      .where(and(eq(intents.userId, user.id), eq(intents.network, network), inArray(intents.state, [...OPEN_STATES]), gt(intents.expiresAt, now)))
      .orderBy(desc(intents.createdAt))
      .limit(PROPOSALS);
    return rows.map((row) => ({
      ...blank({
        id: `proposal:${row.id}`,
        group: "held",
        source: "proposal",
        kind: row.kind as AgentFeedKind,
        origin: AGENT_SURFACES.has(row.originSurface) ? "agent" : row.originSurface === "automation" ? "automation" : "you",
        network,
        at: row.createdAt.toISOString(),
        outcome: "waiting",
      }),
      asked: {
        amount: text(row.request.amount),
        from: text(row.request.tokenIn) ?? text(row.request.asset),
        to: text(row.request.tokenOut) ?? text(row.request.destination) ?? text(row.request.recipient),
      },
      counterparty: text(row.request.recipient) ?? text(row.request.destination),
      reason: row.state === "ready_for_approval" ? "READY_FOR_APPROVAL" : row.state === "auth_required" ? "SIGN_IN_REQUIRED" : "INPUT_REQUIRED",
      intentId: row.id,
      threadId: row.threadId,
    }));
  }

  /** Automations that are on, each with its next run; the soonest one drives the countdown. */
  private async watched(user: SessionUser, network: NetworkId): Promise<{ items: AgentFeedItem[]; next: AgentFeed["next"] }> {
    const rows = await this.db
      .select()
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, network), eq(automations.status, "active"), isNotNull(automations.nextRunAt)));
    const addresses = getNetwork(network).addresses;
    const stable = (asset: "USDC" | "EURC"): FeedToken => ({ address: asset === "USDC" ? addresses.usdc : addresses.eurc, symbol: asset, decimals: USDC_DECIMALS });
    const items = rows.map((row) => {
      const item = blank({ id: `automation:${row.id}`, group: "watching", source: "automation", kind: "automation", origin: "automation", network, at: row.nextRunAt!.toISOString(), outcome: "scheduled" });
      item.automationId = row.id;
      item.threadId = row.threadId;
      item.reason = row.kind.toUpperCase();
      item.reasonParams = { every: row.schedule.every, time: row.schedule.time, timezone: row.schedule.timezone, practice: String(row.practice) };
      if (row.kind === "scheduled_send") {
        const action = row.action as AutomationAction;
        item.token = stable(action.asset);
        item.amount = action.amount;
        item.counterparty = action.recipientName ?? action.recipientWords;
      } else if (row.kind === "auto_save") item.counterparty = (row.action as AutoSaveAction).vaultName;
      else if (row.kind === "dca") {
        const action = row.action as DcaAction;
        item.token = { address: action.tokenIn, symbol: action.symbolIn, decimals: action.decimalsIn };
        item.amount = action.amount;
        item.counterparty = action.symbolOut;
      } else if (row.kind === "rule") {
        const step = (row.action as RuleAction).step;
        item.counterparty = step.type === "bridge" ? step.destinationName : step.type === "save" ? step.vaultName : step.type === "send" ? (step.recipientName ?? step.recipientWords) : null;
      }
      return item;
    });
    const soonest = [...rows].sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())[0];
    return { items, next: soonest ? { automationId: soonest.id, at: soonest.nextRunAt!.toISOString(), kind: soonest.kind } : null };
  }
}
