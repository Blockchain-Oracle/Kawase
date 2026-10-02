// "For you" (cards/agent-business.md, Proactive suggestions; surfaces.md Home §8): cards computed now from the
// person's holdings, positions and events on the active network, each with one action. Every producer reads a real
// source and stays silent when it has nothing to say or its source is down; none of them gives investment advice:
// they point at a fact (money sitting idle next to a liquid vault, a request about to expire, a bridge that has not
// arrived, a move in a currency the person holds) and offer the next step. Dismissed cards stay hidden for a week (or
// for good once their subject is done); a muted kind never shows.
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { formatUnits } from "viem";

import { agentPreferences, automations, intents, suggestionDismissals, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { amount, formatAmount } from "@kawase/money";
import { SUGGESTION_KINDS, type Suggestion, type SuggestionKind, type SuggestionsView } from "@kawase/api-client";

import type { EarnService } from "../earn/service";
import type { MarginService } from "../margin/service";
import type { AssetService } from "../tokens/service";
import type { RequestService } from "../requests/service";
import type { SessionUser } from "../types";
import type { WalletService } from "../wallet/service";
import { eurUsdMove } from "./fx";

const DISPLAY_LOCALE = "en";
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** A dismissed card comes back after this, if its situation is still true. */
const DISMISS_DAYS = 7;
const USDC_UNIT = 1_000_000n;
const ZERO = 0n;
/** Idle cash worth mentioning (20 USDC), and what stays in the wallet for spending (the larger of 10 USDC and 10%). */
const IDLE_MIN = 20_000_000n;
const KEEP_FLOOR = 10_000_000n;
const KEEP_SHARE_PERCENT = 10n;
const PERCENT = 100n;
/** Requests that run out within two days. */
const EXPIRING_WITHIN_MS = 172_800_000;
/** A bridge normally lands in about a minute; past 15 minutes it is worth a look. */
const STUCK_AFTER_MS = 900_000;
/** A daily move in a held currency worth a card, in percent, and the least held to care (10 EURC). */
const BIG_MOVE_PERCENT = 0.5;
const MOVE_MIN_HELD = 10_000_000n;
/** Any other held token: a 5% day, worth at least $10. */
const BIG_MOVE_TOKEN_PERCENT = 5;
const MOVE_MIN_USD = 10;
/** Margin: account health under 1.25, or liquidation within a 10% move; a dismissal holds per 0.25 of health. */
const HEALTH_WARN = 1.25;
const LIQUIDATION_NEAR = 0.1;
const HEALTH_STEP = 0.25;
const DATE_CHARS = 10;
const PRIORITY = { stuck_bridge: 90, health_drop: 85, expiring_request: 70, idle_cash: 50, big_move: 40 } as const;
const PCT_DIGITS = 1;
const PCT_SCALE = 100;
const DECIMALS_SHOWN = 2;
const RATE_DIGITS = 4;

const usd = (baseUnits: bigint, asset: "USDC" | "EURC" = "USDC") => formatAmount(amount(asset, baseUnits), DISPLAY_LOCALE, { fractionDigits: DECIMALS_SHOWN, withSymbol: false });

type Balances = { usdc: bigint; eurc: bigint };

export class SuggestionService {
  constructor(
    private readonly db: Db,
    private readonly wallets: WalletService,
    private readonly earn: EarnService,
    private readonly requests: RequestService,
    private readonly log: Logger,
    /** The priced portfolio (builder A) and Kawase Margin (B1); each card kind stays silent without its source. */
    private readonly assets?: AssetService | undefined,
    private readonly margin?: MarginService | undefined,
  ) {}

  private async prefs(userId: string) {
    const [row] = await this.db.select().from(agentPreferences).where(eq(agentPreferences.userId, userId));
    return { muted: (row?.mutedSuggestions ?? []).filter((kind): kind is SuggestionKind => (SUGGESTION_KINDS as readonly string[]).includes(kind)) };
  }

  private async balances(user: SessionUser): Promise<Balances | undefined> {
    const status = await this.wallets.status(user.id, [user.activeNetwork]);
    const state = (status.networks as Record<string, { usdcBalance: string; eurcBalance?: string } | undefined>)[user.activeNetwork];
    return state ? { usdc: BigInt(state.usdcBalance), eurc: BigInt(state.eurcBalance ?? "0") } : undefined;
  }

  /** USDC sitting in the wallet above a spending reserve, next to an active vault that could pay it all back now. */
  private async idleCash(user: SessionUser, balances: Balances | undefined): Promise<Suggestion[]> {
    if (!balances || balances.usdc < IDLE_MIN) return [];
    // Auto-save already puts idle money to work by itself.
    const [autoSave] = await this.db
      .select({ id: automations.id })
      .from(automations)
      .where(and(eq(automations.userId, user.id), eq(automations.network, user.activeNetwork), eq(automations.kind, "auto_save"), eq(automations.status, "active")))
      .limit(1);
    if (autoSave) return [];
    const keepShare = (balances.usdc * KEEP_SHARE_PERCENT) / PERCENT;
    const keep = keepShare > KEEP_FLOOR ? keepShare : KEEP_FLOOR;
    const idle = balances.usdc - keep;
    if (idle <= ZERO) return [];
    const { vaults } = await this.earn.overview(user);
    const idleWhole = Number(idle / USDC_UNIT);
    const vault = vaults.find((entry) => /active/i.test(entry.status) && entry.apy > 0 && Number(entry.available) >= idleWhole);
    if (!vault) return [];
    return [
      {
        id: `idle_cash:${user.activeNetwork}`,
        kind: "idle_cash",
        network: user.activeNetwork,
        facts: {
          amount: usd(idle),
          asset: "USDC",
          apy: (vault.apy * PCT_SCALE).toFixed(PCT_DIGITS),
          vault: vault.name,
          keep: usd(keep),
        },
        action: { type: "chat" },
        priority: PRIORITY.idle_cash,
      },
    ];
  }

  /** The person's own open requests that run out within two days: share the link again. */
  private async expiringRequests(user: SessionUser): Promise<Suggestion[]> {
    const soon = Date.now() + EXPIRING_WITHIN_MS;
    const list = await this.requests.list(user.id);
    return list
      .filter((request) => request.network === user.activeNetwork && request.status === "open" && new Date(request.expiresAt).getTime() <= soon && new Date(request.expiresAt).getTime() > Date.now())
      .map((request) => ({
        id: `expiring_request:${request.id}`,
        kind: "expiring_request" as const,
        network: request.network,
        facts: {
          // Requests can ask for any token (R1): USDC/EURC as money, any other in its own decimals.
          amount: request.asset === "USDC" || request.asset === "EURC" ? usd(BigInt(request.amount), request.asset) : formatUnits(BigInt(request.amount), request.assetToken.decimals),
          asset: request.asset,
          note: request.note ?? "",
          hours: String(Math.max(1, Math.round((new Date(request.expiresAt).getTime() - Date.now()) / MS_PER_HOUR))),
        },
        action: { type: "share" as const, url: request.link },
        priority: PRIORITY.expiring_request,
      }));
  }

  /** A bridge still on its way long after it should have landed: open the conversation that tracks it. */
  private async stuckBridges(user: SessionUser): Promise<Suggestion[]> {
    const rows = await this.db
      .select({ id: intents.id, threadId: intents.threadId, request: intents.request, updatedAt: intents.updatedAt })
      .from(intents)
      .where(
        and(
          eq(intents.userId, user.id),
          eq(intents.network, user.activeNetwork),
          eq(intents.kind, "bridge"),
          inArray(intents.state, ["executing", "unknown_outcome"]),
          lt(intents.updatedAt, new Date(Date.now() - STUCK_AFTER_MS)),
        ),
      );
    return rows.map((row) => {
      const request = row.request as { destination?: string | null; amount?: string | null };
      return {
        id: `stuck_bridge:${row.id}`,
        kind: "stuck_bridge" as const,
        network: user.activeNetwork,
        facts: {
          chain: request.destination ? request.destination[0]!.toUpperCase() + request.destination.slice(1) : "",
          amount: request.amount ?? "",
          minutes: String(Math.round((Date.now() - row.updatedAt.getTime()) / MS_PER_MINUTE)),
        },
        action: row.threadId ? { type: "thread" as const, threadId: row.threadId } : { type: "route" as const, path: "/activity" },
        priority: PRIORITY.stuck_bridge,
      };
    });
  }

  /**
   * A held token that moved a lot in 24 hours (the priced portfolio: GeckoTerminal via AssetService): 5% for most
   * tokens, half a percent for a currency stablecoin (EURC follows the euro), never a dollar stablecoin. When the
   * portfolio has no price change for EURC, the ECB's daily euro rate stands in.
   */
  private async bigMoves(user: SessionUser, balances: Balances | undefined): Promise<Suggestion[]> {
    const today = new Date().toISOString().slice(0, DATE_CHARS);
    const moves: Suggestion[] = [];
    let eurcPriced = false;
    const portfolio = this.assets ? await this.assets.portfolio(user).catch(() => undefined) : undefined;
    for (const holding of portfolio?.assets ?? []) {
      const pct = holding.change24hPct;
      if (holding.token.symbol.toUpperCase() === "EURC" && pct !== null) eurcPriced = true;
      if (pct === null || holding.valueUsd === null || holding.valueUsd < MOVE_MIN_USD || holding.token.kind === "dollar") continue;
      if (Math.abs(pct) < (holding.token.kind === "fiat" ? BIG_MOVE_PERCENT : BIG_MOVE_TOKEN_PERCENT)) continue;
      const deltaUsd = holding.valueUsd - holding.valueUsd / (1 + pct / PCT_SCALE);
      moves.push({
        id: `big_move:${holding.token.address.toLowerCase()}:${today}`,
        kind: "big_move",
        network: user.activeNetwork,
        facts: {
          asset: holding.token.symbol,
          change: `${pct > 0 ? "+" : ""}${pct.toFixed(PCT_DIGITS)}%`,
          valueChange: `${deltaUsd >= 0 ? "+" : "−"}$${Math.abs(deltaUsd).toFixed(DECIMALS_SHOWN)}`,
          held: Number(holding.amount).toFixed(DECIMALS_SHOWN),
          price: `$${(holding.priceUsd ?? 0).toFixed(holding.priceUsd !== null && holding.priceUsd < 1 ? RATE_DIGITS : DECIMALS_SHOWN)}`,
          date: today,
        },
        action: { type: "chat" },
        priority: PRIORITY.big_move,
      });
    }
    if (eurcPriced || !balances || balances.eurc < MOVE_MIN_HELD) return moves;
    const move = await eurUsdMove();
    if (!move || Math.abs(move.changePct) < BIG_MOVE_PERCENT) return moves;
    const heldEur = Number(balances.eurc) / Number(USDC_UNIT);
    const deltaUsd = heldEur * (move.rate - move.previousRate);
    return [
      ...moves,
      {
        id: `big_move:EURC:${move.date}`,
        kind: "big_move",
        network: user.activeNetwork,
        facts: {
          asset: "EURC",
          change: `${move.changePct > 0 ? "+" : ""}${move.changePct.toFixed(PCT_DIGITS)}%`,
          valueChange: `${deltaUsd >= 0 ? "+" : "−"}$${Math.abs(deltaUsd).toFixed(DECIMALS_SHOWN)}`,
          held: usd(balances.eurc, "EURC"),
          price: `$${move.rate.toFixed(RATE_DIGITS)}`,
          date: move.date,
        },
        action: { type: "chat" },
        priority: PRIORITY.big_move,
      },
    ];
  }

  /** An open long or short (Kawase Margin) whose account health is low or whose liquidation price is close. */
  private async healthDrops(user: SessionUser): Promise<Suggestion[]> {
    if (!this.margin) return [];
    const positions = await this.margin.positions(user);
    return positions
      .filter(
        (position) =>
          position.network === user.activeNetwork &&
          position.status === "open" &&
          ((position.health !== null && position.health < HEALTH_WARN) || (position.liquidationDistance !== null && position.liquidationDistance < LIQUIDATION_NEAR)),
      )
      .map((position) => ({
        // A dismissal holds until the health falls another step.
        id: `health_drop:${position.id}:${position.health === null ? "na" : Math.floor(position.health / HEALTH_STEP)}`,
        kind: "health_drop" as const,
        network: position.network,
        facts: {
          market: position.market,
          side: position.side,
          health: position.health === null ? "—" : position.health.toFixed(DECIMALS_SHOWN),
          distance: position.liquidationDistance === null ? "—" : `${(position.liquidationDistance * PCT_SCALE).toFixed(PCT_DIGITS)}%`,
        },
        action: { type: "route" as const, path: `/position/${position.id}` },
        priority: PRIORITY.health_drop,
      }));
  }

  async list(user: SessionUser): Promise<SuggestionsView> {
    const network = user.activeNetwork;
    const { muted } = await this.prefs(user.id);
    if (user.isAnonymous) return { network, suggestions: [], muted };
    const quiet = <T>(what: string, work: Promise<T[]>) =>
      work.catch((error: unknown) => {
        this.log.warn({ err: error, what }, "suggestion source failed");
        return [] as T[];
      });
    const balances = await this.balances(user).catch(() => undefined);
    const all = (
      await Promise.all([
        quiet("idle_cash", this.idleCash(user, balances)),
        quiet("expiring_request", this.expiringRequests(user)),
        quiet("stuck_bridge", this.stuckBridges(user)),
        quiet("big_move", this.bigMoves(user, balances)),
        quiet("health_drop", this.healthDrops(user)),
      ])
    ).flat();
    const dismissed = all.length
      ? await this.db
          .select({ id: suggestionDismissals.suggestionId })
          .from(suggestionDismissals)
          .where(
            and(
              eq(suggestionDismissals.userId, user.id),
              inArray(suggestionDismissals.suggestionId, all.map((entry) => entry.id)),
              gt(suggestionDismissals.dismissedAt, new Date(Date.now() - DISMISS_DAYS * MS_PER_DAY)),
            ),
          )
      : [];
    const hidden = new Set(dismissed.map((row) => row.id));
    return {
      network,
      suggestions: all.filter((entry) => !hidden.has(entry.id) && !muted.includes(entry.kind)).sort((a, b) => b.priority - a.priority),
      muted,
    };
  }

  async dismiss(userId: string, suggestionId: string) {
    await this.db
      .insert(suggestionDismissals)
      .values({ userId, suggestionId })
      .onConflictDoUpdate({ target: [suggestionDismissals.userId, suggestionDismissals.suggestionId], set: { dismissedAt: new Date() } });
  }

  async mute(userId: string, kind: SuggestionKind, muted: boolean): Promise<SuggestionKind[]> {
    const change = muted
      ? sql`array(select distinct unnest(${agentPreferences.mutedSuggestions} || array[${kind}]::text[]))`
      : sql`array_remove(${agentPreferences.mutedSuggestions}, ${kind})`;
    await this.db
      .insert(agentPreferences)
      .values({ userId, mutedSuggestions: muted ? [kind] : [] })
      .onConflictDoUpdate({ target: agentPreferences.userId, set: { mutedSuggestions: change, updatedAt: new Date() } });
    return (await this.prefs(userId)).muted;
  }
}
