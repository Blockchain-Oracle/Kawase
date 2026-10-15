// "For you" (cards/agent-business.md, Proactive suggestions; surfaces.md Home §8): cards computed now from the
// person's holdings, positions and events on the active network, each with one action. Every producer reads a real
// source and stays silent when it has nothing to say or its source is down; none of them gives investment advice:
// they point at a fact (money sitting idle next to a liquid vault, a request about to expire, a bridge that has not
// arrived, a move in a currency the person holds, a route that now beats the one they keep using, a token trending on
// Arc they do not hold, a paid service about what they hold) and offer the next step; each card's words say why it
// appears. Dismissed cards stay hidden for a week (or for good once their subject is done); a muted kind never shows.
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { formatUnits, parseUnits, type Address } from "viem";

import { agentPreferences, automations, intentDrafts, intents, suggestionDismissals, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { amount, formatAmount } from "@kawase/money";
import { SUGGESTION_KINDS, type PortfolioView, type Suggestion, type SuggestionKind, type SuggestionsView } from "@kawase/api-client";

import type { BridgeService } from "../bridge/service";
import { netOf, rankRoutes, type RouteQuote } from "../bridge/compare";
import type { EarnService } from "../earn/service";
import type { MarketplaceService } from "../marketplace/service";
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
const PRIORITY = { stuck_bridge: 90, health_drop: 85, expiring_request: 70, idle_cash: 50, better_route: 45, big_move: 40, trending_token: 20, service_pick: 15 } as const;
/** Better route: a move counts as repeated at two in 30 days; a saving worth a card is 0.05 USDC and 0.1% of the amount. */
const ROUTE_HISTORY_DAYS = 30;
const ROUTE_REPEAT_MIN = 2;
const ROUTE_SAVING_MIN = 50_000n;
const ROUTE_SAVING_PER_MILLE = 1n;
const PER_MILLE = 1000n;
/** Faster: at least a minute sooner, for no more than 0.1% of the amount. */
const ROUTE_FASTER_S = 60;
const USDC_DECIMALS = 6;
/** Trending: only tokens with real liquidity, never a lookalike or an impersonator. */
const TRENDING_MIN_LIQUIDITY_USD = 10_000;
const TRENDING_SEGMENTS = ["trending", "meme"] as const;
const NOT_SHOWN_STATUSES = new Set(["lookalike", "impersonator"]);
/** A service's own words on a card, at most this long. */
const SERVICE_WHAT_MAX = 90;
const THOUSAND = 1000;
const MILLION = 1_000_000;

/** A route's provider as Kawase's cross-chain service names it ("lifi"), to find it among the quotes ("LI.FI"). */
const providerKey = (label: string) => (/cctp/i.test(label) ? "cctp" : label.toLowerCase().replace(/[^a-z]/g, ""));
const compactUsd = (value: number) => (value >= MILLION ? `$${(value / MILLION).toFixed(1)}M` : value >= THOUSAND ? `$${(value / THOUSAND).toFixed(1)}k` : `$${value.toFixed(0)}`);
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
    /** Live route quotes (B1's bridge comparison) and the x402 catalog; their cards stay silent without them. */
    private readonly sources: { bridges?: BridgeService | undefined; marketplace?: MarketplaceService | undefined } = {},
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
  private async bigMoves(user: SessionUser, balances: Balances | undefined, portfolio: PortfolioView | undefined): Promise<Suggestion[]> {
    const today = new Date().toISOString().slice(0, DATE_CHARS);
    const moves: Suggestion[] = [];
    let eurcPriced = false;
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

  /**
   * A move the person keeps making (two or more out of Arc to the same chain in 30 days) that another route now
   * delivers for less, or a minute or more sooner for almost nothing, on live quotes for their usual amount (routes.md
   * ranking rule). Kawase picks the best route on every card; this is for the route they chose themselves.
   */
  private async betterRoute(user: SessionUser): Promise<Suggestion[]> {
    const bridges = this.sources.bridges;
    if (!bridges) return [];
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) return [];
    const rows = await this.db
      .select({ id: intents.id, kind: intents.kind, request: intents.request, version: intents.currentDraftVersion })
      .from(intents)
      .where(
        and(
          eq(intents.userId, user.id),
          eq(intents.network, user.activeNetwork),
          inArray(intents.kind, ["bridge", "crosschain"]),
          eq(intents.state, "completed"),
          gt(intents.createdAt, new Date(Date.now() - ROUTE_HISTORY_DAYS * MS_PER_DAY)),
        ),
      )
      .orderBy(desc(intents.createdAt));
    // USDC out of Arc, by the chain it went to (newest first).
    const moves = rows.flatMap((row) => {
      const request = row.request as { direction?: string; destination?: string | null; asset?: string | null; amount?: string | null };
      const usdcOut = row.kind === "bridge" || (request.direction === "out" && (request.asset ?? "USDC").toUpperCase() === "USDC");
      return usdcOut && request.destination && request.amount ? [{ ...row, destination: request.destination.toLowerCase(), amount: request.amount }] : [];
    });
    const counts = new Map<string, number>();
    for (const move of moves) counts.set(move.destination, (counts.get(move.destination) ?? 0) + 1);
    const [chain, times] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!chain || !times || times < ROUTE_REPEAT_MIN) return [];
    const latest = moves.find((move) => move.destination === chain)!;
    let amountBase: bigint;
    try {
      amountBase = parseUnits(latest.amount, USDC_DECIMALS);
    } catch {
      return [];
    }
    // The route they used last: Circle CCTP for a plain bridge; the one their cross-chain card went with otherwise.
    let used = "cctp";
    if (latest.kind === "crosschain") {
      const [draft] = await this.db
        .select({ payload: intentDrafts.payload })
        .from(intentDrafts)
        .where(and(eq(intentDrafts.intentId, latest.id), eq(intentDrafts.version, latest.version)));
      used = (draft?.payload as { view?: { chosen?: string } } | undefined)?.view?.chosen ?? "cctp";
    }
    const quotes = await bridges.compareFor(user.activeNetwork, chain, amountBase, wallet.address as Address);
    if (!quotes) return [];
    const quoted = quotes.filter((quote) => quote.received !== null);
    const mine = quoted.find((quote) => providerKey(quote.provider) === used);
    if (!mine) return [];
    const best = rankRoutes(quoted)[0]!;
    const saving = netOf(best) - netOf(mine);
    const worth = ROUTE_SAVING_MIN > (amountBase * ROUTE_SAVING_PER_MILLE) / PER_MILLE ? ROUTE_SAVING_MIN : (amountBase * ROUTE_SAVING_PER_MILLE) / PER_MILLE;
    const facts = { chain: chain[0]!.toUpperCase() + chain.slice(1), times: String(times), amount: usd(amountBase), used: mine.provider };
    if (best.provider !== mine.provider && saving >= worth)
      return [this.routeCard(user, chain, "cheaper", { ...facts, better: best.provider, saving: usd(saving) })];
    // Faster: both times known, at least a minute sooner, costing no more than the saving threshold.
    const faster = quoted.find(
      (quote: RouteQuote) =>
        quote.provider !== mine.provider &&
        quote.etaSeconds !== null &&
        mine.etaSeconds !== null &&
        mine.etaSeconds - quote.etaSeconds >= ROUTE_FASTER_S &&
        netOf(mine) - netOf(quote) <= worth,
    );
    return faster ? [this.routeCard(user, chain, "faster", { ...facts, better: faster.provider, seconds: String(faster.etaSeconds), usedSeconds: String(mine.etaSeconds) })] : [];
  }

  private routeCard(user: SessionUser, chain: string, why: "cheaper" | "faster", facts: Record<string, string>): Suggestion {
    return {
      id: `better_route:${chain}:${facts.better}:${why}`,
      kind: "better_route",
      network: user.activeNetwork,
      facts: { ...facts, why },
      action: { type: "chat" },
      priority: PRIORITY.better_route,
    };
  }

  /**
   * A token trending on Arc today that the person does not hold (Markets data, builder A's: trending, then meme), with
   * real liquidity and never a copycat. It says why it is here (trending, its day, its liquidity, its verification) and
   * opens the token's page; it is not a recommendation to buy.
   */
  private async trendingToken(user: SessionUser, portfolio: PortfolioView | undefined): Promise<Suggestion[]> {
    if (!this.assets) return [];
    const held = new Set([...(portfolio?.assets ?? []), ...(portfolio?.hidden ?? [])].map((holding) => holding.token.address.toLowerCase()));
    const today = new Date().toISOString().slice(0, DATE_CHARS);
    for (const segment of TRENDING_SEGMENTS) {
      const list = await this.assets.markets(user.activeNetwork, segment).catch(() => undefined);
      if (!list?.available) continue;
      const row = list.rows.find(
        (entry) =>
          !held.has(entry.token.address.toLowerCase()) &&
          !NOT_SHOWN_STATUSES.has(entry.token.status) &&
          entry.token.kind !== "dollar" &&
          entry.change24hPct !== null &&
          (entry.liquidityUsd ?? 0) >= TRENDING_MIN_LIQUIDITY_USD,
      );
      if (!row) continue;
      return [
        {
          id: `trending_token:${row.token.address.toLowerCase()}:${today}`,
          kind: "trending_token",
          network: user.activeNetwork,
          facts: {
            token: row.token.symbol,
            tokenName: row.token.name,
            address: row.token.address,
            segment,
            change: `${row.change24hPct! > 0 ? "+" : ""}${row.change24hPct!.toFixed(PCT_DIGITS)}%`,
            liquidity: compactUsd(row.liquidityUsd ?? 0),
            status: row.token.status,
            // The row wears the token's own logo (Home's feed has no registry mark for most Arc tokens).
            ...(row.token.logoUrl ? { logo: row.token.logoUrl } : {}),
          },
          action: { type: "route", path: `/token/${row.token.chainId}/${row.token.address}` },
          priority: PRIORITY.trending_token,
        },
      ];
    }
    return [];
  }

  /**
   * A paid service (x402, Circle's catalog) about the person's largest holding that is not a dollar, within their
   * per-call cap: it says they hold it and what the service answers for its price, and opens the agent wallet.
   */
  private async servicePick(user: SessionUser, portfolio: PortfolioView | undefined): Promise<Suggestion[]> {
    const marketplace = this.sources.marketplace;
    if (!marketplace) return [];
    const holding = (portfolio?.assets ?? [])
      .filter((entry) => entry.token.kind !== "dollar" && (entry.valueUsd ?? 0) >= MOVE_MIN_USD)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))[0];
    if (!holding) return [];
    const [found, wallet] = await Promise.all([marketplace.search(user, `${holding.token.symbol} price`, "FINANCIAL"), marketplace.view(user).catch(() => undefined)]);
    const cap = wallet ? BigInt(wallet.settings.perCallCap) : undefined;
    const service = found.services.find((entry) => cap === undefined || BigInt(entry.price) <= cap);
    if (!service) return [];
    const what = service.description.length > SERVICE_WHAT_MAX ? `${service.description.slice(0, SERVICE_WHAT_MAX - 1)}…` : service.description;
    return [
      {
        id: `service_pick:${service.url}`,
        kind: "service_pick",
        network: user.activeNetwork,
        facts: { token: holding.token.symbol, service: service.provider.name, what, price: service.priceDisplay },
        action: { type: "route", path: "/agent-wallet" },
        priority: PRIORITY.service_pick,
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
    // The priced portfolio is read once: big moves, trending tokens not held, and services about a holding use it.
    const [balances, portfolio] = await Promise.all([this.balances(user).catch(() => undefined), this.assets ? this.assets.portfolio(user).catch(() => undefined) : undefined]);
    const all = (
      await Promise.all([
        quiet("idle_cash", this.idleCash(user, balances)),
        quiet("expiring_request", this.expiringRequests(user)),
        quiet("stuck_bridge", this.stuckBridges(user)),
        quiet("big_move", this.bigMoves(user, balances, portfolio)),
        quiet("health_drop", this.healthDrops(user)),
        quiet("better_route", muted.includes("better_route") ? Promise.resolve([]) : this.betterRoute(user)),
        quiet("trending_token", muted.includes("trending_token") ? Promise.resolve([]) : this.trendingToken(user, portfolio)),
        quiet("service_pick", muted.includes("service_pick") ? Promise.resolve([]) : this.servicePick(user, portfolio)),
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
