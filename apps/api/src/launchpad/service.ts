// Launchpads on Arc (LIFT): what the token page says about a token still on its bonding curve ("On the LIFT curve: 51%
// to graduation", the fees a trade pays there), and the graduation alert the person can ask for. The monitor reads
// LIFT for every open watch and tells each person once (inbox token_graduated; push and email follow their settings).
// Tokens a launchpad did not launch (TOLLY, ARGUS…) have no curve here: they trade like any other through the swap
// fan-out. Mainnet only (LIFT is on Arc mainnet).
import { and, eq, isNull } from "drizzle-orm";

import type { LaunchpadView } from "@kawase/api-client";
import { launchpadWatches, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import type { SessionUser } from "../types";
import { liftToken } from "./lift";

const LAUNCHPAD = "LIFT";
const PAGE = "https://lift.fun";
const NETWORK: NetworkId = "mainnet";
const MONITOR_MS = 60_000;

export class LaunchpadService {
  constructor(
    private readonly db: Db,
    private readonly log: Logger,
    private readonly inbox?: InboxService,
  ) {}

  /** The token's launchpad facts, or null when no launchpad Kawase reads launched it (or on testnet). */
  async token(viewer: SessionUser | undefined, network: NetworkId, address: string): Promise<LaunchpadView | null> {
    if (network !== NETWORK) return null;
    const lift = await liftToken(address);
    if (!lift) return null;
    let watching = false;
    if (viewer && !viewer.isAnonymous) {
      const [watch] = await this.db
        .select({ id: launchpadWatches.id })
        .from(launchpadWatches)
        .where(and(eq(launchpadWatches.userId, viewer.id), eq(launchpadWatches.network, network), eq(launchpadWatches.token, address.toLowerCase()), isNull(launchpadWatches.notifiedAt)));
      watching = Boolean(watch);
    }
    return {
      launchpad: LAUNCHPAD,
      url: PAGE,
      graduated: lift.graduated,
      graduatedAt: lift.graduatedAt,
      progress: lift.progress,
      marketCapUsd: lift.marketCapUsd,
      curveUsd: lift.curveUsd,
      buyFeeBps: lift.buyFeeBps,
      sellFeeBps: lift.sellFeeBps,
      creatorFeeBps: Math.max(lift.creatorBuyBps, lift.creatorSellBps),
      watching,
    };
  }

  /** Tell me when it graduates (only for a token still on its curve). */
  async watch(user: SessionUser, address: string): Promise<LaunchpadView | null> {
    if (user.activeNetwork !== NETWORK) throw problem(HTTP.unprocessable, "launchpad_unavailable", "launchpads are read on Arc mainnet");
    const lift = await liftToken(address);
    if (!lift) throw problem(HTTP.notFound, "not_found", "no launchpad launched this token");
    if (!lift.graduated) {
      await this.db
        .insert(launchpadWatches)
        .values({ userId: user.id, network: NETWORK, token: address.toLowerCase(), symbol: lift.symbol, launchpad: LAUNCHPAD })
        .onConflictDoUpdate({ target: [launchpadWatches.userId, launchpadWatches.network, launchpadWatches.token], set: { notifiedAt: null } });
    }
    return this.token(user, NETWORK, address);
  }

  async unwatch(user: SessionUser, address: string): Promise<LaunchpadView | null> {
    await this.db.delete(launchpadWatches).where(and(eq(launchpadWatches.userId, user.id), eq(launchpadWatches.network, user.activeNetwork), eq(launchpadWatches.token, address.toLowerCase())));
    return this.token(user, user.activeNetwork, address);
  }

  /** Every open watch: one read of LIFT per token, and each watcher told once. */
  async tick() {
    if (!this.inbox) return;
    const open = await this.db.select().from(launchpadWatches).where(isNull(launchpadWatches.notifiedAt));
    const tokens = [...new Set(open.map((watch) => watch.token))];
    for (const token of tokens) {
      const lift = await liftToken(token);
      if (!lift?.graduated) continue;
      for (const watch of open.filter((entry) => entry.token === token)) {
        const [claimed] = await this.db.update(launchpadWatches).set({ notifiedAt: new Date() }).where(and(eq(launchpadWatches.id, watch.id), isNull(launchpadWatches.notifiedAt))).returning({ id: launchpadWatches.id });
        if (!claimed) continue;
        await this.inbox.add(this.db, {
          userId: watch.userId,
          network: watch.network,
          kind: "token_graduated",
          params: { symbol: watch.symbol, token: watch.token, launchpad: watch.launchpad },
          dedupeKey: `token_graduated:${watch.id}`,
        });
      }
    }
  }

  start() {
    const timer = setInterval(() => void this.tick().catch((error: unknown) => this.log.warn({ err: error }, "launchpad tick failed")), MONITOR_MS);
    timer.unref();
    return () => clearInterval(timer);
  }
}
