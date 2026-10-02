// The x402 marketplace (cards/marketplace.md, X29) and the person's agent wallet.
//
// Money path, end to end:
//  1. Top up: the person signs one marketplace grant (Face ID): USDC `transfer` only, only to their own agent wallet,
//     capped per day, redeemable only by the ops wallet. Each top-up is the ops wallet redeeming it; the chain refuses
//     anything else. The agent wallet then deposits into Circle Gateway (approve + deposit, sent by itself).
//  2. Buy: a listing from Circle's catalog (testnet: the demo seller) is asked once without payment; its 402 is checked
//     (exact, USDC on this chain, the catalog's payTo) against the person's caps; only then the agent wallet signs once
//     (Gateway nanopayment, or plain EIP-3009) and the call is sent. Above the per-call cap, with "ask me first", or
//     after paid data was read in this turn, it waits for the person's tap. The answer is untrusted data.
//  3. Return: the Gateway balance is withdrawn straight to the person's wallet (burn intent + mint) and what is on hand
//     (less a gas reserve) is sent back.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { erc20Abi, hashTypedData, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import type {
  AgentWalletMove,
  AgentWalletSettings,
  AgentWalletSettingsChange,
  AgentWalletView,
  BuyOutcome,
  BuyServiceInput,
  MarketplaceCategory,
  PurchaseView,
  ServiceListing,
} from "@kawase/api-client";
import {
  AGENT_WALLET_GAS_RESERVE,
  AGENT_WALLET_ON_HAND_BPS,
  AGENT_WALLET_REFILL_MIN,
  BPS,
  AGENT_WALLET_RETURN_GAS,
  GATEWAY_BURN_FEE,
  GATEWAY_MIN_DEPOSIT,
  GATEWAY_WITHDRAW_MAX_FEE,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_DEFAULTS,
  MARKETPLACE_MAX_DAILY_BUDGET,
  MARKETPLACE_MAX_PER_CALL,
  SECONDS_PER_DAY,
  X402_RESPONSE_PREVIEW_CHARS,
  X402_SEARCH_LIMIT,
} from "@kawase/config";
import {
  agentWalletMoves,
  grants,
  marketplacePurchases,
  marketplaceSettings,
  users,
  wallets,
  type Db,
} from "@kawase/db";
import {
  buildMarketplaceGrant,
  describeGrant,
  encodeRedeemTransfer,
  grantTypedData,
  isWalletSetUp,
  withSignature,
} from "@kawase/integrations-delegation";
import {
  encodeGatewayDeposit,
  encodeUsdcTransfer,
  gatewayBalance,
  gatewayTransfer,
  optionsHere,
  pay,
  probe,
  withdrawIntent,
  type AgentSigner,
  type Call,
  type Discovery,
  type Listing,
  type PaymentOption,
} from "@kawase/integrations-x402";
import type { Logger } from "@kawase/log";
import { amount, formatPrice } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { OpsExecutor } from "../send/ops";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { AgentWalletProvider } from "./agent-wallets";

const SALT_BYTES = 32;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
/** The grant lives a year; the daily cap is what bounds it. */
const GRANT_TTL_DAYS = 365;
const HISTORY_LIMIT = 40;
/** Circle transactions are followed this often, this long (Arc confirms in about a second). */
const POLL_MS = 1_500;
const CIRCLE_TIMEOUT_MS = 90_000;
/** A Gateway deposit shows in the balance API within seconds on Arc. */
const GATEWAY_CREDIT_TIMEOUT_MS = 45_000;
/** A purchase being paid this recently is the same call answered twice (no second signature). */
const SAME_CALL_WINDOW_MS = 120_000;
const ZERO = 0n;
/** Display strings for the model are canonical; the model renders them in the person's language. */
const DISPLAY_LOCALE = "en";

const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const min = (a: bigint, b: bigint) => (a < b ? a : b);

type PurchaseRow = typeof marketplacePurchases.$inferSelect;
type MoveRow = typeof agentWalletMoves.$inferSelect;
type AgentWallet = { id: string; walletId: string; address: Address };

export function listingView(listing: Listing): ServiceListing {
  return {
    url: listing.url,
    method: listing.method,
    description: listing.description,
    provider: { name: listing.provider.name, website: listing.provider.website, category: listing.provider.category },
    price: listing.price.toString(),
    priceDisplay: formatPrice(amount("USDC", listing.price), DISPLAY_LOCALE),
    rails: listing.rails,
    payTo: listing.payTo,
  };
}

