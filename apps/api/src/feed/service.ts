// The agent's feed (D37 "watch it work", Mitoshi's DecisionTimeline/NextDecision): a read model, no new money logic.
// It joins what already records Kawase's work —
//   - Activity's rows (ActivityFeedService): sends, swaps, bridges, earn and margin moves, automation runs (done,
//     skipped, failed, practised, waiting in Needs you) and payments still being checked;
//   - the agent's and the person's open proposals (intents waiting for a tap);
//   - automations that are on (Watching, with the next run's countdown);
//   - For you (Found: what Kawase noticed, one tap to act) —
// and groups it Done · Held · Skipped · Watching · Found. Money that merely arrived is Activity's, not the agent's.
// A source that cannot be read leaves its rows out and is named in `partial`; the rest is still served.
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";

import { AGENT_FEED_GROUPS, type AgentFeed, type AgentFeedDetail, type RaceRoutesOutput, type RouteRace, type AgentFeedGroup, type AgentFeedItem, type AgentFeedKind, type AgentFeedOrigin, type FeedItem, type FeedPage, type FeedToken, type SuggestionsView } from "@kawase/api-client";
import { approvals, automations, intentDrafts, intents, threadMessages, type AutomationAction, type AutoSaveAction, type DcaAction, type Db, type RuleAction } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { getNetwork, type NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";

/**
 * Home never waits long on one source: a slow one (the chain's transfer index when it is rate-limited) is marked
 * partial and the feed answers with the rest; its read carries on and fills the cache for the next look.
 */
const SOURCE_WAIT_MS = 4_000;
const within = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms).unref())]);

/** Rows per group (the feed is a glance; Activity keeps the full history). */
const GROUP_ROWS = 30;
/** Open proposals still worth showing: the newest few. */
const PROPOSALS = 20;
const OPEN_STATES = ["ready_for_approval", "input_required", "auth_required"] as const;
const AGENT_SURFACES = new Set(["chat", "voice"]);
const USDC_DECIMALS = 6;
/** A token row only shows a mark, never an amount, so its decimals are the ERC-20 default. */
const TOKEN_DECIMALS = 18;

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
/** Money that came in is on the same timeline (Abu, 10-15: a payment he received was only under Inbox). */
const INCOMING_KINDS = new Set<FeedItem["kind"]>(["receive", "request_paid", "faucet"]);

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
    venue: null,
    suggestion: null,
  };
}

/** A stored message part, loosely (only what the detail reads). */
type ThreadPart = { type: string; state?: string; preliminary?: boolean; text?: unknown; output?: unknown };

/** The intent a card carries ({ intent: { id } } on every propose_* output), if any. */
function intentIdOf(part: ThreadPart): string | null {
  if (!part.type.startsWith("tool-") || part.state !== "output-available") return null;
  const intent = (part.output as { intent?: { id?: unknown } } | undefined)?.intent;
  return typeof intent?.id === "string" ? intent.id : null;
}

/** Display names the services write ("KyberSwap", "LI.FI", "Circle App Kit") → identity slugs (packages/identity). */
const VENUE_SLUGS: Record<string, string> = {
  kyberswap: "kyberswap",
  kyber: "kyberswap",
  lifi: "lifi",
  appkit: "app_kit",
  circleappkit: "app_kit",
  app_kit: "app_kit",
  uniswap: "uniswap",
  uniswapv3: "uniswap",
  zerox: "zerox",
  "0x": "zerox",
  socket: "socket",
  bungee: "socket",
  gaszip: "gaszip",
  across: "across",
  relay: "relay",
  debridge: "debridge",
  cctp: "cctp",
  circlecctp: "cctp",
};

