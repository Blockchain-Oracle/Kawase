// Margin protection (trade.md "Long / short": take-profit, stop-loss, health alerts), kept inside Kawase Margin.
//
// Grants: per position, the person signs six delegations at once (protect.ts in the delegation package: withdraw and
// repay on that position's own reserves, one capped approval each to Uniswap's router and to the Spoke, taking those
// approvals back, and Uniswap swaps of exactly that pair in one pool paying their wallet), redeemable only by the ops
// wallet until they expire. The caps are the position's size as signed with some headroom; a position grown past them
// asks again. Turning protection off, or signing again over live grants, also disables the old ones on chain (one Face
// ID; Kawase's relayer pays when the wallet can't). Targets: a take-profit and a stop-loss per position (the asset's
// price), checked against the mark and the liquidation price, and against what Uniswap v3 can carry now (a close it
// cannot route is refused up front, not promised). Monitor: every tick, an armed position whose oracle price crossed
// its target is checked again on an executable quote (Uniswap's own for the whole size, in the pinned pool): a
// take-profit closes only when that quote still reaches the target; a stop-loss closes when the quote is within its
// slippage of the oracle, and otherwise tells the person rather than selling at any price. The close itself is
// MarginService's (one order, origin "automation").
// Health: Aave V4 health is one per account, shared by margin and borrowing; under 1.5 and under 1.2 it is told once
// on the way down through the inbox (push and email follow the person's settings), and again after a recovery.
import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { formatUnits, hashTypedData, parseUnits, verifyTypedData, type Address, type Hex, type PublicClient, type TypedDataDefinition } from "viem";

