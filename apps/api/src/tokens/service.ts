// The portfolio, token pages, markets and search (A0, R1, R2, R13). Balances on Arc come from one Multicall3 read
// over the canonical tokens, Arc's listed tokens and every token the watcher has seen arrive at the wallet; other
// chains come from LI.FI's balance index (mainnet). Prices: GeckoTerminal's token markets (shared cache), LI.FI's
// list as the fallback; test tokens are valued at their mainnet twin and always labelled test money.
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { erc20Abi, formatUnits, getAddress, isAddress, type Address } from "viem";

import {
  DUST_USD,
  MARKET_LIST_LIMIT,
  PORTFOLIO_HISTORY_DAYS,
  PORTFOLIO_SNAPSHOT_EVERY_MS,
  SECONDS_PER_DAY,
  MS_PER_SECOND,
  TOKEN_SEARCH_LIMIT,
} from "@kawase/config";
import type {
  Candle,
  ChartRange,
  HiddenReason,
  HoldingView,
  MarketListView,
  MarketRow,
  MarketSegment,
  PortfolioPoint,
  PortfolioView,
  PositionSummary,
  TokenActionView,
  TokenDetailView,
  TokenSearchResult,
  TokenView,
  WatchRow,
} from "@kawase/api-client";
import { portfolioSnapshots, walletTokens, watchlist, type Db } from "@kawase/db";
import {
  CANONICAL_TOKENS,
  NETWORKS,
  TESTNET_PRICE_TWINS,
  isForeignImpostor,
  isImpostor,
  isArcUsdc,
  normalizeSymbol,
  type NetworkId,
} from "@kawase/networks";
import type { Logger } from "@kawase/log";
import { USDC_ERC20_DECIMALS } from "@kawase/money";

import { HTTP, problem } from "../http/problem";
import { priceKey, type WalletHolding } from "../market/alchemy";
import type { MarketData, PoolRow, TokenMarket } from "../market/sources";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { TokenDirectory } from "./directory";
import { safetyVerdict, type Lookalike } from "./safety";

const MAINNET_CHAIN_ID = NETWORKS.mainnet.chainId;
/** Other chains (LI.FI scans ~60) and positions may take longer than a Home screen should wait; they fill the cache. */
const SLOW_SOURCE_WAIT_MS = 3_000;
/** Alchemy answered in 0.8–6.4 s in the live check; past this the fallback path answers and Alchemy fills its cache. */
const ALCHEMY_WAIT_MS = 7_000;
/** How the bridge chains' native coins (ETH, POL, AVAX) are addressed. */
const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";
const STABLE_DECIMALS = 6;
const NETWORK_EURC_MAINNET = NETWORKS.mainnet.addresses.eurc;

/** The answer if it comes within `ms`, else `fallback` (the work goes on and fills its cache for the next read). */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}
const PERCENT = 100;
const HISTORY_POINTS_MAX = 200;
const LOOKALIKES_MAX = 5;
/** Search ranks held tokens above everything else, then by how far Kawase trusts the token. */
const NOT_HELD_RANK = 10;
const ZERO = 0n;

/** Positions the earn service can report (kept narrow so tests can fake it). */
export type EarnPositions = (user: SessionUser) => Promise<{ vault: string; name: string; apy: number; assets: string }[]>;

type Priced = { priceUsd: number | null; change24hPct: number | null; market: TokenMarket | null };

const chainIdOf = (network: NetworkId) => NETWORKS[network].chainId;
const round = (value: number) => Math.round(value * PERCENT) / PERCENT;

