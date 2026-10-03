// Bridges out of Arc (Stage 6b; ARCHITECTURE §8 `compare_bridge_routes`), built like swaps.
//
// Drafting: the destination chain and amount, the route's fee cap from App Kit, live quotes from the other routes
// that serve Arc, the policy, and an immutable version hashing what moves money (exactly `amount` burned on Arc for
// the person's own address on the destination's CCTP domain, at most `maxRouteFee` taken on the way). Approving:
// estimate again; a higher fee cap makes a new version. App Kit builds approve + burn, Kawase checks the calls, and
// the wallet sends them to itself as one transaction (one Face ID). Tracking: the burn's receipt must show exactly
// `amount` leaving the wallet; then Circle attests it and its forwarder mints on the destination, which Kawase
// follows through IRIS and checks on the destination chain itself (at least amount − maxRouteFee to the person).
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import {
  APPROVAL_TTL_S,
  BRIDGE_BATCH_GAS_ESTIMATE,
  BRIDGE_FEE_HEADROOM_PERCENT,
  BRIDGE_PROVIDER_LABEL,
  GAS_ESTIMATE_HEADROOM_PERCENT,
  GAS_FLOAT_USDC_BASE_UNITS,
  INTENT_TTL_S,
  MAX_FEE_DRAFT_MULTIPLIER,
  MS_PER_SECOND,
  SEND_UNKNOWN_AFTER_S,
} from "@kawase/config";
import type {
  BridgeApproveResponse,
  BridgeDestinationId,
  BridgeDestinationView,
  BridgeDraftView,
  BridgeIntent,
  BridgeRequest,
  BridgeStage,
  UnsignedTransaction,
} from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import { getChainIdentity } from "@kawase/identity";
import { checkBridgeCalls, forwardDelivered, type BridgeDestination, type SwapCall } from "@kawase/integrations-app-kit";
import { BRIDGE_GRANT_MAX_FEE, encodeRedeemMany, encodeSelfBatch, isWalletSetUp, type BridgeGrants } from "@kawase/integrations-delegation";
import {
  DRAFTABLE_STATES,
  bridgeDraftHash,
  loadBridgeDraft,
  storeBridgeDraft,
  type BridgeDraft,
  type IntentState,
  type StoredBridgeDraft,
} from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import { evaluateBridge, type BridgeEvaluation, type PolicyResult } from "@kawase/policy";

