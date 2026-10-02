// Cross-chain moves with options (routes.md): USDC out of Arc to anyone on another chain, and Bring to Arc.
//
// Out: Kawase quotes every route that serves the pair (Circle CCTP through App Kit, Across, Relay), ranks them by
// what arrives net of anything paid on top, shows up to three, and executes the chosen one: the provider's calls
// (approve + deposit/burn) are built at approval, checked against the version (recipient, amounts, destination,
// the provider's own contracts), simulated from the wallet, and sent by the wallet to itself as one EIP-7702 batch
// (one Face ID). In: "Bring to Arc" from a chain where the person holds USDC at the same address uses Relay's
// permit — one EIP-712 signature (USDC's ReceiveWithAuthorization), no gas on that chain — which Kawase hands to
// Relay. Tracking: the origin receipt must show exactly `amount` leaving; the fill is followed through the
// provider (Across deposit status, Relay request status, CCTP's attestation and forwarder) until it is delivered.
// A move that is not filled says so and how it ends (refunded by the provider), never re-sent on its own (R7).
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  verifyTypedData,
  type Address,
  type Hex,
  type TransactionReceipt,
  type TypedDataDefinition,
} from "viem";

import { APPROVAL_TTL_S, GAS_ESTIMATE_HEADROOM_PERCENT, GAS_FLOAT_USDC_BASE_UNITS, INTENT_TTL_S, MAX_FEE_DRAFT_MULTIPLIER, MS_PER_SECOND, SEND_UNKNOWN_AFTER_S } from "@kawase/config";
import type {
  CrossChainApproveResponse,
  CrossChainChainView,
  CrossChainDraftView,
  CrossChainIntent,
  CrossChainProvider,
  CrossChainRequest,
  CrossChainRouteView,
  CrossChainStage,
  ElsewhereView,
  UnsignedTransaction,
} from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import { checkBridgeCalls, forwardDelivered, type BridgeDestination } from "@kawase/integrations-app-kit";
import {
  acrossQuote,
  acrossStatus,
  checkAcrossCalls,
  checkRelayCalls,
  checkRelayPermit,
  relayContracts,
  relayQuote,
  relayStatus,
  submitRelayPermit,
  type BridgeCall,
  type RelayPermit,
} from "@kawase/integrations-bridges";
import { encodeSelfBatch, isWalletSetUp } from "@kawase/integrations-delegation";
import {
  CROSSCHAIN_PROVIDERS,
  DRAFTABLE_STATES,
  crossChainDraftHash,
  loadCrossChainDraft,
  storeCrossChainDraft,
  type CrossChainDraft,
  type IntentState,
  type StoredCrossChainDraft,
} from "@kawase/intents";
import type { Logger } from "@kawase/log";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import { evaluateCrossChain, type CrossChainEvaluation, type PolicyResult, type RecipientFacts } from "@kawase/policy";

import type { BridgeEngine } from "../bridge/engine";
import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { jsonSafe, nextAttemptNo, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import { parseRequestAmount } from "../send/facts";
import type { Recipients } from "../send/recipients";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;
type StoredRequest = Required<{ [K in keyof CrossChainRequest]: Exclude<CrossChainRequest[K], undefined> }>;
type DraftPayload = { draft: StoredCrossChainDraft | null; view: CrossChainDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };
type Progress = { provider: CrossChainProvider; requestId?: string | null; status?: string; fillTx?: string | null; received?: string | null };
type Quote = { provider: CrossChainProvider; received: bigint | null; minReceived: bigint | null; etaSeconds: number | null; reason: CrossChainRouteView["reason"] };

const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const USDC_DECIMALS = decimalsOf("USDC");
const SHOWN_ROUTES = 3;
const BATCH_GAS_ESTIMATE = 400_000n;
const TRACK_POLL_MS = 3_000;
const TRACK_POLL_ATTEMPTS = 120;
const ERROR_MAX = 140;
const QUOTE_TIMEOUT_MS = 6_000;
/** App Kit's CCTP estimate simulates the burn and reads Circle's fees: 6.2–6.8 s on Arc Testnet (measured 10-02). */
const CCTP_QUOTE_TIMEOUT_MS = 15_000;
const NO_QUOTE = -1n;
const TRUST: Record<CrossChainProvider, CrossChainRouteView["trust"]> = { cctp: "burn_mint", across: "solver", relay: "solver" };
const CHAIN_NAMES: Record<string, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "OP Mainnet", polygon: "Polygon", avalanche: "Avalanche" };

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const within = <T>(promise: Promise<T>, fallback: T, timeoutMs = QUOTE_TIMEOUT_MS) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]).catch(() => fallback);

