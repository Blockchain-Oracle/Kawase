// Buy with Apple Pay / Google Pay / debit (money-in.md; Circle Onramp Kit). Starting a purchase writes an order and
// mints a 30-minute Circle session for the person's own Arc address; the app opens the widget top level in the
// system browser sheet. What the browser reports (opened, submitted, not completed and why) only moves the status
// shown. The order settles when the money is seen arriving on chain: the incoming watcher's chain_events, matched
// to the open order by person, network, asset, time and amount. Circle's webhook is verified and recorded on the
// order too (the README: "server-side webhooks are the source of truth"); the chain stays the witness of the money.
// Two engines (engine.ts): Circle (Arc direct) and Coinbase Apple Pay (Base, then Kawase's Bring-to-Arc leg as the same
// order: the provider's state says when the money is on Base, the leg is started once, the Arc arrival settles it).
// A "then buy" token is carried to the app, which opens the swap for what arrived (one more approval).
// "Top up my agent wallet with Apple Pay" (B2-2) is the same purchase with the agent wallet as the destination: USDC
// only, matched from the chain's USDC Transfer logs to that wallet from the block it started at (the watcher follows
// people's own wallets only), never one of the agent wallet's own moves; once settled the marketplace puts it to work.
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { parseAbiItem, parseUnits, type Address } from "viem";