const purchaseView = (row: PurchaseRow): PurchaseView => ({
  id: row.id,
  network: row.network,
  status: row.status,
  provider: row.providerName,
  description: row.description,
  url: row.url,
  method: row.method,
  category: row.category as MarketplaceCategory,
  payTo: row.payTo,
  amount: row.amount.toString(),
  rail: row.rail,
  reasonCode: row.reasonCode,
  settlement: row.settlement,
  responsePreview: row.responsePreview,
  paidAt: row.paidAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const moveView = (row: MoveRow): AgentWalletMove => ({
  id: row.id,
  kind: row.kind,
  amount: row.amount.toString(),
  status: row.status,
  txHashes: row.txHashes,
  createdAt: row.createdAt.toISOString(),
});

/** The listed URL with its `{name}` parts and query filled in; anything unfilled is refused. */
export function filledCall(listing: Listing, input: BuyServiceInput): Call {
  let url = listing.url.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = input.pathParams?.[name];
    if (value === undefined || value === "") throw problem(HTTP.unprocessable, "validation", `missing ${name}`);
    return encodeURIComponent(value);
  });
  const query = Object.entries(input.query ?? {});
  if (query.length > 0) url += `${url.includes("?") ? "&" : "?"}${new URLSearchParams(query).toString()}`;
  return { url, method: listing.method, body: listing.method === "GET" ? undefined : input.body };
}

const requestHash = (call: Call) => createHash("sha256").update(`${call.method} ${call.url} ${call.body ?? ""}`).digest("hex");

export class MarketplaceService {
  private readonly creating = new Map<string, Promise<AgentWallet>>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly walletService: WalletService,
    private readonly ops: OpsExecutor,
    private readonly agentWallets: AgentWalletProvider,
    private readonly discovery: Discovery,
    private readonly log: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  // ── The agent wallet ───────────────────────────────────────────────────────────────────────────────────────────

