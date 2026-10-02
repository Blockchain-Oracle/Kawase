// Earn and borrow on Aave V4 directly (earn-borrow.md), and the yield options card that compares every source.
//
// Options: for an asset, Aave V4's Main Spoke (supply rate, what the hub can pay out now, size), App Kit's Morpho
// vaults (G1's liquidity ranking; stuck ones never offered) and Merkl's LP campaigns (shown as advanced, read-only),
// ranked by rate among sources that could give the amount back now. Actions on the person's own Aave account —
// supply, withdraw, borrow (with collateral put in the same batch when asked), repay — are intents built like swaps:
// a hashed version, the calls built at approval, simulated from the wallet, one self-batch (one Face ID), settled on
// the Spoke's own events. Positions exclude what Kawase Margin positions hold (margin_positions), so earn, borrow
// and margin never double count the shared account; health is the account's.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { erc20Abi, formatUnits, keccak256, maxUint256, parseTransaction, parseUnits, recoverTransactionAddress, type Address, type Hex, type TransactionReceipt } from "viem";

import { APPROVAL_TTL_S, GAS_ESTIMATE_HEADROOM_PERCENT, GAS_FLOAT_USDC_BASE_UNITS, INTENT_TTL_S, LEND, MAX_FEE_DRAFT_MULTIPLIER, MS_PER_SECOND, SEND_UNKNOWN_AFTER_S } from "@kawase/config";
import type { LendAccountView, LendApproveResponse, LendDraftView, LendIntent, LendRequest, UnsignedTransaction, YieldOptionView, YieldOptionsView } from "@kawase/api-client";
import { approvals, intentDrafts, intents, marginPositions, newId, txAttempts, type Db } from "@kawase/db";
import {
  BPS,
  WAD,
  approveCall,
  borrowApr,
  borrowCall,
  collateralCall,
  hasNoDebt,
  readAccount,
  readMarket,
  repayCall,
  spokeMoves,
  supplyApr,
  supplyCall,
  valueOf,
  withdrawCall,
  type AaveAccount,
  type AaveMarket,
  type AaveReserve,
  type SpokeCall,
} from "@kawase/integrations-aave-v4";
import { encodeSelfBatch, isWalletSetUp } from "@kawase/integrations-delegation";
import { DRAFTABLE_STATES, LEND_ACTIONS, lendDraftHash, loadLendDraft, storeLendDraft, type IntentState, type LendDraft, type StoredLendDraft } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import { AAVE_V4, type NetworkId } from "@kawase/networks";
import { evaluateLend, type LendEvaluation, type LendFacts, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import type { EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import { jsonSafe, nextAttemptNo, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;
type StoredRequest = LendIntent["request"];
type DraftPayload = { draft: StoredLendDraft | null; view: LendDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };
type Free = { supplied: Map<number, bigint>; debt: Map<number, bigint> };

const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const BPS_NUMBER = Number(BPS);
const PRICE_DECIMALS = 8;
const WAD_DECIMALS = 18;
const MARKET_FRESH_MS = 15_000;
const MERKL_TIMEOUT_MS = 5_000;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 60;
const ERROR_MAX = 140;
const RATE_PERCENT = 100;
const SHARE_ROUNDING = 10n;
/** Liquid sources first, then those with a note (low liquidity, small for the amount), then LP shown only. */
const RANK_LIQUID = 0;
const RANK_NOTED = 1;
const RANK_SHOWN_ONLY = 2;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const usd = (value: bigint) => Number(formatUnits(value, PRICE_DECIMALS));
const weighted = (reserve: AaveReserve, amount: bigint) => (valueOf(amount, reserve.decimals, reserve.price) * BigInt(reserve.collateralFactorBps)) / BPS;
const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(scaled, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

function restingState(evaluation: LendEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

/**
 * Where the account would be liquidated, when its collateral after the action is one asset other than what it owes:
 * health moves in step with that asset's price, so it reaches 1 at price ÷ health. Mixed collateral has no one price.
 */
function liquidationOf(market: AaveMarket, account: AaveAccount, action: StoredRequest["action"], reserve: AaveReserve, added: AaveReserve | undefined, healthAfterBps: number | null) {
  if (healthAfterBps === null || healthAfterBps <= 0) return null;
  const collateralIds = new Set(account.reserves.filter((entry) => entry.usingAsCollateral && entry.supplied > ZERO).map((entry) => entry.reserveId));
  if (added) collateralIds.add(added.reserveId);
  if (action === "supply" && account.reserves[reserve.reserveId]?.usingAsCollateral) collateralIds.add(reserve.reserveId);
  const debtIds = new Set(account.reserves.filter((entry) => entry.debt > ZERO).map((entry) => entry.reserveId));
  if (action === "borrow") debtIds.add(reserve.reserveId);
  if (collateralIds.size !== 1) return null;
  const only = market.reserves.find((entry) => entry.reserveId === [...collateralIds][0]);
  if (!only || debtIds.has(only.reserveId)) return null;
  return { asset: only.symbol, price: ((only.price * BPS) / BigInt(healthAfterBps)).toString() };
}

export class LendService {
  private readonly tracking = new Set<string>();
  private readonly marketCache = new Map<NetworkId, { at: number; market: AaveMarket }>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly earn: EarnService,
    private readonly log: Logger,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  private async venue(network: NetworkId): Promise<AaveMarket | undefined> {
    const spoke = AAVE_V4[network]?.mainSpoke;
    const clients = this.chains.get(network);
    if (!spoke || !clients) return undefined;
    const hit = this.marketCache.get(network);
    if (hit && Date.now() - hit.at < MARKET_FRESH_MS) return hit.market;
    const market = await readMarket(clients.client, spoke);
    this.marketCache.set(network, { at: Date.now(), market });
    return market;
  }

  private findReserve(market: AaveMarket, text: string | null): AaveReserve | "unknown" | undefined {
    if (!text) return undefined;
    const wanted = text.trim().toLowerCase();
    return market.reserves.find((reserve) => reserve.symbol.toLowerCase() === wanted || same(reserve.underlying, wanted)) ?? "unknown";
  }

  /** What the account holds outside Kawase Margin positions (those amounts belong to their positions). */
  private async free(userId: string, network: NetworkId, market: AaveMarket, account: AaveAccount): Promise<Free> {
    const rows = await this.db
      .select()
      .from(marginPositions)
      .where(and(eq(marginPositions.userId, userId), eq(marginPositions.network, network), eq(marginPositions.status, "open")));
    const usdc = market.reserves.find((reserve) => same(reserve.underlying, this.clients(network).network.addresses.usdc));
    const held = { supplied: new Map<number, bigint>(), debt: new Map<number, bigint>() };
    for (const row of rows) {
      const asset = market.reserves.find((reserve) => same(reserve.underlying, row.asset));
      if (!asset || !usdc) continue;
      const collateralId = row.side === "long" ? asset.reserveId : usdc.reserveId;
      const debtId = row.side === "long" ? usdc.reserveId : asset.reserveId;
      held.supplied.set(collateralId, (held.supplied.get(collateralId) ?? ZERO) + row.collateral);
      held.debt.set(debtId, (held.debt.get(debtId) ?? ZERO) + row.debt);
    }
    const left = (total: bigint, used: bigint | undefined) => (used && used < total ? total - used : used ? ZERO : total);
    return {
      supplied: new Map(account.reserves.map((reserve) => [reserve.reserveId, left(reserve.supplied, held.supplied.get(reserve.reserveId))])),
      debt: new Map(account.reserves.map((reserve) => [reserve.reserveId, left(reserve.debt, held.debt.get(reserve.reserveId))])),
    };
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  async account(user: SessionUser): Promise<LendAccountView> {
    const network = user.activeNetwork;
    const base = { network, minBorrowHealth: LEND.minBorrowHealthBps / BPS_NUMBER };
    const market = await this.venue(network);
    if (!market) return { ...base, available: false, reason: "mainnet_only", reserves: [], held: [], supplied: [], borrowed: [], health: null, borrowRoomUsd: 0, weightedCollateralUsd: 0, debtUsd: 0 };
    const reserves = market.reserves.map((reserve) => ({
      reserveId: reserve.reserveId,
      asset: reserve.symbol,
      address: reserve.underlying,
      decimals: reserve.decimals,
      price: reserve.price.toString(),
      supplyApr: supplyApr(reserve),
      borrowApr: borrowApr(reserve),
      collateralFactor: reserve.collateralFactorBps / BPS_NUMBER,
      borrowable: reserve.borrowable && !reserve.paused && !reserve.frozen,
      liquidity: reserve.liquidity.toString(),
    }));
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet || user.isAnonymous) return { ...base, available: true, reason: null, reserves, held: [], supplied: [], borrowed: [], health: null, borrowRoomUsd: 0, weightedCollateralUsd: 0, debtUsd: 0 };
    const client = this.clients(network).client;
    const [account, balances] = await Promise.all([
      readAccount(client, market.spoke, wallet, market.reserves.length),
      Promise.all(market.reserves.map((reserve) => client.readContract({ address: reserve.underlying, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }))),
    ]);
    // What the wallet itself holds of each listed asset: what it could put in as collateral or repay with.
    const held = market.reserves
      .map((reserve, index) => ({ reserveId: reserve.reserveId, asset: reserve.symbol, amount: balances[index]!, decimals: reserve.decimals }))
      .filter((entry) => entry.amount > ZERO)
      .map((entry) => ({ ...entry, amount: entry.amount.toString() }));
    const free = await this.free(user.id, network, market, account);
    const supplied = market.reserves
      .filter((reserve) => (free.supplied.get(reserve.reserveId) ?? ZERO) > ZERO)
      .map((reserve) => {
        const amount = free.supplied.get(reserve.reserveId)!;
        return { reserveId: reserve.reserveId, asset: reserve.symbol, amount: amount.toString(), decimals: reserve.decimals, collateral: account.reserves[reserve.reserveId]!.usingAsCollateral, usd: usd(valueOf(amount, reserve.decimals, reserve.price)) };
      });
    const borrowed = market.reserves
      .filter((reserve) => (free.debt.get(reserve.reserveId) ?? ZERO) > ZERO)
      .map((reserve) => {
        const amount = free.debt.get(reserve.reserveId)!;
        return { reserveId: reserve.reserveId, asset: reserve.symbol, amount: amount.toString(), decimals: reserve.decimals, usd: usd(valueOf(amount, reserve.decimals, reserve.price)) };
      });
    const weightedTotal = (account.totalCollateralValue * account.avgCollateralFactor) / WAD;
    const room = (weightedTotal * BPS) / BigInt(LEND.minBorrowHealthBps) - account.totalDebtValue;
    return {
      ...base,
      available: true,
      reason: null,
      reserves,
      held,
      supplied,
      borrowed,
      health: hasNoDebt(account) ? null : Number(formatUnits(account.healthFactor, WAD_DECIMALS)),
      borrowRoomUsd: room > ZERO ? usd(room) : 0,
      weightedCollateralUsd: usd(weightedTotal),
      debtUsd: usd(account.totalDebtValue),
    };
  }

  /** Every place `asset` can earn here, from live reads, ranked among those that could give `amount` back now. */
  async options(user: SessionUser | undefined, asset: string, amount: string | null): Promise<YieldOptionsView> {
    const network: NetworkId = user?.activeNetwork ?? "mainnet";
    const symbol = asset.trim();
    const want = amount && /^\d+(\.\d+)?$/.test(amount) ? Number(amount) : null;
    const options: YieldOptionView[] = [];
    const market = await this.venue(network).catch(() => undefined);
    const reserve = market ? this.findReserve(market, symbol) : undefined;
    if (reserve && reserve !== "unknown") {
      const priceUsd = usd(reserve.price);
      const withdrawable = Number(formatUnits(reserve.liquidity, reserve.decimals)) * priceUsd;
      options.push({
        kind: "aave_v4",
        id: `aave:${reserve.reserveId}`,
        name: `Aave V4 · ${reserve.symbol}`,
        protocol: "Aave",
        curator: null,
        asset: reserve.symbol,
        rate: supplyApr(reserve),
        rateKind: "apy",
        withdrawableUsd: withdrawable,
        tvlUsd: Number(formatUnits(reserve.hubAdded, reserve.decimals)) * priceUsd,
        risk: "blue_chip",
        executable: true,
        note: null,
      });
    }
    if (user && symbol.toUpperCase() === "USDC") {
      const overview = await this.earn.overview(user).catch(() => undefined);
      for (const vault of overview?.vaults ?? []) {
        if (vault.liquidity === "stuck") continue;
        options.push({
          kind: "morpho_vault",
          id: vault.address,
          name: vault.name,
          protocol: vault.protocol,
          curator: vault.curator,
          asset: "USDC",
          rate: vault.apy,
          rateKind: "apy",
          withdrawableUsd: Number(vault.available),
          tvlUsd: Number(vault.totalDeposits),
          risk: /rwa/i.test(vault.name) ? "rwa_credit" : "curated",
          executable: true,
          note: vault.liquidity === "low" ? "low_liquidity" : null,
        });
      }
    }
    if (network === "mainnet") {
      const lps = await this.merkl(symbol);
      options.push(...lps);
    }
    for (const option of options) if (want !== null && option.executable && option.withdrawableUsd !== null && option.withdrawableUsd < want && !option.note) option.note = "small_for_amount";
    const rank = (option: YieldOptionView) => (option.executable ? (option.note ? RANK_NOTED : RANK_LIQUID) : RANK_SHOWN_ONLY);
    const ranked = options.sort((a, b) => rank(a) - rank(b) || b.rate - a.rate).slice(0, LEND.maxOptions);
    const best = ranked.find((option) => option.executable && !option.note)?.id ?? null;
    return { network, asset: symbol, amount, options: ranked, best };
  }

  private async merkl(symbol: string): Promise<YieldOptionView[]> {
    try {
      const response = await fetch(`${LEND.merklApi}?chainId=${this.clients("mainnet").network.chainId}&status=LIVE`, { signal: AbortSignal.timeout(MERKL_TIMEOUT_MS) });
      const items = (await response.json()) as { id?: string; name?: string; apr?: number; tvl?: number; type?: string; protocol?: { name?: string }; tokens?: { symbol?: string }[] }[];
      return items
        .filter((item) => item.type === "AERO" && (item.tokens ?? []).some((token) => token.symbol?.toLowerCase() === symbol.toLowerCase()))
        .map((item) => ({
          kind: "lp" as const,
          id: `merkl:${item.id ?? item.name}`,
          name: item.name ?? "LP",
          protocol: item.protocol?.name ?? "Aero",
          curator: null,
          asset: symbol,
          rate: (item.apr ?? 0) / RATE_PERCENT,
          rateKind: "apr" as const,
          withdrawableUsd: null,
          tvlUsd: item.tvl ?? null,
          risk: "advanced" as const,
          executable: false,
          note: "advanced" as const,
        }));
    } catch {
      return [];
    }
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: LendRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise({ action: "supply", asset: null, amount: null, collateralAsset: null, collateralAmount: null }, request);
    const [row] = await this.db
      .insert(intents)
      .values({ userId: user.id, threadId: origin.threadId ?? null, network: user.activeNetwork, kind: "lend", originSurface: origin.surface, state: "submitted", request: stored, expiresAt: later(INTENT_TTL_S) })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  async revise(user: SessionUser, intentId: string, patch: LendRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredRequest) {
    const network = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const view = await capabilityView(this.db, this.chains.available);
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const market = await this.venue(network).catch(() => undefined);
    const action = request.action;
    const found = market ? this.findReserve(market, request.asset) : undefined;
    const reserve = found && found !== "unknown" ? found : undefined;
    const collateralFound = market && request.collateralAsset ? this.findReserve(market, request.collateralAsset) : undefined;
    const collateral = collateralFound && collateralFound !== "unknown" ? collateralFound : undefined;

    let setUp = false;
    let usdcBalance = ZERO;
    let balance = ZERO;
    let collateralBalance = ZERO;
    let account: AaveAccount | undefined;
    let free: Free | undefined;
    if (clients && wallet && market) {
      const balanceOf = (token: Address) => clients.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
      const [code, usdc, own, coll, read] = await Promise.all([
        clients.client.getCode({ address: wallet }),
        balanceOf(clients.network.addresses.usdc),
        reserve ? balanceOf(reserve.underlying) : Promise.resolve(ZERO),
        collateral ? balanceOf(collateral.underlying) : Promise.resolve(ZERO),
        readAccount(clients.client, market.spoke, wallet, market.reserves.length),
      ]);
      setUp = isWalletSetUp(code);
      usdcBalance = usdc;
      balance = own;
      collateralBalance = coll;
      account = read;
      free = await this.free(user.id, network, market, read);
    }
    const all = request.amount?.trim().toLowerCase() === "all";
    const amount = !reserve || !request.amount ? ({ status: request.amount ? "invalid" : "missing" } as const) : all ? ({ status: "all" } as const) : parseDecimal(request.amount, reserve.decimals);
    const collateralAmount = collateral && request.collateralAmount ? parseDecimal(request.collateralAmount, collateral.decimals) : undefined;
    const supplied = reserve && free ? (free.supplied.get(reserve.reserveId) ?? ZERO) : ZERO;
    const debt = reserve && free ? (free.debt.get(reserve.reserveId) ?? ZERO) : ZERO;
    const value = amount.status === "ok" ? amount.baseUnits : amount.status === "all" ? (action === "repay" ? debt : supplied) : ZERO;

    // Health after, the Spoke's formula at oracle prices: Σ(collateral value × factor) ÷ debt value.
    let healthBefore: number | null = null;
    let healthAfterBps: number | null = null;
    if (account && reserve) {
      let weightedTotal = (account.totalCollateralValue * account.avgCollateralFactor) / WAD;
      let debtValue = account.totalDebtValue;
      healthBefore = hasNoDebt(account) ? null : Number(formatUnits(account.healthFactor, WAD_DECIMALS));
      const isCollateral = account.reserves[reserve.reserveId]!.usingAsCollateral;
      if (action === "borrow") {
        debtValue += valueOf(value, reserve.decimals, reserve.price);
        if (collateral && collateralAmount?.status === "ok") weightedTotal += weighted(collateral, collateralAmount.baseUnits);
      } else if (action === "repay") debtValue -= valueOf(value < debt ? value : debt, reserve.decimals, reserve.price);
      else if (action === "withdraw" && isCollateral) weightedTotal -= weighted(reserve, value);
      else if (action === "supply" && isCollateral) weightedTotal += weighted(reserve, value);
      healthAfterBps = debtValue > ZERO ? Number(((weightedTotal > ZERO ? weightedTotal : ZERO) * BPS) / debtValue) : null;
    }

    const facts: LendFacts = {
      network,
      capability: { here: view.lend[network].state, other: view.lend[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: false,
      wallet: { registered: Boolean(wallet), setUp, usdc: usdcBalance },
      action,
      asset: !request.asset ? { status: "missing" } : !reserve ? { status: "unknown", name: request.asset } : { status: "found", symbol: reserve.symbol, decimals: reserve.decimals, borrowable: reserve.borrowable && !reserve.paused && !reserve.frozen, collateralOk: reserve.collateralFactorBps > 0 },
      amount,
      limit: { balance, supplied, debt },
      collateral: !request.collateralAsset
        ? { status: "none" }
        : collateral && collateral.collateralFactorBps > 0
          ? { status: "ok", symbol: collateral.symbol, decimals: collateral.decimals, balance: collateralBalance, amount: collateralAmount?.status === "ok" ? collateralAmount.baseUnits : ZERO }
          : { status: "not_collateral", symbol: collateral?.symbol ?? request.collateralAsset },
      health: { afterBps: healthAfterBps, minBps: LEND.minBorrowHealthBps, warnBps: LEND.warnHealthBps },
      gasFloat: GAS_FLOAT_USDC_BASE_UNITS,
    };
    return { wallet, clients, market, reserve, collateral, collateralAmount, account, amount, value, all, debt, healthBefore, healthAfterBps, evaluation: evaluateLend(facts) };
  }

  private calls(input: { draft: LendDraft; reserve: AaveReserve; collateral: AaveReserve | undefined; collateralOn: boolean; debt: bigint }): SpokeCall[] {
    const { draft, reserve, collateral } = input;
    const { spoke, from } = draft;
    const action = LEND_ACTIONS[draft.action]!;
    if (action === "supply") return [approveCall(reserve.underlying, spoke, draft.amount), supplyCall(spoke, reserve.reserveId, draft.amount, from)];
    if (action === "withdraw") return [withdrawCall(spoke, reserve.reserveId, draft.all ? maxUint256 : draft.amount, from)];
    if (action === "borrow") {
      const calls: SpokeCall[] = [];
      if (collateral && draft.collateralAmount > ZERO) {
        calls.push(approveCall(collateral.underlying, spoke, draft.collateralAmount), supplyCall(spoke, collateral.reserveId, draft.collateralAmount, from));
        if (!input.collateralOn) calls.push(collateralCall(spoke, collateral.reserveId, true, from));
      }
      calls.push(borrowCall(spoke, reserve.reserveId, draft.amount, from));
      return calls;
    }
    // Repay: everything owed (interest to the block included) takes "max" with a little allowance headroom.
    if (draft.all) {
      const allowance = input.debt + (input.debt * BigInt(LEND.repayBufferBps)) / BPS;
      return [approveCall(reserve.underlying, spoke, allowance), repayCall(spoke, reserve.reserveId, maxUint256, from), approveCall(reserve.underlying, spoke, ZERO)];
    }
    return [approveCall(reserve.underlying, spoke, draft.amount), repayCall(spoke, reserve.reserveId, draft.amount, from)];
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const fresh = await this.evaluate(user, intent, request);
    const { wallet, clients, market, reserve, collateral, collateralAmount, account, value, all, healthBefore, healthAfterBps, evaluation } = fresh;
    let draft: LendDraft | null = null;
    let view: LendDraftView | null = null;
    if (wallet && clients && market && reserve && value > ZERO) {
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const fee = ((LEND.gasEstimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      const withCollateral = request.action === "borrow" && collateral && collateralAmount?.status === "ok";
      draft = {
        chainId: clients.network.chainId,
        from: wallet,
        spoke: market.spoke,
        action: LEND_ACTIONS.indexOf(request.action),
        reserveId: reserve.reserveId,
        amount: value,
        all,
        collateralReserveId: withCollateral ? collateral!.reserveId : 0,
        collateralAmount: withCollateral ? collateralAmount.baseUnits : ZERO,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      view = {
        action: request.action,
        asset: reserve.symbol,
        decimals: reserve.decimals,
        amount: value.toString(),
        all,
        collateral: withCollateral ? { asset: collateral!.symbol, amount: collateralAmount.baseUnits.toString(), decimals: collateral!.decimals } : null,
        healthBefore,
        healthAfter: healthAfterBps === null ? null : healthAfterBps / BPS_NUMBER,
        liquidation: account ? liquidationOf(market, account, request.action, reserve, withCollateral ? collateral! : undefined, healthAfterBps) : null,
        rate: request.action === "borrow" || request.action === "repay" ? borrowApr(reserve) : supplyApr(reserve),
        networkFee: feeInUsdc(fee).toString(),
        quotedAt: new Date().toISOString(),
      };
    }
    const payload: DraftPayload = { draft: draft ? storeLendDraft(draft) : null, view };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = draft || evaluation.blocking ? restingState(evaluation) : "input_required";
    await this.db.transaction(async (tx) => {
      await tx.update(intentDrafts).set({ voidedAt: new Date(), voidReason: "superseded" }).where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? lendDraftHash(draft) : null,
        policyReport: report as unknown as Record<string, unknown>,
        route: draft && !evaluation.blocking ? "wallet_signature" : null,
        createdBy,
      });
      await tx.update(intents).set({ state, currentDraftVersion: version }).where(eq(intents.id, intent.id));
    });
    return this.view(user.id, intent.id);
  }

  private async ownIntent(userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await this.db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "lend")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such order");
    return intent;
  }

  private async currentDraft(intent: IntentRow): Promise<DraftRow | undefined> {
    const [row] = await this.db.select().from(intentDrafts).where(and(eq(intentDrafts.intentId, intent.id), eq(intentDrafts.version, intent.currentDraftVersion)));
    return row;
  }

  private async latestAttempt(intentId: string): Promise<AttemptRow | undefined> {
    const [row] = await this.db.select().from(txAttempts).where(eq(txAttempts.intentId, intentId)).orderBy(desc(txAttempts.attemptNo)).limit(1);
    return row;
  }

  async get(userId: string, intentId: string): Promise<LendIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<LendIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const explorer = this.chains.get(intent.network)?.network.viemChain.blockExplorers?.default.url;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      version: intent.currentDraftVersion,
      request: intent.request as StoredRequest,
      draft: payload.view ?? null,
      results: report.results,
      blocking: report.blocking,
      tx: attempt?.txHash && explorer ? { hash: attempt.txHash, explorerUrl: `${explorer}/tx/${attempt.txHash}` } : null,
      createdAt: intent.createdAt.toISOString(),
      completedAt: intent.completedAt?.toISOString() ?? null,
      expiresAt: intent.expiresAt.toISOString(),
    };
  }

  async cancel(userId: string, intentId: string) {
    const intent = await this.ownIntent(userId, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    await this.db.update(intents).set({ state: "canceled" }).where(eq(intents.id, intentId));
    await this.db.update(approvals).set({ status: "rejected" }).where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
    return this.view(userId, intentId);
  }

  // ── Approving ───────────────────────────────────────────────────────────────────────────────────────────────

  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice" }): Promise<LendApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return this.redraft(user, intentId);
    const draft = loadLendDraft(stored);
    if (lendDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);
    // Fresh facts: the same version must still pass (health, balances) or the person sees the new numbers.
    const fresh = await this.evaluate(user, before, before.request as StoredRequest);
    if (fresh.evaluation.blocking || !fresh.reserve || !fresh.account) return this.redraft(user, intentId);
    const { network, client } = this.clients(before.network);
    const calls = this.calls({
      draft,
      reserve: fresh.reserve,
      collateral: fresh.collateral,
      collateralOn: fresh.collateral ? fresh.account.reserves[fresh.collateral.reserveId]!.usingAsCollateral : false,
      debt: fresh.debt,
    });
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    try {
      await client.call({ account: draft.from, to: draft.from, data });
    } catch (error) {
      this.log.warn({ err: error, intentId }, "lend batch simulation reverted");
      throw problem(HTTP.badGateway, "simulation_failed");
    }
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch(() => LEND.gasEstimate),
    ]);
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
    const transaction: UnsignedTransaction = { type: "eip1559", chainId: network.chainId, nonce, to: draft.from, data, value: "0", gas: gas.toString(), maxFeePerGas: price.maxFeePerGas.toString(), maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString() };
    const outcome = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return { kind: "final" as const };
      await tx.update(approvals).set({ status: "rejected" }).where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
      const id = newId();
      await tx.insert(approvals).values({
        id,
        intentId,
        draftVersion: intent.currentDraftVersion,
        draftHash: current.draftHash!,
        userId: user.id,
        network: intent.network,
        route: "wallet_signature",
        unsignedTransaction: transaction as unknown as Record<string, unknown>,
        signerAddress: draft.from,
        status: "pending_signature",
        decidedViaSurface: input.surface,
        expiresAt: later(APPROVAL_TTL_S),
      });
      return { kind: "sign" as const, approvalId: id };
    });
    if (outcome.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    return { status: "sign", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, transaction };
  }

  private async redraft(user: SessionUser, intentId: string): Promise<LendApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx.select().from(intents).where(and(eq(intents.id, intentId), eq(intents.userId, userId))).for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such order");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<LendApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadLendDraft(stored);
    const context = this.clients(before.network);
    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
      if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
      const unsigned = approval.unsignedTransaction as unknown as UnsignedTransaction;
      const parsed = parseTransaction(input.signedTransaction);
      const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
      const ok =
        signer?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.chainId === draft.chainId &&
        parsed.to?.toLowerCase() === draft.from.toLowerCase() &&
        parsed.data?.toLowerCase() === unsigned.data.toLowerCase() &&
        (parsed.value ?? ZERO) === ZERO &&
        parsed.nonce === unsigned.nonce &&
        (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
      if (!ok) {
        this.log.warn({ intentId }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      const [attempt] = await tx
        .insert(txAttempts)
        .values({ userId: user.id, intentId, network: intent.network, chainId: context.network.chainId, attemptNo: await nextAttemptNo(tx, intentId), kind: "lend_wallet", provider: "user_wallet", idempotencyKey: randomUUID(), fromAddress: draft.from, toAddress: draft.from, nonce: unsigned.nonce, txHash: keccak256(input.signedTransaction), status: "prepared" })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "broadcast" as const, attemptId: attempt!.id };
    });
    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    try {
      await context.client.sendRawTransaction({ serializedTransaction: input.signedTransaction });
      await this.db.update(txAttempts).set({ status: "submitted" }).where(eq(txAttempts.id, prepared.attemptId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (refusedBeforeSending(message)) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, ERROR_MAX));
      else await this.db.update(txAttempts).set({ status: "submitted", errorCode: "broadcast_unclear" }).where(eq(txAttempts.id, prepared.attemptId));
    }
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  // ── Tracking ────────────────────────────────────────────────────────────────────────────────────────────────

  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      if (await this.track(intentId).catch(() => false)) return;
    }
  }

  async track(intentId: string): Promise<boolean> {
    if (this.tracking.has(intentId)) return false;
    this.tracking.add(intentId);
    try {
      const [intent] = await this.db.select().from(intents).where(eq(intents.id, intentId));
      if (!intent || (intent.state !== "executing" && intent.state !== "unknown_outcome")) return true;
      const attempt = await this.latestAttempt(intentId);
      if (!attempt?.txHash) return false;
      const receipt = await this.clients(intent.network).client.getTransactionReceipt({ hash: attempt.txHash as Hex }).catch(() => undefined);
      if (!receipt) {
        if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
          await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
        }
        return false;
      }
      await this.settle(intent, attempt, receipt);
      return true;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  /** Done only when the Spoke's own events in the receipt match the version. */
  private async settle(intent: IntentRow, attempt: AttemptRow, receipt: TransactionReceipt) {
    const stored = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined)?.draft;
    if (!stored) return;
    const draft = loadLendDraft(stored);
    const moves = spokeMoves(receipt.logs, draft.spoke, draft.from);
    const moved = (map: Map<number, bigint>) => map.get(draft.reserveId) ?? ZERO;
    const action = LEND_ACTIONS[draft.action]!;
    const witnessed =
      receipt.status === "success" &&
      (action === "supply"
        ? moved(moves.supplied) === draft.amount
        : action === "borrow"
          ? moved(moves.borrowed) === draft.amount && (draft.collateralAmount === ZERO || (moves.supplied.get(draft.collateralReserveId) ?? ZERO) === draft.collateralAmount)
          : action === "withdraw"
            ? draft.all
              ? moved(moves.withdrawn) > ZERO
              : moved(moves.withdrawn) + SHARE_ROUNDING >= draft.amount
            : draft.all
              ? moved(moves.repaid) >= draft.amount
              : moved(moves.repaid) === draft.amount);
    if (receipt.status === "success" && !witnessed) this.log.error({ intentId: intent.id, tx: receipt.transactionHash }, "security.receipt_mismatch");
    if (!witnessed) {
      await this.settleFailed(intent.id, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null);
      return;
    }
    await this.db.transaction(async (tx) => {
      const [done] = await tx
        .update(intents)
        .set({ state: "completed", completedAt: new Date() })
        .where(and(eq(intents.id, intent.id), inArray(intents.state, ["executing", "unknown_outcome"])))
        .returning({ id: intents.id });
      if (!done) return;
      await tx.update(txAttempts).set({ status: "confirmed", receipt: jsonSafe({ transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber }) }).where(eq(txAttempts.id, attempt.id));
    });
  }

  private async settleFailed(intentId: string, attemptId: string, how: "not_sent" | "reverted" | "mismatch", error: string | null) {
    await this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(intents)
        .set({ state: "failed", completedAt: new Date() })
        .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome", "approved"])))
        .returning({ id: intents.id });
      if (!moved) return;
      await tx.update(txAttempts).set({ status: how === "not_sent" ? "not_sent" : "reverted", errorCode: how === "mismatch" ? "receipt_mismatch" : error }).where(eq(txAttempts.id, attemptId));
    });
  }

  startSweeper(intervalMs: number) {
    const run = async () => {
      const open = await this.db.select({ id: intents.id }).from(intents).where(and(eq(intents.kind, "lend"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "lend sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "lend sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

function parseDecimal(text: string, decimals: number): { status: "ok"; baseUnits: bigint } | { status: "invalid" } {
  const clean = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return { status: "invalid" };
  try {
    return { status: "ok", baseUnits: parseUnits(clean, decimals) };
  } catch {
    return { status: "invalid" };
  }
}

function normalise(base: StoredRequest, patch: LendRequest): StoredRequest {
  const pick = <K extends keyof StoredRequest>(key: K): StoredRequest[K] => (patch[key] !== undefined ? (patch[key] as StoredRequest[K]) : base[key]);
  const text = (value: string | null) => (typeof value === "string" ? value.trim() || null : null);
  return {
    action: pick("action") ?? "supply",
    asset: text(pick("asset")),
    amount: text(pick("amount")),
    collateralAsset: text(pick("collateralAsset")),
    collateralAmount: text(pick("collateralAmount")),
  };
}

function outcomeOf(state: IntentState, attempt: AttemptRow | undefined) {
  switch (state) {
    case "completed":
      return "sent" as const;
    case "failed":
      return attempt?.status === "reverted" ? ("reverted" as const) : ("not_sent" as const);
    case "unknown_outcome":
      return "checking" as const;
    case "canceled":
      return "canceled" as const;
    case "expired":
      return "expired" as const;
    default:
      return null;
  }
}