/** The venue a draft ran on: its `venue`, else its `provider`/`bridge`, as an identity slug (unknown names stay null). */
function venueOf(payload: Record<string, unknown>): string | null {
  for (const field of ["venue", "provider", "bridge", "route"]) {
    const value = payload[field];
    if (typeof value !== "string") continue;
    // "Aave V4 · KyberSwap": the venue that swapped is the last named part.
    for (const name of value.split("·").reverse()) {
      const slug = VENUE_SLUGS[name.toLowerCase().replace(/[\s.-]/g, "")];
      if (slug) return slug;
    }
  }
  return null;
}

export type FeedSources = {
  /** Activity's merged rows (the chain plus Kawase's outcomes). */
  activity: { list(user: SessionUser, network: NetworkId): Promise<FeedPage> };
  /** For you; Found stays empty without it. */
  suggestions?: { list(user: SessionUser): Promise<SuggestionsView>; dismiss(userId: string, id: string): Promise<void> } | undefined;
};

export class FeedService {
  constructor(
    private readonly db: Db,
    private readonly sources: FeedSources,
    private readonly log: Logger,
  ) {}

  /**
   * The person swiped or closed a feed item: a held proposal is cancelled (nothing had moved, and its waiting
   * signature is rejected, as each money screen's own Cancel does); a found suggestion is dismissed for good. What
   * already happened is the record, and stays.
   */
  async dismiss(user: SessionUser, itemId: string): Promise<{ dismissed: true }> {
    const [source, id] = [itemId.slice(0, itemId.indexOf(":")), itemId.slice(itemId.indexOf(":") + 1)];
    if (source === "proposal") {
      const done = await this.db.transaction(async (tx) => {
        const [cancelled] = await tx
          .update(intents)
          .set({ state: "canceled" })
          .where(and(eq(intents.id, id), eq(intents.userId, user.id), inArray(intents.state, [...OPEN_STATES])))
          .returning({ id: intents.id });
        if (!cancelled) return false;
        await tx.update(approvals).set({ status: "rejected" }).where(and(eq(approvals.intentId, id), eq(approvals.status, "pending_signature")));
        return true;
      });
      if (!done) throw problem(HTTP.conflict, "intent_final", "it is no longer waiting");
      return { dismissed: true };
    }
    if (source === "suggestion" && this.sources.suggestions) {
      await this.sources.suggestions.dismiss(user.id, id);
      return { dismissed: true };
    }
    throw problem(HTTP.unprocessable, "validation", "what already happened stays in the record");
  }

  async get(user: SessionUser, network: NetworkId, now: Date = new Date()): Promise<AgentFeed> {
    const partial: AgentFeed["partial"] = [];
    const [activity, proposals, watched, found] = await Promise.all([
      within(this.sources.activity.list(user, network), SOURCE_WAIT_MS).catch((error: unknown) => {
        this.log.warn({ err: error }, "feed: activity unavailable");
        partial.push("activity");
        return null;
      }),
      this.openProposals(user, network, now),
      this.watched(user, network),
      // For you reads the session's network; on the other one it has nothing to say here.
      network === user.activeNetwork && this.sources.suggestions
        ? within(this.sources.suggestions.list(user), SOURCE_WAIT_MS).catch((error: unknown) => {
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
        // A trending token's row wears the token's own mark.
        token:
          suggestion.kind === "trending_token" && suggestion.facts.address
            ? { address: suggestion.facts.address, symbol: suggestion.facts.token ?? "", decimals: TOKEN_DECIMALS, logoUrl: suggestion.facts.logo ?? null }
            : null,
        suggestion,
      })),
    ];
    await this.withVenues(items);

    const groups = AGENT_FEED_GROUPS.map((group) => {
      const inGroup = items.filter((item) => item.group === group);
      // Watching counts down: soonest first. Found keeps For you's priority. Everything else: newest first.
      const sorted =
        group === "watching" ? inGroup.sort((a, b) => a.at.localeCompare(b.at)) : group === "found" ? inGroup : inGroup.sort((a, b) => b.at.localeCompare(a.at));
      return { group, count: inGroup.length, items: sorted.slice(0, GROUP_ROWS) };
    });
    return { network, groups, next: watched.next, partial, generatedAt: now.toISOString() };
  }