export class AssetService {
  readonly directory: TokenDirectory;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly market: MarketData,
    private readonly log: Logger,
    private readonly earnPositions?: EarnPositions,
  ) {
    this.directory = new TokenDirectory(db, market);
  }

  /**
   * Keep the shared market cache warm so people's reads rarely spend GeckoTerminal's small budget: the Markets lists
   * and the prices of every listed and canonical token, refreshed when due.
   */
  startWarmer(intervalMs: number) {
    const run = async () => {
      await this.market.pools("trending").catch(() => undefined);
      await this.market.pools("new").catch(() => undefined);
      const listed = await this.market.listed(MAINNET_CHAIN_ID);
      await this.market.markets(MAINNET_CHAIN_ID, [...CANONICAL_TOKENS.mainnet.map((token) => token.address.toLowerCase()), ...listed.keys()]);
    };
    void run().catch((error: unknown) => this.log.warn({ err: error }, "market warm failed"));
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "market warm failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  // ── Prices ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** USD price and 24 h change per token (lower-case address); test tokens use their mainnet twin. */
  async prices(network: NetworkId, addresses: readonly string[]): Promise<{ prices: Map<string, Priced>; at: number; stale: boolean }> {
    const twin = (address: string) => (network === "testnet" ? TESTNET_PRICE_TWINS[address.toLowerCase()]?.toLowerCase() : address.toLowerCase());
    const lookups = addresses.map((address) => [address.toLowerCase(), twin(address)] as const);
    const wanted = lookups.map(([, mainnet]) => mainnet).filter((address): address is string => Boolean(address));
    const [{ markets, at, stale }, listed] = await Promise.all([this.market.markets(MAINNET_CHAIN_ID, wanted), this.market.listed(MAINNET_CHAIN_ID)]);
    const prices = new Map<string, Priced>();
    for (const [address, mainnet] of lookups) {
      const market = mainnet ? (markets.get(mainnet) ?? null) : null;
      const listedPrice = mainnet ? (listed.get(mainnet)?.priceUsd ?? null) : null;
      // The listed price wins for the dollar itself (GeckoTerminal can show USDC a hair off its peg from one pool).
      const priceUsd = mainnet && isArcUsdc(mainnet) ? (listedPrice ?? 1) : (market?.priceUsd ?? listedPrice);
      prices.set(address, { priceUsd, change24hPct: market?.change24hPct ?? null, market });
    }
    // Majors no DEX list prices (and any token the others missed): Alchemy's Prices API, when configured.
    const unpriced = lookups.filter(([address, mainnet]) => mainnet && prices.get(address)?.priceUsd === null);
    if (unpriced.length > 0 && this.market.wallets) {
      const found = await this.market.wallets.prices(unpriced.map(([, mainnet]) => ({ chainId: MAINNET_CHAIN_ID, address: mainnet! }))).catch(() => new Map<string, number>());
      for (const [address, mainnet] of unpriced) {
        const value = found.get(priceKey(MAINNET_CHAIN_ID, mainnet!));
        if (value !== undefined) prices.set(address, { ...prices.get(address)!, priceUsd: value });
      }
    }
    return { prices, at, stale };
  }

  // ── Portfolio ───────────────────────────────────────────────────────────────────────────────────────────────

  async portfolio(user: SessionUser): Promise<PortfolioView> {
    const network = user.activeNetwork;
    const chainId = chainIdOf(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const clients = this.chains.get(network);
    const currency = user.displayCurrency || "USD";
    const perUsd = (await this.market.fx(currency)) ?? 1;
    const fx = { currency: perUsd === 1 && currency !== "USD" ? "USD" : currency, perUsd };

    if (!wallet || !clients) return this.emptyPortfolio(network, fx);

    // Every token this wallet might hold on Arc: the verified list, the market's list, and what has arrived.
    const [listed, seen] = await Promise.all([
      this.market.listed(chainId),
      this.db
        .select({ token: walletTokens.tokenAddress, visibility: walletTokens.visibility })
        .from(walletTokens)
        .where(and(eq(walletTokens.userId, user.id), eq(walletTokens.chainId, chainId))),
    ]);
    const visibility = new Map(seen.map((row) => [row.token, row.visibility]));
    // Primary discovery: Alchemy's Portfolio API (Arc and the bridge chains in one call); the watcher's list and the
    // market's list stay as the fallback and the real-time path. Balances on Arc are read on chain either way.
    const index = this.market.wallets ? await within(this.market.wallets.holdings(wallet, network), ALCHEMY_WAIT_MS, null) : null;
    const indexed = index?.holdings ?? null;
    const candidates = [
      ...new Set([
        ...CANONICAL_TOKENS[network].map((token) => token.address.toLowerCase()),
        ...listed.keys(),
        ...seen.map((row) => row.token),
        ...(indexed ?? []).filter((entry) => entry.chainId === chainId && entry.tokenAddress).map((entry) => entry.tokenAddress!),
      ]),
    ];
    const balances = await this.balancesOnArc(network, wallet, candidates);
    const held = [...balances.entries()].filter(([, balance]) => balance > ZERO).map(([address]) => address);
    // A token found by a balance read (a listed token the watcher has not seen arrive yet) joins the wallet's list.
    const unseen = held.filter((address) => !visibility.has(address));
    if (unseen.length > 0)
      await this.db
        .insert(walletTokens)
        .values(unseen.map((tokenAddress) => ({ userId: user.id, network, chainId, tokenAddress, walletAddress: wallet.toLowerCase(), source: "balance" as const })))
        .onConflictDoNothing();

    const [{ prices, at, stale }, positionsRaw, other] = await Promise.all([
      this.prices(network, held),
      this.earnPositions
        ? within(this.earnPositions(user).catch((error: unknown) => (this.log.warn({ err: error }, "portfolio earn positions failed"), [])), SLOW_SOURCE_WAIT_MS, [])
        : Promise.resolve([]),
      indexed
        ? this.otherChainsFromIndex(network, indexed.filter((entry) => entry.chainId !== chainId))
        : network === "mainnet"
          ? within(this.otherChains(wallet), SLOW_SOURCE_WAIT_MS, [] as HoldingView[])
          : Promise.resolve([] as HoldingView[]),
    ]);
    const described = await this.directory.describe(network, chainId, clients.client, held, new Map([...prices].flatMap(([address, priced]) => (priced.market ? [[address, priced.market] as const] : []))));

    const positionVaults = new Set(positionsRaw.map((position) => position.vault.toLowerCase()));
    const assets: HoldingView[] = [];
    const hidden: HoldingView[] = [];
    const positions: PositionSummary[] = [];
    const usdc = described.get(CANONICAL_TOKENS[network][0]!.address.toLowerCase());
    const usdcPrice = prices.get(CANONICAL_TOKENS[network][0]!.address.toLowerCase())?.priceUsd ?? 1;

    for (const position of positionsRaw) {
      const value = Number(formatUnits(BigInt(position.assets), usdc?.decimals ?? USDC_ERC20_DECIMALS)) * usdcPrice;
      positions.push({ kind: "earn", id: getAddress(position.vault), title: position.name, provider: "morpho", valueUsd: round(value), apyPct: round(position.apy * PERCENT), token: usdc ?? null });
    }

    for (const address of held) {
      const token = described.get(address);
      if (!token) continue;
      const balance = balances.get(address)!;
      const priced = prices.get(address);
      const amount = formatUnits(balance, token.decimals);
      const valueUsd = priced?.priceUsd === null || priced?.priceUsd === undefined ? null : Number(amount) * priced.priceUsd;
      // Vault shares are positions, not loose tokens; those the earn service already reports are not counted twice.
      if (token.kind === "position") {
        if (!positionVaults.has(address)) positions.push({ kind: "earn", id: token.address, title: token.name, provider: "vault", valueUsd: valueUsd === null ? null : round(valueUsd), apyPct: null, token });
        continue;
      }
      const holding: HoldingView = {
        token,
        balance: balance.toString(),
        amount,
        priceUsd: priced?.priceUsd ?? null,
        valueUsd: valueUsd === null ? null : round(valueUsd),
        change24hPct: priced?.change24hPct ?? null,
        chainName: NETWORKS[network].viemChain.name,
        hidden: false,
        hiddenReason: null,
      };
      const reason = hideReason(token, valueUsd, visibility.get(address));
      if (reason) hidden.push({ ...holding, hidden: true, hiddenReason: reason });
      else assets.push(holding);
    }

    const byValue = (a: HoldingView, b: HoldingView) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
    assets.sort(byValue);
    hidden.sort(byValue);
    const visibleOther = other.filter((holding) => !holding.hidden).sort(byValue);
    const sum = (rows: { valueUsd: number | null }[]) => rows.reduce((total, row) => total + (row.valueUsd ?? 0), 0);
    const availableUsd = sum(assets);
    const positionsUsd = sum(positions);
    const otherChainsUsd = sum(visibleOther);
    const totalUsd = round(availableUsd + positionsUsd + otherChainsUsd);
    // What today's holdings were worth 24 hours ago, from each token's own change.
    let before = 0;
    let moved = false;
    for (const row of [...assets, ...visibleOther]) {
      if (row.valueUsd === null) continue;
      if (row.change24hPct === null) {
        before += row.valueUsd;
        continue;
      }
      moved = true;
      before += row.valueUsd / (1 + row.change24hPct / PERCENT);
    }
    before += positionsUsd;
    const change24hUsd = moved ? round(totalUsd - before) : null;
    const change24hPct = moved && before > 0 ? round(((totalUsd - before) / before) * PERCENT) : null;

    const history = await this.history(user.id, network, totalUsd);
    return {
      network,
      isTest: network === "testnet",
      totalUsd,
      change24hUsd,
      change24hPct,
      assets,
      otherChains: visibleOther,
      hidden: [...hidden, ...other.filter((holding) => holding.hidden)],
      positions,
      breakdown: { availableUsd: round(availableUsd), positionsUsd: round(positionsUsd), otherChainsUsd: round(otherChainsUsd) },
      history,
      fx,
      pricedAt: new Date(at).toISOString(),
      // A chain Alchemy could not answer for is shown from its last answer, or missing: either way, not fresh.
      stale: stale || (index?.failedChains.length ?? 0) > 0,
    };
  }

  private emptyPortfolio(network: NetworkId, fx: PortfolioView["fx"]): PortfolioView {
    return {
      network,
      isTest: network === "testnet",
      totalUsd: 0,
      change24hUsd: null,
      change24hPct: null,
      assets: [],
      otherChains: [],
      hidden: [],
      positions: [],
      breakdown: { availableUsd: 0, positionsUsd: 0, otherChainsUsd: 0 },
      history: [],
      fx,
      pricedAt: new Date().toISOString(),
      stale: false,
    };
  }

  /** One Multicall3 read of balanceOf for every candidate (USDC through its 6-decimal ERC-20 view: one asset). */
  async balancesOnArc(network: NetworkId, wallet: Address, tokens: readonly string[]): Promise<Map<string, bigint>> {
    const clients = this.chains.get(network);
    const out = new Map<string, bigint>();
    if (!clients || tokens.length === 0) return out;
    const results = await clients.client.multicall({
      contracts: tokens.map((token) => ({ address: token as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) as const),
      allowFailure: true,
    });
    tokens.forEach((token, index) => {
      const result = results[index];
      if (result?.status === "success") out.set(token.toLowerCase(), result.result as bigint);
    });
    return out;
  }

  /**
   * The wallet's tokens on the bridge chains, from Alchemy (native coins and every ERC-20). Kawase's own rules decide
   * what shows: a stablecoin symbol with the wrong decimals is a fake; no price means Hidden; tokens without a price
   * never count toward the total. Test networks value test USDC/EURC at their mainnet twin.
   */
  private async otherChainsFromIndex(network: NetworkId, entries: readonly WalletHolding[]): Promise<HoldingView[]> {
    const usable = entries.filter((entry) => entry.decimals !== null && entry.symbol);
    const missing = usable.filter((entry) => entry.priceUsd === null && entry.tokenAddress).map((entry) => ({ chainId: entry.chainId, address: entry.tokenAddress! }));
    const fetched = missing.length && this.market.wallets && network === "mainnet" ? await this.market.wallets.prices(missing).catch(() => new Map<string, number>()) : new Map<string, number>();
    const twins = network === "testnet" ? await this.prices("mainnet", [CANONICAL_TOKENS.mainnet[0]!.address, NETWORK_EURC_MAINNET]) : undefined;
    return usable.map((entry) => {
      const decimals = entry.decimals!;
      const symbol = entry.symbol!;
      const fake = isForeignImpostor(symbol, decimals);
      const twin = twins && !fake && decimals === STABLE_DECIMALS ? (symbol === "USDC" ? 1 : symbol === "EURC" ? (twins.prices.get(NETWORK_EURC_MAINNET.toLowerCase())?.priceUsd ?? null) : null) : null;
      const looked = entry.tokenAddress ? fetched.get(priceKey(entry.chainId, entry.tokenAddress)) : undefined;
      const priceUsd = fake ? null : (entry.priceUsd ?? looked ?? twin);
      const amount = formatUnits(entry.balance, decimals);
      const valueUsd = priceUsd === null ? null : Number(amount) * priceUsd;
      const token: TokenView = {
        chainId: entry.chainId,
        address: entry.tokenAddress ? getAddress(entry.tokenAddress) : NATIVE_ADDRESS,
        symbol,
        name: entry.name ?? symbol,
        decimals,
        logoUrl: entry.logoUrl,
        kind: "token",
        status: fake ? "impersonator" : priceUsd === null ? "unverified" : "listed",
        isTest: network === "testnet",
      };
      const reason: HiddenReason | null = fake ? "impersonator" : priceUsd === null ? "spam" : valueUsd !== null && valueUsd < DUST_USD ? "dust" : null;
      return {
        token,
        balance: entry.balance.toString(),
        amount,
        priceUsd,
        valueUsd: valueUsd === null ? null : round(valueUsd),
        change24hPct: null,
        chainName: entry.chainName,
        hidden: reason !== null,
        hiddenReason: reason,
      };
    });
  }

  /** The wallet's tokens on the other chains LI.FI indexes (the same address on each EVM chain). */
  private async otherChains(wallet: Address): Promise<HoldingView[]> {
    const [balances, chains] = await Promise.all([this.market.otherChains(wallet), this.market.chains()]);
    return balances.map((entry) => {
      const amount = formatUnits(BigInt(entry.amount), entry.decimals);
      const valueUsd = entry.priceUsd === null ? null : Number(amount) * entry.priceUsd;
      const token: TokenView = {
        chainId: entry.chainId,
        address: entry.address,
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
        logoUrl: entry.logoUrl,
        kind: "token",
        status: "listed",
        isTest: false,
      };
      const dust = valueUsd === null || valueUsd < DUST_USD;
      return {
        token,
        balance: entry.amount,
        amount,
        priceUsd: entry.priceUsd,
        valueUsd: valueUsd === null ? null : round(valueUsd),
        change24hPct: null,
        chainName: chains.get(entry.chainId)?.name ?? `Chain ${entry.chainId}`,
        hidden: dust,
        hiddenReason: dust ? "dust" : null,
      };
    });
  }

  /** Snapshots of the total for the balance chart; one is written at most every quarter hour. */
  private async history(userId: string, network: NetworkId, totalUsd: number): Promise<PortfolioPoint[]> {
    const since = new Date(Date.now() - PORTFOLIO_HISTORY_DAYS * SECONDS_PER_DAY * MS_PER_SECOND);
    const rows = await this.db
      .select({ takenAt: portfolioSnapshots.takenAt, totalUsd: portfolioSnapshots.totalUsd })
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.network, network), gte(portfolioSnapshots.takenAt, since)))
      .orderBy(asc(portfolioSnapshots.takenAt));
    const last = rows.at(-1);
    if (!last || Date.now() - last.takenAt.getTime() >= PORTFOLIO_SNAPSHOT_EVERY_MS) {
      await this.db.insert(portfolioSnapshots).values({ userId, network, totalUsd }).onConflictDoNothing();
    }
    const step = Math.max(1, Math.ceil(rows.length / HISTORY_POINTS_MAX));
    const points = rows.filter((_, index) => index % step === 0).map((row) => ({ t: row.takenAt.toISOString(), usd: round(row.totalUsd) }));
    return [...points, { t: new Date().toISOString(), usd: totalUsd }];
  }

  /**
   * Whether a token that just arrived is news (R1): the same rules as Hidden decide — the person's own choice, the
   * copycat rule, spam (unverified with no price) and dust stay quiet; anything else is announced with its symbol
   * and decimals. Null = keep it silent.
   */
  async arrivalNotice(userId: string, network: NetworkId, token: string, amount: bigint): Promise<{ symbol: string; decimals: number } | null> {
    const clients = this.chains.get(network);
    if (!clients) return null;
    const address = token.toLowerCase();
    const [described, rows] = await Promise.all([
      this.directory.describe(network, clients.network.chainId, clients.client, [address]),
      this.db
        .select({ visibility: walletTokens.visibility })
        .from(walletTokens)
        .where(and(eq(walletTokens.userId, userId), eq(walletTokens.chainId, clients.network.chainId), eq(walletTokens.tokenAddress, address))),
    ]);
    const view = described.get(address);
    if (!view) return null;
    const { prices } = await this.prices(network, [address]).catch(() => ({ prices: new Map<string, { priceUsd: number | null }>() }));
    const priceUsd = prices.get(address)?.priceUsd ?? null;
    const valueUsd = priceUsd === null ? null : Number(formatUnits(amount, view.decimals)) * priceUsd;
    if (hideReason(view, valueUsd, rows[0]?.visibility) !== null) return null;
    return { symbol: view.symbol, decimals: view.decimals };
  }

  // ── The watchlist (the token page's star; Markets "Watchlist") ──────────────────────────────────────────────────

  async watched(userId: string, network: NetworkId, address: string): Promise<boolean> {
    const [row] = await this.db
      .select({ token: watchlist.tokenAddress })
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.chainId, chainIdOf(network)), eq(watchlist.tokenAddress, address.toLowerCase())));
    return Boolean(row);
  }

  async watch(user: SessionUser, network: NetworkId, address: string, on: boolean): Promise<{ watched: boolean }> {
    const chainId = chainIdOf(network);
    const token = address.toLowerCase();
    if (on) await this.db.insert(watchlist).values({ userId: user.id, network, chainId, tokenAddress: token }).onConflictDoNothing();
    else await this.db.delete(watchlist).where(and(eq(watchlist.userId, user.id), eq(watchlist.chainId, chainId), eq(watchlist.tokenAddress, token)));
    return { watched: on };
  }

  /** The starred tokens on a network with today's price and 24 h change, newest star first. */
  async watchlist(user: SessionUser, network: NetworkId = user.activeNetwork): Promise<WatchRow[]> {
    const clients = this.chains.get(network);
    const rows = await this.db
      .select({ token: watchlist.tokenAddress })
      .from(watchlist)
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.network, network)))
      .orderBy(desc(watchlist.createdAt));
    if (rows.length === 0) return [];
    const addresses = rows.map((row) => row.token);
    const [described, { prices }, held] = await Promise.all([
      this.directory.describe(network, chainIdOf(network), clients?.client, addresses),
      this.prices(network, addresses).catch(() => ({ prices: new Map<string, Priced>() })),
      this.db
        .select({ token: walletTokens.tokenAddress })
        .from(walletTokens)
        .where(and(eq(walletTokens.userId, user.id), eq(walletTokens.chainId, chainIdOf(network)))),
    ]);
    const holding = new Set(held.map((row) => row.token));
    return addresses.flatMap((address) => {
      const token = described.get(address);
      if (!token) return [];
      const priced = prices.get(address);
      return [{ token, priceUsd: priced?.priceUsd ?? null, change24hPct: priced?.change24hPct ?? null, held: holding.has(address) }];
    });
  }

  async setVisibility(user: SessionUser, address: string, visibility: "auto" | "shown" | "hidden") {
    if (!isAddress(address)) throw problem(HTTP.badRequest, "validation", "expected a token address");
    const wallet = (await this.wallets.userWallet(user.id))?.address;
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const network = user.activeNetwork;
    await this.db
      .insert(walletTokens)
      .values({ userId: user.id, network, chainId: chainIdOf(network), tokenAddress: address.toLowerCase(), walletAddress: wallet.toLowerCase(), source: "balance", visibility })
      .onConflictDoUpdate({ target: [walletTokens.userId, walletTokens.chainId, walletTokens.tokenAddress], set: { visibility, updatedAt: new Date() } });
    return { address: getAddress(address), visibility };
  }

  // ── Token page ──────────────────────────────────────────────────────────────────────────────────────────────

  /** The safety verdict alone (copycat rule + GoPlus, cached), for a buy: no market page, no lookalike search. */
  async safety(network: NetworkId, token: TokenView) {
    const facts = network === "mainnet" ? await this.market.security(MAINNET_CHAIN_ID, token.address.toLowerCase()) : null;
    return safetyVerdict(token, facts, []);
  }

  async token(viewer: SessionUser | undefined, network: NetworkId, address: string): Promise<TokenDetailView> {
    if (!isAddress(address)) throw problem(HTTP.badRequest, "validation", "expected a token address");
    const chainId = chainIdOf(network);
    const lower = address.toLowerCase();
    const clients = this.chains.get(network);
    const { prices, at, stale } = await this.prices(network, [lower]);
    const priced = prices.get(lower);
    const described = await this.directory.describe(network, chainId, clients?.client ?? this.anyClient(network), [lower], priced?.market ? new Map([[lower, priced.market]]) : undefined);
    const token = described.get(lower);
    if (!token) throw problem(HTTP.notFound, "not_found", "no token at this address on this network");
    const marketAddress = network === "testnet" ? TESTNET_PRICE_TWINS[lower]?.toLowerCase() : lower;
    const [info, facts, lookalikes, holding] = await Promise.all([
      marketAddress && network === "mainnet" ? this.market.info(MAINNET_CHAIN_ID, marketAddress) : Promise.resolve(null),
      network === "mainnet" ? this.market.security(MAINNET_CHAIN_ID, lower) : Promise.resolve(null),
      network === "mainnet" ? this.lookalikes(token) : Promise.resolve([] as Lookalike[]),
      viewer ? this.holdingOf(viewer, network, token, priced) : Promise.resolve(null),
    ]);
    // Two unlisted tokens with one symbol: the deeper market is the one people mean; the other is the lookalike.
    if (token.status === "unverified" && lookalikes.some((other) => (other.liquidityUsd ?? 0) > (priced?.market?.liquidityUsd ?? 0))) token.status = "lookalike";
    const safety = safetyVerdict(token, facts, lookalikes);
    const market = priced?.market ?? null;
    return {
      token,
      network,
      market: {
        priceUsd: priced?.priceUsd ?? null,
        change24hPct: priced?.change24hPct ?? null,
        volume24hUsd: market?.volume24hUsd ?? null,
        liquidityUsd: market?.liquidityUsd ?? null,
        marketCapUsd: market?.marketCapUsd ?? null,
        fdvUsd: market?.fdvUsd ?? null,
        holders: info?.holders ?? facts?.holders ?? null,
        pool: market?.pool ? { address: market.pool.address, dex: market.pool.dex, createdAt: market.pool.createdAt } : null,
      },
      about: { description: info?.description ?? null, websites: info?.websites ?? [], twitter: info?.twitter ?? null, telegram: info?.telegram ?? null },
      safety,
      holding,
      actions: tokenActions(network, token, safety.level, holding),
      pricedAt: new Date(at).toISOString(),
      stale,
    };
  }

  async chart(network: NetworkId, address: string, range: ChartRange): Promise<Candle[]> {
    if (!isAddress(address)) throw problem(HTTP.badRequest, "validation", "expected a token address");
    const mainnet = network === "testnet" ? TESTNET_PRICE_TWINS[address.toLowerCase()] : address;
    if (!mainnet) return [];
    const { prices } = await this.prices("mainnet", [mainnet]);
    const pool = prices.get(mainnet.toLowerCase())?.market?.pool;
    if (!pool) return [];
    return this.market.chart(MAINNET_CHAIN_ID, pool.address, mainnet.toLowerCase(), range);
  }

  private anyClient(network: NetworkId) {
    return this.chains.get(network)?.client;
  }

  private async holdingOf(viewer: SessionUser, network: NetworkId, token: TokenView, priced: Priced | undefined): Promise<HoldingView | null> {
    if (viewer.activeNetwork !== network) return null;
    const wallet = (await this.wallets.userWallet(viewer.id))?.address as Address | undefined;
    if (!wallet) return null;
    const balance = (await this.balancesOnArc(network, wallet, [token.address.toLowerCase()])).get(token.address.toLowerCase()) ?? ZERO;
    const amount = formatUnits(balance, token.decimals);
    const valueUsd = priced?.priceUsd ? round(Number(amount) * priced.priceUsd) : null;
    return { token, balance: balance.toString(), amount, priceUsd: priced?.priceUsd ?? null, valueUsd, change24hPct: priced?.change24hPct ?? null, chainName: NETWORKS[network].viemChain.name, hidden: false, hiddenReason: null };
  }

  /** Other tokens on Arc using this token's symbol, from the market's pools (copycats, cards/trade.md). */
  private async lookalikes(token: TokenView): Promise<Lookalike[]> {
    const symbol = normalizeSymbol(token.symbol);
    if (!symbol) return [];
    const pools = await this.market.search(token.symbol);
    const seen = new Map<string, Lookalike>();
    for (const pool of pools) {
      for (const side of [pool.base, pool.quote]) {
        if (!side.address || normalizeSymbol(side.symbol) !== symbol || side.address.toLowerCase() === token.address.toLowerCase()) continue;
        const known = seen.get(side.address.toLowerCase());
        const liquidity = pool.liquidityUsd ?? 0;
        if (!known || (known.liquidityUsd ?? 0) < liquidity) seen.set(side.address.toLowerCase(), { address: side.address, name: side.name, liquidityUsd: liquidity });
      }
    }
    return [...seen.values()].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, LOOKALIKES_MAX);
  }

  // ── Markets and search ─────────────────────────────────────────────────────────────────────────────────────

  async markets(network: NetworkId, segment: MarketSegment): Promise<MarketListView> {
    if (network === "testnet") return { segment, network, rows: [], pricedAt: new Date().toISOString(), stale: false, available: false };
    // Long/short lists come from the margin venue (Kawase Margin on Aave V4), which is being built: no rows yet.
    if (segment === "perps") return { segment, network, rows: [], pricedAt: new Date().toISOString(), stale: false, available: false };
    if (segment === "fx") return this.fxMarkets();
    const pools = await this.market.pools(segment === "new" ? "new" : "trending").catch(() => ({ value: [] as PoolRow[], at: Date.now(), stale: true }));
    const owners = await this.directory.symbolOwners("mainnet", MAINNET_CHAIN_ID);
    const listed = await this.market.listed(MAINNET_CHAIN_ID);
    const rows: MarketRow[] = [];
    const seen = new Set<string>();
    for (const pool of pools.value) {
      // The traded side is the base token, unless the base is a stable quote (then the other side).
      const side = CANONICAL_TOKENS.mainnet.some((token) => token.address.toLowerCase() === pool.base.address.toLowerCase() && token.kind === "dollar") ? pool.quote : pool.base;
      if (!side.address || seen.has(side.address.toLowerCase())) continue;
      const token = this.poolToken(side, owners, listed);
      if (segment === "meme" && !isMeme(token)) continue;
      seen.add(side.address.toLowerCase());
      rows.push({
        token,
        priceUsd: pool.priceUsd,
        change24hPct: pool.change24hPct,
        volume24hUsd: pool.volume24hUsd,
        liquidityUsd: pool.liquidityUsd,
        marketCapUsd: pool.marketCapUsd,
        pool: { address: pool.address, dex: pool.dex, createdAt: pool.createdAt },
        spark: null,
      });
      if (rows.length >= MARKET_LIST_LIMIT) break;
    }
    return { segment, network, rows, pricedAt: new Date(pools.at).toISOString(), stale: pools.stale, available: true };
  }

  /** Stocks & FX: the verified currency and real-world-asset tokens on Arc (EURC, wARS, XAUm…), priced. */
  private async fxMarkets(): Promise<MarketListView> {
    const tokens = CANONICAL_TOKENS.mainnet.filter((token) => token.kind === "fiat" || token.kind === "rwa");
    const { prices, at, stale } = await this.prices("mainnet", tokens.map((token) => token.address));
    const described = await this.directory.describe("mainnet", MAINNET_CHAIN_ID, this.anyClient("mainnet"), tokens.map((token) => token.address));
    const rows: MarketRow[] = [];
    for (const canonical of tokens) {
      const token = described.get(canonical.address.toLowerCase());
      const priced = prices.get(canonical.address.toLowerCase());
      const pool = priced?.market?.pool;
      if (!token || !pool) continue;
      rows.push({
        token: { ...token, logoUrl: token.logoUrl ?? priced?.market?.logoUrl ?? null },
        priceUsd: priced?.priceUsd ?? null,
        change24hPct: priced?.change24hPct ?? null,
        volume24hUsd: priced?.market?.volume24hUsd ?? null,
        liquidityUsd: priced?.market?.liquidityUsd ?? null,
        marketCapUsd: priced?.market?.marketCapUsd ?? null,
        pool: { address: pool.address, dex: pool.dex, createdAt: pool.createdAt },
        spark: null,
      });
    }
    return { segment: "fx", network: "mainnet", rows, pricedAt: new Date(at).toISOString(), stale, available: true };
  }

  private poolToken(side: PoolRow["base"], owners: Map<string, string>, listed: Map<string, unknown>): TokenView {
    const lower = side.address.toLowerCase();
    const canonical = CANONICAL_TOKENS.mainnet.find((token) => token.address.toLowerCase() === lower);
    return {
      chainId: MAINNET_CHAIN_ID,
      address: getAddress(side.address),
      symbol: canonical?.symbol ?? side.symbol,
      name: canonical?.name ?? side.name,
      decimals: canonical?.decimals ?? side.decimals,
      logoUrl: side.logoUrl,
      kind: canonical?.kind ?? "token",
      status: this.directory.status("mainnet", lower, side.symbol, Boolean(canonical), listed.has(lower) || Boolean(side.coingeckoId), owners, side.decimals),
      isTest: false,
    };
  }

  /** Search by name, symbol or address: held tokens and the lists first, then the market's pools. */
  async search(viewer: SessionUser | undefined, network: NetworkId, query: string): Promise<TokenSearchResult[]> {
    const text = query.trim();
    const chainId = chainIdOf(network);
    const clients = this.chains.get(network);
    if (!text) return [];
    const heldSet = new Set<string>();
    if (viewer && viewer.activeNetwork === network) {
      const rows = await this.db.select({ token: walletTokens.tokenAddress }).from(walletTokens).where(and(eq(walletTokens.userId, viewer.id), eq(walletTokens.chainId, chainId)));
      for (const row of rows) heldSet.add(row.token);
    }
    if (isAddress(text)) {
      const described = await this.directory.describe(network, chainId, clients?.client, [text.toLowerCase()]);
      const token = described.get(text.toLowerCase());
      if (!token) return [];
      const { prices } = await this.prices(network, [text]);
      const priced = prices.get(text.toLowerCase());
      return [{ token, priceUsd: priced?.priceUsd ?? null, liquidityUsd: priced?.market?.liquidityUsd ?? null, held: heldSet.has(text.toLowerCase()) }];
    }
    const needle = text.toLowerCase();
    const listed = await this.market.listed(chainId);
    const local = [
      ...CANONICAL_TOKENS[network].map((token) => token.address.toLowerCase()),
      ...listed.keys(),
      ...heldSet,
    ];
    const describedLocal = await this.directory.describe(network, chainId, clients?.client, local);
    const matches = [...describedLocal.values()].filter((token) => token.symbol.toLowerCase().includes(needle) || token.name.toLowerCase().includes(needle));
    const found = new Map(matches.map((token) => [token.address.toLowerCase(), token]));
    if (network === "mainnet") {
      const owners = await this.directory.symbolOwners(network, chainId);
      for (const pool of await this.market.search(text)) {
        for (const side of [pool.base, pool.quote]) {
          if (!side.address || found.has(side.address.toLowerCase())) continue;
          if (!side.symbol.toLowerCase().includes(needle) && !side.name.toLowerCase().includes(needle)) continue;
          found.set(side.address.toLowerCase(), this.poolToken(side, owners, listed));
        }
      }
    }
    const { prices } = await this.prices(network, [...found.keys()]);
    const rank = (token: TokenView) =>
      (heldSet.has(token.address.toLowerCase()) ? 0 : NOT_HELD_RANK) + ({ canonical: 0, listed: 1, unverified: 2, lookalike: 3, impersonator: 4 } as const)[token.status];
    return [...found.values()]
      .map((token) => {
        const priced = prices.get(token.address.toLowerCase());
        return { token, priceUsd: priced?.priceUsd ?? null, liquidityUsd: priced?.market?.liquidityUsd ?? null, held: heldSet.has(token.address.toLowerCase()) };
      })
      .sort((a, b) => rank(a.token) - rank(b.token) || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
      .slice(0, TOKEN_SEARCH_LIMIT);
  }
}