import { MARGIN, MARGIN_PROTECTION, MS_PER_SECOND } from "@kawase/config";
import type { GrantDisableRequest, MarginProtectionChange, MarginProtectionGrantRequest, MarginProtectionOff, MarginProtectionResult, MarginProtectionView } from "@kawase/api-client";
import { accountHealth, grants, intents, marginPositions, type Db } from "@kawase/db";
import { hasNoDebt, readAccount, valueOf } from "@kawase/integrations-aave-v4";
import { buildProtectGrants, describeGrant, encodeRevoke, grantTypedData, isWalletSetUp, PROTECT_PURPOSES, withSignature, type ProtectGrants, type ProtectPurpose, type ProtectScope } from "@kawase/integrations-delegation";
import type { Logger } from "@kawase/log";
import { AAVE_V4, type NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import { jsonSafe } from "../intents/chain";
import { safetySettingsOf } from "../safety/settings";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { MarginService } from "./service";
import { uniswapQuote } from "./uniswap";

type GrantRow = typeof grants.$inferSelect;
type PositionRow = typeof marginPositions.$inferSelect;
type CloseContext = NonNullable<Awaited<ReturnType<MarginService["closeContext"]>>>;
type Level = "ok" | "warning" | "danger";
type Reason = "take_profit" | "stop_loss";
/** What each grant row keeps besides the delegation: which grant it is, for which position, and what they all pin. */
type StoredReceipt = { purpose?: ProtectPurpose; positionId?: string; scope?: { spoke: string; router: string; fee: number; collateral: StoredLeg; debt: StoredLeg } };
type StoredLeg = { token: string; reserveId: number; cap: string };

const PRICE_DECIMALS = 8;
const WAD_DECIMALS = 18;
const SALT_BYTES = 32;
const DAY_S = 86_400;
const BPS = 10_000;
const BPS_BIG = 10_000n;
const ZERO = 0n;
const HEALTH_DIGITS = 2;
/** A short's buy-back is quoted with this much USDC over the debt's value, then priced per unit bought. */
const SHORT_QUOTE_HEADROOM = 1.05;
/** `disableDelegation` from the wallet: one, then each more in the same self-batch (as WalletService sizes revokes). */
const DISABLE_GAS = 200_000n;
const DISABLE_EACH_GAS = 120_000n;
const NETWORK: NetworkId = "mainnet";
const LEVELS: Record<Level, number> = { ok: 0, warning: 1, danger: 2 };
const nowSeconds = () => Math.floor(Date.now() / MS_PER_SECOND);
const salt = (): Hex => `0x${randomBytes(SALT_BYTES).toString("hex")}`;
const usd = (value: bigint) => Number(formatUnits(value, PRICE_DECIMALS));
const withHeadroom = (amount: bigint) => (amount * BigInt(MARGIN_PROTECTION.capHeadroomBps)) / BPS_BIG;
const withRepayBuffer = (amount: bigint) => amount + (amount * BigInt(MARGIN.repayBufferBps)) / BPS_BIG;
const receiptOf = (row: GrantRow) => row.receipt as StoredReceipt;
const live = (row: GrantRow) => row.status === "active" && row.expiresAt.getTime() > Date.now();

function parsePrice(text: string | null | undefined): bigint | null | undefined {
  if (text === undefined) return undefined;
  if (text === null || text.trim() === "") return null;
  if (!/^\d+(\.\d{1,8})?$/.test(text.trim())) throw problem(HTTP.badRequest, "validation", "a price is digits with a dot");
  const value = parseUnits(text.trim(), PRICE_DECIMALS);
  if (value === ZERO) throw problem(HTTP.badRequest, "validation", "a price above zero");
  return value;
}

function loadScope(stored: NonNullable<StoredReceipt["scope"]>): ProtectScope {
  const leg = (entry: StoredLeg) => ({ token: entry.token as Address, reserveId: entry.reserveId, cap: BigInt(entry.cap) });
  return { spoke: stored.spoke as Address, router: stored.router as Address, fee: stored.fee, collateral: leg(stored.collateral), debt: leg(stored.debt) };
}

/** Whether a close of the position as it is now stays inside the grants' caps (it grew past them otherwise). */
function covers(scope: ProtectScope, context: CloseContext) {
  return context.live.collateral <= scope.collateral.cap && withRepayBuffer(context.live.debt) <= scope.debt.cap;
}

export class MarginProtection {
  /** On-chain disables handed out for the relayer to send, so the submit route sends nothing else. */
  private readonly relayedDisables = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly margin: MarginService,
    private readonly log: Logger,
    private readonly inbox?: InboxService,
  ) {}

  /**
   * The person's protection grants on a network that are still in play: one position's, together with any from
   * before grants were per position (account-wide, no position: never used again, only disabled), or all of them.
   */
  private async rows(userId: string, network: NetworkId, positionId?: string): Promise<GrantRow[]> {
    const rows = await this.db
      .select()
      .from(grants)
      .where(and(eq(grants.userId, userId), eq(grants.network, network), eq(grants.kind, "margin_protection"), inArray(grants.status, ["pending", "active"])));
    if (!positionId) return rows;
    return rows.filter((row) => receiptOf(row).positionId === positionId || receiptOf(row).positionId === undefined);
  }

  /** A position's six grants, signed and unexpired, with what they pin; or nothing. */
  private async active(userId: string, network: NetworkId, positionId: string): Promise<{ grants: ProtectGrants; scope: ProtectScope } | undefined> {
    const rows = (await this.rows(userId, network, positionId)).filter((row) => live(row) && receiptOf(row).positionId === positionId);
    const byPurpose = new Map(rows.map((row) => [receiptOf(row).purpose, row]));
    const stored = rows[0] ? receiptOf(rows[0]).scope : undefined;
    if (!stored || !PROTECT_PURPOSES.every((purpose) => byPurpose.has(purpose))) return undefined;
    return { grants: Object.fromEntries(PROTECT_PURPOSES.map((purpose) => [purpose, byPurpose.get(purpose)!.delegation])) as unknown as ProtectGrants, scope: loadScope(stored) };
  }

  private available(network: NetworkId) {
    return network === NETWORK && Boolean(AAVE_V4[network]?.mainSpoke) && Boolean(this.chains.get(network)?.ops);
  }

  /** Whether Kawase may close this position for the person: its grants, and until when. A position grown past them asks again. */
  async view(user: SessionUser, positionId?: string): Promise<MarginProtectionView> {
    const network = user.activeNetwork;
    const shell = { network, positionId: positionId ?? null, available: this.available(network) };
    if (!positionId) return { ...shell, grant: "none", expiresAt: null };
    const rows = (await this.rows(user.id, network, positionId)).filter((row) => receiptOf(row).positionId === positionId);
    const signed = rows.filter((row) => row.status === "active");
    const expiresAt = signed[0]?.expiresAt.toISOString() ?? null;
    if (signed.length < PROTECT_PURPOSES.length) return { ...shell, grant: rows.some((row) => row.status === "pending") ? "pending" : "none", expiresAt: null };
    if (!signed.every(live)) return { ...shell, grant: "expired", expiresAt };
    const granted = await this.active(user.id, network, positionId);
    const context = await this.margin.closeContext(user.id, network, positionId);
    return { ...shell, grant: granted && context && covers(granted.scope, context) ? "active" : "none", expiresAt };
  }

  /**
   * The grants to sign for one position, stored as pending (earlier unsigned ones set aside), pinned to its pair, its
   * pool and its size now. Signing over live grants (renewing, or the account-wide ones from before) comes with their
   * on-chain disable, signed in the same yes.
   */
  async requestGrant(user: SessionUser, positionId: string): Promise<MarginProtectionGrantRequest> {
    const network = user.activeNetwork;
    const clients = this.chains.get(network);
    if (network !== NETWORK || !clients?.ops) throw problem(HTTP.unprocessable, "protection_unavailable", "take-profit and stop-loss run on Arc mainnet");
    const wallet = await this.wallets.userWallet(user.id);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    if (!isWalletSetUp(await clients.client.getCode({ address: wallet.address as Address }))) throw problem(HTTP.unprocessable, "wallet_not_set_up");
    const context = await this.margin.closeContext(user.id, network, positionId);
    if (!context) throw problem(HTTP.notFound, "not_found", "no such open position");
    // The pool the close will sell in: the best tier for the whole collateral now (the grants pin it).
    const pool = await uniswapQuote(clients.client as PublicClient, context.collateral.underlying, context.debt.underlying, context.live.collateral).catch(() => undefined);
    if (!pool) throw problem(HTTP.unprocessable, "protection_unavailable", "Uniswap on Arc cannot close this position's size right now");
    const scope: ProtectScope = {
      spoke: context.venue.spoke,
      router: MARGIN_PROTECTION.uniswap.router as Address,
      fee: pool.fee,
      collateral: { token: context.collateral.underlying, reserveId: context.collateral.reserveId, cap: withHeadroom(context.live.collateral) },
      debt: { token: context.debt.underlying, reserveId: context.debt.reserveId, cap: withHeadroom(withRepayBuffer(context.live.debt)) },
    };
    const expiresAt = nowSeconds() + MARGIN_PROTECTION.grantDays * DAY_S;
    const built = buildProtectGrants({
      network: clients.network,
      wallet: wallet.address as Address,
      redeemer: clients.ops.address as Address,
      ...scope,
      expiresAt,
      salts: Object.fromEntries(PROTECT_PURPOSES.map((purpose) => [purpose, salt()])) as Record<ProtectPurpose, Hex>,
    });
    const replaced = (await this.rows(user.id, network, positionId)).filter((row) => row.status === "active");
    const revoke = await this.disableRequest(user.id, network, replaced);
    const out: MarginProtectionGrantRequest = { grants: [], receipts: [], expiresAt: new Date(expiresAt * MS_PER_SECOND).toISOString(), revoke };
    await this.db.transaction(async (tx) => {
      await tx
        .update(grants)
        .set({ status: "superseded" })
        .where(and(eq(grants.userId, user.id), eq(grants.network, network), eq(grants.kind, "margin_protection"), eq(grants.status, "pending"), sql`${grants.receipt}->>'positionId' = ${positionId}`));
      for (const purpose of PROTECT_PURPOSES) {
        const typedData = grantTypedData(clients.network, built[purpose]);
        const receipt = { purpose, positionId, scope, ...describeGrant(clients.network, built[purpose]) };
        const [row] = await tx
          .insert(grants)
          .values({
            userId: user.id,
            network,
            kind: "margin_protection",
            delegatorWalletId: wallet.id,
            delegateAddress: clients.ops!.address,
            delegation: jsonSafe(built[purpose]),
            delegationHash: hashTypedData(typedData),
            receipt: jsonSafe(receipt),
            periodAmount: ZERO,
            periodSeconds: 0,
            recipientAddress: wallet.address,
            startsAt: new Date(),
            expiresAt: new Date(expiresAt * MS_PER_SECOND),
            status: "pending",
          })
          .returning({ id: grants.id });
        out.grants.push({ grantId: row!.id, typedData: jsonSafe(typedData) });
        out.receipts.push(jsonSafe(receipt));
      }
    });
    return out;
  }

  /** Every signature checked against the wallet; then the position's grants are on (the old ones set aside) and its targets watched. */
  async activate(user: SessionUser, signatures: { grantId: string; signature: Hex }[]): Promise<MarginProtectionView> {
    const network = user.activeNetwork;
    const clients = this.chains.get(network);
    const wallet = await this.wallets.userWallet(user.id);
    if (!clients || !wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const asked = new Set(signatures.map((entry) => entry.grantId));
    const pending = (await this.rows(user.id, network)).filter((row) => row.status === "pending" && asked.has(row.id));
    const positionId = pending[0] ? receiptOf(pending[0]).positionId : undefined;
    const purposes = new Set(pending.map((row) => receiptOf(row).purpose));
    if (!positionId || pending.some((row) => receiptOf(row).positionId !== positionId) || pending.length !== PROTECT_PURPOSES.length || purposes.size !== PROTECT_PURPOSES.length || signatures.length !== PROTECT_PURPOSES.length)
      throw problem(HTTP.unprocessable, "grant_not_pending");
    const signed: { row: GrantRow; delegation: ReturnType<typeof withSignature> }[] = [];
    for (const row of pending) {
      const signature = signatures.find((entry) => entry.grantId === row.id)?.signature;
      if (!signature) throw problem(HTTP.unprocessable, "grant_not_pending");
      const delegation = withSignature(row.delegation as never, signature);
      const valid = await verifyTypedData({ address: wallet.address as Address, ...(grantTypedData(clients.network, delegation) as TypedDataDefinition), signature }).catch(() => false);
      if (!valid) throw problem(HTTP.unprocessable, "signature_mismatch");
      signed.push({ row, delegation });
    }
    const replaced = (await this.rows(user.id, network, positionId)).filter((row) => row.status === "active").map((row) => row.id);
    await this.db.transaction(async (tx) => {
      // Their on-chain disable was signed with these (requestGrant); the app sends it once this answers.
      if (replaced.length > 0) await tx.update(grants).set({ status: "superseded" }).where(inArray(grants.id, replaced));
      for (const entry of signed) await tx.update(grants).set({ status: "active", delegation: jsonSafe(entry.delegation) }).where(eq(grants.id, entry.row.id));
      // Targets set before the grants were signed start being watched now.
      await tx
        .update(marginPositions)
        .set({ protection: "armed" })
        .where(and(eq(marginPositions.id, positionId), eq(marginPositions.userId, user.id), eq(marginPositions.status, "open"), or(isNotNull(marginPositions.takeProfit), isNotNull(marginPositions.stopLoss)), sql`${marginPositions.protection} is distinct from 'closing'`));
    });
    return this.view(user, positionId);
  }

  /**
   * Kawase stops using a position's grants at once (or every position's, when none is named); the targets stay,
   * unwatched. The answer carries the on-chain disable for the wallet to sign (one Face ID), so a leaked ops key can't
   * use them either; expired ones are dead on chain already.
   */
  async revoke(user: SessionUser, positionId?: string): Promise<MarginProtectionOff> {
    const network = user.activeNetwork;
    const rows = await this.rows(user.id, network, positionId);
    const revoke = await this.disableRequest(user.id, network, rows.filter((row) => row.status === "active"));
    await this.db.transaction(async (tx) => {
      if (rows.length > 0) await tx.update(grants).set({ status: "revoked" }).where(inArray(grants.id, rows.map((row) => row.id)));
      await tx
        .update(marginPositions)
        .set({ protection: null })
        .where(and(eq(marginPositions.userId, user.id), eq(marginPositions.network, network), eq(marginPositions.protection, "armed"), ...(positionId ? [eq(marginPositions.id, positionId)] : [])));
    });
    return { ...(await this.view(user, positionId)), revoke };
  }

  /** The relayed disable the wallet signed (it couldn't pay the fee): Kawase's relayer sends it. */
  async submitDisable(user: SessionUser, requestId: string, signature: Hex) {
    if (!this.relayedDisables.delete(requestId)) throw problem(HTTP.notFound, "not_found", "no such transaction request");
    return this.wallets.submitRelayedBatch(user.id, requestId, signature);
  }

  /**
   * `disableDelegation` for grants Kawase no longer uses, from the wallet: one transaction (several grants go as one
   * self-batch), paid by the wallet when its USDC covers the fee, else a one-time delegation Kawase's relayer sends.
   */
  private async disableRequest(userId: string, network: NetworkId, rows: GrantRow[]): Promise<GrantDisableRequest | null> {
    const unexpired = rows.filter(live);
    const clients = this.chains.get(network);
    if (unexpired.length === 0 || !clients) return null;
    const gas = DISABLE_GAS + DISABLE_EACH_GAS * BigInt(unexpired.length - 1);
    const ids = unexpired.map((row) => row.id);
    if (await this.wallets.canPayFee(userId, network, ZERO, gas)) return (await this.wallets.revokeGrantsRequest(userId, ids)) as GrantDisableRequest | null;
    const request = await this.wallets.relayedBatchRequest(
      userId,
      network,
      "revoke_grant",
      unexpired.map((row) => encodeRevoke(clients.network, row.delegation as never)),
    );
    this.relayedDisables.add(request.requestId);
    return request;
  }

  /** A position just grew (the person added to it): past what its grants let Kawase move, it stops being watched and its page asks again. */
  async resized(userId: string, network: NetworkId, positionId: string) {
    const granted = await this.active(userId, network, positionId);
    if (!granted) return;
    const context = await this.margin.closeContext(userId, network, positionId);
    if (!context || covers(granted.scope, context)) return;
    await this.db.update(marginPositions).set({ protection: null }).where(and(eq(marginPositions.id, positionId), eq(marginPositions.protection, "armed")));
  }

  /** A take-profit and/or stop-loss for one position: on the right side of the mark, short of liquidation, and routable now. */
  async protect(user: SessionUser, positionId: string, change: MarginProtectionChange): Promise<MarginProtectionResult> {
    const network = user.activeNetwork;
    if (network !== NETWORK) throw problem(HTTP.unprocessable, "protection_unavailable", "take-profit and stop-loss run on Arc mainnet");
    const context = await this.margin.closeContext(user.id, network, positionId);
    if (!context) throw problem(HTTP.notFound, "not_found", "no such open position");
    const takeProfit = parsePrice(change.takeProfit);
    const stopLoss = parsePrice(change.stopLoss);
    const next = { takeProfit: takeProfit === undefined ? context.row.takeProfit : takeProfit, stopLoss: stopLoss === undefined ? context.row.stopLoss : stopLoss };
    const mark = context.asset.price;
    const view = (await this.margin.positions(user)).find((position) => position.id === positionId);
    const liquidation = view?.liquidationPrice ? BigInt(view.liquidationPrice) : null;
    const long = context.side === "long";
    if (next.takeProfit !== null && (long ? next.takeProfit <= mark : next.takeProfit >= mark)) throw problem(HTTP.unprocessable, "take_profit_wrong_side", long ? "a take-profit is above the price now" : "a take-profit is below the price now");
    if (next.stopLoss !== null && (long ? next.stopLoss >= mark : next.stopLoss <= mark)) throw problem(HTTP.unprocessable, "stop_loss_wrong_side", long ? "a stop-loss is below the price now" : "a stop-loss is above the price now");
    if (next.stopLoss !== null && liquidation !== null && (long ? next.stopLoss <= liquidation : next.stopLoss >= liquidation)) throw problem(HTTP.unprocessable, "stop_loss_past_liquidation", "the stop-loss must come before liquidation");
    const any = next.takeProfit !== null || next.stopLoss !== null;
    const active = await this.active(user.id, network, positionId);
    const granted = Boolean(active && covers(active.scope, context));
    // Only what Kawase can actually close: the whole position through Uniswap v3 (the grants' pool once signed), planned now.
    if (any) {
      try {
        await this.margin.planProtectiveClose(context, MARGIN_PROTECTION.stopLossSlippageBps, "quote", granted ? active!.scope.fee : undefined);
      } catch (error) {
        this.log.info({ err: error, positionId }, "protection unroutable");
        throw problem(HTTP.unprocessable, "protection_unavailable", "Uniswap on Arc cannot close this position's size right now");
      }
    }
    await this.db
      .update(marginPositions)
      .set({ takeProfit: next.takeProfit, stopLoss: next.stopLoss, protection: any && granted ? "armed" : null })
      .where(and(eq(marginPositions.id, positionId), eq(marginPositions.userId, user.id), sql`${marginPositions.protection} is distinct from 'closing'`));
    const position = (await this.margin.positions(user)).find((entry) => entry.id === positionId);
    if (!position) throw problem(HTTP.notFound, "not_found", "no such open position");
    return { position, needsGrant: any && !granted };
  }

  // ── The monitor ─────────────────────────────────────────────────────────────────────────────────────────────

  /** The price Uniswap would actually give for the whole position now, in the grants' pool (USD, as a number), or undefined. */
  private async executablePrice(client: PublicClient, context: CloseContext, fee: number): Promise<number | undefined> {
    const { asset, usdc, live: amounts, side } = context;
    try {
      if (side === "long") {
        const quote = await uniswapQuote(client, asset.underlying, usdc.underlying, amounts.collateral, fee);
        return Number(formatUnits(quote.amountOut, usdc.decimals)) / Number(formatUnits(amounts.collateral, asset.decimals));
      }
      const spend = Number(formatUnits(valueOf(amounts.debt, asset.decimals, asset.price), PRICE_DECIMALS)) * SHORT_QUOTE_HEADROOM;
      const usdcIn = parseUnits(spend.toFixed(usdc.decimals), usdc.decimals);
      const quote = await uniswapQuote(client, usdc.underlying, asset.underlying, usdcIn, fee);
      return Number(formatUnits(usdcIn, usdc.decimals)) / Number(formatUnits(quote.amountOut, asset.decimals));
    } catch {
      return undefined;
    }
  }

  async tick() {
    const clients = this.chains.get(NETWORK);
    if (!clients?.ops) return;
    const armed = await this.db
      .select()
      .from(marginPositions)
      .where(and(eq(marginPositions.network, NETWORK), eq(marginPositions.status, "open"), eq(marginPositions.protection, "armed")));
    if (armed.length === 0) return;
    const venue = await this.margin.venueFor(NETWORK);
    if (!venue) return;
    for (const row of armed) {
      const asset = venue.reserves.find((reserve) => reserve.underlying.toLowerCase() === row.asset.toLowerCase());
      if (!asset) continue;
      const mark = asset.price;
      const long = row.side === "long";
      const hit: Reason | undefined =
        row.takeProfit !== null && (long ? mark >= row.takeProfit : mark <= row.takeProfit) ? "take_profit" : row.stopLoss !== null && (long ? mark <= row.stopLoss : mark >= row.stopLoss) ? "stop_loss" : undefined;
      if (!hit) continue;
      await this.fire(row, hit, clients.client as PublicClient).catch((error: unknown) => this.log.warn({ err: error, positionId: row.id }, "protection fire failed"));
    }
  }

  private async fire(row: PositionRow, reason: Reason, client: PublicClient) {
    // Practice mode never touches real money: a target that is hit is only told (once). Pause stops what Kawase does
    // for the person except what lowers their risk: a stop-loss still closes (a pause must not leave a falling position
    // to liquidation); a take-profit waits, still armed, and closes after they resume if the price is still there.
    const settings = await safetySettingsOf(this.db, row.userId, NETWORK);
    if (settings.practice || (settings.pausedAt && reason === "take_profit")) {
      await this.held(row, reason, settings.practice ? "practice" : "paused");
      return;
    }
    const granted = await this.active(row.userId, NETWORK, row.id);
    if (!granted) {
      await this.db.update(marginPositions).set({ protection: null }).where(eq(marginPositions.id, row.id));
      return;
    }
    const context = await this.margin.closeContext(row.userId, NETWORK, row.id);
    if (!context) return;
    const exec = await this.executablePrice(client, context, granted.scope.fee);
    const mark = usd(context.asset.price);
    const long = row.side === "long";
    const slippage = (reason === "take_profit" ? MARGIN_PROTECTION.takeProfitSlippageBps : MARGIN_PROTECTION.stopLossSlippageBps) / BPS;
    const target = usd(reason === "take_profit" ? row.takeProfit! : row.stopLoss!);
    // Executable, not just the oracle: a take-profit needs Uniswap's price for the whole size to still reach the target;
    // a stop-loss accepts its slippage from the oracle and no more.
    const fair = exec !== undefined && (reason === "take_profit" ? (long ? exec >= target * (1 - slippage) : exec <= target * (1 + slippage)) : long ? exec >= mark * (1 - slippage) : exec <= mark * (1 + slippage));
    if (!fair) {
      if (reason === "take_profit") return; // not really reached at a price Kawase can get: wait for the next tick
      await this.unavailable(row, reason);
      return;
    }
    const result = await this.margin.protectiveClose({ userId: row.userId, network: NETWORK, positionId: row.id, reason, slippageBps: Math.round(slippage * BPS), grants: granted.grants, scope: granted.scope });
    if ("refused" in result && result.refused !== "already_closing") await this.unavailable(row, reason);
    this.log.info({ positionId: row.id, reason, mark, exec, result }, "protection fired");
  }

  /** A stop Kawase could not take at a fair price: the person is told and the position is no longer watched. */
  private async unavailable(row: PositionRow, reason: Reason) {
    const [changed] = await this.db.update(marginPositions).set({ protection: "unavailable" }).where(and(eq(marginPositions.id, row.id), eq(marginPositions.protection, "armed"))).returning({ id: marginPositions.id });
    if (!changed || !this.inbox) return;
    await this.inbox.add(this.db, {
      userId: row.userId,
      network: row.network,
      kind: "position_closed",
      params: { market: row.market, side: row.side, reason, outcome: "failed" },
      dedupeKey: `position_closed:${row.id}:${reason}:${Date.now()}`,
    });
  }

  /** A target hit while practice mode or a pause holds the close back: told once per position, target and cause; still armed. */
  private async held(row: PositionRow, reason: Reason, outcome: "practice" | "paused") {
    if (!this.inbox) return;
    await this.inbox.add(this.db, {
      userId: row.userId,
      network: row.network,
      kind: "position_closed",
      params: { market: row.market, side: row.side, reason, outcome },
      dedupeKey: `position_held:${row.id}:${reason}:${outcome}`,
    });
  }

  /** Account health under 1.5, then 1.2, told once on the way down; recovering resets it. */
  async healthTick() {
    const clients = this.chains.get(NETWORK);
    const spoke = AAVE_V4[NETWORK]?.mainSpoke;
    if (!clients || !spoke || !this.inbox) return;
    const venue = await this.margin.venueFor(NETWORK);
    if (!venue) return;
    // Anyone who could owe on the Spoke: open margin positions, or a borrow made through Kawase.
    const holders = await this.db
      .selectDistinct({ userId: intents.userId })
      .from(intents)
      .where(and(eq(intents.network, NETWORK), inArray(intents.kind, ["margin", "lend"]), eq(intents.state, "completed"), gt(intents.createdAt, sql`now() - interval '365 days'`)));
    for (const { userId } of holders) {
      const wallet = (await this.wallets.userWallet(userId))?.address as Address | undefined;
      if (!wallet) continue;
      const account = await readAccount(clients.client, spoke, wallet, venue.reserves.length).catch(() => undefined);
      if (!account) continue;
      const health = hasNoDebt(account) ? null : Number(formatUnits(account.healthFactor, WAD_DECIMALS));
      const level: Level = health === null || health >= MARGIN_PROTECTION.warnHealthBps / BPS ? "ok" : health >= MARGIN_PROTECTION.dangerHealthBps / BPS ? "warning" : "danger";
      const [before] = await this.db.select().from(accountHealth).where(and(eq(accountHealth.userId, userId), eq(accountHealth.network, NETWORK)));
      const worse = LEVELS[level] > LEVELS[(before?.level as Level | undefined) ?? "ok"];
      await this.db
        .insert(accountHealth)
        .values({ userId, network: NETWORK, level, health: health?.toFixed(HEALTH_DIGITS) ?? null })
        .onConflictDoUpdate({ target: [accountHealth.userId, accountHealth.network], set: { level, health: health?.toFixed(HEALTH_DIGITS) ?? null, updatedAt: new Date() } });
      if (!worse || health === null) continue;
      const [margin] = await this.db.select({ id: marginPositions.id }).from(marginPositions).where(and(eq(marginPositions.userId, userId), eq(marginPositions.network, NETWORK), eq(marginPositions.status, "open"))).limit(1);
      await this.inbox.add(this.db, {
        userId,
        network: NETWORK,
        kind: "position_health",
        params: { level, health: health.toFixed(HEALTH_DIGITS), path: margin ? "/margin" : "/borrow" },
        dedupeKey: `position_health:${userId}:${NETWORK}:${level}:${Date.now()}`,
      });
    }
  }

  start() {
    const run = (name: string, task: () => Promise<void>) => () => void task().catch((error: unknown) => this.log.warn({ err: error }, `${name} failed`));
    const timers = [setInterval(run("protection tick", () => this.tick()), MARGIN_PROTECTION.tickMs), setInterval(run("health tick", () => this.healthTick()), MARGIN_PROTECTION.healthTickMs)];
    for (const timer of timers) timer.unref();
    return () => timers.forEach((timer) => clearInterval(timer));
  }
}