  async agentWallet(userId: string, network: NetworkId): Promise<AgentWallet | undefined> {
    const [row] = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.network, network), eq(wallets.role, "marketplace"), eq(wallets.status, "active")))
      .limit(1);
    if (!row) return undefined;
    return { id: row.id, walletId: (row.providerRef as { walletId: string }).walletId, address: row.address as Address };
  }

  /** The person's agent wallet on this network, made on first use (one at a time per person and network). */
  async ensureAgentWallet(userId: string, network: NetworkId): Promise<AgentWallet> {
    const existing = await this.agentWallet(userId, network);
    if (existing) return existing;
    const key = `${userId}:${network}`;
    let running = this.creating.get(key);
    if (!running) {
      running = (async () => {
        const created = await this.agentWallets.create(network, userId);
        const [row] = await this.db
          .insert(wallets)
          .values({ userId, network, role: "marketplace", custody: "circle_dcw", address: created.address, providerRef: { walletId: created.walletId } })
          .returning();
        this.log.info({ userId, network, address: created.address }, "agent wallet created");
        return { id: row!.id, walletId: created.walletId, address: created.address };
      })().finally(() => this.creating.delete(key));
      this.creating.set(key, running);
    }
    return running;
  }

  private signer(network: NetworkId, wallet: AgentWallet): AgentSigner {
    return {
      address: wallet.address,
      signTypedData: (typedData) => this.agentWallets.signTypedData(network, wallet.walletId, typedData),
    };
  }

  private async balances(network: NetworkId, address: Address) {
    const { client, network: context } = this.clients(network);
    const [onHand, gateway] = await Promise.all([
      client.readContract({ address: context.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      gatewayBalance(context, address, this.fetchImpl).catch((error: unknown) => {
        this.log.warn({ err: error, network }, "gateway balance unread");
        return { available: ZERO, withdrawing: ZERO, withdrawable: ZERO };
      }),
    ]);
    return { onHand, gateway };
  }

  // ── Settings and the page ──────────────────────────────────────────────────────────────────────────────────────

  async settings(userId: string, network: NetworkId): Promise<AgentWalletSettings> {
    const [row] = await this.db
      .select()
      .from(marketplaceSettings)
      .where(and(eq(marketplaceSettings.userId, userId), eq(marketplaceSettings.network, network)));
    const defaults = MARKETPLACE_DEFAULTS[network];
    return {
      dailyBudget: (row?.dailyBudget ?? defaults.dailyBudget).toString(),
      perCallCap: (row?.perCallCap ?? defaults.perCallCap).toString(),
      askFirst: row?.askFirst ?? false,
      allowedCategories: (row?.allowedCategories ?? []) as MarketplaceCategory[],
      blockedSellers: row?.blockedSellers ?? [],
      limits: { maxDailyBudget: MARKETPLACE_MAX_DAILY_BUDGET.toString(), maxPerCall: MARKETPLACE_MAX_PER_CALL.toString() },
    };
  }

  async updateSettings(user: SessionUser, change: AgentWalletSettingsChange): Promise<AgentWalletSettings> {
    const network = user.activeNetwork;
    const current = await this.settings(user.id, network);
    const dailyBudget = change.dailyBudget !== undefined ? BigInt(change.dailyBudget) : BigInt(current.dailyBudget);
    const perCallCap = change.perCallCap !== undefined ? BigInt(change.perCallCap) : BigInt(current.perCallCap);
    if (dailyBudget > MARKETPLACE_MAX_DAILY_BUDGET || perCallCap > MARKETPLACE_MAX_PER_CALL || perCallCap > dailyBudget) {
      throw problem(HTTP.unprocessable, "validation", "budget out of range");
    }
    const allowedCategories = (change.allowedCategories ?? current.allowedCategories).filter((category) =>
      (MARKETPLACE_CATEGORIES as readonly string[]).includes(category),
    );
    const blockedSellers = change.blockedSellers ?? current.blockedSellers;
    const values = {
      dailyBudget,
      perCallCap,
      askFirst: change.askFirst ?? current.askFirst,
      allowedCategories,
      blockedSellers: blockedSellers.map((seller) => ({ key: seller.key.toLowerCase(), name: seller.name })),
    };
    await this.db
      .insert(marketplaceSettings)
      .values({ userId: user.id, network, ...values })
      .onConflictDoUpdate({ target: [marketplaceSettings.userId, marketplaceSettings.network], set: values });
    return this.settings(user.id, network);
  }

  /** Spent in the last 24 hours: paid, being paid, or paid but failed after (the seller has the money). */
  private async spentToday(userId: string, network: NetworkId): Promise<bigint> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${marketplacePurchases.amount}), 0)` })
      .from(marketplacePurchases)
      .where(
        and(
          eq(marketplacePurchases.userId, userId),
          eq(marketplacePurchases.network, network),
          inArray(marketplacePurchases.status, ["paid", "paying", "failed_after_payment"]),
          gte(marketplacePurchases.createdAt, new Date(Date.now() - MS_PER_DAY)),
        ),
      );
    return BigInt(row?.total ?? "0");
  }

  private async activeGrant(userId: string, network: NetworkId) {
    const [row] = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.userId, userId), eq(grants.network, network), eq(grants.kind, "marketplace"), eq(grants.status, "active")))
      .orderBy(desc(grants.createdAt))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) return undefined;
    return row;
  }

  /** Everything the Agent wallet page shows. */
  async view(user: SessionUser): Promise<AgentWalletView> {
    const network = user.activeNetwork;
    const wallet = await this.agentWallet(user.id, network);
    const [settings, spent, grant, purchases, moves, balances] = await Promise.all([
      this.settings(user.id, network),
      this.spentToday(user.id, network),
      this.activeGrant(user.id, network),
      this.db
        .select()
        .from(marketplacePurchases)
        .where(and(eq(marketplacePurchases.userId, user.id), eq(marketplacePurchases.network, network)))
        .orderBy(desc(marketplacePurchases.createdAt))
        .limit(HISTORY_LIMIT),
      this.db
        .select()
        .from(agentWalletMoves)
        .where(and(eq(agentWalletMoves.userId, user.id), eq(agentWalletMoves.network, network)))
        .orderBy(desc(agentWalletMoves.createdAt))
        .limit(HISTORY_LIMIT),
      wallet ? this.balances(network, wallet.address) : undefined,
    ]);
    const onHand = balances?.onHand ?? ZERO;
    const inGateway = balances?.gateway.available ?? ZERO;
    const withdrawing = balances?.gateway.withdrawing ?? ZERO;
    const history: AgentWalletView["history"] = [
      ...purchases.map((row) => ({ kind: "purchase" as const, at: row.createdAt.toISOString(), purchase: purchaseView(row) })),
      ...moves.map((row) => ({ kind: "move" as const, at: row.createdAt.toISOString(), move: moveView(row) })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, HISTORY_LIMIT);
    return {
      network,
      address: wallet?.address ?? null,
      balances: { onHand: onHand.toString(), inGateway: inGateway.toString(), withdrawing: withdrawing.toString(), total: (onHand + inGateway + withdrawing).toString() },
      settings,
      spentToday: spent.toString(),
      grant: grant ? { perDay: grant.periodAmount.toString(), expiresAt: grant.expiresAt.toISOString() } : null,
      topUpPresets: MARKETPLACE_DEFAULTS[network].topUpPresets.map(String),
      history,
    };
  }

  // ── The marketplace grant ──────────────────────────────────────────────────────────────────────────────────────

  /** The grant the person signs once (Face ID): Kawase may move up to the cap per day into their agent wallet only. */
  async grantRequest(user: SessionUser) {
    const network = user.activeNetwork;
    const owner = await this.walletService.userWallet(user.id);
    if (!owner) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { client, ops, network: context } = this.clients(network);
    if (!isWalletSetUp(await client.getCode({ address: owner.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const agent = await this.ensureAgentWallet(user.id, network);
    const startsAt = nowSeconds();
    const expiresAt = startsAt + GRANT_TTL_DAYS * SECONDS_PER_DAY;
    const grant = buildMarketplaceGrant({
      network: context,
      wallet: owner.address as Address,
      redeemer: ops.address,
      token: context.addresses.usdc,
      amountPerPeriod: MARKETPLACE_DEFAULTS[network].grantPerDay,
      periodSeconds: SECONDS_PER_DAY,
      startsAt,
      expiresAt,
      salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`,
      agentWallet: agent.address,
    });
    const typedData = grantTypedData(context, grant);
    const receipt = describeGrant(context, grant);
    const [row] = await this.db
      .insert(grants)
      .values({
        userId: user.id,
        network,
        kind: "marketplace",
        delegatorWalletId: owner.id,
        delegateAddress: ops.address,
        delegation: jsonSafe(grant),
        delegationHash: hashTypedData(typedData),
        receipt: jsonSafe(receipt),
        periodAmount: receipt.amountPerPeriod ?? ZERO,
        periodSeconds: SECONDS_PER_DAY,
        recipientAddress: agent.address,
        startsAt: new Date(startsAt * MS_PER_SECOND),
        expiresAt: new Date(expiresAt * MS_PER_SECOND),
        status: "pending",
      })
      .returning({ id: grants.id });
    return { grantId: row!.id, typedData: jsonSafe(typedData), receipt: jsonSafe(receipt) };
  }

  async grantSubmit(user: SessionUser, grantId: string, signature: Hex) {
    const [pending] = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.id, grantId), eq(grants.userId, user.id), eq(grants.kind, "marketplace")));
    if (!pending || pending.status !== "pending") throw problem(HTTP.unprocessable, "grant_not_pending");
    const owner = await this.walletService.userWallet(user.id);
    if (!owner) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { network: context } = this.clients(pending.network);
    const grant = withSignature(pending.delegation as never, signature);
    const typedData = grantTypedData(context, grant) as TypedDataDefinition;
    const valid = await verifyTypedData({ address: owner.address as Address, ...typedData, signature }).catch(() => false);
    if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
    await this.db.transaction(async (tx) => {
      await tx
        .update(grants)
        .set({ status: "superseded" })
        .where(and(eq(grants.userId, user.id), eq(grants.network, pending.network), eq(grants.kind, "marketplace"), eq(grants.status, "active")));
      await tx.update(grants).set({ status: "active", delegation: jsonSafe(grant) }).where(eq(grants.id, grantId));
    });
    return { grantId, perDay: pending.periodAmount.toString(), expiresAt: pending.expiresAt.toISOString() };
  }

  // ── Moving money ───────────────────────────────────────────────────────────────────────────────────────────────

  /** Sends one contract call from a Circle wallet and waits for its hash (or throws). */
  private async send(network: NetworkId, walletId: string, call: { to: Address; data: Hex }, refId: string): Promise<Hex> {
    const sent = await this.ops.execute({ network, walletId, contract: call.to, callData: call.data, idempotencyKey: randomUUID(), refId });
    const deadline = Date.now() + CIRCLE_TIMEOUT_MS;
    for (;;) {
      const transaction = await this.ops.get(network, sent.id);
      if (transaction.state === "complete" && transaction.txHash) return transaction.txHash as Hex;
      if (transaction.state === "failed") throw new Error(`circle transaction failed: ${transaction.error ?? "unknown"}`);
      if (Date.now() > deadline) throw new Error("circle transaction still pending");
      await sleep(POLL_MS);
    }
  }

  private async recordMove(userId: string, network: NetworkId, kind: MoveRow["kind"], amount: bigint) {
    const [row] = await this.db.insert(agentWalletMoves).values({ userId, network, kind, amount }).returning();
    return row!;
  }

  private async settleMove(row: MoveRow, status: "confirmed" | "failed", txHashes: string[], error?: string) {
    const [updated] = await this.db
      .update(agentWalletMoves)
      .set({ status, txHashes, error: error ?? null })
      .where(eq(agentWalletMoves.id, row.id))
      .returning();
    return updated!;
  }

  /**
   * Moves what is on hand into Gateway, less the gas reserve and `keep` (left on hand for plain EIP-3009 sellers).
   * Returns the amount deposited (0 when too little).
   */
  private async deposit(userId: string, network: NetworkId, wallet: AgentWallet, onHand: bigint, keep: bigint = ZERO): Promise<bigint> {
    const amount = onHand - AGENT_WALLET_GAS_RESERVE - keep;
    if (amount < GATEWAY_MIN_DEPOSIT) return ZERO;
    const { network: context } = this.clients(network);
    const move = await this.recordMove(userId, network, "deposit", amount);
    const calls = encodeGatewayDeposit(context, amount);
    const hashes: string[] = [];
    try {
      hashes.push(await this.send(network, wallet.walletId, calls.approve, `agent-approve:${move.id}`));
      hashes.push(await this.send(network, wallet.walletId, calls.deposit, `agent-deposit:${move.id}`));
      await this.settleMove(move, "confirmed", hashes);
    } catch (error) {
      await this.settleMove(move, "failed", hashes, (error as Error).message);
      throw error;
    }
    // The balance API credits an Arc deposit within seconds.
    const deadline = Date.now() + GATEWAY_CREDIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { available } = await gatewayBalance(context, wallet.address, this.fetchImpl).catch(() => ({ available: ZERO }));
      if (available >= amount) break;
      await sleep(POLL_MS);
    }
    return amount;
  }

  /** Tops up from the person's wallet under the marketplace grant, then deposits into Gateway. */
  async topUp(user: SessionUser, amount: bigint) {
    const network = user.activeNetwork;
    if (amount <= ZERO) throw problem(HTTP.unprocessable, "validation", "amount must be positive");
    const grant = await this.activeGrant(user.id, network);
    if (!grant) return { status: "needs_grant" as const, grant: await this.grantRequest(user) };
    if (amount > grant.periodAmount) throw problem(HTTP.unprocessable, "validation", "above the grant's daily cap");
    const owner = await this.walletService.userWallet(user.id);
    if (!owner) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const { client, ops, network: context } = this.clients(network);
    const held = await client.readContract({ address: context.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner.address as Address] });
    if (held < amount) throw problem(HTTP.unprocessable, "validation", "not enough USDC in the wallet");
    const agent = await this.ensureAgentWallet(user.id, network);
    if (grant.recipientAddress?.toLowerCase() !== agent.address.toLowerCase()) throw problem(HTTP.conflict, "conflict", "the grant names another agent wallet");
    const move = await this.recordMove(user.id, network, "top_up", amount);
    const call = encodeRedeemTransfer(context, grant.delegation as never, { token: context.addresses.usdc, to: agent.address, amount });
    let topUpHash: Hex;
    try {
      topUpHash = await this.send(network, ops.walletId, call, `agent-top-up:${move.id}`);
    } catch (error) {
      await this.settleMove(move, "failed", [], (error as Error).message);
      throw problem(HTTP.badGateway, "upstream", "the top-up did not go through");
    }
    const settled = await this.settleMove(move, "confirmed", [topUpHash]);
    // Gateway sellers (most) need it deposited; a share stays on hand for plain EIP-3009 sellers (BlockRun's data).
    const { onHand } = await this.balances(network, agent.address);
    await this.deposit(user.id, network, agent, onHand, (amount * AGENT_WALLET_ON_HAND_BPS) / BPS).catch((error: unknown) =>
      this.log.warn({ err: error, userId: user.id }, "gateway deposit after top-up failed; money stays on hand"),
    );
    return { status: "topped_up" as const, move: moveView(settled), wallet: await this.view(user) };
  }

  /**
   * Out of Gateway on Arc to `recipient` (the person's wallet, or the agent wallet itself to refill what is on hand): a
   * burn intent the agent wallet signs, Circle's attestation, then the mint the agent wallet sends. Asks for exactly
   * `value` leaving the burn fee; when refused, leaves the fee cap instead. Throws (with the move marked failed).
   */
  private async withdraw(userId: string, network: NetworkId, agent: AgentWallet, recipient: Address, available: bigint, value: bigint, kind: "return" | "refill") {
    const { network: context } = this.clients(network);
    const move = await this.recordMove(userId, network, kind, value);
    const attest = async (amount: bigint) => {
      const intent = withdrawIntent(context, {
        depositor: agent.address,
        recipient,
        value: amount,
        maxFee: GATEWAY_WITHDRAW_MAX_FEE,
        salt: `0x${randomBytes(SALT_BYTES).toString("hex")}`,
      });
      const signature = await this.agentWallets.signTypedData(network, agent.walletId, intent.typedData as never);
      return gatewayTransfer(context, intent.burnIntent, signature, this.fetchImpl);
    };
    try {
      let sent = value;
      const mint = await attest(sent).catch(async (error: unknown) => {
        // Refused for the fee: ask again leaving the fee cap. Anything else is a real refusal.
        const capped = available - GATEWAY_WITHDRAW_MAX_FEE;
        if (capped <= ZERO || sent <= capped) throw error;
        sent = capped;
        return attest(sent);
      });
      const hash = await this.send(network, agent.walletId, mint, `agent-${kind}:${move.id}`);
      const [settled] = await this.db.update(agentWalletMoves).set({ status: "confirmed", amount: sent, txHashes: [hash] }).where(eq(agentWalletMoves.id, move.id)).returning();
      return settled!;
    } catch (error) {
      await this.settleMove(move, "failed", [], (error as Error).message);
      throw error;
    }
  }

  /** Everything in the agent wallet back to the person's wallet: Gateway first (withdraw + mint), then what is on hand. */
  async returnToWallet(user: SessionUser) {
    const network = user.activeNetwork;
    const agent = await this.agentWallet(user.id, network);
    const owner = await this.walletService.userWallet(user.id);
    if (!agent || !owner) return { status: "nothing_to_return" as const, moves: [], wallet: await this.view(user) };
    const { network: context } = this.clients(network);
    const moves: AgentWalletMove[] = [];
    const before = await this.balances(network, agent.address);
    const available = before.gateway.available;
    if (available > GATEWAY_BURN_FEE) {
      const move = await this.withdraw(user.id, network, agent, owner.address as Address, available, available - GATEWAY_BURN_FEE, "return").catch((error: unknown) => {
        this.log.warn({ err: error, userId: user.id }, "gateway withdrawal failed");
        return undefined;
      });
      if (move) moves.push(moveView(move));
    }
    const { onHand } = await this.balances(network, agent.address);
    const fromHand = onHand - AGENT_WALLET_RETURN_GAS;
    if (fromHand > ZERO) {
      const move = await this.recordMove(user.id, network, "return", fromHand);
      try {
        const hash = await this.send(network, agent.walletId, encodeUsdcTransfer(context, owner.address as Address, fromHand), `agent-return:${move.id}`);
        moves.push(moveView(await this.settleMove(move, "confirmed", [hash])));
      } catch (error) {
        moves.push(moveView(await this.settleMove(move, "failed", [], (error as Error).message)));
      }
    }
    return { status: moves.length > 0 ? ("returned" as const) : ("nothing_to_return" as const), moves, wallet: await this.view(user) };
  }

  // ── Finding and buying ─────────────────────────────────────────────────────────────────────────────────────────

  private available(network: NetworkId) {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "marketplace_unavailable");
    return clients.network;
  }

  async search(user: SessionUser, query: string, category?: MarketplaceCategory) {
    const network = user.activeNetwork;
    const context = this.available(network);
    const settings = user.isAnonymous ? undefined : await this.settings(user.id, network);
    const allowed = category ? [category] : settings?.allowedCategories;
    const blocked = new Set((settings?.blockedSellers ?? []).map((seller) => seller.key));
    // Read past the limit so blocked sellers removed below still leave a full page.
    const { listings, total } = await this.discovery.search(context, { query, categories: allowed, limit: X402_SEARCH_LIMIT + (settings?.blockedSellers.length ?? 0) });
    const shown = listings.filter((listing) => !blocked.has(listing.payTo.toLowerCase()) && !blocked.has(listing.provider.name.toLowerCase()));
    return { network, services: shown.slice(0, X402_SEARCH_LIMIT).map(listingView), total };
  }

  /** One listing with a live price (its 402 asked now, nothing paid). */
  async inspect(user: SessionUser, input: BuyServiceInput) {
    const network = user.activeNetwork;
    const context = this.available(network);
    const listing = await this.discovery.find(context, input.url, input.method);
    if (!listing) return { network, status: "not_listed" as const };
    const call = filledCall(listing, input);
    const asked = await probe(call, this.fetchImpl).catch(() => ({ kind: "error" as const, status: 0 }));
    const price = asked.kind === "payment_required" ? this.cheapest(asked.required, context) : undefined;
    const settings = user.isAnonymous ? undefined : await this.settings(user.id, network);
    return {
      network,
      status: "listed" as const,
      service: listingView(listing),
      livePrice: price?.amount.toString() ?? null,
      free: asked.kind === "free",
      withinPerCallCap: settings && price ? price.amount <= BigInt(settings.perCallCap) : null,
    };
  }

  private cheapest(required: Parameters<typeof optionsHere>[0], context: ReturnType<MarketplaceService["available"]>) {
    const { gateway, eip3009 } = optionsHere(required, context);
    const options = [gateway, eip3009].filter((option): option is PaymentOption => Boolean(option));
    if (options.length === 0) return undefined;
    const amount = options.map((option) => BigInt(option.amount)).reduce(min);
    return { amount, gateway, eip3009 };
  }

  /** The person's tap on a consent card: yes (the next call pays) or no. */
  async decide(user: SessionUser, purchaseId: string, decision: "approve" | "decline") {
    const [row] = await this.db
      .select()
      .from(marketplacePurchases)
      .where(and(eq(marketplacePurchases.id, purchaseId), eq(marketplacePurchases.userId, user.id)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    if (row.status !== "needs_consent") return { purchase: purchaseView(row) };
    const [updated] = await this.db
      .update(marketplacePurchases)
      .set({ status: decision === "approve" ? "approved" : "declined" })
      .where(and(eq(marketplacePurchases.id, purchaseId), eq(marketplacePurchases.status, "needs_consent")))
      .returning();
    return { purchase: purchaseView(updated ?? row) };
  }

  async purchases(user: SessionUser) {
    const rows = await this.db
      .select()
      .from(marketplacePurchases)
      .where(and(eq(marketplacePurchases.userId, user.id), eq(marketplacePurchases.network, user.activeNetwork)))
      .orderBy(desc(marketplacePurchases.createdAt))
      .limit(HISTORY_LIMIT);
    return rows.map(purchaseView);
  }

  /**
   * One paid call for the agent. `tainted` is set once paid data was read in this turn: from then on every purchase
   * waits for the person's tap (MASTER-PLAN §Security, the tainted-turn rule).
   */
  async buy(user: SessionUser, input: BuyServiceInput, context: { threadId: string | null; tainted: boolean }): Promise<BuyOutcome> {
    const network = user.activeNetwork;
    if (user.isAnonymous) return { network, status: "needs_sign_in" };
    const owner = await this.walletService.userWallet(user.id);
    if (!owner) return { network, status: "needs_wallet" };
    const clients = this.chains.get(network);
    if (!clients) return { network, status: "refused", reason: "unavailable" };
    const net = clients.network;
    const [person] = await this.db.select({ pausedAllAt: users.pausedAllAt }).from(users).where(eq(users.id, user.id));
    if (person?.pausedAllAt) return { network, status: "refused", reason: "paused" };

    const listing = await this.discovery.find(net, input.url, input.method);
    if (!listing) return { network, status: "refused", reason: "not_listed" };
    const service = listingView(listing);
    const settings = await this.settings(user.id, network);
    const blocked = new Set(settings.blockedSellers.map((seller) => seller.key));
    if (blocked.has(listing.payTo.toLowerCase()) || blocked.has(listing.provider.name.toLowerCase())) return { network, status: "refused", reason: "blocked_seller", service };
    if (settings.allowedCategories.length > 0 && !settings.allowedCategories.includes(listing.provider.category)) {
      return { network, status: "refused", reason: "category_off", service };
    }

    const call = filledCall(listing, input);
    const hash = requestHash(call);
    const [earlier] = context.threadId
      ? await this.db
          .select()
          .from(marketplacePurchases)
          .where(and(eq(marketplacePurchases.userId, user.id), eq(marketplacePurchases.threadId, context.threadId), eq(marketplacePurchases.requestHash, hash)))
          .orderBy(desc(marketplacePurchases.createdAt))
          .limit(1)
      : [];
    if (earlier?.status === "declined") return { network, status: "refused", reason: "declined", service };
    // The same call answered twice (a retry, a resumed turn): what it already got, never a second payment.
    if (earlier && (earlier.status === "paid" || earlier.status === "paying") && Date.now() - earlier.createdAt.getTime() < SAME_CALL_WINDOW_MS) {
      return { network, status: "paid", purchase: purchaseView(earlier), content: earlier.responsePreview ?? "", truncated: true };
    }
    const approved = earlier?.status === "approved" ? earlier : undefined;

    const asked = await probe(call, this.fetchImpl).catch((error: unknown) => {
      this.log.warn({ err: error, url: call.url }, "seller did not answer");
      return { kind: "error" as const, status: 0 };
    });
    if (asked.kind === "free") return { network, status: "free", service, content: asked.answer.text.slice(0, X402_RESPONSE_PREVIEW_CHARS), truncated: asked.answer.truncated };
    if (asked.kind === "error") return { network, status: "failed", reason: "seller_error", service };
    const priced = this.cheapest(asked.required, net);
    if (!priced) return { network, status: "refused", reason: "no_option_here", service };
    const { amount, gateway, eip3009 } = priced;
    // The 402 must pay the seller the catalog names; a changed payTo is a hard stop.
    if ([gateway, eip3009].some((option) => option && option.payTo.toLowerCase() !== listing.payTo.toLowerCase())) {
      return { network, status: "refused", reason: "payto_changed", service };
    }
    const spent = await this.spentToday(user.id, network);
    const caps = { perCallCap: settings.perCallCap, dailyBudget: settings.dailyBudget, spentToday: spent.toString() };
    if (spent + amount > BigInt(settings.dailyBudget)) return { network, status: "refused", reason: "over_budget", service, caps };

    const base = {
      userId: user.id,
      network,
      threadId: context.threadId,
      url: call.url,
      method: call.method,
      requestHash: hash,
      providerName: listing.provider.name,
      description: listing.description || null,
      category: listing.provider.category,
      payTo: listing.payTo,
      amount,
    };
    const why = amount > BigInt(settings.perCallCap) ? "over_per_call" : settings.askFirst ? "ask_first" : context.tainted ? "after_paid_data" : undefined;
    if (why && !approved) {
      const [pending] =
        earlier?.status === "needs_consent" && earlier.amount === amount
          ? [earlier]
          : await this.db.insert(marketplacePurchases).values({ ...base, status: "needs_consent" }).returning();
      return { network, status: "needs_consent", purchase: purchaseView(pending!), caps, why };
    }

    // Funds: Gateway when its balance covers the price, plain EIP-3009 from what is on hand, else deposit, else top up.
    const agent = await this.ensureAgentWallet(user.id, network);
    let { onHand, gateway: inGateway } = await this.balances(network, agent.address);
    let option: PaymentOption | undefined;
    if (gateway && inGateway.available >= BigInt(gateway.amount)) option = gateway;
    else if (eip3009 && onHand - AGENT_WALLET_GAS_RESERVE >= BigInt(eip3009.amount)) option = eip3009;
    else if (gateway && onHand - AGENT_WALLET_GAS_RESERVE + inGateway.available >= BigInt(gateway.amount)) {
      await this.deposit(user.id, network, agent, onHand).catch((error: unknown) => this.log.warn({ err: error }, "deposit before paying failed"));
      ({ onHand, gateway: inGateway } = await this.balances(network, agent.address));
      if (inGateway.available >= BigInt(gateway.amount)) option = gateway;
    } else if (eip3009 && inGateway.available > GATEWAY_BURN_FEE) {
      // A plain EIP-3009 seller (BlockRun) while the money sits in Gateway: bring some back on hand first (one fee per
      // refill, so at least the refill minimum, never more than Gateway holds less the fee).
      const short = BigInt(eip3009.amount) + AGENT_WALLET_GAS_RESERVE - onHand;
      const wanted = short > AGENT_WALLET_REFILL_MIN ? short : AGENT_WALLET_REFILL_MIN;
      const room = inGateway.available - GATEWAY_BURN_FEE;
      if (room >= short) {
        await this.withdraw(user.id, network, agent, agent.address, inGateway.available, wanted < room ? wanted : room, "refill").catch((error: unknown) =>
          this.log.warn({ err: error }, "refill from gateway failed"),
        );
        ({ onHand, gateway: inGateway } = await this.balances(network, agent.address));
        if (onHand - AGENT_WALLET_GAS_RESERVE >= BigInt(eip3009.amount)) option = eip3009;
      }
    }
    if (!option) {
      const presets = MARKETPLACE_DEFAULTS[network].topUpPresets;
      const suggested = presets.find((preset) => preset >= amount) ?? amount;
      return {
        network,
        status: "needs_top_up",
        service,
        price: amount.toString(),
        wallet: { onHand: onHand.toString(), inGateway: inGateway.available.toString() },
        suggested: suggested.toString(),
        presets: presets.map(String),
      };
    }

    // From here the payment is signed once; the row says "paying" first, so nothing signs it again.
    const rail = option === gateway ? ("gateway" as const) : ("eip3009" as const);
    const [paying] = approved
      ? await this.db.update(marketplacePurchases).set({ status: "paying", rail, amount: BigInt(option.amount) }).where(eq(marketplacePurchases.id, approved.id)).returning()
      : await this.db.insert(marketplacePurchases).values({ ...base, amount: BigInt(option.amount), rail, status: "paying" }).returning();
    let result;
    try {
      result = await pay(call, asked.required, option, this.signer(network, agent), this.fetchImpl);
    } catch (error) {
      this.log.warn({ err: error, purchaseId: paying!.id }, "x402 payment did not go through");
      const [failed] = await this.db
        .update(marketplacePurchases)
        .set({ status: "failed", reasonCode: "payment_failed" })
        .where(eq(marketplacePurchases.id, paying!.id))
        .returning();
      return { network, status: "failed", reason: "payment_failed", purchase: purchaseView(failed!), service };
    }
    const ok = result.answer.status >= HTTP.ok && result.answer.status < HTTP.badRequest;
    const preview = result.answer.text.slice(0, X402_RESPONSE_PREVIEW_CHARS);
    const [done] = await this.db
      .update(marketplacePurchases)
      .set({
        status: ok ? "paid" : result.settlement ? "failed_after_payment" : "failed",
        reasonCode: ok ? null : `http_${result.answer.status}`,
        settlement: result.settlement,
        authorizationNonce: result.nonce,
        httpStatus: String(result.answer.status),
        contentType: result.answer.contentType,
        responsePreview: preview,
        paidAt: ok || result.settlement ? new Date() : null,
      })
      .where(eq(marketplacePurchases.id, paying!.id))
      .returning();
    const view = purchaseView(done!);
    if (!ok) return { network, status: "failed", reason: result.settlement ? "failed_after_payment" : "seller_error", purchase: view, service };
    return { network, status: "paid", purchase: view, content: preview, truncated: result.answer.truncated || result.answer.text.length > preview.length };
  }
}
