// Buy with Apple Pay / Google Pay / debit (money-in.md; Circle Onramp Kit). Starting a purchase writes an order and
// mints a 30-minute Circle session for the person's own Arc address; the app opens the widget top level in the
// system browser sheet. What the browser reports (opened, submitted, not completed and why) only moves the status
// shown. The order settles when the money is seen arriving on chain: the incoming watcher's chain_events, matched
// to the open order by person, network, asset, time and amount. Circle's webhook is verified and recorded on the
// order too (the README: "server-side webhooks are the source of truth"); the chain stays the witness of the money.
// A "then buy" token is carried to the app, which opens the swap for what arrived (one more approval).
// "Top up my agent wallet with Apple Pay" (B2-2) is the same purchase with the agent wallet as the destination: USDC
// only, matched from the chain's USDC Transfer logs to that wallet from the block it started at (the watcher follows
// people's own wallets only), never one of the agent wallet's own moves; once settled the marketplace puts it to work.
import { createPublicKey, verify } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { parseAbiItem, parseUnits, type Address } from "viem";

import { ONRAMP } from "@kawase/config";
import type { OnrampAvailability, OnrampDestination, OnrampEventInput, OnrampOrderView, OnrampStartRequest, OnrampStartResponse, OnrampStatus } from "@kawase/api-client";
import { chainEvents, onrampOrders, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { OnrampEngine } from "./engine";

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

const decimal = (value: string | null | undefined) => (value && /^\d+(\.\d{1,2})?$/.test(value.trim()) && value.trim().length <= AMOUNT_MAX_DIGITS ? value.trim() : undefined);

export class OnrampService {
  private readonly publicKeys = new Map<string, string>();
  /** Key ids Circle answered without a key, and when. */
  private readonly unknownKeys = new Map<string, number>();
  private keyLookups = { windowStart: 0, count: 0 };
  private agentWallets: AgentWalletPort | undefined;

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: OnrampEngine,
    private readonly log: Logger,
    private readonly circleApiKey?: string | undefined,
  ) {}

  /** Lets a purchase land on the person's agent wallet (set once the marketplace exists). */
  setAgentWallets(port: AgentWalletPort) {
    this.agentWallets = port;
  }

  async availability(user: SessionUser | undefined): Promise<OnrampAvailability> {
    const network: NetworkId = user?.activeNetwork ?? "mainnet";
    const base = { network, sandbox: network === "testnet", deliverable: ONRAMP.deliverable, defaultAmount: ONRAMP.defaultAmount };
    if (!this.engine.configured(network) || !this.chains.available.includes(network)) return { ...base, available: false, reason: "not_configured" };
    if (!user || user.isAnonymous) return { ...base, available: false, reason: "sign_in" };
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet?.address) return { ...base, available: false, reason: "no_wallet" };
    return { ...base, available: true, reason: null };
  }

  async start(user: SessionUser, request: OnrampStartRequest, surface: "app" | "chat" | "voice"): Promise<OnrampStartResponse> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to buy");
    const network = user.activeNetwork;
    if (!this.engine.configured(network)) throw problem(HTTP.unprocessable, "network_unavailable", "buying is not set up on this network");
    const own = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!own) throw problem(HTTP.conflict, "wallet_not_registered");
    const toAgent = request.destination === "agent_wallet";
    if (toAgent && !this.agentWallets) throw problem(HTTP.unprocessable, "marketplace_unavailable", "the agent wallet is not available here");
    const wallet = toAgent ? await this.agentWallets!.address(user) : own;
    // What arrives: the asset named if the provider delivers it; a "then" token it delivers itself; else USDC.
    const deliverable = ONRAMP.deliverable as readonly string[];
    const wanted = request.asset?.toUpperCase();
    const then = request.then?.trim() || null;
    // The agent wallet pays services in USDC, so that is what lands there (and nothing is bought after).
    const asset = toAgent ? "USDC" : wanted && deliverable.includes(wanted) ? wanted : then && deliverable.includes(then.toUpperCase()) ? then.toUpperCase() : deliverable[0]!;
    const thenToken = !toAgent && then && then.toUpperCase() !== asset ? then : null;
    const fromBlock = toAgent ? ((await this.chains.get(network)?.client.getBlockNumber()) ?? null) : null;
    const amount = decimal(request.amount) ?? null;
    const currency = request.currency?.trim().toUpperCase() || (asset === "EURC" ? "EUR" : "USD");

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
        expiresAt: new Date(Date.now() + ONRAMP.orderTtlMs),
      })
      .returning();
    try {
      const session = await this.engine.mint(network, {
        appUserId: user.id,
        destinationAddress: wallet,
        asset,
        ...(amount ? { amount, currency } : {}),
        ...(user.email ? { email: user.email } : {}),
        metadata: { orderId: order!.id },
      });
      const [row] = await this.db.update(onrampOrders).set({ traceId: session.traceId }).where(eq(onrampOrders.id, order!.id)).returning();
      return { order: this.view(row!), widgetUrl: session.widgetUrl, expiresAt: session.expiresAt };
    } catch (error) {
      this.log.warn({ err: error, orderId: order!.id }, "onramp session mint failed");
      await this.db.update(onrampOrders).set({ status: "not_completed", reason: "SESSION_MINT_FAILED" }).where(eq(onrampOrders.id, order!.id));
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

  /** The widget's lifecycle hints: they move the status shown, never settle the order. */
  async event(userId: string, id: string, input: OnrampEventInput): Promise<OnrampOrderView> {
    const row = await this.own(userId, id);
    const events = [...row.events, { at: new Date().toISOString(), from: "browser", event: input.event, code: input.code ?? null }].slice(-EVENTS_KEPT);
    const open = OPEN.includes(row.status as OnrampStatus);
    const next: Partial<typeof onrampOrders.$inferInsert> = { events };
    if (open && input.event === "INITIALIZATION_SUCCESS" && row.status === "created") next.status = "opened";
    if (open && (input.event === "DEPOSIT_SUBMITTED" || input.event === "DEPOSIT_SETTLED")) next.status = "submitted";
    // Not completed in the browser while nothing was submitted: the money is not coming.
    if (open && row.status !== "submitted" && (input.event === "DEPOSIT_NOT_COMPLETED" || input.event === "INITIALIZATION_ERROR")) {
      next.status = "not_completed";
      next.reason = input.code ?? input.event;
    }
    await this.db.update(onrampOrders).set(next).where(eq(onrampOrders.id, id));
    return this.get(userId, id);
  }

  // ── Settlement ──────────────────────────────────────────────────────────────────────────────────────────────

  /** The first arrival of the asset after the order started, near the amount asked for, not used by another order. */
  private async reconcileOrder(row: OrderRow) {
    if (row.expiresAt.getTime() < Date.now()) {
      await this.db.update(onrampOrders).set({ status: "expired" }).where(and(eq(onrampOrders.id, row.id), inArray(onrampOrders.status, OPEN)));
      return;
    }
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
    };
  }
}
