// Public aggregate counts for the showcase's /live page: how much Kawase has actually done, per network. Counts only;
// never an id, an address, an amount or an email. Recomputed at most every PUBLIC_STATS_CACHE_MS so the page cannot
// be used to load the database.
import { eq, sql } from "drizzle-orm";

import { PUBLIC_STATS_CACHE_MS } from "@kawase/config";
import { automationRuns, automations, intents, users, type Db } from "@kawase/db";
import { NETWORK_IDS, type NetworkId } from "@kawase/networks";

export const PUBLIC_ACTION_KINDS = ["send", "swap", "bridge", "earn", "margin", "crosschain", "lend"] as const;
export type PublicActionKind = (typeof PUBLIC_ACTION_KINDS)[number];

export type NetworkStats = {
  /** Completed (witnessed on chain) actions by kind. */
  completed: Record<PublicActionKind, number>;
  /** Automation runs that did their work by themselves. */
  automationRuns: number;
  /** Automations switched on right now. */
  activeAutomations: number;
};

export type PublicStats = {
  networks: Record<NetworkId, NetworkStats>;
  /** People who signed in (an account with a wallet). */
  accounts: number;
  /** Guests who tried Kawase without signing in. */
  guests: number;
  generatedAt: string;
};

const emptyNetwork = (): NetworkStats => ({
  completed: { send: 0, swap: 0, bridge: 0, earn: 0, margin: 0, crosschain: 0, lend: 0 },
  automationRuns: 0,
  activeAutomations: 0,
});

export class PublicStatsService {
  private cached: { at: number; stats: PublicStats } | undefined;

  constructor(
    private readonly db: Db,
    private readonly cacheMs: number = PUBLIC_STATS_CACHE_MS,
  ) {}

  async stats(): Promise<PublicStats> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < this.cacheMs) return this.cached.stats;
    const stats = await this.compute(now);
    this.cached = { at: now, stats };
    return stats;
  }

  private async compute(now: number): Promise<PublicStats> {
    const count = sql<number>`count(*)::int`;
    const [completed, runs, active, people] = await Promise.all([
      this.db
        .select({ network: intents.network, kind: intents.kind, n: count })
        .from(intents)
        .where(eq(intents.state, "completed"))
        .groupBy(intents.network, intents.kind),
      this.db
        .select({ network: automations.network, n: count })
        .from(automationRuns)
        .innerJoin(automations, eq(automationRuns.automationId, automations.id))
        .where(eq(automationRuns.status, "succeeded"))
        .groupBy(automations.network),
      this.db
        .select({ network: automations.network, n: count })
        .from(automations)
        .where(eq(automations.status, "active"))
        .groupBy(automations.network),
      this.db.select({ anonymous: users.isAnonymous, n: count }).from(users).groupBy(users.isAnonymous),
    ]);

    const networks = Object.fromEntries(NETWORK_IDS.map((id) => [id, emptyNetwork()])) as Record<
      NetworkId,
      NetworkStats
    >;
    for (const row of completed) networks[row.network].completed[row.kind] = row.n;
    for (const row of runs) networks[row.network].automationRuns = row.n;
    for (const row of active) networks[row.network].activeAutomations = row.n;

    return {
      networks,
      accounts: people.find((row) => !row.anonymous)?.n ?? 0,
      guests: people.find((row) => row.anonymous)?.n ?? 0,
      generatedAt: new Date(now).toISOString(),
    };
  }
}