import { MS_PER_SECOND, ONRAMP, SECONDS_PER_DAY } from "@kawase/config";
import type {
  OnrampAvailability,
  OnrampDestination,
  OnrampEngineId,
  OnrampEventInput,
  OnrampMethod,
  OnrampOrderView,
  OnrampPageView,
  OnrampQuoteRequest,
  OnrampQuoteView,
  OnrampSessionView,
  OnrampStage,
  OnrampStartRequest,
  OnrampStartResponse,
  OnrampStatus,
  OnrampVerificationChannel,
  OnrampVerificationDone,
  OnrampVerificationStarted,
} from "@kawase/api-client";
import { chainEvents, onrampOrders, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { CoinbaseError } from "./coinbase";
import type { OnrampContact, OnrampEngine } from "./engine";

type OrderRow = typeof onrampOrders.$inferSelect;

const OPEN: OnrampStatus[] = ["created", "opened", "submitted"];
const USDC_DECIMALS = 6;
const BPS = 10_000n;
const AMOUNT_MAX_DIGITS = 12;
const EVENTS_KEPT = 20;
const CIRCLE_KEY_URL = "https://api.circle.com/v2/notifications/publicKey/";
/** A key id worth asking Circle about: short and URL-safe (anything else is refused without a call). */
const KEY_ID = /^[A-Za-z0-9-]{1,64}$/;
/**
 * Asking Circle for a key we don't hold spends the live API key, so a webhook with a made-up key id must not be a
 * lever: at most this many lookups of new ids per window across everyone, and an id Circle didn't know is not asked
 * again for a while (both bounded in memory).
 */
const KEY_LOOKUPS_PER_WINDOW = 6;
const KEY_LOOKUP_WINDOW_MS = 60_000;
const UNKNOWN_KEY_FORGET_MS = 3_600_000;
const UNKNOWN_KEYS_KEPT = 1_000;
const KEY_FETCH_TIMEOUT_MS = 5_000;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
/** Public Arc RPC: at most 9,999 blocks per getLogs. */
const LOG_BLOCKS_MAX = 9_000n;

/** The agent wallet, for "top up with Apple Pay" (the marketplace answers; buying for it is off without one). */
export type AgentWalletPort = {
  address(user: SessionUser): Promise<Address>;
  /** The agent wallet's own transactions (top-ups, refills), never taken for a card purchase. */
  ownMoves(userId: string, network: NetworkId): Promise<Set<string>>;
  /** The purchase landed: put it to work (Gateway, less what stays on hand). */
  arrived(userId: string, network: NetworkId): Promise<void>;
};

/** The leg after a Base delivery (Kawase's Bring-to-Arc, CCTP): the crosschain service makes the intent, the person approves it. */
export type CrossChainPort = {
  /** Starts "Bring `amount` USDC from Base to Arc" for the person; resolves to the intent the app opens. */
  bringToArc(userId: string, network: NetworkId, input: { amount: bigint; source: "base" }): Promise<{ intentId: string }>;
};

/** A Coinbase order whose money reached Base stays watched this long for the leg to Arc (it needs the person's approval). */
const BRIDGE_WATCH_MS = SECONDS_PER_DAY * MS_PER_SECOND;
/** How often one order may ask its provider for its state. */
const PROVIDER_POLL_MS = 5_000;
const PAGE_KEY_PREFIX = "kbuy_";
const PAGE_KEY_BYTES = 24;
/** The widget/pay-page events that mean the person is out without paying, or paid. */
const FAILED_EVENTS = new Set(["DEPOSIT_NOT_COMPLETED", "INITIALIZATION_ERROR", "onramp_api.cancel", "onramp_api.commit_error", "onramp_api.load_error", "onramp_api.validate_merchant_error"]);
const SUBMITTED_EVENTS = new Set(["DEPOSIT_SUBMITTED", "DEPOSIT_SETTLED", "onramp_api.commit_success", "onramp_api.polling_success"]);
const OPENED_EVENTS = new Set(["INITIALIZATION_SUCCESS", "onramp_api.load_success"]);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** A Coinbase refusal as the problem the app words: what to fix (a code, the region), or that it is Coinbase's trouble. */
function coinbaseProblem(error: unknown) {
  if (!(error instanceof CoinbaseError)) return problem(HTTP.badGateway, "upstream", "the payment provider did not answer; try again in a moment");
  const extra = { reason: error.errorType };
  // A guest limit (weekly, daily, lifetime) comes back as a 429, but it is the person's limit, not a rate: waiting a
  // moment does not fix it, a smaller amount or next week does. The reason says which.
  if (error.errorType.startsWith("guest_") && error.errorType.includes("limit")) return problem(HTTP.forbidden, "forbidden", error.message, extra);
  if (error.status === HTTP.tooManyRequests) return problem(HTTP.tooManyRequests, "rate_limited", error.message, extra);
  if (error.errorType === "guest_region_forbidden" || error.errorType === "guest_permission_denied") return problem(HTTP.forbidden, "forbidden", error.message, extra);
  if (error.status >= HTTP.badRequest && error.status < HTTP.internal) return problem(HTTP.badRequest, "validation", error.message, extra);
  return problem(HTTP.badGateway, "upstream", "the payment provider did not answer; try again in a moment", extra);
}

const decimal = (value: string | null | undefined) => (value && /^\d+(\.\d{1,2})?$/.test(value.trim()) && value.trim().length <= AMOUNT_MAX_DIGITS ? value.trim() : undefined);

export class OnrampService {
  private readonly publicKeys = new Map<string, string>();
  /** Key ids Circle answered without a key, and when. */
  private readonly unknownKeys = new Map<string, number>();
  private keyLookups = { windowStart: 0, count: 0 };
  private agentWallets: AgentWalletPort | undefined;
  private crossChain: CrossChainPort | undefined;
  private readonly polled = new Map<string, number>();
  /** Where Kawase's buy page is served (https://app.getkawase.xyz): the host the Circle kit's referrerDomain names. */
  private readonly pageBaseUrl: string | undefined;
  private readonly providerPollMs: number;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: OnrampEngine,
    private readonly log: Logger,
    private readonly circleApiKey?: string | undefined,
    options: { pageBaseUrl?: string | undefined; providerPollMs?: number | undefined } = {},
  ) {
    this.providerPollMs = options.providerPollMs ?? PROVIDER_POLL_MS;
    const host = process.env.ONRAMP_REFERRER_DOMAIN;
    this.pageBaseUrl = (options.pageBaseUrl ?? process.env.ONRAMP_PAGE_URL ?? (host ? `https://${host}` : undefined))?.replace(/\/$/, "");
  }

  /** Lets a Coinbase delivery on Base carry on to Arc (the crosschain service answers). */
  setCrossChain(port: CrossChainPort) {
    this.crossChain = port;
  }

  /** Lets a purchase land on the person's agent wallet (set once the marketplace exists). */
  setAgentWallets(port: AgentWalletPort) {
    this.agentWallets = port;
  }

  async availability(user: SessionUser | undefined): Promise<OnrampAvailability> {
    const network: NetworkId = user?.activeNetwork ?? "mainnet";
    const engines = this.engine.engines(network).map((info) => ({
      id: info.id,
      available: true,
      reason: null,
      methods: info.methods,
      delivers: info.delivers,
      bridgesToArc: info.delivers === "base",
      weeklyLimitUsd: info.weeklyLimitUsd,
    }));
    const base = { network, sandbox: network === "testnet", deliverable: ONRAMP.deliverable, defaultAmount: ONRAMP.defaultAmount, engines };
    if (!this.engine.configured(network) || !this.chains.available.includes(network)) return { ...base, available: false, reason: "not_configured" };
    if (!user || user.isAnonymous) return { ...base, available: false, reason: "sign_in" };
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet?.address) return { ...base, available: false, reason: "no_wallet" };
    return { ...base, available: true, reason: null };
  }

  async start(user: SessionUser, request: OnrampStartRequest, surface: "app" | "chat" | "voice", context: { clientIp?: string | undefined } = {}): Promise<OnrampStartResponse> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to buy");
    const network = user.activeNetwork;
    const provider = this.engine.pick(network, request.engine ?? undefined);
    if (!provider) throw problem(HTTP.unprocessable, "network_unavailable", "buying is not set up on this network");
    const own = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!own) throw problem(HTTP.conflict, "wallet_not_registered");
    const toAgent = request.destination === "agent_wallet";
    if (toAgent && !this.agentWallets) throw problem(HTTP.unprocessable, "marketplace_unavailable", "the agent wallet is not available here");
    // The agent wallet is topped up through Circle (Arc direct); a Base delivery has no leg to it.
    if (toAgent && provider.delivers !== "arc") throw problem(HTTP.unprocessable, "validation", "the agent wallet is topped up with Circle");
    const wallet = toAgent ? await this.agentWallets!.address(user) : own;
    // What arrives: the asset named if the provider delivers it; a "then" token it delivers itself; else USDC.
    const deliverable = (provider.id === "coinbase" ? ["USDC"] : ONRAMP.deliverable) as readonly string[];
    const wanted = request.asset?.toUpperCase();
    const then = request.then?.trim() || null;
    // The agent wallet pays services in USDC, so that is what lands there (and nothing is bought after).
    const asset = toAgent ? "USDC" : wanted && deliverable.includes(wanted) ? wanted : then && deliverable.includes(then.toUpperCase()) ? then.toUpperCase() : deliverable[0]!;
    const thenToken = !toAgent && then && then.toUpperCase() !== asset ? then : null;
    const fromBlock = toAgent ? ((await this.chains.get(network)?.client.getBlockNumber()) ?? null) : null;
    const amount = decimal(request.amount) ?? null;
    const currency = request.currency?.trim().toUpperCase() || (asset === "EURC" ? "EUR" : "USD");
    const method: OnrampMethod | null = request.method ?? (provider.id === "coinbase" ? "apple_pay" : null);
    if (method && !provider.methods(network).includes(method)) throw problem(HTTP.unprocessable, "validation", `${provider.id} does not take ${method}`);
    let contact: OnrampContact | undefined;
    if (provider.id === "coinbase") {
      const verified = request.coinbase;
      const email = verified?.email?.trim() || user.email;
      if (!amount) throw problem(HTTP.badRequest, "validation", "an amount is needed");
      if (!verified || !email) throw problem(HTTP.badRequest, "validation", "verify your phone and email first", { reason: "otp_verification_required" });
      contact = { phone: verified.phone, email, smsVerificationId: verified.smsVerificationId, emailVerificationId: verified.emailVerificationId, agreementAcceptedAt: new Date().toISOString() };
    }
    const pageKey = `${PAGE_KEY_PREFIX}${randomBytes(PAGE_KEY_BYTES).toString("base64url")}`;

    const [order] = await this.db
      .insert(onrampOrders)
      .values({
        userId: user.id,
        network,
        surface,
        asset,
        fiatAmount: amount,
        fiatCurrency: currency,
        thenToken,
        destination: wallet,
        destinationKind: toAgent ? "agent_wallet" : "wallet",
        fromBlock,
        engine: provider.id,
        method,
        deliveryChain: provider.delivers,
        pageKeyHash: sha256(pageKey),
        expiresAt: new Date(Date.now() + ONRAMP.orderTtlMs),
      })
      .returning();
    try {
      const session = await this.engine.mint(network, {
        engine: provider.id,
        appUserId: user.id,
        destinationAddress: wallet,
        asset,
        ...(amount ? { amount, currency } : {}),
        ...(user.email ? { email: user.email } : {}),
        ...(method ? { method } : {}),
        frame: request.frame ?? "browser",
        ...(contact ? { contact } : {}),
        ...(context.clientIp ? { clientIp: context.clientIp } : {}),
        locale: user.locale,
        orderId: order!.id,
        metadata: { orderId: order!.id },
      });
      const [row] = await this.db.update(onrampOrders).set({ traceId: session.traceId, providerOrderId: session.providerOrderId }).where(eq(onrampOrders.id, order!.id)).returning();
      return {
        order: this.view(row!),
        widgetUrl: session.widgetUrl,
        expiresAt: session.expiresAt,
        engine: provider.id,
        destinationChain: session.destinationChain,
        ...(this.pageBaseUrl ? { pageUrl: `${this.pageBaseUrl}/buy/${order!.id}#k=${pageKey}` } : {}),
      };
    } catch (error) {
      this.log.warn({ err: error, orderId: order!.id, engine: provider.id }, "onramp session mint failed");
      const reason = error instanceof CoinbaseError ? error.errorType : "SESSION_MINT_FAILED";
      await this.db.update(onrampOrders).set({ status: "not_completed", reason }).where(eq(onrampOrders.id, order!.id));
      if (provider.id === "coinbase") throw coinbaseProblem(error);
      throw problem(HTTP.badGateway, "upstream", "Circle's onramp did not start; try again in a moment");
    }
  }

  /** Coinbase's price for an amount (Circle's widget shows its own). Nothing is created at Coinbase. */
  async quote(user: SessionUser, request: OnrampQuoteRequest): Promise<OnrampQuoteView> {
    const network = user.activeNetwork;
    const provider = this.engine.pick(network, request.engine);
    if (!provider || provider.id !== request.engine || !provider.quote) throw problem(HTTP.unprocessable, "quote_unavailable", `${request.engine} gives no quote here`);
    const amount = decimal(request.amount);
    if (!amount) throw problem(HTTP.badRequest, "validation", "an amount is needed");
    const wallet = (await this.wallets.userWallet(user.id))?.address;
    if (!wallet) throw problem(HTTP.conflict, "wallet_not_registered");
    try {
      const quote = await provider.quote(network, { amount, currency: request.currency?.trim().toUpperCase() || "USD", asset: "USDC", method: request.method ?? "apple_pay", destinationAddress: wallet, appUserId: user.id });
      return { engine: provider.id, ...quote };
    } catch (error) {
      this.log.warn({ err: error }, "onramp quote failed");
      throw coinbaseProblem(error);
    }
  }

  /** Coinbase's code to a phone or an email (an email defaults to the account's own). */
  async verifyStart(user: SessionUser, channel: OnrampVerificationChannel, destination: string | undefined): Promise<OnrampVerificationStarted> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to buy");
    const provider = this.engine.pick(user.activeNetwork, "coinbase");
    if (!provider?.verification || provider.id !== "coinbase") throw problem(HTTP.unprocessable, "network_unavailable", "buying with Apple Pay is not set up on this network");
    const to = destination?.trim() || (channel === "email" ? user.email : undefined);
    if (!to) throw problem(HTTP.badRequest, "validation", channel === "email" ? "no email on this account" : "a phone number is needed");
    try {
      const started = await provider.verification.start(user.activeNetwork, { channel, destination: to });
      return { verificationId: started.verificationId, channel, expiresAt: started.expiresAt };
    } catch (error) {
      throw coinbaseProblem(error);
    }
  }

  async verifySubmit(user: SessionUser, verificationId: string, otpCode: string, channel: OnrampVerificationChannel): Promise<OnrampVerificationDone> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to buy");
    const provider = this.engine.pick(user.activeNetwork, "coinbase");
    if (!provider?.verification || provider.id !== "coinbase") throw problem(HTTP.unprocessable, "network_unavailable", "buying with Apple Pay is not set up on this network");
    try {
      const done = await provider.verification.submit(user.activeNetwork, { verificationId, otpCode });
      return { verificationId: done.verificationId, channel, verifiedUntil: done.verifiedUntil };
    } catch (error) {
      throw coinbaseProblem(error);
    }
  }

  /** The user an order's page key belongs to (the buy page carries no sign-in), while the order is still live. */
  async pageKeyUser(id: string, key: string): Promise<string | undefined> {
    if (!key.startsWith(PAGE_KEY_PREFIX) || !/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const [row] = await this.db.select({ userId: onrampOrders.userId, hash: onrampOrders.pageKeyHash, expiresAt: onrampOrders.expiresAt }).from(onrampOrders).where(eq(onrampOrders.id, id));
    if (!row?.hash || row.expiresAt.getTime() + BRIDGE_WATCH_MS < Date.now()) return undefined;
    const given = Buffer.from(sha256(key));
    const stored = Buffer.from(row.hash);
    return given.length === stored.length && timingSafeEqual(given, stored) ? row.userId : undefined;
  }

  /**
   * Kawase's buy page for an order of the signed-in person, with a new order key (the old one stops working): how the app
   * opens the page again for an order it did not just start (a deep link, a resumed purchase). Never for a page key holder.
   */
  async page(userId: string, id: string): Promise<OnrampPageView> {
    const row = await this.own(userId, id);
    if (!this.pageBaseUrl) throw problem(HTTP.unprocessable, "network_unavailable", "the buy page is not served here");
    const watching = row.engine === "coinbase" && row.deliveryTx !== null && row.expiresAt.getTime() + BRIDGE_WATCH_MS > Date.now();
    if (!watching && (!OPEN.includes(row.status as OnrampStatus) || row.expiresAt.getTime() < Date.now())) throw problem(HTTP.conflict, "conflict", "this purchase is no longer open");
    const pageKey = `${PAGE_KEY_PREFIX}${randomBytes(PAGE_KEY_BYTES).toString("base64url")}`;
    await this.db.update(onrampOrders).set({ pageKeyHash: sha256(pageKey) }).where(eq(onrampOrders.id, row.id));
    return { pageUrl: `${this.pageBaseUrl}/buy/${row.id}#k=${pageKey}` };
  }

  /** A fresh Circle session for an open order (SESSION_TIMEOUT / INVALID_SESSION_TOKEN on the page): same address, same amount. */
  async session(userId: string, id: string): Promise<OnrampSessionView> {
    const row = await this.own(userId, id);
    if (row.engine !== "circle") throw problem(HTTP.unprocessable, "validation", "this purchase has no widget session");
    if (!OPEN.includes(row.status as OnrampStatus) || row.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "conflict", "this purchase is no longer open");
    try {
      const session = await this.engine.mint(row.network, {
        engine: "circle",
        appUserId: row.userId,
        destinationAddress: row.destination,
        asset: row.asset,
        ...(row.fiatAmount ? { amount: row.fiatAmount, currency: row.fiatCurrency ?? "USD" } : {}),
        frame: "page",
        orderId: row.id,
        metadata: { orderId: row.id },
      });
      await this.db.update(onrampOrders).set({ traceId: session.traceId }).where(eq(onrampOrders.id, row.id));
      return { widgetUrl: session.widgetUrl, expiresAt: session.expiresAt, engine: "circle", destinationChain: session.destinationChain, ...(session.kitSession ? { kitSession: session.kitSession } : {}) };
    } catch (error) {
      this.log.warn({ err: error, orderId: id }, "onramp session re-mint failed");
      throw problem(HTTP.badGateway, "upstream", "Circle's onramp did not start; try again in a moment");
    }
  }

  private async own(userId: string, id: string): Promise<OrderRow> {
    const [row] = await this.db
      .select()
      .from(onrampOrders)
      .where(and(eq(onrampOrders.id, id), eq(onrampOrders.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found", "no such purchase");
    return row;
  }

  async get(userId: string, id: string): Promise<OnrampOrderView> {
    const row = await this.own(userId, id);
    if (OPEN.includes(row.status as OnrampStatus)) await this.reconcileOrder(row).catch((error: unknown) => this.log.warn({ err: error, orderId: id }, "onramp reconcile failed"));
    return this.view(await this.own(userId, id));
  }

  /** The widget's (or the pay page's) lifecycle hints: they move the status shown, never settle the order. */
  async event(userId: string, id: string, input: OnrampEventInput): Promise<OnrampOrderView> {
    const row = await this.own(userId, id);
    const events = [...row.events, { at: new Date().toISOString(), from: "browser", event: input.event, code: input.code ?? null }].slice(-EVENTS_KEPT);
    const open = OPEN.includes(row.status as OnrampStatus);
    const next: Partial<typeof onrampOrders.$inferInsert> = { events };
    if (open && OPENED_EVENTS.has(input.event) && row.status === "created") next.status = "opened";
    if (open && SUBMITTED_EVENTS.has(input.event)) next.status = "submitted";
    // Not completed in the browser while nothing was submitted: the money is not coming.
    if (open && row.status !== "submitted" && FAILED_EVENTS.has(input.event) && next.status === undefined) {
      next.status = "not_completed";
      next.reason = input.code ?? input.event;
    }
    await this.db.update(onrampOrders).set(next).where(eq(onrampOrders.id, id));
    return this.get(userId, id);
  }

  // ── Settlement ──────────────────────────────────────────────────────────────────────────────────────────────

  /** The first arrival of the asset after the order started, near the amount asked for, not used by another order. */
  private async reconcileOrder(start: OrderRow) {
    let row = start;
    // Coinbase: the provider says when the money is on Base; the leg to Arc starts once; only then is Arc watched.
    if (row.engine === "coinbase") row = await this.reconcileCoinbase(row);
    if (!OPEN.includes(row.status as OnrampStatus)) return;
    const expiresAt = row.deliveryTx ? row.expiresAt.getTime() + BRIDGE_WATCH_MS : row.expiresAt.getTime();
    if (expiresAt < Date.now()) {
      await this.db.update(onrampOrders).set({ status: "expired" }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
      return;
    }
    // A Coinbase order cannot arrive on Arc before Coinbase has delivered to Base.
    if (row.engine === "coinbase" && !row.deliveryTx) return;
    const arrivals =
      row.destinationKind === "agent_wallet"
        ? await this.agentArrivals(row)
        : await this.db
            .select()
            .from(chainEvents)
            .where(and(eq(chainEvents.userId, row.userId), eq(chainEvents.network, row.network), eq(chainEvents.asset, row.asset), gte(chainEvents.createdAt, row.createdAt)))
            .orderBy(asc(chainEvents.createdAt));
    const used = new Set(
      (
        await this.db
          .select({ tx: onrampOrders.receivedTx, log: onrampOrders.receivedLogIndex })
          .from(onrampOrders)
          .where(and(eq(onrampOrders.userId, row.userId), sql`${onrampOrders.receivedTx} is not null`))
      ).map((entry) => `${entry.tx}:${entry.log}`),
    );
    const asked = row.fiatAmount && row.fiatCurrency === (row.asset === "EURC" ? "EUR" : "USD") ? parseUnits(row.fiatAmount, USDC_DECIMALS) : undefined;
    const fits = (amount: bigint) => !asked || (amount * BPS >= asked * BigInt(ONRAMP.matchShareMinBps) && amount * BPS <= asked * BigInt(ONRAMP.matchShareMaxBps));
    const match = arrivals.find((arrival) => !used.has(`${arrival.txHash}:${arrival.logIndex}`) && fits(arrival.amount));
    if (!match) return;
    await this.db
      .update(onrampOrders)
      .set({ status: "settled", received: match.amount, receivedTx: match.txHash, receivedLogIndex: String(match.logIndex), settledAt: new Date() })
      .where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN), isNull(onrampOrders.receivedTx)));
    this.log.info({ orderId: row.id, tx: match.txHash }, "onramp settled on chain");
    if (row.destinationKind === "agent_wallet") {
      await this.agentWallets?.arrived(row.userId, row.network).catch((error: unknown) => this.log.warn({ err: error, orderId: row.id }, "agent wallet deposit after card purchase failed; it stays on hand"));
    }
  }

  /**
   * One Coinbase order against the provider's own word. Processing moves it to submitted; failed closes it; completed on
   * mainnet records the Base delivery and starts the Bring-to-Arc leg once. A sandbox order (testnet, `sandbox-` ref)
   * completes without any money moving, so it ends as not completed with that reason instead of pretending to arrive.
   */
  private async reconcileCoinbase(row: OrderRow): Promise<OrderRow> {
    const provider = this.engine.provider("coinbase");
    if (!provider?.orderState || !row.providerOrderId || !OPEN.includes(row.status as OnrampStatus)) return row;
    if (!row.deliveryTx) {
      const last = this.polled.get(row.id) ?? 0;
      if (Date.now() - last < this.providerPollMs) return row;
      this.polled.set(row.id, Date.now());
      let state;
      try {
        state = await provider.orderState(row.network, row.providerOrderId);
      } catch (error) {
        this.log.warn({ err: error, orderId: row.id }, "coinbase order state failed");
        return row;
      }
      const note = { at: new Date().toISOString(), from: "coinbase", state: state.raw, tx: state.txHash };
      const events = [...row.events, note].slice(-EVENTS_KEPT);
      if (state.state === "failed") {
        await this.db.update(onrampOrders).set({ status: "not_completed", reason: "PAYMENT_PROVIDER_ERROR", events }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
      } else if (state.state === "completed" && provider.sandbox(row.network)) {
        await this.db.update(onrampOrders).set({ status: "not_completed", reason: "SANDBOX_NO_FUNDS", events }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
      } else if (state.state === "completed") {
        await this.db.update(onrampOrders).set({ status: "submitted", deliveryTx: state.txHash ?? "delivered", events }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
        this.log.info({ orderId: row.id, tx: state.txHash }, "coinbase delivered to Base");
        await this.startBridge(row.id, state.purchaseAmount);
      } else if (state.state === "processing" && row.status !== "submitted") {
        await this.db.update(onrampOrders).set({ status: "submitted", events }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
      } else {
        await this.db.update(onrampOrders).set({ events }).where(eq(onrampOrders.id, row.id));
      }
    } else if (row.bridgeState === null || row.bridgeState === "failed") {
      // Delivered earlier but the leg did not start (no port yet, or it failed): try again.
      await this.startBridge(row.id, null);
    }
    const [fresh] = await this.db.select().from(onrampOrders).where(eq(onrampOrders.id, row.id));
    return fresh ?? row;
  }

  /** Starts Bring-to-Arc for what Coinbase delivered, once (claimed in the row before the intent is made). */
  private async startBridge(orderId: string, purchaseAmount: string | null) {
    const port = this.crossChain;
    if (!port) return;
    const [claimed] = await this.db
      .update(onrampOrders)
      .set({ bridgeState: "starting" })
      .where(and(eq(onrampOrders.id, orderId), sql`(${onrampOrders.bridgeState} is null or ${onrampOrders.bridgeState} = 'failed')`))
      .returning();
    if (!claimed) return;
    try {
      let amount = purchaseAmount;
      if (!amount) amount = (await this.engine.provider("coinbase")?.orderState?.(claimed.network, claimed.providerOrderId!))?.purchaseAmount ?? null;
      if (!amount) throw new Error("the delivered amount is unknown");
      const { intentId } = await port.bringToArc(claimed.userId, claimed.network, { amount: parseUnits(amount, USDC_DECIMALS), source: "base" });
      await this.db.update(onrampOrders).set({ bridgeState: "started", crosschainIntentId: intentId }).where(eq(onrampOrders.id, orderId));
    } catch (error) {
      // The money is safe on Base at the person's own address; Bring to Arc can still be started from there.
      this.log.warn({ err: error, orderId }, "bring-to-arc after a coinbase delivery did not start");
      await this.db.update(onrampOrders).set({ bridgeState: "failed" }).where(eq(onrampOrders.id, orderId));
    }
  }

  /** USDC that reached the agent wallet since the order started, leaving out its own moves and the person's top-ups. */
  private async agentArrivals(row: OrderRow) {
    const clients = this.chains.get(row.network);
    if (!clients || row.fromBlock === null || !this.agentWallets) return [];
    // The reconciler looks every few seconds, so the latest window always covers what arrived since its last look.
    const latest = await clients.client.getBlockNumber();
    const fromBlock = latest - row.fromBlock > LOG_BLOCKS_MAX ? latest - LOG_BLOCKS_MAX : row.fromBlock;
    const [logs, own, mine] = await Promise.all([
      clients.client.getLogs({ address: clients.network.addresses.usdc, event: TRANSFER, args: { to: row.destination as Address }, fromBlock, toBlock: latest }),
      this.agentWallets.ownMoves(row.userId, row.network),
      this.wallets.userWallet(row.userId),
    ]);
    const from = mine?.address.toLowerCase();
    return logs
      .filter((log) => log.transactionHash && !own.has(log.transactionHash.toLowerCase()) && log.args.from?.toLowerCase() !== from)
      .map((log) => ({ txHash: log.transactionHash!, logIndex: log.logIndex ?? 0, amount: log.args.value ?? BigInt(0) }));
  }

  /** Every few seconds: open orders against what the watcher saw arrive; stale ones expire. */
  startReconciler(intervalMs: number) {
    const run = async () => {
      const open = await this.db
        .select()
        .from(onrampOrders)
        .where(and(inArray(onrampOrders.status, OPEN), lt(onrampOrders.createdAt, new Date())));
      for (const row of open) await this.reconcileOrder(row).catch((error: unknown) => this.log.warn({ err: error, orderId: row.id }, "onramp reconcile failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "onramp reconcile failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  // ── Circle's webhook ────────────────────────────────────────────────────────────────────────────────────────

  /**
   * A Circle notification (X-Circle-Signature over the raw body, ECDSA SHA-256, with the public key Circle serves
   * for X-Circle-Key-Id). Verified, then recorded on the order it names (by our order id in the session metadata,
   * or Circle's trace id); a settled or failed purchase is reconciled at once. Unverifiable bodies are refused.
   */
  async webhook(body: string, signature: string | undefined, keyId: string | undefined): Promise<boolean> {
    if (!signature || !keyId || !(await this.verified(body, signature, keyId))) return false;
    const parsed = JSON.parse(body) as { notificationType?: string; notification?: Record<string, unknown> };
    const note = parsed.notification ?? {};
    const metadata = (note.metadata ?? {}) as { orderId?: string };
    const traceId = typeof note.traceId === "string" ? note.traceId : undefined;
    const [row] = metadata.orderId
      ? await this.db.select().from(onrampOrders).where(eq(onrampOrders.id, metadata.orderId))
      : traceId
        ? await this.db.select().from(onrampOrders).where(eq(onrampOrders.traceId, traceId))
        : [];
    if (!row) return true;
    const events = [...row.events, { at: new Date().toISOString(), from: "circle", type: parsed.notificationType ?? null, state: note.state ?? note.status ?? null }].slice(-EVENTS_KEPT);
    await this.db.update(onrampOrders).set({ events }).where(eq(onrampOrders.id, row.id));
    if (OPEN.includes(row.status as OnrampStatus)) await this.reconcileOrder(row);
    return true;
  }

  /** Whether Circle may be asked about a key id we don't hold yet (see KEY_LOOKUPS_PER_WINDOW). */
  private mayLookUp(keyId: string) {
    const now = Date.now();
    const forgotten = this.unknownKeys.get(keyId);
    if (forgotten !== undefined && now - forgotten < UNKNOWN_KEY_FORGET_MS) return false;
    if (now - this.keyLookups.windowStart >= KEY_LOOKUP_WINDOW_MS) this.keyLookups = { windowStart: now, count: 0 };
    if (this.keyLookups.count >= KEY_LOOKUPS_PER_WINDOW) return false;
    this.keyLookups.count++;
    return true;
  }

  private rememberUnknown(keyId: string) {
    if (this.unknownKeys.size >= UNKNOWN_KEYS_KEPT) this.unknownKeys.delete(this.unknownKeys.keys().next().value!);
    this.unknownKeys.set(keyId, Date.now());
  }

  private async verified(body: string, signature: string, keyId: string) {
    try {
      let key = this.publicKeys.get(keyId);
      if (!key) {
        if (!this.circleApiKey || !KEY_ID.test(keyId)) return false;
        if (!this.mayLookUp(keyId)) {
          this.log.warn({ keyId }, "onramp webhook key lookup refused (unknown or over the rate)");
          return false;
        }
        const response = await fetch(`${CIRCLE_KEY_URL}${encodeURIComponent(keyId)}`, { headers: { authorization: `Bearer ${this.circleApiKey}` }, signal: AbortSignal.timeout(KEY_FETCH_TIMEOUT_MS) });
        key = ((await response.json()) as { data?: { publicKey?: string } }).data?.publicKey;
        if (!key) {
          // Circle doesn't know it (a 404) — not asked again for a while. A 5xx or 429 is Circle's trouble, not the id's.
          if (response.status < HTTP.internal && response.status !== HTTP.tooManyRequests) this.rememberUnknown(keyId);
          return false;
        }
        this.publicKeys.set(keyId, key);
      }
      const publicKey = createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" });
      return verify("sha256", Buffer.from(body), publicKey, Buffer.from(signature, "base64"));
    } catch (error) {
      this.log.warn({ err: error }, "onramp webhook verification failed");
      return false;
    }
  }

  /** The word the progress rail shows (Paying → Buying → On Arc; a Base delivery adds on_base and bridging). */
  private stage(row: OrderRow): OnrampStage {
    if (row.status === "settled") return "arrived";
    if (row.engine === "coinbase" && row.deliveryTx) return row.bridgeState === "started" || row.bridgeState === "starting" ? "bridging" : "on_base";
    return row.status === "submitted" ? "buying" : "paying";
  }

  view(row: OrderRow): OnrampOrderView {
    const explorer = this.chains.get(row.network)?.network.viemChain.blockExplorers?.default.url;
    return {
      id: row.id,
      network: row.network,
      status: row.status as OnrampStatus,
      reason: row.reason,
      asset: row.asset,
      fiatAmount: row.fiatAmount,
      fiatCurrency: row.fiatCurrency,
      thenToken: row.thenToken,
      destination: row.destinationKind as OnrampDestination,
      received: row.received?.toString() ?? null,
      tx: row.receivedTx && explorer ? { hash: row.receivedTx, explorerUrl: `${explorer}/tx/${row.receivedTx}` } : null,
      settledAt: row.settledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      engine: row.engine as OnrampEngineId,
      method: (row.method as OnrampMethod | null) ?? null,
      deliveryChain: row.deliveryChain === "base" ? "base" : "arc",
      stage: this.stage(row),
      deliveryTx: row.deliveryTx,
      bridge: row.bridgeState ? { state: row.bridgeState as "starting" | "started" | "failed", intentId: row.crosschainIntentId } : null,
    };
  }
}