import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { pausedAll } from "../safety/settings";
import { intentExists, jsonSafe, nextAttemptNo, receiptSummary, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import { OpsAttempts } from "../intents/ops-attempts";
import type { OpsExecutor } from "../send/ops";
import { parseRequestAmount } from "../send/facts";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { compareRoutes } from "./compare";
import type { BridgeEngine } from "./engine";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;

type StoredBridgeRequest = { destination: BridgeDestinationId | null; amount: string | null };
type DraftPayload = { draft: StoredBridgeDraft | null; view: BridgeDraftView | null; destination: BridgeDestinationId | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };
/** What the attempt row keeps about the bridge's progress after the burn. */
type Progress = { burnConfirmed?: boolean; forward?: string | null; mintTxHash?: string | null; received?: string; error?: string | null };

const DESTINATION_IDS: readonly BridgeDestinationId[] = ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"];
const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
/** App Kit's bridge: an allowance, then the burn. */
const ALLOWANCE_AND_BURN = 2;
const TRACK_POLL_MS = 3_000;
const TRACK_POLL_ATTEMPTS = 120;
const ERROR_MAX = 140;
const USDC_DECIMALS = decimalsOf("USDC");

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, USDC_DECIMALS);
  return rescale(scaled, USDC_DECIMALS, USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

function restingState(evaluation: BridgeEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

export class BridgeService {
  private readonly tracking = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly engine: BridgeEngine,
    private readonly log: Logger,
    ops?: OpsExecutor | undefined,
  ) {
    this.opsAttempts = ops ? new OpsAttempts(db, chains, ops, log, (intentId, attemptId, error) => this.settleFailed(intentId, attemptId, "not_sent", error)) : undefined;
  }

  private readonly opsAttempts: OpsAttempts | undefined;

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  private destination(network: NetworkContext, id: BridgeDestinationId | null | undefined): BridgeDestination | undefined {
    return id ? this.engine.destinations(network).find((entry) => entry.id === id) : undefined;
  }

  /** Where USDC can go from this network, named as the identity registry names them. */
  destinations(network: NetworkId): BridgeDestinationView[] {
    const context = this.clients(network).network;
    return this.engine.destinations(context).map((entry) => ({ id: entry.id, chainId: entry.chainId, name: getChainIdentity(entry.chainId)?.name ?? entry.kitChain }));
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: BridgeRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise({}, request);
    const [row] = await this.db
      .insert(intents)
      .values({
        userId: user.id,
        threadId: origin.threadId ?? null,
        network: user.activeNetwork,
        kind: "bridge",
        originSurface: origin.surface,
        state: "submitted",
        request: stored,
        expiresAt: later(INTENT_TTL_S),
      })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  async revise(user: SessionUser, intentId: string, patch: BridgeRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredBridgeRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredBridgeRequest) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.chains.get(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const view = await capabilityView(this.db, this.chains.available);
    const amount = parseRequestAmount(request.amount, "USDC");
    const destination = clients ? this.destination(clients.network, request.destination) : undefined;

    let usdc = ZERO;
    let setUp = false;
    if (clients && wallet) {
      const [balance, code] = await Promise.all([
        clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
        clients.client.getCode({ address: wallet }),
      ]);
      usdc = balance;
      setUp = isWalletSetUp(code);
    }

    let route: { status: "ok"; maxRouteFee: bigint; quotedFee: bigint } | { status: "unavailable" } | { status: "not_requested" } = { status: "not_requested" };
    if (clients && wallet && destination && amount.status === "ok" && amount.baseUnits > ZERO) {
      const estimate = await this.engine
        .estimate({ network: clients.network, client: clients.client, from: wallet, destination, recipient: wallet, amount: formatUnits(amount.baseUnits, USDC_DECIMALS) })
        .catch((error: unknown) => {
          this.log.warn({ err: error, intentId: intent.id }, "bridge estimate failed");
          return undefined;
        });
      route = estimate
        ? { status: "ok", maxRouteFee: (estimate.maxFee * BRIDGE_FEE_HEADROOM_PERCENT) / PERCENT, quotedFee: estimate.maxFee }
        : { status: "unavailable" };
    }

    const evaluation = evaluateBridge({
      network,
      capability: { here: view.bridge[network].state, other: view.bridge[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: await pausedAll(this.db, user.id),
      wallet: { registered: Boolean(wallet), setUp, usdc },
      destination: destination?.id,
      amount,
      route,
      thresholds: { gasFloat: GAS_FLOAT_USDC_BASE_UNITS },
    });
    return { wallet, destination, amount, route, evaluation };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredBridgeRequest, createdBy: "user" | "agent" | "system") {
    const { wallet, destination, amount, route, evaluation } = await this.evaluate(user, intent, request);
    const clients = this.chains.get(intent.network);

    let draft: BridgeDraft | null = null;
    let view: BridgeDraftView | null = null;
    if (clients && wallet && destination && route.status === "ok" && amount.status === "ok") {
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const fee = ((BRIDGE_BATCH_GAS_ESTIMATE * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      draft = {
        chainId: clients.network.chainId,
        from: wallet,
        token: clients.network.addresses.usdc,
        amount: amount.baseUnits,
        destinationDomain: destination.domain,
        recipient: wallet,
        maxRouteFee: route.maxRouteFee,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const minReceived = amount.baseUnits > route.maxRouteFee ? amount.baseUnits - route.maxRouteFee : ZERO;
      const routes = await compareRoutes(
        { network: clients.network, from: wallet, recipient: wallet, amount: amount.baseUnits, destinationChainId: destination.chainId, destinationUsdc: destination.usdc },
        minReceived,
      ).catch(() => [{ provider: BRIDGE_PROVIDER_LABEL, received: minReceived, extraCost: ZERO, etaSeconds: null, status: "chosen" as const, reason: null }]);
      view = {
        destination: destination.id,
        chainId: destination.chainId,
        amount: amount.baseUnits.toString(),
        maxRouteFee: route.maxRouteFee.toString(),
        minReceived: minReceived.toString(),
        networkFee: feeInUsdc(fee).toString(),
        recipient: wallet,
        provider: BRIDGE_PROVIDER_LABEL,
        routes: routes.map((entry) => ({
          provider: entry.provider,
          status: entry.status,
          received: entry.received?.toString() ?? null,
          extraCost: entry.extraCost.toString(),
          etaSeconds: entry.etaSeconds,
          reason: entry.reason,
        })),
        quotedAt: new Date().toISOString(),
      };
    }

    const payload: DraftPayload = { draft: draft ? storeBridgeDraft(draft) : null, view, destination: destination?.id ?? null };
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
        draftHash: draft ? bridgeDraftHash(draft) : null,
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
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "bridge")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such bridge");
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

  async get(userId: string, intentId: string): Promise<BridgeIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<BridgeIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const explorer = this.chains.get(intent.network)?.network.viemChain.blockExplorers?.default.url;
    const request = intent.request as StoredBridgeRequest;
    const progress = (attempt?.receipt as Progress | null) ?? {};
    const destination = this.chains.get(intent.network) ? this.destination(this.clients(intent.network).network, payload.destination ?? request.destination) : undefined;
    const stage: BridgeStage | null =
      intent.state === "completed"
        ? "delivered"
        : intent.state === "executing" || intent.state === "unknown_outcome"
          ? !progress.burnConfirmed
            ? "burning"
            : progress.mintTxHash
              ? "minting"
              : "attesting"
          : null;
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      version: intent.currentDraftVersion,
      request: { destination: request.destination, amount: request.amount },
      draft: payload.view ?? null,
      results: report.results,
      blocking: report.blocking,
      stage,
      received: progress.received ?? null,
      tx: attempt?.txHash && explorer ? { hash: attempt.txHash, explorerUrl: `${explorer}/tx/${attempt.txHash}` } : null,
      mintTx: progress.mintTxHash && destination ? { hash: progress.mintTxHash, explorerUrl: destination.explorerTx.replace("{hash}", progress.mintTxHash) } : null,
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

  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice"; deviceId?: string | undefined }): Promise<BridgeApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };

    const current = await this.currentDraft(before);
    const payload = current?.payload as DraftPayload | undefined;
    if (!current?.draftHash || !payload?.draft) return this.redraft(user, intentId);
    const draft = loadBridgeDraft(payload.draft);
    if (bridgeDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);
    const fresh = await this.evaluate(user, before, before.request as StoredBridgeRequest);
    if (fresh.route.status === "unavailable") throw problem(HTTP.badGateway, "quote_unavailable");
    // The version stands while the route's fee, as quoted now, is still within the cap the person saw.
    if (fresh.evaluation.blocking || fresh.route.status !== "ok" || fresh.route.quotedFee > draft.maxRouteFee || !fresh.destination) return this.redraft(user, intentId);

    const { network, client } = this.clients(before.network);
    let calls: SwapCall[];
    try {
      calls = await this.engine.prepare({
        network,
        client,
        from: draft.from,
        destination: fresh.destination,
        recipient: draft.recipient,
        amount: formatUnits(draft.amount, USDC_DECIMALS),
      });
    } catch (error) {
      this.log.warn({ err: error, intentId }, "bridge prepare failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }
    const check = checkBridgeCalls(network, calls, { usdc: draft.token, amount: draft.amount, recipient: draft.recipient, domain: draft.destinationDomain, maxFee: draft.maxRouteFee });
    if (!check.ok && check.reason === "above_fee_cap") return this.redraft(user, intentId);
    if (!check.ok) {
      this.log.error({ intentId, reason: check.reason }, "security.bridge_calls_refused");
      throw problem(HTTP.badGateway, "quote_unavailable", "the bridge route returned calls Kawase does not accept");
    }

    // Lower-case, as a parsed signed transaction reads it back (App Kit's calldata can carry upper-case hex).
    const data = encodeSelfBatch(calls).toLowerCase() as Hex;
    const [nonce, price, estimate] = await Promise.all([
      client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
      walletGasPrice(client),
      client.estimateGas({ account: draft.from, to: draft.from, data }).catch((error: unknown) => {
        this.log.warn({ err: error, intentId }, "bridge gas estimate failed");
        return BRIDGE_BATCH_GAS_ESTIMATE;
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

  private async redraft(user: SessionUser, intentId: string): Promise<BridgeApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredBridgeRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId)))
      .for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such bridge");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction: Hex }): Promise<BridgeApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadBridgeDraft(stored);
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
      const matches = failed.length === 0;
      if (!matches) {
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
          kind: "bridge_wallet",
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
      this.log.warn({ intentId, refused, message: message.slice(0, ERROR_MAX) }, "bridge broadcast failed");
      if (refused) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, ERROR_MAX));
      else await this.db.update(txAttempts).set({ status: "submitted", errorCode: "broadcast_unclear" }).where(eq(txAttempts.id, prepared.attemptId));
    }
    void this.follow(intentId);
    return { status: "executing", intent: await this.view(user.id, intentId) };
  }

  // ── Bridge rules (Stage 8b) ─────────────────────────────────────────────────────────────────────────────────

  /**
   * One bridge a rule makes: USDC from Arc to the person's own address on the rule's chain, sent by the ops wallet
   * under the person's bridge grants (which pin that recipient, chain, token and hook, and bound the route's fee).
   * App Kit builds the calls; they are checked like any bridge (`checkBridgeCalls`, the fee within the quote and the
   * grant's bound); the intent is created under the run's own id, so a retry resumes; the burn and the forwarder's
   * mint are witnessed by the same tracking as a bridge the person signs.
   */
  async runBridge(input: {
    userId: string;
    network: NetworkId;
    intentId: string;
    grants: BridgeGrants;
    destination: BridgeDestinationId;
    amount: bigint;
  }): Promise<{ status: "executing"; intentId: string; resumed: boolean } | { status: "skipped"; reason: string; params?: Record<string, string> }> {
    if (await intentExists(this.db, input.intentId)) return { status: "executing", intentId: input.intentId, resumed: true };
    // Nothing moves without the person while everything is paused (X30), whoever asks for the move.
    if (await pausedAll(this.db, input.userId)) return { status: "skipped", reason: "PAUSED_ALL" };
    if (!this.opsAttempts) return { status: "skipped", reason: "NOT_AVAILABLE_YET" };
    const { client, network, ops } = this.clients(input.network);
    const wallet = (await this.wallets.userWallet(input.userId))?.address as Address | undefined;
    if (!wallet) return { status: "skipped", reason: "WALLET_NOT_READY" };
    const destination = this.destination(network, input.destination);
    if (!destination) return { status: "skipped", reason: "DESTINATION_MISSING" };
    const decimal = formatUnits(input.amount, USDC_DECIMALS);
    const estimate = await this.engine.estimate({ network, client, from: wallet, destination, recipient: wallet, amount: decimal }).catch(() => undefined);
    if (!estimate) return { status: "skipped", reason: "QUOTE_UNAVAILABLE" };
    const maxRouteFee = (estimate.maxFee * BRIDGE_FEE_HEADROOM_PERCENT) / PERCENT;
    if (maxRouteFee > BRIDGE_GRANT_MAX_FEE) return { status: "skipped", reason: "BRIDGE_FEE_HIGH", params: { fee: estimate.maxFee.toString(), asset: "USDC" } };
    if (maxRouteFee >= input.amount) return { status: "skipped", reason: "AMOUNT_BELOW_FEE", params: { fee: estimate.maxFee.toString(), asset: "USDC" } };
    const calls = await this.engine.prepare({ network, client, from: wallet, destination, recipient: wallet, amount: decimal }).catch(() => undefined);
    if (!calls) return { status: "skipped", reason: "QUOTE_UNAVAILABLE" };
    const check = checkBridgeCalls(network, calls, { usdc: network.addresses.usdc, amount: input.amount, recipient: wallet, domain: destination.domain, maxFee: maxRouteFee });
    if (!check.ok || calls.length !== ALLOWANCE_AND_BURN) {
      this.log.error({ intentId: input.intentId, reason: check.ok ? "calls" : check.reason }, "security.bridge_calls_refused");
      return { status: "skipped", reason: "QUOTE_UNAVAILABLE" };
    }
    const [allowance, burn] = calls as [SwapCall, SwapCall];
    const call = encodeRedeemMany(network, [
      { grant: input.grants.allowance, target: allowance.to, callData: allowance.data },
      { grant: input.grants.burn, target: burn.to, callData: burn.data },
    ]);
    const draft: BridgeDraft = {
      chainId: network.chainId,
      from: wallet,
      token: network.addresses.usdc,
      amount: input.amount,
      destinationDomain: destination.domain,
      recipient: wallet,
      maxRouteFee,
      // The ops wallet pays the gas; the person pays nothing on Arc.
      maxFee: ZERO,
    };
    const minReceived = input.amount - maxRouteFee;
    const view: BridgeDraftView = {
      destination: destination.id,
      chainId: destination.chainId,
      amount: input.amount.toString(),
      maxRouteFee: maxRouteFee.toString(),
      minReceived: minReceived.toString(),
      networkFee: "0",
      recipient: wallet,
      provider: BRIDGE_PROVIDER_LABEL,
      routes: [{ provider: BRIDGE_PROVIDER_LABEL, status: "chosen", received: minReceived.toString(), reason: null }],
      quotedAt: new Date().toISOString(),
    };
    const draftHash = bridgeDraftHash(draft);
    const request: StoredBridgeRequest = { destination: destination.id, amount: decimal };
    const created = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.network}`}, 0))`);
      if (await intentExists(tx, input.intentId)) return false;
      await tx.insert(intents).values({ id: input.intentId, userId: input.userId, network: input.network, kind: "bridge", originSurface: "automation", state: "executing", request, currentDraftVersion: 1, expiresAt: later(INTENT_TTL_S) });
      await tx.insert(intentDrafts).values({
        intentId: input.intentId,
        version: 1,
        payload: { draft: storeBridgeDraft(draft), view, destination: destination.id } as unknown as Record<string, unknown>,
        draftHash,
        policyReport: { results: [], blocking: null },
        route: "automation",
        createdBy: "system",
      });
      await tx.insert(approvals).values({ intentId: input.intentId, draftVersion: 1, draftHash, userId: input.userId, network: input.network, route: "automation", signerAddress: wallet, status: "approved", decidedViaSurface: "automation", expiresAt: later(APPROVAL_TTL_S) });
      await tx.insert(txAttempts).values({
        userId: input.userId,
        intentId: input.intentId,
        network: input.network,
        chainId: network.chainId,
        attemptNo: 1,
        kind: "bridge_burn",
        provider: "circle_dcw",
        idempotencyKey: randomUUID(),
        fromAddress: ops.address,
        toAddress: call.to,
        status: "prepared",
        receipt: { prepared: { to: call.to, data: call.data } },
      });
      return true;
    });
    if (!created) return { status: "executing", intentId: input.intentId, resumed: true };
    const attempt = await this.latestAttempt(input.intentId);
    if (attempt) await this.opsAttempts.submit(input.intentId, attempt);
    void this.follow(input.intentId);
    return { status: "executing", intentId: input.intentId, resumed: false };
  }

  // ── Tracking: the burn on Arc, Circle's attestation, the forwarder's mint ───────────────────────────────────

  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      const settled = await this.track(intentId).catch((error: unknown) => {
        this.log.warn({ intentId, err: error }, "bridge track failed");
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
      // An attempt the ops wallet sends (a bridge rule) gets its hash from Circle.
      const hash = latest.provider === "circle_dcw" ? await this.opsAttempts?.hash(intentId, intent.network, latest) : (latest.txHash as Hex | null);
      if (!hash) return false;
      const attempt = { ...latest, txHash: hash };
      const stored = ((await this.currentDraft(intent))?.payload as DraftPayload | undefined) ?? undefined;
      if (!stored?.draft) return false;
      const draft = loadBridgeDraft(stored.draft);
      const { client, network } = this.clients(intent.network);
      const progress = (attempt.receipt as Progress | null) ?? {};
      await this.db.update(txAttempts).set({ lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));

      // 1. The burn on Arc: exactly `amount` left the wallet.
      if (!progress.burnConfirmed) {
        const receipt = await client.getTransactionReceipt({ hash: attempt.txHash as Hex }).catch(() => undefined);
        if (!receipt) return this.maybeUnknown(intent, attempt);
        if (receipt.status !== "success" || burned(receipt, draft) !== draft.amount) {
          if (receipt.status === "success") this.log.error({ intentId, tx: receipt.transactionHash }, "security.receipt_mismatch");
          await this.settleFailed(intentId, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null, receipt);
          return true;
        }
        await this.db
          .update(txAttempts)
          .set({ status: "pending_chain", receipt: { ...progress, burnConfirmed: true, chain: jsonSafe(receiptSummary(receipt)) } })
          .where(eq(txAttempts.id, attempt.id));
        return false;
      }

      // 2. Circle's attestation and the forwarder's mint, then the mint itself on the destination.
      const destination = this.destination(network, stored.destination);
      if (!destination) return false;
      const forward = await this.engine.progress(network, attempt.txHash as Hex).catch(() => null);
      if (forward?.forward === "FAILED") {
        await this.db
          .update(txAttempts)
          .set({ receipt: { ...progress, forward: "FAILED", error: forward.forwardError } })
          .where(eq(txAttempts.id, attempt.id));
        await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
        return false;
      }
      if (forward?.forwardTxHash && forward.forwardTxHash !== progress.mintTxHash)
        await this.db
          .update(txAttempts)
          .set({ receipt: { ...progress, forward: forward.forward, mintTxHash: forward.forwardTxHash } })
          .where(eq(txAttempts.id, attempt.id));
      if (!forwardDelivered(forward)) return false;
      const received = await this.engine.minted(destination, forward!.forwardTxHash as Hex, draft.recipient).catch(() => undefined);
      if (received === undefined) return false;
      if (received < draft.amount - draft.maxRouteFee) {
        this.log.error({ intentId, mint: forward!.forwardTxHash, received: received.toString() }, "security.mint_short");
        return false;
      }
      await this.db.transaction(async (tx) => {
        const [done] = await tx
          .update(intents)
          .set({ state: "completed", completedAt: new Date() })
          .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome"])))
          .returning({ id: intents.id });
        if (!done) return;
        await tx
          .update(txAttempts)
          .set({ status: "confirmed", receipt: { ...progress, forward: forward!.forward, mintTxHash: forward!.forwardTxHash, received: received.toString() } })
          .where(eq(txAttempts.id, attempt.id));
      });
      return true;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  private async maybeUnknown(intent: IntentRow, attempt: AttemptRow) {
    if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
      await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intent.id), eq(intents.state, "executing")));
      await this.db.update(txAttempts).set({ status: "unknown" }).where(eq(txAttempts.id, attempt.id));
    }
    return false;
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
        .where(and(eq(intents.kind, "bridge"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "bridge sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "bridge sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

function normalise(base: Partial<StoredBridgeRequest>, patch: BridgeRequest): StoredBridgeRequest {
  const destination = patch.destination !== undefined ? patch.destination : (base.destination ?? null);
  const amount = patch.amount !== undefined ? patch.amount : (base.amount ?? null);
  return { destination: destination && DESTINATION_IDS.includes(destination) ? destination : null, amount: amount?.trim() || null };
}

/** USDC that left the wallet in the burn transaction. */
function burned(receipt: TransactionReceipt, draft: BridgeDraft) {
  let out = ZERO;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== draft.token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName === "Transfer" && event.args.from.toLowerCase() === draft.from.toLowerCase()) out += event.args.value;
    } catch {
      // Not an ERC-20 Transfer.
    }
  }
  return out;
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