  /**
   * One row opened: the row as the feed has it, the race Kawase ran before it and the person's words. The race is
   * read from the conversation that made the row — the last finished race_routes before the card that carries this
   * intent — so it is what the person watched, not a new quote. A row from a screen or an automation has no race.
   */
  async detail(user: SessionUser, network: NetworkId, id: string, now: Date = new Date()): Promise<AgentFeedDetail | null> {
    const feed = await this.get(user, network, now);
    const item = feed.groups.flatMap((group) => group.items).find((row) => row.id === id);
    if (!item) return null;
    if (!item.threadId || !item.intentId) return { item, race: null, asked: null };
    const rows = await this.db
      .select({ role: threadMessages.role, parts: threadMessages.parts, seq: threadMessages.seq })
      .from(threadMessages)
      .where(and(eq(threadMessages.threadId, item.threadId), eq(threadMessages.userId, user.id)))
      .orderBy(asc(threadMessages.seq));
    const messages = rows.map((row) => ({ role: row.role, parts: (row.parts ?? []) as ThreadPart[] }));
    const at = messages.findIndex((message) => message.parts.some((part) => intentIdOf(part) === item.intentId));
    if (at < 0) return { item, race: null, asked: null };
    let race: RouteRace | null = null;
    let asked: string | null = null;
    for (let index = at; index >= 0 && (race === null || asked === null); index--) {
      const message = messages[index]!;
      if (message.role === "user") {
        asked ??= message.parts.map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : "")).join(" ").trim() || null;
        // A race belongs to the question that asked for it: stop at the question.
        break;
      }
      for (const part of [...message.parts].reverse()) {
        if (race === null && part.type === "tool-race_routes" && part.state === "output-available" && part.preliminary !== true) {
          const output = part.output as RaceRoutesOutput | undefined;
          if (output && output.status !== "routes_unavailable") race = output.race;
        }
      }
    }
    return { item, race, asked };
  }

  /** Each row's venue, from its intent's latest draft (the venue it was quoted and run on). */
  private async withVenues(items: AgentFeedItem[]): Promise<void> {
    const ids = [...new Set(items.map((item) => item.intentId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return;
    const drafts = await this.db
      .select({ intentId: intentDrafts.intentId, version: intentDrafts.version, payload: intentDrafts.payload })
      .from(intentDrafts)
      .where(and(inArray(intentDrafts.intentId, ids), isNull(intentDrafts.voidedAt)))
      .catch((error: unknown) => {
        this.log.warn({ err: error }, "feed: venues unavailable");
        return [];
      });
    const latest = new Map<string, { version: number; payload: Record<string, unknown> }>();
    for (const draft of drafts) {
      const seen = latest.get(draft.intentId);
      if (!seen || draft.version > seen.version) latest.set(draft.intentId, { version: draft.version, payload: draft.payload });
    }
    for (const item of items) {
      const draft = item.intentId ? latest.get(item.intentId) : undefined;
      item.venue = draft ? venueOf(draft.payload) : null;
    }
  }

  /** Activity's rows that are Kawase's work, named by who started them. */
  private async fromActivity(user: SessionUser, network: NetworkId, rows: FeedItem[]): Promise<AgentFeedItem[]> {
    const mine = rows.filter((row) => KAWASE_KINDS.has(row.kind) || INCOMING_KINDS.has(row.kind) || row.intentId || row.runId);
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
        ...blank({ id: `activity:${row.id}`, group, source: "activity", kind: INCOMING_KINDS.has(row.kind) ? "receive" : (row.kind as AgentFeedKind), origin: by, network, at: row.at, outcome }),
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
      // A long or short asks with its margin, its side and its market ("10", "short", "cirBTC").
      asked:
        row.kind === "margin"
          ? { amount: text(row.request.margin), from: text(row.request.side), to: text(row.request.market) }
          : {
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