const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, USDC_DECIMALS);
  return rescale(scaled, USDC_DECIMALS, USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

function restingState(evaluation: CrossChainEvaluation): IntentState {
  const blocking = evaluation.blocking;
  if (!blocking) return "ready_for_approval";
  if (blocking.code === "SIGN_IN_REQUIRED") return "auth_required";
  if (blocking.kind === "error" || blocking.kind === "policy") return "rejected";
  return "input_required";
}

export class CrossChainService {
  private readonly tracking = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly recipients: Recipients,
    private readonly engine: BridgeEngine,
    private readonly log: Logger,
  ) {}

  private clients(network: NetworkId): NetworkClients {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    return clients;
  }

  private chainView(network: NetworkContext, chain: BridgeDestination | "arc"): CrossChainChainView {
    if (chain === "arc") return { chainId: network.chainId, name: network.isRealMoney ? "Arc" : "Arc Testnet", key: "arc" };
    return { chainId: chain.chainId, name: CHAIN_NAMES[chain.id] ?? chain.id, key: chain.id };
  }

  private findChain(network: NetworkContext, text: string | null): BridgeDestination | undefined {
    if (!text) return undefined;
    const wanted = text.trim().toLowerCase();
    return this.engine.destinations(network).find((chain) => chain.id === wanted || String(chain.chainId) === wanted || (CHAIN_NAMES[chain.id] ?? "").toLowerCase() === wanted);
  }

  private remoteUsdc(chain: BridgeDestination, owner: Address) {
    const client = createPublicClient({ transport: http(chain.rpcUrl, { timeout: QUOTE_TIMEOUT_MS }) });
    return client.readContract({ address: chain.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  }

  /** USDC at the person's own address on each CCTP chain (Bring to Arc finds it here). */
  async elsewhere(user: SessionUser): Promise<ElsewhereView> {
    const network = user.activeNetwork;
    const clients = this.clients(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet) return { network, chains: [] };
    const rows = await Promise.all(
      this.engine.destinations(clients.network).map(async (chain) => ({ chain, balance: await within(this.remoteUsdc(chain, wallet), ZERO) })),
    );
    return {
      network,
      chains: rows.filter((row) => row.balance > ZERO).map((row) => ({ ...this.chainView(clients.network, row.chain), asset: "USDC", balance: row.balance.toString() })),
    };
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: CrossChainRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }) {
    const stored = normalise(empty(), request);
    const [row] = await this.db
      .insert(intents)
      .values({ userId: user.id, threadId: origin.threadId ?? null, network: user.activeNetwork, kind: "crosschain", originSurface: origin.surface, state: "submitted", request: stored, expiresAt: later(INTENT_TTL_S) })
      .returning();
    return this.draft(user, row!, stored, origin.surface === "app" ? "user" : "agent");
  }

  async revise(user: SessionUser, intentId: string, patch: CrossChainRequest) {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) throw problem(HTTP.conflict, "intent_final");
    if (intent.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const stored = normalise(intent.request as StoredRequest, patch);
    await this.db.update(intents).set({ request: stored, expiresAt: later(INTENT_TTL_S) }).where(eq(intents.id, intentId));
    return this.draft(user, { ...intent, request: stored }, stored, "user");
  }

  private async quotes(input: { network: NetworkContext; client: NetworkClients["client"]; direction: "out" | "in"; chain: BridgeDestination; wallet: Address; recipient: Address; amount: bigint }): Promise<Quote[]> {
    const { network, direction, chain, wallet, recipient, amount } = input;
    const testnet = !network.isRealMoney;
    const failed = (provider: CrossChainProvider, error: unknown): Quote => ({
      provider,
      received: null,
      minReceived: null,
      etaSeconds: null,
      reason: (error as { code?: string }).code === "amount_too_low" ? "amount_too_low" : (error as { code?: string }).code === "timeout" ? "timeout" : "no_quote",
    });
    if (direction === "in") {
      const relay: Quote = testnet
        ? { provider: "relay", received: null, minReceived: null, etaSeconds: null, reason: "not_on_arc_testnet" }
        : await within(
            relayQuote({ originChainId: chain.chainId, destinationChainId: network.chainId, originCurrency: chain.usdc, destinationCurrency: network.addresses.usdc, amount, user: wallet, recipient: wallet, usePermit: true }).then(
              (quote): Quote => ({ provider: "relay", received: quote.outputAmount, minReceived: quote.outputAmount, etaSeconds: quote.fillSeconds, reason: null }),
            ),
            failed("relay", { code: "timeout" }),
          ).catch((error: unknown) => failed("relay", error));
      // Across and CCTP start with a transaction on the other chain, which needs its gas (ETH on Base): offered
      // only once Kawase can sponsor it (routes.md ranking rule).
      return [relay, { provider: "across", received: null, minReceived: null, etaSeconds: null, reason: "needs_source_gas" }, { provider: "cctp", received: null, minReceived: null, etaSeconds: null, reason: "needs_source_gas" }];
    }
    const decimal = formatUnits(amount, USDC_DECIMALS);
    const cctp = within(
      this.engine.estimate({ network, client: input.client, from: wallet, destination: chain, recipient, amount: decimal }).then((estimate): Quote => {
        const received = amount > estimate.maxFee ? amount - estimate.maxFee : ZERO;
        return { provider: "cctp", received, minReceived: received, etaSeconds: null, reason: null };
      }),
      failed("cctp", { code: "timeout" }),
      CCTP_QUOTE_TIMEOUT_MS,
    ).catch((error: unknown) => failed("cctp", error));
    const across: Promise<Quote> = testnet
      ? Promise.resolve({ provider: "across", received: null, minReceived: null, etaSeconds: null, reason: "not_on_arc_testnet" })
      : within(
          acrossQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: network.addresses.usdc, outputToken: chain.usdc, amount, depositor: wallet, recipient }).then(
            (quote): Quote => ({ provider: "across", received: quote.outputAmount, minReceived: quote.minOutputAmount, etaSeconds: quote.fillSeconds, reason: null }),
          ),
          failed("across", { code: "timeout" }),
        ).catch((error: unknown) => failed("across", error));
    const relay: Promise<Quote> = testnet
      ? Promise.resolve({ provider: "relay", received: null, minReceived: null, etaSeconds: null, reason: "not_on_arc_testnet" })
      : within(
          relayQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, originCurrency: network.addresses.usdc, destinationCurrency: chain.usdc, amount, user: wallet, recipient }).then(
            (quote): Quote => ({ provider: "relay", received: quote.outputAmount, minReceived: quote.outputAmount, etaSeconds: quote.fillSeconds, reason: null }),
          ),
          failed("relay", { code: "timeout" }),
        ).catch((error: unknown) => failed("relay", error));
    return Promise.all([cctp, across, relay]);
  }

  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredRequest) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.chains.get(network);
    const view = await capabilityView(this.db, this.chains.available);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const direction: "in" | "out" = request.direction === "in" ? "in" : "out";
    const amount = parseRequestAmount(request.amount, "USDC");

    let setUp = false;
    let balance = ZERO;
    let chain: BridgeDestination | undefined;
    let chainState: "found" | "missing" | "unknown" = "missing";
    let recipientFacts: RecipientFacts | { status: "own" } = { status: "own" };
    let recipient: Address | undefined = wallet;
    let recipientLabel: string | null = null;
    if (clients && wallet) {
      const named = direction === "in" ? request.source : request.destination;
      chain = this.findChain(clients.network, named);
      if (direction === "in" && !named) {
        // Bring to Arc from wherever the money is: the chain holding the most USDC at this address.
        const found = await this.elsewhere(user);
        const richest = [...found.chains].sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1))[0];
        chain = richest ? this.findChain(clients.network, richest.key) : undefined;
      }
      chainState = chain ? "found" : named ? "unknown" : "missing";
      const code = await clients.client.getCode({ address: wallet });
      setUp = isWalletSetUp(code);
      if (direction === "out") {
        balance = await clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
        if (request.recipient) {
          const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, request.recipient);
          recipientFacts = resolution.facts.status === "self" ? { status: "own" } : resolution.facts;
          if (resolution.facts.status === "resolved") {
            recipient = getAddress(resolution.facts.address);
            recipientLabel = resolution.view?.name ?? resolution.view?.handle ?? null;
          }
        }
      } else if (chain) balance = await within(this.remoteUsdc(chain, wallet), ZERO);
    }

    let quotes: Quote[] = [];
    const canQuote = clients && wallet && chain && recipient && amount.status === "ok" && amount.baseUnits > ZERO && (recipientFacts.status === "own" || recipientFacts.status === "resolved");
    if (canQuote) quotes = await this.quotes({ network: clients.network, client: clients.client, direction, chain: chain!, wallet, recipient: recipient!, amount: amount.baseUnits });
    const net = (quote: Quote) => quote.received ?? NO_QUOTE;
    const executable = quotes.filter((quote) => quote.received !== null && quote.reason === null);
    const ranked = [...executable].sort((a, b) => (net(b) > net(a) ? 1 : net(b) < net(a) ? -1 : (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity)));
    const chosen = ranked.find((quote) => quote.provider === request.route) ?? ranked[0];

    const evaluation = evaluateCrossChain({
      network,
      capability: { here: view.bridge[network].state, other: view.bridge[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: false,
      direction,
      wallet: { registered: Boolean(wallet), setUp },
      chain: chainState,
      recipient: recipientFacts,
      amount,
      balance,
      gasFloat: GAS_FLOAT_USDC_BASE_UNITS,
      route: canQuote ? (chosen ? { status: "ok" } : { status: "none", reason: quotes[0]?.reason ?? "no_quote" }) : { status: "not_requested" },
    });
    return { wallet, clients, direction, chain, recipient, recipientLabel, amount, quotes, ranked, chosen, evaluation };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const fresh = await this.evaluate(user, intent, request);
    const { wallet, clients, direction, chain, recipient, recipientLabel, amount, quotes, ranked, chosen, evaluation } = fresh;
    let draft: CrossChainDraft | null = null;
    let view: CrossChainDraftView | null = null;
    if (wallet && clients && chain && recipient && chosen && chosen.minReceived !== null && amount.status === "ok") {
      const outbound = direction === "out";
      const { maxFeePerGas } = await walletGasPrice(clients.client);
      const fee = outbound ? ((BATCH_GAS_ESTIMATE * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas : ZERO;
      draft = {
        originChainId: outbound ? clients.network.chainId : chain.chainId,
        destinationChainId: outbound ? chain.chainId : clients.network.chainId,
        from: wallet,
        token: outbound ? clients.network.addresses.usdc : chain.usdc,
        amount: amount.baseUnits,
        recipient,
        minReceived: chosen.minReceived,
        provider: CROSSCHAIN_PROVIDERS.indexOf(chosen.provider),
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const shown = [...ranked, ...quotes.filter((quote) => !ranked.includes(quote))].slice(0, SHOWN_ROUTES);
      view = {
        direction,
        asset: "USDC",
        amount: amount.baseUnits.toString(),
        source: outbound ? this.chainView(clients.network, "arc") : this.chainView(clients.network, chain),
        destination: outbound ? this.chainView(clients.network, chain) : this.chainView(clients.network, "arc"),
        recipient: { address: recipient, label: recipientLabel, own: same(recipient, wallet) },
        routes: shown.map((quote) => ({
          provider: quote.provider,
          received: quote.received?.toString() ?? null,
          fee: quote.received !== null ? (amount.baseUnits - quote.received).toString() : null,
          extraCost: "0",
          net: quote.received?.toString() ?? null,
          etaSeconds: quote.etaSeconds,
          executable: quote.received !== null && quote.reason === null,
          trust: TRUST[quote.provider],
          reason: quote.reason,
        })),
        chosen: chosen.provider,
        minReceived: chosen.minReceived.toString(),
        networkFee: feeInUsdc(fee).toString(),
        quotedAt: new Date().toISOString(),
      };
    }
    const payload: DraftPayload = { draft: draft ? storeCrossChainDraft(draft) : null, view };
    const report: PolicyReport = { results: evaluation.results, blocking: evaluation.blocking ?? null };
    const version = intent.currentDraftVersion + 1;
    const state = draft || evaluation.blocking ? restingState(evaluation) : "input_required";
    await this.db.transaction(async (tx) => {
      await tx.update(intentDrafts).set({ voidedAt: new Date(), voidReason: "superseded" }).where(and(eq(intentDrafts.intentId, intent.id), sql`${intentDrafts.voidedAt} is null`));
      await tx.insert(intentDrafts).values({
        intentId: intent.id,
        version,
        payload: payload as unknown as Record<string, unknown>,
        draftHash: draft ? crossChainDraftHash(draft) : null,
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
      .where(and(eq(intents.id, intentId), eq(intents.userId, userId), eq(intents.kind, "crosschain")));
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such transfer");
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

  async get(userId: string, intentId: string): Promise<CrossChainIntent> {
    let intent = await this.ownIntent(userId, intentId);
    if (DRAFTABLE_STATES.has(intent.state) && intent.expiresAt.getTime() < Date.now()) {
      await this.db.update(intents).set({ state: "expired" }).where(eq(intents.id, intentId));
      intent = { ...intent, state: "expired" };
    }
    if (intent.state === "executing" || intent.state === "unknown_outcome") await this.track(intentId).catch(() => undefined);
    return this.view(userId, intentId);
  }

  async view(userId: string, intentId: string): Promise<CrossChainIntent> {
    const intent = await this.ownIntent(userId, intentId);
    const [draft, attempt] = await Promise.all([this.currentDraft(intent), this.latestAttempt(intentId)]);
    const payload = (draft?.payload ?? {}) as Partial<DraftPayload>;
    const report = (draft?.policyReport ?? { results: [], blocking: null }) as PolicyReport;
    const progress = (attempt?.receipt ?? {}) as Progress;
    const network = this.chains.get(intent.network)?.network;
    const view = payload.view ?? null;
    const arcExplorer = network?.viemChain.blockExplorers?.default.url;
    const farExplorer = view ? this.engine.destinations(network!).find((chain) => chain.chainId === (view.direction === "out" ? view.destination.chainId : view.source.chainId))?.explorerTx : undefined;
    const originExplorer = view?.direction === "in" ? farExplorer : arcExplorer ? `${arcExplorer}/tx/` : undefined;
    const fillExplorer = view?.direction === "in" ? (arcExplorer ? `${arcExplorer}/tx/` : undefined) : farExplorer;
    const link = (base: string | undefined, hash: string | null | undefined) => (base && hash ? { hash, explorerUrl: base.includes("{hash}") ? base.replace("{hash}", hash) : `${base}${hash}` } : null);
    return {
      id: intent.id,
      network: intent.network,
      state: intent.state,
      outcome: outcomeOf(intent.state, attempt),
      stage: stageOf(intent.state, progress),
      version: intent.currentDraftVersion,
      request: intent.request as StoredRequest,
      draft: view,
      results: report.results,
      blocking: report.blocking,
      tx: link(originExplorer, attempt?.txHash),
      fillTx: link(fillExplorer, progress.fillTx),
      received: progress.received ?? null,
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

  private async build(draft: CrossChainDraft, network: NetworkContext, client: NetworkClients["client"], chain: BridgeDestination): Promise<{ calls: BridgeCall[] } | { permit: RelayPermit; requestId: string } | { changed: true }> {
    const provider = CROSSCHAIN_PROVIDERS[draft.provider]!;
    if (draft.originChainId !== network.chainId) {
      // Bring to Arc: Relay's permit, checked: USDC's ReceiveWithAuthorization from the wallet to Relay's proxy.
      const quote = await relayQuote({ originChainId: chain.chainId, destinationChainId: network.chainId, originCurrency: chain.usdc, destinationCurrency: network.addresses.usdc, amount: draft.amount, user: draft.from, recipient: draft.from, usePermit: true });
      if (!quote.permit) throw problem(HTTP.badGateway, "quote_unavailable");
      if (quote.outputAmount < draft.minReceived) return { changed: true };
      const contracts = await relayContracts(chain.chainId);
      const proxy = contracts.find((address) => same(address, String(quote.permit!.typedData.message.to)));
      if (!proxy || !checkRelayPermit(quote.permit, { chainId: chain.chainId, token: chain.usdc, from: draft.from, amount: draft.amount, approvalProxy: proxy })) {
        this.log.error({ provider }, "security.permit_refused");
        throw problem(HTTP.badGateway, "quote_unavailable", "the route asked for a signature Kawase does not accept");
      }
      return { permit: quote.permit, requestId: quote.requestId };
    }
    if (provider === "across") {
      const quote = await acrossQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: network.addresses.usdc, outputToken: chain.usdc, amount: draft.amount, depositor: draft.from, recipient: draft.recipient });
      if (quote.minOutputAmount < draft.minReceived) return { changed: true };
      const check = checkAcrossCalls(quote.calls, { spokePool: quote.spokePool, depositor: draft.from, recipient: draft.recipient, inputToken: network.addresses.usdc, outputToken: chain.usdc, amount: draft.amount, minOutput: draft.minReceived, destinationChainId: chain.chainId });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: quote.calls };
    }
    if (provider === "relay") {
      const quote = await relayQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, originCurrency: network.addresses.usdc, destinationCurrency: chain.usdc, amount: draft.amount, user: draft.from, recipient: draft.recipient });
      if (quote.outputAmount < draft.minReceived) return { changed: true };
      const check = checkRelayCalls(quote.calls, { depositories: await relayContracts(network.chainId), depositor: draft.from, token: network.addresses.usdc, amount: draft.amount });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: quote.calls };
    }
    const calls = await this.engine.prepare({ network, client, from: draft.from, destination: chain, recipient: draft.recipient, amount: formatUnits(draft.amount, USDC_DECIMALS) });
    const check = checkBridgeCalls(network, calls, { usdc: network.addresses.usdc, amount: draft.amount, recipient: draft.recipient, domain: chain.domain, maxFee: draft.amount - draft.minReceived });
    if (!check.ok) throw this.refused(provider, check.reason);
    return { calls: calls.map((call) => ({ to: call.to, data: call.data ?? "0x", value: call.value ?? ZERO })) };
  }

  private refused(provider: string, reason: string) {
    this.log.error({ provider, reason }, "security.crosschain_calls_refused");
    return problem(HTTP.badGateway, "quote_unavailable", "the route returned calls Kawase does not accept");
  }

  async approve(user: SessionUser, intentId: string, input: { version: number; surface: "app" | "chat" | "voice" }): Promise<CrossChainApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    if (input.version !== before.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    if (before.expiresAt.getTime() < Date.now()) return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const payload = current?.payload as DraftPayload | undefined;
    if (!current?.draftHash || !payload?.draft || !payload.view) return this.redraft(user, intentId);
    const draft = loadCrossChainDraft(payload.draft);
    if (crossChainDraftHash(draft) !== current.draftHash) return this.redraft(user, intentId);
    const { network, client } = this.clients(before.network);
    const chain = this.engine.destinations(network).find((entry) => entry.chainId === (payload.view!.direction === "out" ? draft.destinationChainId : draft.originChainId));
    if (!chain) return this.redraft(user, intentId);

    let built: Awaited<ReturnType<CrossChainService["build"]>>;
    try {
      built = await this.build(draft, network, client, chain);
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      this.log.warn({ err: error, intentId }, "crosschain build failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }
    if ("changed" in built) return this.redraft(user, intentId);

    let unsigned: Record<string, unknown>;
    let answer: { status: "sign"; transaction: UnsignedTransaction } | { status: "sign_typed"; typedData: RelayPermit["typedData"] };
    if ("permit" in built) {
      unsigned = { kind: "permit", permit: built.permit, requestId: built.requestId };
      answer = { status: "sign_typed", typedData: built.permit.typedData };
    } else {
      const data = encodeSelfBatch(built.calls).toLowerCase() as Hex;
      try {
        await client.call({ account: draft.from, to: draft.from, data });
      } catch (error) {
        this.log.warn({ err: error, intentId }, "crosschain batch simulation reverted");
        throw problem(HTTP.badGateway, "simulation_failed");
      }
      const [nonce, price, estimate] = await Promise.all([
        client.getTransactionCount({ address: draft.from, blockTag: "pending" }),
        walletGasPrice(client),
        client.estimateGas({ account: draft.from, to: draft.from, data }).catch(() => BATCH_GAS_ESTIMATE),
      ]);
      const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
      if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
      const transaction: UnsignedTransaction = { type: "eip1559", chainId: network.chainId, nonce, to: draft.from, data, value: "0", gas: gas.toString(), maxFeePerGas: price.maxFeePerGas.toString(), maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString() };
      unsigned = transaction as unknown as Record<string, unknown>;
      answer = { status: "sign", transaction };
    }

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
        unsignedTransaction: unsigned,
        signerAddress: draft.from,
        status: "pending_signature",
        decidedViaSurface: input.surface,
        expiresAt: later(APPROVAL_TTL_S),
      });
      return { kind: "sign" as const, approvalId: id };
    });
    if (outcome.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    const intent = await this.view(user.id, intentId);
    return answer.status === "sign"
      ? { status: "sign", intent, approvalId: outcome.approvalId, transaction: answer.transaction }
      : { status: "sign_typed", intent, approvalId: outcome.approvalId, typedData: answer.typedData };
  }

  private async redraft(user: SessionUser, intentId: string): Promise<CrossChainApproveResponse> {
    const intent = await this.ownIntent(user.id, intentId);
    if (!DRAFTABLE_STATES.has(intent.state)) return { status: "final", intent: await this.view(user.id, intentId) };
    await this.draft(user, intent, intent.request as StoredRequest, "system");
    return { status: "changed", intent: await this.view(user.id, intentId) };
  }

  private async lockIntent(tx: Tx, userId: string, intentId: string): Promise<IntentRow> {
    const [intent] = await tx.select().from(intents).where(and(eq(intents.id, intentId), eq(intents.userId, userId))).for("update");
    if (!intent) throw problem(HTTP.notFound, "not_found", "no such transfer");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${intent.network}`}, 0))`);
    return intent;
  }

  /** The wallet signed: the exact transaction handed out (broadcast here), or the permit (handed to Relay). */
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction?: Hex | undefined; signature?: Hex | undefined }): Promise<CrossChainApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadCrossChainDraft(stored);
    const provider = CROSSCHAIN_PROVIDERS[draft.provider]!;
    const context = this.clients(before.network);

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
      if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
      const unsigned = approval.unsignedTransaction as Record<string, unknown>;
      let txHash: Hex | null = null;
      let requestId: string | null = null;
      if (unsigned.kind === "permit") {
        const permit = unsigned.permit as RelayPermit;
        const valid = input.signature ? await verifyTypedData({ address: draft.from, ...(permit.typedData as unknown as TypedDataDefinition), signature: input.signature }).catch(() => false) : false;
        if (!valid) {
          this.log.warn({ intentId }, "security.permit_signature_mismatch");
          await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
          return { kind: "mismatch" as const };
        }
        requestId = String(unsigned.requestId);
      } else {
        const transaction = unsigned as unknown as UnsignedTransaction;
        if (!input.signedTransaction) throw problem(HTTP.badRequest, "validation", "a signed transaction is needed");
        const parsed = parseTransaction(input.signedTransaction);
        const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
        const ok =
          signer?.toLowerCase() === draft.from.toLowerCase() &&
          parsed.chainId === draft.originChainId &&
          parsed.to?.toLowerCase() === draft.from.toLowerCase() &&
          parsed.data?.toLowerCase() === transaction.data.toLowerCase() &&
          (parsed.value ?? ZERO) === ZERO &&
          parsed.nonce === transaction.nonce &&
          (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
        if (!ok) {
          this.log.warn({ intentId }, "security.draft_mismatch");
          await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
          return { kind: "mismatch" as const };
        }
        txHash = keccak256(input.signedTransaction);
      }
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      const progress: Progress = { provider, requestId, status: "submitted" };
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: draft.originChainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "crosschain_wallet",
          provider: unsigned.kind === "permit" ? ("relayer" as const) : ("user_wallet" as const),
          idempotencyKey: randomUUID(),
          fromAddress: draft.from,
          toAddress: draft.from,
          txHash,
          status: "prepared",
          receipt: progress as unknown as Record<string, unknown>,
        })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "go" as const, attemptId: attempt!.id, permit: unsigned.kind === "permit" ? (unsigned.permit as RelayPermit) : null };
    });

    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    try {
      if (prepared.permit) await submitRelayPermit(prepared.permit, input.signature!);
      else await context.client.sendRawTransaction({ serializedTransaction: input.signedTransaction! });
      await this.db.update(txAttempts).set({ status: "submitted" }).where(eq(txAttempts.id, prepared.attemptId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A refused permit or a refused broadcast never left: nothing moved.
      const refused = prepared.permit ? true : refusedBeforeSending(message);
      this.log.warn({ intentId, refused, message: message.slice(0, ERROR_MAX) }, "crosschain submit failed");
      if (refused) await this.settleFailed(intentId, prepared.attemptId, "not_sent", message.slice(0, ERROR_MAX));
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
      const payload = (await this.currentDraft(intent))?.payload as DraftPayload | undefined;
      if (!attempt || !payload?.draft) return false;
      const draft = loadCrossChainDraft(payload.draft);
      const progress = (attempt.receipt ?? {}) as Progress;
      const { network, client } = this.clients(intent.network);
      const update = (next: Progress) => this.db.update(txAttempts).set({ receipt: jsonSafe(next), lastReconciledAt: new Date() }).where(eq(txAttempts.id, attempt.id));

      // Out of Arc: the origin receipt first, exactly `amount` leaving the wallet.
      if (draft.originChainId === network.chainId && progress.status === "submitted") {
        const receipt = await client.getTransactionReceipt({ hash: attempt.txHash as Hex }).catch(() => undefined);
        if (!receipt) {
          if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
            await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
          }
          return false;
        }
        if (receipt.status !== "success" || outOf(receipt, draft.token, draft.from) !== draft.amount) {
          if (receipt.status === "success") this.log.error({ intentId, tx: receipt.transactionHash }, "security.receipt_mismatch");
          await this.settleFailed(intentId, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null);
          return true;
        }
        await update({ ...progress, status: "filling" });
        return false;
      }
      // The fill, through the provider.
      const filled = await this.fillOf(progress, network, draft, attempt.txHash as Hex | null);
      if (filled.status === "delivered") {
        await this.db.transaction(async (tx) => {
          const [done] = await tx
            .update(intents)
            .set({ state: "completed", completedAt: new Date() })
            .where(and(eq(intents.id, intentId), inArray(intents.state, ["executing", "unknown_outcome"])))
            .returning({ id: intents.id });
          if (!done) return;
          await tx.update(txAttempts).set({ status: "confirmed", receipt: jsonSafe({ ...progress, status: "delivered", fillTx: filled.fillTx, received: filled.received }) }).where(eq(txAttempts.id, attempt.id));
        });
        return true;
      }
      if (filled.status === "refunded" || filled.status === "failed") {
        await update({ ...progress, status: filled.status });
        await this.settleFailed(intentId, attempt.id, "reverted", filled.status);
        return true;
      }
      if (progress.status !== "filling") await update({ ...progress, status: "filling" });
      return false;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  private async fillOf(progress: Progress, network: NetworkContext, draft: CrossChainDraft, originTx: Hex | null): Promise<{ status: "pending" | "delivered" | "refunded" | "failed"; fillTx: string | null; received: string | null }> {
    if (progress.provider === "relay" && progress.requestId) {
      const status = await relayStatus(progress.requestId as Hex);
      if (status.status === "success") return { status: "delivered", fillTx: status.destinationTxHash, received: draft.minReceived.toString() };
      if (status.status === "refund") return { status: "refunded", fillTx: null, received: null };
      if (status.status === "failure") return { status: "failed", fillTx: null, received: null };
      return { status: "pending", fillTx: null, received: null };
    }
    if (progress.provider === "across" && originTx) {
      const status = await acrossStatus(network.chainId, originTx);
      if (status.status === "filled") return { status: "delivered", fillTx: status.fillTxHash, received: draft.minReceived.toString() };
      if (status.status === "refunded" || status.status === "expired") return { status: "refunded", fillTx: null, received: null };
      return { status: "pending", fillTx: null, received: null };
    }
    if (progress.provider === "cctp" && originTx) {
      const forward = await this.engine.progress(network, originTx);
      if (forwardDelivered(forward)) return { status: "delivered", fillTx: forward?.forwardTxHash ?? null, received: draft.minReceived.toString() };
      return { status: "pending", fillTx: null, received: null };
    }
    return { status: "pending", fillTx: null, received: null };
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
      const open = await this.db.select({ id: intents.id }).from(intents).where(and(eq(intents.kind, "crosschain"), inArray(intents.state, ["executing", "unknown_outcome"])));
      for (const { id } of open) await this.track(id).catch((error: unknown) => this.log.warn({ intentId: id, err: error }, "crosschain sweep failed"));
    };
    const timer = setInterval(() => void run().catch((error: unknown) => this.log.warn({ err: error }, "crosschain sweep failed")), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}

const empty = (): StoredRequest => ({ direction: "out", asset: "USDC", amount: null, destination: null, source: null, recipient: null, route: null });

function normalise(base: StoredRequest, patch: CrossChainRequest): StoredRequest {
  const pick = <K extends keyof StoredRequest>(key: K): StoredRequest[K] => (patch[key] !== undefined ? (patch[key] as StoredRequest[K]) : base[key]);
  const text = (value: string | null) => (typeof value === "string" ? value.trim() || null : null);
  return {
    direction: pick("direction") === "in" ? "in" : "out",
    asset: text(pick("asset")) ?? "USDC",
    amount: text(pick("amount")),
    destination: text(pick("destination")),
    source: text(pick("source")),
    recipient: text(pick("recipient")),
    route: pick("route") ?? null,
  };
}

/** What the receipt says left `from` in `token` (ERC-20 Transfer logs). */
function outOf(receipt: TransactionReceipt, token: Address, from: Address): bigint {
  let out = ZERO;
  for (const log of receipt.logs) {
    if (!same(log.address, token)) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName === "Transfer" && same(event.args.from, from)) out += event.args.value;
    } catch {
      // Not a Transfer.
    }
  }
  return out;
}

function stageOf(state: IntentState, progress: Progress): CrossChainStage {
  if (state === "completed") return "delivered";
  if (state === "failed") return progress.status === "refunded" ? "refunded" : "failed";
  if (state === "executing" || state === "unknown_outcome") return progress.status === "filling" ? "filling" : "submitted";
  return "draft";
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