/** Why a holding starts in Hidden: the person's choice first, then the copycat rule, then spam and dust. */
function hideReason(token: TokenView, valueUsd: number | null, visibility: "auto" | "shown" | "hidden" | undefined): HiddenReason | null {
  if (visibility === "hidden") return "chosen";
  if (visibility === "shown") return null;
  if (token.status === "impersonator") return "impersonator";
  if (token.status === "lookalike") return "lookalike";
  if (token.status === "unverified" && (valueUsd === null || valueUsd < DUST_USD)) return "spam";
  if (token.status !== "canonical" && valueUsd !== null && valueUsd < DUST_USD) return "dust";
  return null;
}

const MEME_EXCLUDED_KINDS = new Set(["dollar", "fiat", "bitcoin", "ether", "rwa", "permissioned", "position"]);
const isMeme = (token: TokenView) => !MEME_EXCLUDED_KINDS.has(token.kind) && !isImpostor("mainnet", token.symbol, token.address, token.decimals);

/**
 * What a person can do with a token here, each with its reason when they cannot (R1, R2; capability-matrix.md).
 * Reason codes: mainnet_only, blocked, permissioned, position, no_balance, convert_first, no_yield, no_market.
 */
export function tokenActions(network: NetworkId, token: TokenView, safety: "ok" | "caution" | "block", holding: HoldingView | null): TokenActionView[] {
  const holds = holding !== null && BigInt(holding.balance) > ZERO;
  const testnetPair = token.kind === "dollar" || token.symbol === "EURC";
  const stable = token.kind === "dollar";
  const is = (available: boolean, reason: string | null): { available: boolean; reason: string | null } => ({ available, reason: available ? null : reason });
  const tradable = (): { available: boolean; reason: string | null } => {
    if (token.kind === "permissioned") return is(false, "permissioned");
    if (token.kind === "position") return is(false, "position");
    if (safety === "block") return is(false, "blocked");
    if (network === "testnet" && !testnetPair) return is(false, "mainnet_only");
    return is(true, null);
  };
  const trade = tradable();
  return [
    { id: "buy", ...trade },
    { id: "sell", ...(trade.available ? is(holds, "no_balance") : trade) },
    { id: "send", ...(token.kind === "permissioned" ? is(false, "permissioned") : is(holds, "no_balance")) },
    { id: "receive", ...is(token.kind !== "permissioned", "permissioned") },
    { id: "withdraw", ...(token.kind === "permissioned" ? is(false, "permissioned") : is(holds, "no_balance")) },
    // CCTP carries USDC itself; every other token converts to USDC first (one approval: R2's nearest path).
    { id: "bridge", ...(stable ? is(holds, "no_balance") : is(false, "convert_first")) },
    { id: "earn", ...(stable ? is(true, null) : is(false, "no_yield")) },
    { id: "long_short", ...is(false, "no_market") },
  ];
}
