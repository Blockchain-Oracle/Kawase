// Earning on idle USDC (Stage 6c; MASTER-PLAN "Earn vaults ... deposit and withdraw, positions"), built like swaps.
//
// Overview: the USDC vaults App Kit lists on the network (yield, 30-day yield, how much can be paid out now, curator,
// Circle's monitoring, warnings) and what the person holds in each, read from the vault itself. Drafting: the vault
// named, or (inferred, never asked) the highest-yield active vault for a deposit and the person's largest position
// for a withdrawal; the vault's own preview sets the floor (shares for a deposit, USDC for a withdrawal) and the
// ceiling (shares a withdrawal may burn), all hashed. Approving: App Kit builds approve + its adapter's `execute`,
// Kawase checks the calls against the version (`checkEarnCalls`), and the wallet sends them to itself as one
// transaction (one Face ID). Tracking: done only when the receipt's transfers match the version.
//
// Auto-save (Stage 8b) moves through here too: `runSave` drafts the move the same way, and Kawase's ops wallet sends
// it under the person's save grants (only between the wallet and its own position); the same witness settles it.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  getAddress,
  keccak256,
  parseTransaction,
  parseUnits,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import {
  APPROVAL_TTL_S,
  EARN_BATCH_GAS_ESTIMATE,
  EARN_FLOOR_BPS,
  EARN_SHARES_CEILING_BPS,
  GAS_ESTIMATE_HEADROOM_PERCENT,
  GAS_FLOAT_USDC_BASE_UNITS,
  INTENT_TTL_S,
  MAX_FEE_DRAFT_MULTIPLIER,
  MS_PER_SECOND,
  SEND_UNKNOWN_AFTER_S,
} from "@kawase/config";
import type {
  EarnApproveResponse,
  EarnDraftView,
  EarnIntent,
  EarnPositionView,
  EarnRequest,
  EarnVaultView,
  UnsignedTransaction,
} from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import { checkEarnCalls, type EarnVault, type SwapCall } from "@kawase/integrations-app-kit";
import { buildEarnLeaves, encodeRedeemLeaves, encodeRedeemSave, encodeSelfBatch, isWalletSetUp, randomSalt, readGrantNonce, type SaveGrants } from "@kawase/integrations-delegation";
import { DRAFTABLE_STATES, earnDraftHash, loadEarnDraft, storeEarnDraft, type EarnDraft, type IntentState, type StoredEarnDraft } from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import { evaluateEarn, type EarnEvaluation, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { pausedAll } from "../safety/settings";
import { intentExists, jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import { parseRequestAmount } from "../send/facts";
import { OpsAttempts } from "../intents/ops-attempts";
import type { OpsExecutor } from "../send/ops";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { chainNow, markLeafRequest, offerLeaves, storeLeafRequest, takeSignedLeaves, type LeafBudget, type LeafResponse } from "../budget/leaf";
import type { EarnEngine } from "./engine";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

type StoredEarnRequest = { action: "deposit" | "withdraw"; vault: string | null; amount: string | null };
type DraftPayload = { draft: StoredEarnDraft | null; view: EarnDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };

const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const BPS = 10_000n;
const TRACK_POLL_MS = 2_000;
const TRACK_POLL_ATTEMPTS = 45;
const ERROR_MAX = 140;
const USDC_DECIMALS = decimalsOf("USDC");
const YIELD_DIGITS = 6;
const VAULTS_FRESH_MS = 60_000;
const VAULTS_STALE_MS = 600_000;
const VAULT_FETCH_ATTEMPTS = 2;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, USDC_DECIMALS);
  return rescale(scaled, USDC_DECIMALS, USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

const vaultView = (vault: EarnVault): EarnVaultView => ({ ...vault, address: vault.address });

function restingState(evaluation: EarnEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

export class EarnService {
  private readonly tracking = new Set<string>();
  private readonly vaultCache = new Map<NetworkId, { at: number; vaults: EarnVault[] }>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: EarnEngine,
    private readonly log: Logger,
    private readonly ops?: OpsExecutor | undefined,
  ) {
    this.opsAttempts = ops ? new OpsAttempts(db, chains, ops, log, (intentId, attemptId, error) => this.settleFailed(intentId, attemptId, "not_sent", error)) : undefined;
  }

  private readonly opsAttempts: OpsAttempts | undefined;

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  /**
   * The vaults App Kit lists, kept for a minute (they change rarely, and Auto-save reads them on every check and
   * view); one retry, and when Circle is briefly unreachable the last good list (up to ten minutes old) rather than
   * "no vaults".
   */
  private async vaults(network: NetworkContext): Promise<EarnVault[]> {
    const cached = this.vaultCache.get(network.id);
    if (cached && Date.now() - cached.at < VAULTS_FRESH_MS) return cached.vaults;
    for (let attempt = 0; attempt < VAULT_FETCH_ATTEMPTS; attempt++) {
      try {
        const vaults = await this.engine.vaults(network);
        this.vaultCache.set(network.id, { at: Date.now(), vaults });
        return vaults;
      } catch (error) {
        this.log.warn({ err: error, attempt }, "earn vaults failed");
      }
    }
    return cached && Date.now() - cached.at < VAULTS_STALE_MS ? cached.vaults : [];
  }

  /** Every USDC vault here and what this wallet holds in each (only non-empty positions are returned). */
  private async holdings(network: NetworkContext, client: NetworkClients["client"], wallet: Address | undefined) {
    const vaults = await this.vaults(network);
    const positions = wallet
      ? await Promise.all(vaults.map(async (vault) => ({ vault, ...(await this.engine.position(client, vault.address, wallet).catch(() => ({ shares: ZERO, assets: ZERO }))) })))
      : [];
    return { vaults, positions: positions.filter((entry) => entry.shares > ZERO) };
  }

  /** The vaults on a network and the non-empty positions a wallet holds (for Auto-save's draft, view and runs). */
  async holdingsOn(networkId: NetworkId, wallet: Address | undefined) {
    const { network, client } = this.clients(networkId);
    return this.holdings(network, client, wallet);
  }

  async overview(user: SessionUser): Promise<{ vaults: EarnVaultView[]; positions: EarnPositionView[] }> {
    const { network, client } = this.clients(user.activeNetwork);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const { vaults, positions } = await this.holdings(network, client, wallet);
    return {
      vaults: vaults.map(vaultView),
      positions: positions.map((entry) => ({ vault: entry.vault.address, name: entry.vault.name, apy: entry.vault.apy, assets: entry.assets.toString(), shares: entry.shares.toString() })),
    };
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: EarnRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise({ action: "deposit", vault: null, amount: null }, request);
    const [row] = await this.db
      .insert(intents)
      .values({
        userId: user.id,
        threadId: origin.threadId ?? null,
        network: user.activeNetwork,
        kind: "earn",
        originSurface: origin.surface,
        state: "submitted",
        request: stored,
        expiresAt: later(INTENT_TTL_S),
      })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  async revise(user: SessionUser, intentId: string, patch: EarnRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredEarnRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredEarnRequest) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.clients(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const view = await capabilityView(this.db, this.chains.available);
    const amount = parseRequestAmount(request.amount, "USDC");

    let usdc = ZERO;
    let setUp = false;
    if (wallet) {
      const [balance, code] = await Promise.all([
        clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
        clients.client.getCode({ address: wallet }),
      ]);
      usdc = balance;
      setUp = isWalletSetUp(code);
    }
    const { vaults, positions } = await this.holdings(clients.network, clients.client, wallet);
    // Infer, don't ask: the named vault; else the best active one to deposit into, or the largest position to take from.
    const named = request.vault ? vaults.find((vault) => same(vault.address, request.vault!)) : undefined;
    const largest = [...positions].sort((a, b) => (b.assets > a.assets ? 1 : b.assets < a.assets ? -1 : 0))[0]?.vault;
    // Deposits go to the best liquid source (vaults come ranked by what they can pay out now, gaps.md G1), never a stuck one.
    const depositable = (entry: EarnVault) => entry.status === "active" && entry.liquidity !== "stuck";
    const vault = named ?? (request.action === "deposit" ? (vaults.find((entry) => depositable(entry) && entry.liquidity === "liquid") ?? vaults.find(depositable)) : largest);
    const position = vault ? positions.find((entry) => same(entry.vault.address, vault.address)) : undefined;
    const available = vault ? usdcUnits(vault.available) : ZERO;

    const evaluation = evaluateEarn({
      network,
      capability: { here: view.yield[network].state, other: view.yield[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: await pausedAll(this.db, user.id),
      wallet: { registered: Boolean(wallet), setUp, usdc },
      action: request.action,
      vault: vault
        ? { status: "found", active: vault.status !== "paused" && vault.status !== "deprecated", lowLiquidity: vault.liquidity !== "liquid", stuck: vault.liquidity === "stuck", warnings: vault.warnings, available, position: position?.assets ?? ZERO }
        : { status: "missing" },
      amount,
      thresholds: { gasFloat: GAS_FLOAT_USDC_BASE_UNITS },
    });
    return { wallet, vault, position, amount, evaluation, clients };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredEarnRequest, createdBy: "user" | "agent" | "system") {
    const { wallet, vault, position, amount, evaluation, clients } = await this.evaluate(user, intent, request);
    let draft: EarnDraft | null = null;
    let view: EarnDraftView | null = null;
    if (wallet && vault && amount.status === "ok" && amount.baseUnits > ZERO) {
      const preview = await this.engine.preview(clients.client, vault.address, amount.baseUnits).catch(() => undefined);
      if (preview) {
        const deposit = request.action === "deposit";
        const held = position?.shares ?? ZERO;
        const ceiling = (preview.sharesOut * EARN_SHARES_CEILING_BPS) / BPS;
        const { maxFeePerGas } = await walletGasPrice(clients.client);
        const fee = ((EARN_BATCH_GAS_ESTIMATE * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
        draft = {
          chainId: clients.network.chainId,
          from: wallet,
          vault: getAddress(vault.address),
          action: request.action,
          amount: amount.baseUnits,
          maxIn: deposit ? amount.baseUnits : ceiling < held ? ceiling : held,
          minOut: deposit ? (preview.sharesIn * EARN_FLOOR_BPS) / BPS : (amount.baseUnits * EARN_FLOOR_BPS) / BPS,
          maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
        };
        const worth = position?.assets ?? ZERO;
        const after = deposit ? worth + amount.baseUnits : worth > amount.baseUnits ? worth - amount.baseUnits : ZERO;
        view = {
          action: request.action,
          vault: vaultView(vault),
          amount: amount.baseUnits.toString(),
          minReceived: deposit ? amount.baseUnits.toString() : draft.minOut.toString(),
          positionAfter: after.toString(),
          yearlyEarnings: parseUnits((Number(formatUnits(after, USDC_DECIMALS)) * vault.apy).toFixed(YIELD_DIGITS), USDC_DECIMALS).toString(),
          networkFee: feeInUsdc(fee).toString(),
          quotedAt: new Date().toISOString(),
        };
      }
    }

    const payload: DraftPayload = { draft: draft ? storeEarnDraft(draft) : null, view };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = draft || evaluation.blocking ? restingState(evaluation) : "input_required";
    await this.db.transaction(async (tx) => {
      await tx
        .update(intentDrafts)
        .set({ voidedAt: new Date(), voidReason: "superseded" })
        .where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? earnDraftHash(draft) : null,
        policyReport: report as unknown as Record<string, unknown>,
        route: draft && !evaluation.blocking ? "wallet_signature" : null,
        createdBy,
      });
      await tx.update(intents).set({ state, currentDraftVersion: version }).where(eq(intents.id, intent.id));
    });
    return this.view(user.id, intent.id);
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────

  private async ownIntent(userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await this.db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "earn")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such earn action");
    return intent;
  }

  private async currentDraft(intent: IntentRow): Promise<DraftRow | undefined> {
    const [row] = await this.db
      .select()
      .from(intentDrafts)
      .where(and(eq(intentDrafts.intentId, intent.id), eq(intentDrafts.version, intent.currentDraftVersion)));
    return row;
  }

  private async latestAttempt(intentId: string): Promise<AttemptRow | undefined> {
    const [row] = await this.db.select().from(txAttempts).where(eq(txAttempts.intentId, intentId)).orderBy(desc(txAttempts.attemptNo)).limit(1);
    return row;
  }

  async get(userId: string, intentId: string): Promise<EarnIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<EarnIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const explorer = this.chains.get(intent.network)?.network.viemChain.blockExplorers?.default.url;
    const request = intent.request as StoredEarnRequest;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      version: intent.currentDraftVersion,
      request: { action: request.action, vault: request.vault, amount: request.amount },
      draft: payload.view ?? null,
      results: report.results,
      blocking: report.blocking,
      received: (attempt?.receipt as { received?: string } | null)?.received ?? null,
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
    await this.db
      .update(approvals)
      .set({ status: "rejected" })
      .where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
    return this.view(userId, intentId);
  }

  // ── Approving ───────────────────────────────────────────────────────────────────────────────────────────────

  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice"; deviceId?: string | undefined }): Promise<EarnApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };

    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return this.redraft(user, intentId);
    const draft = loadEarnDraft(stored);
    if (earnDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);
    const fresh = await this.evaluate(user, before, before.request as StoredEarnRequest);
    if (fresh.evaluation.blocking || !fresh.vault || !same(fresh.vault.address, draft.vault)) return this.redraft(user, intentId);

    const { network, client } = fresh.clients;
    const engineInput = { network, client, from: draft.from, vault: draft.vault, amount: formatUnits(draft.amount, USDC_DECIMALS) };
    let calls: SwapCall[];
    try {
      calls = draft.action === "deposit" ? await this.engine.deposit(engineInput) : await this.engine.withdraw(engineInput);
    } catch (error) {
      this.log.warn({ err: error, intentId }, "earn prepare failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }
    const check = checkEarnCalls(network, draft.action, calls, { from: draft.from, usdc: network.addresses.usdc, vault: draft.vault, maxIn: draft.maxIn, minOut: draft.minOut });
    if (!check.ok && check.reason === "below_minimum") return this.redraft(user, intentId);
    if (!check.ok) {
      this.log.error({ intentId, reason: check.reason }, "security.earn_calls_refused");
      throw problem(HTTP.badGateway, "quote_unavailable", "the vault route returned calls Kawase does not accept");
    }

    // Lower-case, as a parsed signed transaction reads it back.
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        this.log.warn({ err: error, intentId }, "earn gas estimate failed");
        return EARN_BATCH_GAS_ESTIMATE;
      }),
    ]);
    const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
    if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
    const transaction: UnsignedTransaction = {
      type: "eip1559",
      chainId: draft.chainId,
      nonce,
      to: draft.from,
      data,
      value: "0",
      gas: gas.toString(),
      maxFeePerGas: price.maxFeePerGas.toString(),
      maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString(),
    };

    const outcome = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return { kind: "final" as const };
      await tx
        .update(approvals)
        .set({ status: "rejected" })
        .where(and(eq(approvals.intentId, intentId), eq(approvals.status, "pending_signature")));
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
        deviceId: input.deviceId ?? null,
        status: "pending_signature",
        decidedViaSurface: input.surface,
        expiresAt: later(APPROVAL_TTL_S),
      });
      return { kind: "sign" as const, approvalId: id };
    });
    if (outcome.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    return { status: "sign", intent: await this.view(user.id, intentId), approvalId: outcome.approvalId, transaction };
  }

  private async redraft(user: SessionUser, intentId: string): Promise<EarnApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredEarnRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
      .for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such earn action");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<EarnApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadEarnDraft(stored);
    const context = this.clients(before.network);

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion)
        throw problem(HTTP.conflict, "intent_stale");
      if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
      const unsigned = approval.unsignedTransaction as unknown as UnsignedTransaction;
      const parsed = parseTransaction(input.signedTransaction);
      const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
      const checks = {
        signer: signer?.toLowerCase() === draft.from.toLowerCase(),
        chain: parsed.chainId === draft.chainId,
        to: parsed.to?.toLowerCase() === draft.from.toLowerCase(),
        data: parsed.data?.toLowerCase() === unsigned.data.toLowerCase(),
        value: (parsed.value ?? ZERO) === ZERO,
        nonce: parsed.nonce === unsigned.nonce,
        fee: (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee,
      };
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      if (failed.length > 0) {
        this.log.warn({ intentId, approvalId: approval.id, failed }, "security.draft_mismatch");
        await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
        return { kind: "mismatch" as const };
      }
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: context.network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: `earn_${draft.action}`,
          provider: "user_wallet",
          idempotencyKey: randomUUID(),
          fromAddress: draft.from,
          toAddress: draft.from,
          nonce: unsigned.nonce,
          txHash: keccak256(input.signedTransaction),
          status: "prepared",
        })
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
      const refused = refusedBeforeSending(message);
      this.log.warn({ intentId, refused, message: message.slice(0, ERROR_MAX) }, "earn broadcast failed");
      if (refused) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, ERROR_MAX));
      else await this.db.update(txAttempts).set({ status: "submitted", errorCode: "broadcast_unclear" }).where(eq(txAttempts.id, prepared.attemptId));
    }
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  // ── Inside the budget (D38): one-shot leaves, no Face ID ────────────────────────────────────────────────────

  /**
   * The same approval as `approve`, inside the person's budget: the phone signs one-shot leaves for the vault's own
   * ERC-4626 call, pinned exactly with the wallet as receiver (and owner), plus the share and USDC balance changes the
   * version promises; Kawase's ops wallet redeems them. The vault itself is the budget's venue. Outside the budget it
   * says why and offers nothing: the phone takes the ordinary path.
   */
  async approveLeaf(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice" }, budget: LeafBudget): Promise<LeafResponse<EarnIntent>> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };
    if (!this.opsAttempts) throw problem(HTTP.serviceUnavailable, "network_unavailable", "silent vault moves are not available here");
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!current?.draftHash || !stored) return this.redraft(user, intentId) as Promise<LeafResponse<EarnIntent>>;
    const draft = loadEarnDraft(stored);
    if (earnDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId) as Promise<LeafResponse<EarnIntent>>;
    const fresh = await this.evaluate(user, before, before.request as StoredEarnRequest);
    if (fresh.evaluation.blocking || !fresh.vault || !same(fresh.vault.address, draft.vault)) return this.redraft(user, intentId) as Promise<LeafResponse<EarnIntent>>;

    const { network, client, ops } = fresh.clients;
    // USDC in or out of the person's own vault position: its dollar amount is the amount itself.
    const line = { category: "earn" as const, venue: draft.vault.toLowerCase(), amountUsd: draft.amount };
    const fits = await budget.allows(this.db, user.id, before.network, line);
    if (!fits.ok) return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: fits.reason };

    const [nonce, now] = await Promise.all([readGrantNonce(client, network, draft.from), chainNow(client)]);
    const leaves = buildEarnLeaves({
      network,
      wallet: draft.from,
      ops: ops.address,
      action: draft.action,
      vault: draft.vault,
      asset: network.addresses.usdc,
      amount: draft.amount,
      minOut: draft.minOut,
      maxSharesIn: draft.action === "withdraw" ? draft.maxIn : undefined,
      nonce,
      now,
      salts: [randomSalt(), randomSalt()],
    });
    const approvalId = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== input.version) return undefined;
      return storeLeafRequest(tx, { userId: user.id, intentId, network: intent.network, kind: "earn", draftVersion: intent.currentDraftVersion, draftHash: current.draftHash!, steps: leaves.steps, line, expiresAt: leaves.expiresAt });
    });
    if (!approvalId) return { status: "final", intent: await this.get(user.id, intentId) };
    return {
      status: "sign_leaf",
      intent: await this.view(user.id, intentId),
      approvalId,
      leaves: offerLeaves(network, leaves.steps),
      expiresAt: new Date(leaves.expiresAt * MS_PER_SECOND).toISOString(),
      budget: { category: "earn", venue: line.venue, amountUsd: line.amountUsd.toString(), leftThisWeek: fits.left.toString() },
    };
  }

  /** The phone signed the leaves: checked, reserved against the week, redeemed by ops, settled by the same witness. */
  async submitLeaf(user: SessionUser, intentId: string, input: { approvalId: string; signatures: Hex[] }, budget: LeafBudget): Promise<LeafResponse<EarnIntent>> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId) as Promise<LeafResponse<EarnIntent>>;
    const draft = loadEarnDraft(stored);
    const { network, ops } = this.clients(before.network);
    if (!this.opsAttempts) throw problem(HTTP.serviceUnavailable, "network_unavailable", "silent vault moves are not available here");

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const { request, steps } = await takeSignedLeaves(tx, network, { approvalId: input.approvalId, intentId, kind: "earn", draftVersion: intent.currentDraftVersion, draftHash: current.draftHash!, wallet: draft.from, signatures: input.signatures });
      const fits = await budget.reserve(tx, user.id, intent.network, { category: "earn", venue: request.venue, amountUsd: request.amountUsd, intentId });
      if (!fits.ok) {
        await markLeafRequest(tx, request.id, "rejected");
        return { kind: "outside" as const, reason: fits.reason };
      }
      const call = encodeRedeemLeaves(network, steps);
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: network.chainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: `earn_${draft.action}_leaf`,
          provider: "circle_dcw",
          idempotencyKey: randomUUID(),
          fromAddress: ops.address,
          toAddress: call.to,
          status: "prepared",
          receipt: { prepared: { to: call.to, data: call.data } },
        })
        .returning();
      await markLeafRequest(tx, request.id, "redeemed");
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "redeem" as const, attempt: attempt! };
    });
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (prepared.kind === "outside") return { status: "outside_budget", intent: await this.view(user.id, intentId), reason: prepared.reason };
    await this.opsAttempts.submit(intentId, prepared.attempt);
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  // ── Auto-save (Stage 8b) ────────────────────────────────────────────────────────────────────────────────────

  /**
   * One Auto-save move, sent by the ops wallet under the person's save grants: into the wallet's own position ("in":
   * approve exactly the amount, deposit it for the wallet) or back to the wallet ("out": withdraw to the wallet). It is
   * drafted with the vault's own preview like any earn move, recorded as an earn intent from the automation, and
   * settled by the same receipt witness.
   */
  async runSave(input: {
    userId: string;
    network: NetworkId;
    /** The run's own id for this move, fixed when the check was claimed: a retry resumes it, never repeats it. */
    intentId: string;
    grants: SaveGrants;
    vault: Address;
    direction: "in" | "out";
    amount: bigint;
  }): Promise<{ status: "executing"; intentId: string; resumed: boolean } | { status: "skipped"; reason: string }> {
    if (await intentExists(this.db, input.intentId)) return { status: "executing", intentId: input.intentId, resumed: true };
    // Nothing moves without the person while everything is paused (X30), whoever asks for the move.
    if (await pausedAll(this.db, input.userId)) return { status: "skipped", reason: "PAUSED_ALL" };
    if (!this.ops) return { status: "skipped", reason: "NOT_AVAILABLE_YET" };
    const { client, network, ops } = this.clients(input.network);
    const wallet = (await this.wallets.userWallet(input.userId))?.address as Address | undefined;
    if (!wallet) return { status: "skipped", reason: "WALLET_NOT_READY" };
    const deposit = input.direction === "in";
    const vault = (await this.vaults(network)).find((entry) => same(entry.address, input.vault));
    if (!vault || (deposit && (vault.status === "paused" || vault.status === "deprecated"))) return { status: "skipped", reason: "VAULT_UNAVAILABLE" };
    const [preview, position] = await Promise.all([
      this.engine.preview(client, vault.address, input.amount).catch(() => undefined),
      this.engine.position(client, vault.address, wallet).catch(() => ({ shares: ZERO, assets: ZERO })),
    ]);
    if (!preview) return { status: "skipped", reason: "QUOTE_UNAVAILABLE" };
    const ceiling = (preview.sharesOut * EARN_SHARES_CEILING_BPS) / BPS;
    const draft: EarnDraft = {
      chainId: network.chainId,
      from: wallet,
      vault: getAddress(vault.address),
      action: deposit ? "deposit" : "withdraw",
      amount: input.amount,
      maxIn: deposit ? input.amount : ceiling < position.shares ? ceiling : position.shares,
      minOut: deposit ? (preview.sharesIn * EARN_FLOOR_BPS) / BPS : (input.amount * EARN_FLOOR_BPS) / BPS,
      // The ops wallet pays the gas; the person pays nothing.
      maxFee: ZERO,
    };
    const after = deposit ? position.assets + input.amount : position.assets > input.amount ? position.assets - input.amount : ZERO;
    const view: EarnDraftView = {
      action: draft.action,
      vault: vaultView(vault),
      amount: input.amount.toString(),
      minReceived: deposit ? input.amount.toString() : draft.minOut.toString(),
      positionAfter: after.toString(),
      yearlyEarnings: parseUnits((Number(formatUnits(after, USDC_DECIMALS)) * vault.apy).toFixed(YIELD_DIGITS), USDC_DECIMALS).toString(),
      networkFee: "0",
      quotedAt: new Date().toISOString(),
    };
    const draftHash = earnDraftHash(draft);
    const call = encodeRedeemSave(network, input.grants, { direction: input.direction, amount: input.amount, wallet, usdc: network.addresses.usdc, vault: draft.vault });
    const request: StoredEarnRequest = { action: draft.action, vault: draft.vault, amount: formatUnits(input.amount, USDC_DECIMALS) };

    const prepared = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.network}`}, 0))`);
      if (await intentExists(tx, input.intentId)) return undefined;
      const [intent] = await tx
        .insert(intents)
        .values({ id: input.intentId, userId: input.userId, network: input.network, kind: "earn", originSurface: "automation", state: "executing", request, currentDraftVersion: 1, expiresAt: later(INTENT_TTL_S) })
        .returning({ id: intents.id });
      const intentId = intent!.id;
      await tx.insert(intentDrafts).values({
        intentId,
        version: 1,
        payload: { draft: storeEarnDraft(draft), view } as unknown as Record<string, unknown>,
        draftHash,
        policyReport: { results: [], blocking: null },
        route: "automation",
        createdBy: "system",
      });
      await tx.insert(approvals).values({
        intentId,
        draftVersion: 1,
        draftHash,
        userId: input.userId,
        network: input.network,
        route: "automation",
        signerAddress: wallet,
        status: "approved",
        decidedViaSurface: "automation",
        expiresAt: later(APPROVAL_TTL_S),
      });
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: input.userId,
          intentId,
          network: input.network,
          chainId: network.chainId,
          attemptNo: 1,
          kind: `earn_${draft.action}`,
          provider: "circle_dcw",
          idempotencyKey: randomUUID(),
          fromAddress: ops.address,
          toAddress: call.to,
          status: "prepared",
          receipt: { prepared: { to: call.to, data: call.data } },
        })
        .returning({ id: txAttempts.id });
      return { intentId, attemptId: attempt!.id };
    });
    if (!prepared) return { status: "executing", intentId: input.intentId, resumed: true };
    const attempt = await this.latestAttempt(prepared.intentId);
    if (attempt) await this.opsAttempts?.submit(prepared.intentId, attempt);
    void this.follow(prepared.intentId);
    return { status: "executing", intentId: prepared.intentId, resumed: false };
  }

  // ── Tracking ────────────────────────────────────────────────────────────────────────────────────────────────

  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      const settled = await this.track(intentId).catch((error: unknown) => {
        this.log.warn({ intentId, err: error }, "earn track failed");
        return false;
      });
      if (settled) return;
    }
  }

  async track(intentId: string): Promise<boolean> {
    if (this.tracking.has(intentId)) return false;
    this.tracking.add(intentId);
    try {
      const [intent] = await this.db.select().from(intents).where(eq(intents.id, intentId));
      if (!intent || (intent.state !== "executing" && intent.state !== "unknown_outcome")) return true;
      const latest = await this.latestAttempt(intentId);
      if (!latest) return false;
      const hash = latest.provider === "circle_dcw" ? await this.opsAttempts?.hash(intent.id, intent.network, latest) : (latest.txHash as Hex | null);
      if (!hash) return latest.provider === "circle_dcw" && (await this.latestAttempt(intentId))?.status === "not_sent";
      const attempt = { ...latest, txHash: hash };
      await this.db.update(txAttempts).set({ lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));
      const { client, network } = this.clients(intent.network);
      const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
      if (!receipt) {
        if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
          await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
          await this.db.update(txAttempts).set({ status: "unknown" }).where(eq(txAttempts.id, attempt.id));
        }
        return false;
      }
      const stored = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined)?.draft;
      if (!stored) return false;
      const draft = loadEarnDraft(stored);
      const moved = earnWitness(receipt, draft, network.addresses.usdc);
      const witnessed =
        receipt.status === "success" &&
        (draft.action === "deposit" ? moved.usdcOut === draft.amount && moved.sharesIn >= draft.minOut : moved.sharesOut <= draft.maxIn && moved.usdcIn >= draft.minOut);
      if (receipt.status === "success" && !witnessed) this.log.error({ intentId, tx: receipt.transactionHash }, "security.receipt_mismatch");
      if (!witnessed) {
        await this.settleFailed(intentId, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null, receipt);
        return true;
      }
      const received = draft.action === "deposit" ? draft.amount : moved.usdcIn;
      await this.db.transaction(async (tx) => {
        const [done] = await tx
          .update(intents)
          .set({ state: "completed", completedAt: new Date() })
          .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome"])))
          .returning({ id: intents.id });
        if (!done) return;
        await tx
          .update(txAttempts)
          .set({ status: "confirmed", receipt: { received: received.toString(), chain: jsonSafe(receiptSummary(receipt)) } })
          .where(eq(txAttempts.id, attempt.id));
      });
      return true;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  private async settleFailed(intentId: string, attemptId: string, how: "not_sent" | "reverted" | "mismatch", error: string | null, receipt?: TransactionReceipt) {
    await this.db.transaction(async (tx) => {
      const [moved] = await tx
        .update(intents)
        .set({ state: "failed", completedAt: new Date() })
        .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome", "approved"])))
        .returning({ id: intents.id });
      if (!moved) return;
      await tx
        .update(txAttempts)
        .set({
          status: how === "not_sent" ? "not_sent" : "reverted",
          errorCode: how === "mismatch" ? "receipt_mismatch" : error,
          ...(receipt ? { receipt: jsonSafe(receiptSummary(receipt)) } : {}),
        })
        .where(eq(txAttempts.id, attemptId));
    });
  }

  startSweeper(intervalMs: number) {
    const run = async () => {
      const open = await this.db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.kind, "earn"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "earn sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "earn sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

/** A decimal USDC string from App Kit ("1000000.0", sometimes with more than six places) → base units, truncated. */
export function usdcUnits(decimal: string): bigint {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return parseUnits(`${whole}.${fraction.slice(0, USDC_DECIMALS) || "0"}`, USDC_DECIMALS);
}

function normalise(base: StoredEarnRequest, patch: EarnRequest): StoredEarnRequest {
  const vault = patch.vault !== undefined ? patch.vault : base.vault;
  const amount = patch.amount !== undefined ? patch.amount : base.amount;
  return {
    action: patch.action ?? base.action,
    vault: vault && /^0x[0-9a-fA-F]{40}$/.test(vault) ? vault : null,
    amount: amount?.trim() || null,
  };
}

/** What the receipt's transfers say moved for the wallet: USDC out/in, the vault's shares in/out. */
function earnWitness(receipt: TransactionReceipt, draft: EarnDraft, usdc: Address) {
  const totals = { usdcOut: ZERO, usdcIn: ZERO, sharesIn: ZERO, sharesOut: ZERO };
  for (const log of receipt.logs) {
    const token = log.address.toLowerCase();
    const isUsdc = token === usdc.toLowerCase();
    const isShares = token === draft.vault.toLowerCase();
    if (!isUsdc && !isShares) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName !== "Transfer") continue;
      const out = same(event.args.from, draft.from);
      const into = same(event.args.to, draft.from);
      if (isUsdc && out) totals.usdcOut += event.args.value;
      if (isUsdc && into) totals.usdcIn += event.args.value;
      if (isShares && into) totals.sharesIn += event.args.value;
      if (isShares && out) totals.sharesOut += event.args.value;
    } catch {
      // Not an ERC-20 Transfer.
    }
  }
  return totals;
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
