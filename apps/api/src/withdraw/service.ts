// Withdraw (money-out.md "Withdraw (any asset, anywhere)", G7) and My places. The plan is computed here, the same
// for the Withdraw screen and the agent's propose_withdraw: one line per asset with its route —
//   on Arc → a transfer; to another chain → the bridge (B1's /crosschain, which carries USDC); anything else as
//   cash → convert to USDC on Arc first (the swap ticket), then the transfer or the bridge —
// what arrives, and why a line cannot go (R2). Exchanges come from the exchange table (accepted asset × network);
// sending one something it does not credit is a strong warning with the convert offer, and exchanges are
// mainnet-only. Executing is the app's: each step is an existing intent (swap, send, cross-chain), checked by its
// own engine (R6 included), after one Face ID for the reviewed plan.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { formatUnits, getAddress, isAddress } from "viem";

import type { ExchangeView, HoldingView, PlaceInput, PlaceView, TokenView, WithdrawDestinationView, WithdrawLegView, WithdrawPlanInput, WithdrawPlanView, WithdrawReason, WithdrawStep } from "@kawase/api-client";
import { EXCHANGES, GAS_FLOAT_USDC_BASE_UNITS, WITHDRAW_DUST_USD, exchangeRail, findExchange, type Exchange } from "@kawase/config";
import { intents, places, type Db } from "@kawase/db";
import { CANONICAL_TOKENS, normalizeSymbol, type NetworkContext, type NetworkId } from "@kawase/networks";

import type { BridgeEngine } from "../bridge/engine";
import { HTTP, problem } from "../http/problem";
import { parseTokenAmount } from "../send/facts";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";

type PlaceRow = typeof places.$inferSelect;
type ChainView = { key: string; name: string; chainId: number | null };

const ZERO = 0n;
const ARC = "arc";
const USD_DECIMALS = 2;
const CHAIN_NAMES: Record<string, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "OP Mainnet", polygon: "Polygon", avalanche: "Avalanche" };
const UNCONVERTIBLE_KINDS: ReadonlySet<string> = new Set(["permissioned", "position"]);
const WARNINGS: ReadonlySet<WithdrawReason> = new Set(["exchange_not_accepted", "exchange_unconfirmed", "exchange_limited"]);
const MAX_WORDS: ReadonlySet<string> = new Set(["max", "all", "everything"]);

const lower = (value: string) => value.toLowerCase();

