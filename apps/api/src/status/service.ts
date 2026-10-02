// Dependency health (A5, the status card): whether what Kawase depends on answers right now — its own database, Arc
// on each network it serves (the latest block and how old it is), Circle's API, the price source and the FX source.
// Every check has a short timeout and runs in parallel; the whole answer is cached for half a minute so the card
// and GET /status never hammer anyone.
import { sql } from "drizzle-orm";

import type { Db } from "@kawase/db";
import type { DependencyLine, DependencyState, StatusView } from "@kawase/api-client";

import type { Chains } from "../wallet/chain";

const TIMEOUT_MS = 4_000;
const HTTP_TOO_MANY = 429;
const SLOW_MS = 1_500;
const CACHE_MS = 30_000;
/** A block older than this means the chain (or our view of it) has stalled; Arc makes one every ~0.5 s. */
const STALE_BLOCK_S = 30;
const MS_PER_SECOND = 1_000;
const CIRCLE_PING = "https://api.circle.com/ping";
const PRICES_PING = "https://api.geckoterminal.com/api/v2/networks?page=1";
const FX_PING = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";

async function timed<T>(work: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const startedAt = Date.now();
  try {
    const value = await Promise.race([
      work(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS).unref()),
    ]);
    return { ms: Date.now() - startedAt, value };
  } catch (error) {
    return { ms: Date.now() - startedAt, error };
  }
}

const speed = (ms: number): DependencyState => (ms > SLOW_MS ? "slow" : "ok");

async function ping(id: DependencyLine["id"], url: string): Promise<DependencyLine> {
  const result = await timed(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Rate-limited means it is up and answering, just not to us right now.
    if (response.status === HTTP_TOO_MANY) return "rate limited";
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return null;
  });
  if (result.error) return { id, state: "down", ms: result.ms, detail: String((result.error as Error).message ?? result.error) };
  return { id, state: result.value ? "slow" : speed(result.ms), ms: result.ms, detail: result.value ?? null };
}

/** Shared by every StatusService (the route's and each agent turn's). */
let cached: { at: number; view: StatusView } | undefined;
/** What Kawase cannot work without; the rest (prices, FX) only makes the answer "slow". */
const CORE: ReadonlySet<DependencyLine["id"]> = new Set(["kawase_api", "database", "arc_testnet", "arc_mainnet", "circle"]);

export class StatusService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
  ) {}

  private async arc(network: "testnet" | "mainnet"): Promise<DependencyLine> {
    const id = network === "testnet" ? "arc_testnet" : "arc_mainnet";
    const client = this.chains.get(network)?.client;
    if (!client) return { id, state: "down", ms: null, detail: "not served here" };
    const result = await timed(() => client.getBlock());
    if (result.error || !result.value) return { id, state: "down", ms: result.ms, detail: "no answer" };
    const age = Math.max(0, Math.round(Date.now() / MS_PER_SECOND - Number(result.value.timestamp)));
    return {
      id,
      state: age > STALE_BLOCK_S ? "slow" : speed(result.ms),
      ms: result.ms,
      detail: `block ${result.value.number.toLocaleString("en")} · ${age} s old`,
    };
  }

  async view(): Promise<StatusView> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.view;
    const startedAt = Date.now();
    const database = timed(() => this.db.execute(sql`select 1`)).then(
      (result): DependencyLine => ({ id: "database", state: result.error ? "down" : speed(result.ms), ms: result.ms, detail: null }),
    );
    const items = await Promise.all([
      database,
      this.arc("testnet"),
      ...(this.chains.available.includes("mainnet") ? [this.arc("mainnet")] : []),
      ping("circle", CIRCLE_PING),
      ping("prices", PRICES_PING),
      ping("fx", FX_PING),
    ]);
    // Answering at all is the api's own health; the time is the whole check's.
    const api: DependencyLine = { id: "kawase_api", state: "ok", ms: Date.now() - startedAt, detail: null };
    const all = [api, ...items];
    const overall: DependencyState = all.some((item) => item.state === "down" && CORE.has(item.id)) ? "down" : all.some((item) => item.state !== "ok") ? "slow" : "ok";
    const view = { checkedAt: new Date().toISOString(), overall, items: all };
    cached = { at: Date.now(), view };
    return view;
  }
}