export class WithdrawService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly assets: AssetService,
    private readonly engine: BridgeEngine,
  ) {}

  private context(network: NetworkId): NetworkContext {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients.network;
  }

  /** Arc first, then every chain the bridge reaches from this network. */
  chainsFor(network: NetworkId): ChainView[] {
    const context = this.context(network);
    return [this.chainView(context, ARC)!, ...this.engine.destinations(context).map((chain) => ({ key: chain.id, name: CHAIN_NAMES[chain.id] ?? chain.id, chainId: chain.chainId }))];
  }

  private chainView(context: NetworkContext, key: string): ChainView | undefined {
    const wanted = lower(key.trim());
    if (wanted === ARC || wanted === String(context.chainId) || wanted === "arc testnet") return { key: ARC, name: context.isRealMoney ? "Arc" : "Arc Testnet", chainId: context.chainId };
    const chain = this.engine.destinations(context).find((entry) => entry.id === wanted || String(entry.chainId) === wanted || lower(CHAIN_NAMES[entry.id] ?? "") === wanted);
    return chain ? { key: chain.id, name: CHAIN_NAMES[chain.id] ?? chain.id, chainId: chain.chainId } : undefined;
  }

  exchanges(network: NetworkId): ExchangeView[] {
    return EXCHANGES.map((exchange) => this.exchangeView(network, exchange));
  }

  private exchangeView(network: NetworkId, exchange: Exchange): ExchangeView {
    const rail = exchangeRail(exchange, "deposit");
    const context = this.context(network);
    const chain = this.chainView(context, rail.chain) ?? { key: rail.chain, name: CHAIN_NAMES[rail.chain] ?? rail.chain, chainId: null };
    return {
      slug: exchange.slug,
      name: exchange.name,
      chain,
      asset: rail.asset,
      deposit: rail.deposit,
      withdraw: exchangeRail(exchange, "withdraw").withdraw,
      networkLabel: rail.networkLabel ?? (rail.chain === ARC ? "Arc" : chain.name),
      unavailable: network === "testnet" ? "mainnet_only" : null,
    };
  }

  // ── My places ────────────────────────────────────────────────────────────────────────────────────────────────

  private placeView(row: PlaceRow): PlaceView {
    const context = this.context(row.network);
    return {
      id: row.id,
      network: row.network,
      kind: row.kind,
      label: row.label || null,
      brand: row.brand,
      chain: this.chainView(context, row.chain) ?? { key: row.chain, name: CHAIN_NAMES[row.chain] ?? row.chain, chainId: null },
      address: getAddress(row.address),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    };
  }

  async places(user: SessionUser): Promise<PlaceView[]> {
    const rows = await this.db
      .select()
      .from(places)
      .where(and(eq(places.userId, user.id), eq(places.network, user.activeNetwork), isNull(places.deletedAt)))
      .orderBy(desc(places.lastUsedAt), desc(places.createdAt));
    return rows.map((row) => this.placeView(row));
  }

  /** Saves (or touches) a place: the same address on the same chain is one place, its last use moves forward. */
  async savePlace(user: SessionUser, input: PlaceInput): Promise<PlaceView> {
    const network = user.activeNetwork;
    const chain = this.chainView(this.context(network), input.chain);
    if (!chain) throw problem(HTTP.unprocessable, "validation", "unknown chain");
    if (!isAddress(input.address)) throw problem(HTTP.unprocessable, "address_invalid");
    if (input.kind === "exchange" && !findExchange(input.brand)) throw problem(HTTP.unprocessable, "validation", "unknown exchange");
    const address = lower(input.address);
    const label = input.label?.trim() ?? "";
    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(places)
      .where(and(eq(places.userId, user.id), eq(places.network, network), eq(places.chain, chain.key), eq(places.address, address), isNull(places.deletedAt)));
    if (existing) {
      const [row] = await this.db
        .update(places)
        .set({ lastUsedAt: now, kind: input.kind, brand: input.brand ?? existing.brand, label: label || existing.label })
        .where(eq(places.id, existing.id))
        .returning();
      return this.placeView(row!);
    }
    const [row] = await this.db
      .insert(places)
      .values({ userId: user.id, network, kind: input.kind, label, brand: input.brand ?? null, chain: chain.key, address, lastUsedAt: now })
      .returning();
    return this.placeView(row!);
  }

  async renamePlace(user: SessionUser, id: string, label: string): Promise<PlaceView> {
    const [row] = await this.db
      .update(places)
      .set({ label: label.trim() })
      .where(and(eq(places.id, id), eq(places.userId, user.id), isNull(places.deletedAt)))
      .returning();
    if (!row) throw problem(HTTP.notFound, "not_found");
    return this.placeView(row);
  }

  async removePlace(user: SessionUser, id: string): Promise<void> {
    await this.db
      .update(places)
      .set({ deletedAt: new Date() })
      .where(and(eq(places.id, id), eq(places.userId, user.id), isNull(places.deletedAt)));
  }

  // ── The plan ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** Whether money already went to this address from Kawase (a place used, a completed send or cross-chain move). */
  private async known(userId: string, network: NetworkId, chainKey: string, address: string): Promise<boolean> {
    const lower = address.toLowerCase();
    const [used] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.userId, userId), eq(places.network, network), eq(places.chain, chainKey), eq(places.address, lower), isNull(places.deletedAt), sql`${places.lastUsedAt} is not null`))
      .limit(1);
    if (used) return true;
    const kinds = chainKey === ARC ? (["send"] as const) : (["crosschain"] as const);
    const [paid] = await this.db
      .select({ id: intents.id })
      .from(intents)
      .where(and(eq(intents.userId, userId), eq(intents.network, network), inArray(intents.kind, [...kinds]), eq(intents.state, "completed"), sql`lower(${intents.request}->>'recipient') = ${lower}`))
      .limit(1);
    return Boolean(paid);
  }

  private async destination(user: SessionUser, input: WithdrawPlanInput): Promise<{ destination: Omit<WithdrawDestinationView, "firstTime"> | null; blocking: WithdrawReason | null }> {
    const network = user.activeNetwork;
    const context = this.context(network);
    const saved = await this.places(user);
    const address = input.address?.trim() || null;
    const savedAt = (chainKey: string, at: string | null) => (at ? saved.find((place) => place.chain.key === chainKey && lower(place.address) === lower(at)) : undefined);

    if (input.place) {
      const wanted = lower(input.place.trim());
      const place = saved.find((entry) => entry.id === input.place || lower(entry.label ?? "") === wanted || entry.brand === wanted);
      if (!place) return { destination: null, blocking: "no_destination" };
      const exchange = place.kind === "exchange" ? findExchange(place.brand) : undefined;
      return {
        destination: { kind: place.kind, label: place.label, brand: place.brand, chain: place.chain, address: place.address, placeId: place.id, exchange: exchange ? this.exchangeView(network, exchange) : null },
        blocking: place.kind === "exchange" && network === "testnet" ? "exchange_mainnet_only" : null,
      };
    }
    if (input.exchange) {
      const exchange = findExchange(input.exchange);
      if (!exchange) return { destination: null, blocking: "no_destination" };
      const view = this.exchangeView(network, exchange);
      // A saved place for this exchange fills the address when none was given (infer, don't ask).
      const remembered = address ? savedAt(view.chain.key, address) : saved.find((place) => place.kind === "exchange" && place.brand === exchange.slug && place.chain.key === view.chain.key);
      const at = address ?? remembered?.address ?? null;
      return {
        destination: { kind: "exchange", label: remembered?.label ?? null, brand: exchange.slug, chain: view.chain, address: at, placeId: remembered?.id ?? null, exchange: view },
        blocking: network === "testnet" ? "exchange_mainnet_only" : !at ? "needs_address" : isAddress(at) ? null : "bad_address",
      };
    }
    if (input.chain || address) {
      const chain = this.chainView(context, input.chain ?? ARC);
      if (!chain) return { destination: null, blocking: "unknown_chain" };
      const remembered = savedAt(chain.key, address);
      return {
        destination: { kind: remembered?.kind ?? "wallet", label: remembered?.label ?? null, brand: remembered?.brand ?? null, chain, address, placeId: remembered?.id ?? null, exchange: null },
        blocking: !address ? "needs_address" : isAddress(address) ? null : "bad_address",
      };
    }
    return { destination: null, blocking: "no_destination" };
  }

  /** The holding a line names: an address, a verified symbol, a held token's symbol, or a name the search knows. */
  private async resolve(user: SessionUser, holdings: HoldingView[], text: string): Promise<{ token: TokenView; holding: HoldingView | null } | undefined> {
    const network = user.activeNetwork;
    const wanted = text.trim();
    const byAddress = (address: string) => holdings.find((holding) => lower(holding.token.address) === lower(address));
    if (isAddress(wanted)) {
      const held = byAddress(wanted);
      if (held) return { token: held.token, holding: held };
      const clients = this.chains.get(network);
      const described = await this.assets.directory.describe(network, this.context(network).chainId, clients?.client, [wanted]);
      const token = described.get(lower(wanted));
      return token ? { token, holding: null } : undefined;
    }
    const canonical = CANONICAL_TOKENS[network].find((token) => normalizeSymbol(token.symbol) === normalizeSymbol(wanted));
    if (canonical) {
      const held = byAddress(canonical.address);
      if (held) return { token: held.token, holding: held };
    }
    const bySymbol = holdings.find((holding) => !holding.hidden && lower(holding.token.symbol) === lower(wanted)) ?? holdings.find((holding) => lower(holding.token.symbol) === lower(wanted));
    if (bySymbol) return { token: bySymbol.token, holding: bySymbol };
    const [found] = await this.assets.search(user, network, wanted).catch(() => []);
    if (!found) return undefined;
    const held = byAddress(found.token.address);
    return { token: held?.token ?? found.token, holding: held ?? null };
  }

  async plan(user: SessionUser, input: WithdrawPlanInput): Promise<WithdrawPlanView> {
    const network = user.activeNetwork;
    const context = this.context(network);
    const usdc = lower(context.addresses.usdc);
    const eurc = lower(context.addresses.eurc);
    const found = await this.destination(user, input);
    const blocking = found.blocking;
    const destination: WithdrawDestinationView | null = found.destination
      ? { ...found.destination, firstTime: found.destination.address && isAddress(found.destination.address) ? !(await this.known(user.id, network, found.destination.chain.key, found.destination.address)) : false }
      : null;
    const portfolio = await this.assets.portfolio(user);
    const holdings = [...portfolio.assets, ...portfolio.hidden];
    const toExchange = destination?.kind === "exchange" && destination.exchange !== null;
    const toArc = (destination?.chain.key ?? ARC) === ARC;

    const isUsdc = (token: TokenView) => lower(token.address) === usdc;
    const convertible = (token: TokenView): WithdrawReason | null => {
      if (UNCONVERTIBLE_KINDS.has(token.kind) || token.status === "impersonator") return "cannot_convert";
      if (network === "testnet" && lower(token.address) !== eurc) return "mainnet_only";
      return null;
    };
    // Exchanges credit USDC; everything else goes as cash there. Own wallets: as itself where a route carries it.
    const defaultAs = (token: TokenView): "itself" | "cash" => {
      if (isUsdc(token)) return "itself";
      if (toExchange || !toArc) return convertible(token) ? "itself" : "cash";
      return "itself";
    };

    type Wanted = { token: TokenView; holding: HoldingView | null; amount: string | null; as: "itself" | "cash" };
    const wanted: Wanted[] = [];
    if (input.everything) {
      for (const holding of portfolio.assets) {
        if (BigInt(holding.balance) <= ZERO) continue;
        if (holding.valueUsd !== null && holding.valueUsd < WITHDRAW_DUST_USD) continue;
        wanted.push({ token: holding.token, holding, amount: null, as: defaultAs(holding.token) });
      }
    }
    for (const line of input.assets ?? []) {
      const found = await this.resolve(user, holdings, line.asset);
      if (!found) continue;
      const already = wanted.findIndex((entry) => lower(entry.token.address) === lower(found.token.address));
      const entry: Wanted = { ...found, amount: line.amount?.trim() || null, as: line.as ?? defaultAs(found.token) };
      if (already >= 0) wanted[already] = entry;
      else wanted.push(entry);
    }

    const rail = destination?.exchange ? exchangeRail(findExchange(destination.exchange.slug)!, "deposit") : undefined;
    const legs: WithdrawLegView[] = wanted.map(({ token, holding, amount, as }) => {
      const balance = holding ? BigInt(holding.balance) : ZERO;
      const max = amount === null || MAX_WORDS.has(lower(amount));
      const asked = max ? undefined : parseTokenAmount(amount, token.decimals);
      const parsed = max ? balance : asked?.status === "ok" ? asked.baseUnits : undefined;
      const asCash = as === "cash" && !isUsdc(token);
      const steps: WithdrawStep[] = [...(asCash ? (["swap"] as const) : []), toArc ? "transfer" : "bridge"];
      const movingUsdc = asCash || isUsdc(token);
      const cannotConvert = isUsdc(token) ? null : convertible(token);
      let reason: WithdrawReason | null = null;
      if (balance <= ZERO) reason = "no_balance";
      else if (parsed === undefined || parsed <= ZERO || parsed > balance) reason = "insufficient";
      else if (asCash && cannotConvert) reason = cannotConvert;
      else if (!toArc && !movingUsdc) reason = "convert_first";
      else if (toExchange && rail && !movingUsdc) reason = "exchange_not_accepted";
      else if (toExchange && rail && (rail.deposit === "unclear" || rail.deposit === "likely")) reason = "exchange_unconfirmed";
      else if (toExchange && rail?.deposit === "limited") reason = "exchange_limited";
      const units = parsed ?? ZERO;
      const share = balance > ZERO ? Number(units) / Number(balance) : 0;
      const valueUsd = holding?.valueUsd !== null && holding?.valueUsd !== undefined ? holding.valueUsd * share : null;
      return {
        token,
        amount: units.toString(),
        amountText: formatUnits(units, token.decimals),
        max,
        balance: balance.toString(),
        valueUsd,
        as: asCash ? "cash" : "itself",
        steps,
        receive: {
          symbol: movingUsdc ? "USDC" : token.symbol,
          amountText: asCash ? (valueUsd === null ? null : valueUsd.toFixed(USD_DECIMALS)) : formatUnits(units, token.decimals),
          chain: destination?.chain.name ?? this.chainView(context, ARC)!.name,
        },
        status: reason === null ? "ready" : WARNINGS.has(reason) ? "warning" : "blocked",
        reason,
        canGoAsCash: !asCash && !isUsdc(token) && cannotConvert === null,
      };
    });

    // Every step pays its gas in USDC on Arc: "max" USDC keeps that back (money-out.md "Max = balance − fee reserve").
    const reserve = GAS_FLOAT_USDC_BASE_UNITS * BigInt(legs.reduce((sum, leg) => sum + (leg.status === "blocked" ? 0 : leg.steps.length), 0));
    for (const leg of legs) {
      if (!isUsdc(leg.token) || !leg.max || leg.reason === "no_balance") continue;
      const net = BigInt(leg.balance) - reserve;
      leg.amount = (net > ZERO ? net : ZERO).toString();
      leg.amountText = formatUnits(net > ZERO ? net : ZERO, leg.token.decimals);
      leg.receive.amountText = leg.amountText;
      if (net <= ZERO) {
        leg.status = "blocked";
        leg.reason = "insufficient";
      }
    }

    const priced = legs.filter((leg) => leg.valueUsd !== null);
    return {
      network,
      destination,
      legs,
      blocking,
      totalUsd: priced.length > 0 ? priced.reduce((sum, leg) => sum + (leg.valueUsd ?? 0), 0) : null,
    };
  }
}
