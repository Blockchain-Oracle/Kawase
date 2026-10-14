// Cross-chain moves with options (routes.md): any asset out of Arc to anyone on another chain, and Bring to Arc.
//
// Out: Kawase quotes every route that serves the pair and executes the chosen one as one EIP-7702 batch (one Face ID):
// USDC through Circle CCTP (App Kit), Across, Relay, LI.FI or deBridge; any other asset "as itself" (WETH arrives as
// WETH, cirBTC as cbBTC) through LI.FI or deBridge. When nothing carries the asset as itself it arrives as USDC: through
// an aggregator that swaps inside its own call, or Kawase's convert-first plan, the Arc swap (the swap fan-out's best
// venue, its minimum held) and the USDC bridge in the same batch. Routes are ranked by what arrives, net of anything
// paid on top (deBridge's flat fee, converted at the asset's price); up to three are shown. Each provider's calls are
// built at approval, checked against the version (recipient, amounts, destination, the provider's own contracts),
// simulated from the wallet, and sent by the wallet to itself.
// In: "Bring to Arc" from a chain where the person holds money at the same address: USDC with Relay's permit (one
// EIP-712 signature, no gas there); another token with Relay's Permit2 signature — in two steps when that token is not
// yet approved to Permit2 there: the approval first (one transaction there, its gas in that chain's coin, checked to be
// exactly that approval), then the signature, both under one yes; the chain's own coin (ETH, POL, AVAX) through LI.FI
// as one transaction on that chain, its gas paid from the coin itself. Tracking: the origin receipt must show exactly the amount leaving (on Arc, USDC is measured
// by the chain's own native-transfer log, which covers both its native and ERC-20 faces, plus any flat fee); the fill
// is followed through the provider until it is delivered. A move that is not filled says so and how it ends
// (refunded by the provider), never re-sent on its own (R7).
// Socket (its own routes through Across, CCTP, Relay…; 20 bps; opaque calldata, checked for target, spender, token,
// amount and receiver, then witnessed) and Gas.zip (USDC on Arc → the gas coin on another chain, one native-value
// deposit) are quoted next to the five above, and rank and execute like them: the draft format lists them
// (@kawase/intents CROSSCHAIN_PROVIDERS, append-only: socket = 5, gaszip = 6).
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
  parseUnits,
  recoverTransactionAddress,
  verifyTypedData,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type TypedDataDefinition,
} from "viem";

import { APPROVAL_TTL_S, CROSSCHAIN, GAS_ESTIMATE_HEADROOM_PERCENT, GAS_FLOAT_USDC_BASE_UNITS, INTENT_TTL_S, MAX_FEE_DRAFT_MULTIPLIER, MS_PER_SECOND, SEND_UNKNOWN_AFTER_S, SWAP_ROUTE_SLIPPAGE_DIVISOR, SWAP_VENUE_LABELS, type SwapVenueId } from "@kawase/config";
import type {
  CrossChainApproveResponse,
  CrossChainChainView,
  CrossChainDraftView,
  CrossChainIntent,
  CrossChainProvider,
  CrossChainRequest,
  CrossChainRouteView,
  CrossChainStage,
  ContactChain,
  ElsewhereView,
  UnsignedTransaction,
} from "@kawase/api-client";
import { CONTACT_CHAINS } from "@kawase/api-client";
import { approvals, intentDrafts, intents, newId, txAttempts, type Db } from "@kawase/db";
import { checkBridgeCalls, forwardDelivered, type BridgeDestination } from "@kawase/integrations-app-kit";
import {
  acrossQuote,
  acrossStatus,
  checkAcrossCalls,
  checkDebridgeCalls,
  checkGasZipCalls,
  checkSocketCalls,
  gasZipQuote,
  gasZipStatus,
  SOCKET_NATIVE,
  socketQuote,
  socketStatus,
  checkLifiCalls,
  checkPermit2Approval,
  checkRelayCalls,
  checkRelayPermit,
  checkRelayPermit2,
  DEBRIDGE_NATIVE,
  debridgeQuote,
  debridgeStatus,
  LIFI_NATIVE,
  lifiQuote,
  lifiStatus,
  relayContracts,
  relayQuote,
  relayStatus,
  submitRelayPermit,
  type BridgeCall,
  type RelayPermit,
} from "@kawase/integrations-bridges";
import { encodeSelfBatch, isWalletSetUp } from "@kawase/integrations-delegation";
import {
  CONVERT_VENUES,
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
import { evaluateCrossChain, type CrossChainEvaluation, type CrossChainFacts, type PolicyResult, type RecipientFacts } from "@kawase/policy";

import type { BridgeEngine } from "../bridge/engine";
import { capabilityView } from "../capabilities/service";
import { HTTP, problem } from "../http/problem";
import { pausedAll } from "../safety/settings";
import { withCredit, type BundlePart } from "../intents/bundle";
import { jsonSafe, nextAttemptNo, refusedBeforeSending, walletGasPrice, type Tx } from "../intents/chain";
import type { Recipients } from "../send/recipients";
import { VenueRefused, type SwapVenues } from "../swap/venues";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains, NetworkClients } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { arcAsset, assetView, counterpartOnArc, counterpartThere, isBlocked, NATIVE_SYMBOLS, remoteAsset, type MoveAsset } from "./assets";

type IntentRow = typeof intents.$inferSelect;
type DraftRow = typeof intentDrafts.$inferSelect;
type AttemptRow = typeof txAttempts.$inferSelect;
/**
 * `credit`: USDC base units an earlier call in the same batch delivers first (a withdrawal's conversion), counted as
 * held. Only the server sets it, for a batched step (intents/bundle.ts); on chain the batch is all or nothing.
 */
type StoredRequest = Required<{ [K in keyof CrossChainRequest]: Exclude<CrossChainRequest[K], undefined> }> & { credit?: string | null };
type DraftPayload = { draft: StoredCrossChainDraft | null; view: CrossChainDraftView | null };
type PolicyReport = { results: PolicyResult[]; blocking: PolicyResult | null };
/** Where the origin transaction is: the Arc batch, a transaction on the other chain, or a permit Relay executes. */
type Origin = "arc" | "source" | "permit";
type Track = { requestId?: string | null; orderId?: string | null; tool?: string | null; quoteId?: string | null };
/** Routes quoted beyond the five the draft format knows; see `registered`. */
type ExtraProvider = "socket" | "gaszip";
type Provider = CrossChainProvider | ExtraProvider;
type Progress = Track & { provider: Provider; origin?: Origin; status?: string; fillTx?: string | null; received?: string | null };
type Quote = {
  provider: Provider;
  /** Base units of `output` that would arrive, and the least. */
  received: bigint | null;
  minReceived: bigint | null;
  etaSeconds: number | null;
  reason: CrossChainRouteView["reason"];
  output: MoveAsset;
  /** A flat fee in the origin's native coin, paid on top (deBridge). */
  nativeFee: bigint;
  /** That fee in `output`'s units, for ranking. */
  extraCost: bigint;
  via: string | null;
  steps: string[];
  convert: { venue: SwapVenueId; minOut: bigint } | null;
  /** In, from the chain's own coin: the gas the source transaction costs there. */
  sourceGas: bigint | null;
  /** Bring to Arc with a token not yet approved to Permit2 there: that approval's gas first, in the chain's coin. */
  approval: { coin: string; gas: bigint } | null;
};
type Built =
  | { kind: "batch"; calls: BridgeCall[]; track: Track }
  | { kind: "source"; call: BridgeCall; track: Track }
  /** The first of a two-step Bring to Arc: the token's Permit2 approval, one transaction on the other chain. */
  | { kind: "approval"; call: BridgeCall; track: Track }
  | { kind: "permit"; permit: RelayPermit; requestId: string }
  | { changed: true };

const ZERO = 0n;
const ONE = 1n;
const PERCENT = 100n;
const USDC_DECIMALS = decimalsOf("USDC");
const SHOWN_ROUTES = 3;
/** An ERC-20 `approve` on the source chain (~46k measured; room for tokens that do more). */
const PERMIT2_APPROVAL_GAS = 80_000n;
const NATIVE_DECIMALS = 18;
/** How long the first of two steps (the approval there) is waited for before the signature is asked. */
const APPROVAL_WAIT_MS = 120_000;
const TRACK_POLL_MS = 3_000;
const TRACK_POLL_ATTEMPTS = 120;
const ERROR_MAX = 140;
const QUOTE_TIMEOUT_MS = 6_000;
/** Aggregators answer more slowly than a single bridge. */
const AGGREGATOR_TIMEOUT_MS = 15_000;
/** App Kit's CCTP estimate simulates the burn and reads Circle's fees: 6.2–6.8 s on Arc Testnet (measured 10-02). */
const CCTP_QUOTE_TIMEOUT_MS = 15_000;
const NO_QUOTE = -1n;
/** Arc's native USDC transfers (and the native leg of every ERC-20 USDC transfer) are logged from this address. */
const ARC_NATIVE_LOGGER = "0xfffffffffffffffffffffffffffffffffffffffe";
const TRUST: Record<Provider, CrossChainRouteView["trust"]> = { cctp: "burn_mint", across: "solver", relay: "solver", lifi: "solver", debridge: "solver", socket: "solver", gaszip: "solver" };
/** Gas for the Arc batch of the routes the config does not list yet (Socket's approve + exec; Gas.zip's one deposit). */
const EXTRA_BATCH_GAS: Record<ExtraProvider, bigint> = { socket: 900_000n, gaszip: 120_000n };
/** A provider the draft format can store (its index in CROSSCHAIN_PROVIDERS), so it can be chosen and executed. */
const registered = (provider: Provider): provider is CrossChainProvider => (CROSSCHAIN_PROVIDERS as readonly string[]).includes(provider);
// Read loosely so appending socket/gaszip to CROSSCHAIN_PROVIDERS (without a config entry yet) still compiles and prices.
const batchGasOf = (provider: Provider): bigint => (CROSSCHAIN.batchGas as Partial<Record<Provider, bigint>>)[provider] ?? EXTRA_BATCH_GAS[provider as ExtraProvider];
const isConvertVenue = (venue: string): venue is (typeof CONVERT_VENUES)[number] => (CONVERT_VENUES as readonly string[]).includes(venue);
type ShownQuote = Quote & { provider: CrossChainProvider };
const shownRoute = (quote: Quote): quote is ShownQuote => registered(quote.provider);
const CHAIN_NAMES: Record<string, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "OP Mainnet", polygon: "Polygon", avalanche: "Avalanche" };
const BRIDGE_NAMES: Record<string, string> = { relaydepository: "Relay", relay: "Relay", across: "Across", acrossV3: "Across", polymerStandard: "Polymer", cbridge: "Celer", stargateV2: "Stargate", mayan: "Mayan", glacis: "Glacis" };
const DECIMAL = /^\d+(\.\d+)?$/;

const ms = (seconds: number) => seconds * MS_PER_SECOND;
const later = (seconds: number) => new Date(Date.now() + ms(seconds));
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const within = <T>(promise: Promise<T>, fallback: T, timeout = QUOTE_TIMEOUT_MS) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeout))]).catch(() => fallback);
const toNative = (usdc: bigint) => rescale(usdc, USDC_DECIMALS, USDC_NATIVE_DECIMALS);

const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, USDC_DECIMALS);
  return rescale(scaled, USDC_DECIMALS, USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

/** "10.5" in an asset's own decimals; more decimals than it has is not an amount. */
function parseAmount(text: string | null, decimals: number): CrossChainFacts["amount"] {
  if (!text || !text.trim()) return { status: "missing" };
  const value = text.trim();
  if (!DECIMAL.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) return { status: "invalid" };
  return { status: "ok", baseUnits: parseUnits(value, decimals) };
}

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
    private readonly assets?: AssetService | undefined,
    private readonly venues?: SwapVenues | undefined,
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

  private remote(chain: BridgeDestination): PublicClient {
    return createPublicClient({ transport: http(chain.rpcUrl, { timeout: QUOTE_TIMEOUT_MS }) });
  }

  /** What a Permit2 approval costs on that chain now, in its coin's base units (with headroom). */
  private async approvalGas(chain: BridgeDestination) {
    const fees = await this.remote(chain).estimateFeesPerGas();
    return ((fees.maxFeePerGas ?? ZERO) * PERMIT2_APPROVAL_GAS * BigInt(CROSSCHAIN.sourceGasHeadroomPercent)) / PERCENT;
  }

  private remoteBalance(chain: BridgeDestination, asset: MoveAsset, owner: Address) {
    const client = this.remote(chain);
    return asset.native ? client.getBalance({ address: owner }) : client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  }

  private arcUsdc(network: NetworkContext): MoveAsset {
    return { chainId: network.chainId, address: network.addresses.usdc, symbol: "USDC", decimals: USDC_DECIMALS, native: false, usdc: true, status: "canonical" };
  }

  /** Money at the person's own address on the other chains: USDC read directly, and (mainnet) whatever the portfolio found there. */
  async elsewhere(user: SessionUser): Promise<ElsewhereView> {
    const network = user.activeNetwork;
    const clients = this.clients(network);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    if (!wallet) return { network, chains: [] };
    const destinations = this.engine.destinations(clients.network);
    const [usdcRows, portfolio] = await Promise.all([
      Promise.all(destinations.map(async (chain) => ({ chain, balance: await within(this.remoteBalance(chain, { ...this.arcUsdc(clients.network), address: chain.usdc }, wallet), ZERO) }))),
      this.assets && clients.network.isRealMoney ? within(this.assets.portfolio(user), undefined, AGGREGATOR_TIMEOUT_MS) : Promise.resolve(undefined),
    ]);
    const chains: ElsewhereView["chains"] = usdcRows
      .filter((row) => row.balance > ZERO)
      .map((row) => ({ ...this.chainView(clients.network, row.chain), asset: "USDC", balance: row.balance.toString(), address: row.chain.usdc, decimals: USDC_DECIMALS, usd: Number(formatUnits(row.balance, USDC_DECIMALS)) }));
    for (const holding of portfolio?.otherChains ?? []) {
      const chain = destinations.find((entry) => entry.chainId === holding.token.chainId);
      if (!chain || holding.hidden || same(holding.token.address, chain.usdc) || BigInt(holding.balance) === ZERO) continue;
      chains.push({ ...this.chainView(clients.network, chain), asset: holding.token.symbol, balance: holding.balance, address: holding.token.address, decimals: holding.token.decimals, usd: holding.valueUsd });
    }
    return { network, chains };
  }

  // ── Drafting ────────────────────────────────────────────────────────────────────────────────────────────────

  async create(user: SessionUser, request: CrossChainRequest, origin: { surface: "app" | "chat" | "voice"; threadId?: string | undefined }, options: { credit?: bigint } = {}) {
    const stored = normalise(options.credit ? { ...empty(), credit: options.credit.toString() } : empty(), request);
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

  /** A quote that did not happen, with why. */
  private none(provider: Provider, output: MoveAsset, reason: CrossChainRouteView["reason"]): Quote {
    return { provider, received: null, minReceived: null, etaSeconds: null, reason, output, nativeFee: ZERO, extraCost: ZERO, via: null, steps: [], convert: null, sourceGas: null, approval: null };
  }

  private failed(provider: Provider, output: MoveAsset, error: unknown): Quote {
    const code = (error as { code?: string }).code;
    return this.none(provider, output, code === "amount_too_low" ? "amount_too_low" : code === "timeout" ? "timeout" : "no_quote");
  }

  /** A flat fee in Arc's native USDC (18 decimals), in `output`'s units at its price. */
  private feeIn(output: MoveAsset, nativeFee: bigint) {
    if (nativeFee === ZERO) return ZERO;
    const usd = Number(formatUnits(nativeFee, USDC_NATIVE_DECIMALS));
    if (output.usdc) return feeInUsdc(nativeFee);
    if (!output.priceUsd) return ZERO;
    return parseUnits((usd / output.priceUsd).toFixed(output.decimals), output.decimals);
  }

  /** The USDC routes out of Arc for exactly `amount` (6 decimals), with `convert` set when a swap comes first. */
  private usdcOut(input: { network: NetworkContext; client: NetworkClients["client"]; chain: BridgeDestination; wallet: Address; recipient: Address; amount: bigint; convert: Quote["convert"]; credit?: bigint | undefined }): Promise<Quote>[] {
    const { network, chain, wallet, recipient, amount, convert } = input;
    const testnet = !network.isRealMoney;
    const output: MoveAsset = { chainId: chain.chainId, address: chain.usdc, symbol: "USDC", decimals: USDC_DECIMALS, native: false, usdc: true, status: "remote" };
    const base = (provider: CrossChainProvider, received: bigint, minReceived: bigint, etaSeconds: number | null, extra: Partial<Quote> = {}): Quote => ({ ...this.none(provider, output, null), received, minReceived, etaSeconds, convert, ...extra });
    const cctp = within(
      this.engine.estimate({ network, client: withCredit(input.client, network.addresses.usdc, wallet, input.credit ?? ZERO), from: wallet, destination: chain, recipient, amount: formatUnits(amount, USDC_DECIMALS) }).then((estimate) => {
        const received = amount > estimate.maxFee ? amount - estimate.maxFee : ZERO;
        return base("cctp", received, received, null);
      }),
      this.failed("cctp", output, { code: "timeout" }),
      CCTP_QUOTE_TIMEOUT_MS,
    ).catch((error: unknown) => this.failed("cctp", output, error));
    if (testnet) return [cctp, ...(["across", "relay"] as const).map((provider) => Promise.resolve(this.none(provider, output, "not_on_arc_testnet")))];
    const across = within(
      acrossQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: network.addresses.usdc, outputToken: chain.usdc, amount, depositor: wallet, recipient }).then((quote) => base("across", quote.outputAmount, quote.minOutputAmount, quote.fillSeconds)),
      this.failed("across", output, { code: "timeout" }),
    ).catch((error: unknown) => this.failed("across", output, error));
    const relay = within(
      relayQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, originCurrency: network.addresses.usdc, destinationCurrency: chain.usdc, amount, user: wallet, recipient }).then((quote) => base("relay", quote.outputAmount, quote.outputAmount, quote.fillSeconds)),
      this.failed("relay", output, { code: "timeout" }),
    ).catch((error: unknown) => this.failed("relay", output, error));
    return [cctp, across, relay];
  }

  /** Socket's best route out of Arc for `from` → `to` (its 20 bps already netted in what arrives). */
  private socketOut(input: { network: NetworkContext; chain: BridgeDestination; wallet: Address; recipient: Address; from: MoveAsset; to: MoveAsset; amount: bigint }): Promise<Quote> {
    const { network, chain, wallet, recipient, from, to, amount } = input;
    if (!network.isRealMoney) return Promise.resolve(this.none("socket", to, "not_on_arc_testnet"));
    const slippageBps = from.usdc && to.usdc ? CROSSCHAIN.stableSlippageBps : CROSSCHAIN.volatileSlippageBps;
    const quote = socketQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: from.address as Address, outputToken: to.native ? SOCKET_NATIVE : (to.address as Address), amount, user: wallet, receiver: recipient, slippageBps }).then(
      (route): Quote => ({ ...this.none("socket", to, null), received: route.outputAmount, minReceived: route.minOutputAmount, etaSeconds: route.etaSeconds, via: route.via }),
    );
    return within(quote, this.failed("socket", to, { code: "timeout" }), AGGREGATOR_TIMEOUT_MS).catch((error: unknown) => this.failed("socket", to, error));
  }

  /** Gas.zip: USDC on Arc → the gas coin of `chain` (ETH, POL, AVAX), one native-value deposit. */
  private gasZipOut(input: { network: NetworkContext; chain: BridgeDestination; wallet: Address; recipient: Address; to: MoveAsset; amount: bigint }): Promise<Quote> {
    const { network, chain, wallet, recipient, to, amount } = input;
    if (!network.isRealMoney) return Promise.resolve(this.none("gaszip", to, "not_on_arc_testnet"));
    const quote = gasZipQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, amountWei: toNative(amount), from: wallet, to: recipient }).then(
      // Gas.zip delivers what it quotes (no slippage on its side), so the least equals the expected.
      (quoted): Quote => ({ ...this.none("gaszip", to, null), received: quoted.outputAmount, minReceived: quoted.outputAmount, etaSeconds: quoted.etaSeconds }),
    );
    return within(quote, this.failed("gaszip", to, { code: "timeout" })).catch((error: unknown) => this.failed("gaszip", to, error));
  }

  /** An aggregator route out of Arc for `from` → `to` (LI.FI or deBridge). */
  private aggregatorOut(provider: "lifi" | "debridge", input: { network: NetworkContext; chain: BridgeDestination; wallet: Address; recipient: Address; from: MoveAsset; to: MoveAsset; amount: bigint }): Promise<Quote> {
    const { network, chain, wallet, recipient, from, to, amount } = input;
    if (!network.isRealMoney) return Promise.resolve(this.none(provider, to, "not_on_arc_testnet"));
    const slippageBps = from.usdc && to.usdc ? CROSSCHAIN.stableSlippageBps : CROSSCHAIN.volatileSlippageBps;
    const quote =
      provider === "lifi"
        ? lifiQuote({ fromChainId: network.chainId, toChainId: chain.chainId, fromToken: from.address as Address, toToken: to.address as Address, amount, from: wallet, to: recipient, slippageBps }).then(
            (quoted): Quote => ({ ...this.none("lifi", to, null), received: quoted.outputAmount, minReceived: quoted.minOutputAmount, etaSeconds: quoted.fillSeconds, via: BRIDGE_NAMES[quoted.tool] ?? quoted.tool, steps: quoted.steps }),
          )
        : debridgeQuote({ srcChainId: network.chainId, srcToken: from.usdc ? DEBRIDGE_NATIVE : (from.address as Address), amount: from.usdc ? toNative(amount) : amount, dstChainId: chain.chainId, dstToken: to.address as Address, recipient, authority: wallet }).then(
            (quoted): Quote => ({ ...this.none("debridge", to, null), received: quoted.outputAmount, minReceived: quoted.outputAmount, etaSeconds: quoted.fillSeconds, nativeFee: quoted.fixFee, extraCost: this.feeIn(to, quoted.fixFee) }),
          );
    return within(quote, this.failed(provider, to, { code: "timeout" }), AGGREGATOR_TIMEOUT_MS).catch((error: unknown) => this.failed(provider, to, error));
  }

  /** Kawase's own plan when nothing carries the asset as itself: the Arc swap to USDC and a USDC bridge, one batch. */
  private async convertFirst(input: { network: NetworkContext; client: NetworkClients["client"]; chain: BridgeDestination; wallet: Address; recipient: Address; from: MoveAsset; amount: bigint }): Promise<Quote[]> {
    if (!this.venues) return [];
    const { network, client, wallet, from, amount } = input;
    const swapped = await within(
      this.venues.quoteAll({ network, client: client as PublicClient, from: wallet, tokenIn: from.address as Address, tokenOut: network.addresses.usdc, amountIn: amount, decimalsIn: from.decimals, decimalsOut: USDC_DECIMALS, slippageBps: CROSSCHAIN.volatileSlippageBps }, CONVERT_VENUES),
      { quotes: [], failures: [] },
      AGGREGATOR_TIMEOUT_MS,
    );
    const best = swapped.quotes[0];
    if (!best || best.minOut === ZERO || !isConvertVenue(best.venue)) return [];
    // The bridge is quoted before the swap's USDC exists: its guaranteed minimum is counted as held.
    return Promise.all(this.usdcOut({ ...input, amount: best.minOut, convert: { venue: best.venue, minOut: best.minOut }, credit: best.minOut }));
  }

  private async quotesOut(input: { network: NetworkContext; client: NetworkClients["client"]; chain: BridgeDestination; wallet: Address; recipient: Address; from: MoveAsset; to: MoveAsset | undefined; amount: bigint; credit?: bigint | undefined }): Promise<Quote[]> {
    const { from, to } = input;
    const usdcThere: MoveAsset = { chainId: input.chain.chainId, address: input.chain.usdc, symbol: "USDC", decimals: USDC_DECIMALS, native: false, usdc: true, status: "remote" };
    // Gas for the other chain: its own coin, from USDC.
    if (from.usdc && to?.native) {
      return Promise.all([this.gasZipOut({ ...input, to }), this.aggregatorOut("lifi", { ...input, to }), this.socketOut({ ...input, to })]);
    }
    if (from.usdc) {
      return Promise.all([...this.usdcOut({ ...input, convert: null }), this.aggregatorOut("lifi", { ...input, to: usdcThere }), this.aggregatorOut("debridge", { ...input, to: usdcThere }), this.socketOut({ ...input, to: usdcThere })]);
    }
    // As itself first; USDC (an aggregator's own swap, or convert-first) when nothing carries it.
    if (to && !to.usdc) {
      const direct = await Promise.all([this.aggregatorOut("lifi", { ...input, to }), this.aggregatorOut("debridge", { ...input, to }), this.socketOut({ ...input, to })]);
      if (direct.some((quote) => quote.received !== null && quote.reason === null)) return direct;
    }
    const [lifi, debridge, converted] = await Promise.all([this.aggregatorOut("lifi", { ...input, to: usdcThere }), this.aggregatorOut("debridge", { ...input, to: usdcThere }), this.convertFirst(input)]);
    return [...converted, lifi, debridge];
  }

  private async quotesIn(input: { network: NetworkContext; chain: BridgeDestination; wallet: Address; from: MoveAsset; to: MoveAsset; amount: bigint }): Promise<Quote[]> {
    const { network, chain, wallet, from, to, amount } = input;
    if (!network.isRealMoney) return [this.none("relay", to, "not_on_arc_testnet")];
    if (from.native) {
      // The chain's own coin: one transaction there, its gas paid from the same coin.
      const quote = await within(
        lifiQuote({ fromChainId: chain.chainId, toChainId: network.chainId, fromToken: LIFI_NATIVE, toToken: to.address as Address, amount, from: wallet, to: wallet, slippageBps: CROSSCHAIN.volatileSlippageBps }).then((quoted): Quote => {
          // Whether the coin also covers this gas is the policy's to say (it names the amount to keep).
          const gas = ((quoted.gasCost ?? ZERO) * BigInt(CROSSCHAIN.sourceGasHeadroomPercent)) / PERCENT;
          return { ...this.none("lifi", to, null), received: quoted.outputAmount, minReceived: quoted.minOutputAmount, etaSeconds: quoted.fillSeconds, via: BRIDGE_NAMES[quoted.tool] ?? quoted.tool, steps: quoted.steps, sourceGas: gas };
        }),
        this.failed("lifi", to, { code: "timeout" }),
        AGGREGATOR_TIMEOUT_MS,
      ).catch((error: unknown) => this.failed("lifi", to, error));
      return [quote];
    }
    // A token: Relay's signature (EIP-3009 for USDC; Permit2 for others). A token not yet approved to Permit2 there comes
    // in two steps: that approval (one transaction there, its gas in the chain's coin), then the signature.
    const relay = await within(
      relayQuote({ originChainId: chain.chainId, destinationChainId: network.chainId, originCurrency: from.address as Address, destinationCurrency: to.address as Address, amount, user: wallet, recipient: wallet, usePermit: true }).then(async (quote): Promise<Quote> => {
        const approveFirst = Boolean(quote.permit) && quote.calls.length > 0 && checkPermit2Approval(quote.calls, { token: from.address as Address, amount });
        const approval = approveFirst ? { coin: NATIVE_SYMBOLS[chain.chainId] ?? "ETH", gas: await this.approvalGas(chain) } : null;
        const reason = quote.permit && (quote.calls.length === 0 || approveFirst) ? null : "needs_source_gas";
        return { ...this.none("relay", to, reason), received: quote.outputAmount, minReceived: quote.outputAmount, etaSeconds: quote.fillSeconds, approval };
      }),
      this.failed("relay", to, { code: "timeout" }),
    ).catch((error: unknown) => this.failed("relay", to, error));
    // Across and CCTP start with a transaction on the other chain, which needs its gas: offered once Kawase can sponsor it.
    return from.usdc ? [relay, this.none("across", to, "needs_source_gas"), this.none("cctp", to, "needs_source_gas")] : [relay];
  }

  private async evaluate(user: SessionUser, intent: IntentRow, request: StoredRequest) {
    const network: NetworkId = intent.network;
    const other: NetworkId = network === "testnet" ? "mainnet" : "testnet";
    const clients = this.chains.get(network);
    const view = await capabilityView(this.db, this.chains.available);
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const direction: "in" | "out" = request.direction === "in" ? "in" : "out";
    const outbound = direction === "out";
    const wantUsdc = request.toAsset?.trim().toLowerCase() === "usdc";

    let setUp = false;
    let balance = ZERO;
    let usdcBalance = ZERO;
    let chain: BridgeDestination | undefined;
    let chainState: "found" | "missing" | "unknown" = "missing";
    let recipientFacts: RecipientFacts | { status: "own" } = { status: "own" };
    let recipient: Address | undefined = wallet;
    let recipientLabel: string | null = null;
    let from: MoveAsset | "unknown" | undefined;
    let to: MoveAsset | undefined;
    if (clients && wallet) {
      const named = outbound ? request.destination : request.source;
      chain = this.findChain(clients.network, named);
      if (!outbound && !named) {
        // Bring to Arc from wherever the money is: the chain holding the most of the asked asset at this address.
        const found = await this.elsewhere(user);
        const asked = (request.asset ?? "USDC").toLowerCase();
        const richest = found.chains.filter((entry) => entry.asset.toLowerCase() === asked).sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1))[0];
        chain = richest ? this.findChain(clients.network, richest.key) : undefined;
      }
      chainState = chain ? "found" : named ? "unknown" : "missing";
      const [code, usdc] = await Promise.all([
        clients.client.getCode({ address: wallet }),
        clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
      ]);
      setUp = isWalletSetUp(code);
      // A batched step spends USDC an earlier call in the same transaction delivers.
      usdcBalance = usdc + (outbound ? BigInt(request.credit ?? "0") : ZERO);
      if (outbound) {
        from = await arcAsset(clients.network, clients.client as PublicClient, this.assets?.directory, request.asset);
        if (from !== "unknown") {
          balance = from.usdc ? usdcBalance : await clients.client.readContract({ address: from.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
          const gasCoin = chain ? NATIVE_SYMBOLS[chain.chainId] : undefined;
          const wantGas = Boolean(from.usdc && gasCoin && request.toAsset?.trim().toLowerCase() === gasCoin.toLowerCase());
          if (chain && wantGas) to = { chainId: chain.chainId, address: zeroAddress, symbol: gasCoin!, decimals: NATIVE_DECIMALS, native: true, usdc: false, status: "remote" };
          else if (chain) to = from.usdc || wantUsdc ? { chainId: chain.chainId, address: chain.usdc, symbol: "USDC", decimals: USDC_DECIMALS, native: false, usdc: true, status: "remote" } : await counterpartThere(chain, from);
        }
        if (request.recipient) {
          // A contact's address on the destination chain, when they have one (A5); their Arc one otherwise.
          const resolution = await this.recipients.resolve({ id: user.id, walletAddress: wallet }, network, request.recipient, contactChain(chain?.id));
          recipientFacts = resolution.facts.status === "self" ? { status: "own" } : resolution.facts;
          if (resolution.facts.status === "resolved") {
            recipient = getAddress(resolution.facts.address);
            recipientLabel = resolution.view?.name ?? resolution.view?.handle ?? null;
          }
        }
      } else if (chain) {
        from = await remoteAsset(chain, request.asset);
        if (from !== "unknown") {
          balance = await within(this.remoteBalance(chain, from, wallet), ZERO);
          to = from.usdc || wantUsdc ? this.arcUsdc(clients.network) : (counterpartOnArc(clients.network, from) ?? this.arcUsdc(clients.network));
        }
      }
    }
    const asset = from && from !== "unknown" ? from : undefined;
    const amount = asset ? parseAmount(request.amount, asset.decimals) : request.amount ? ({ status: "invalid" } as const) : ({ status: "missing" } as const);

    let quotes: Quote[] = [];
    const canQuote = clients && wallet && chain && recipient && asset && !isBlocked(asset) && amount.status === "ok" && amount.baseUnits > ZERO && (recipientFacts.status === "own" || recipientFacts.status === "resolved");
    if (canQuote) {
      quotes = outbound
        ? await this.quotesOut({ network: clients.network, client: clients.client, chain: chain!, wallet, recipient: recipient!, from: asset, to, amount: amount.baseUnits, credit: BigInt(request.credit ?? "0") })
        : await this.quotesIn({ network: clients.network, chain: chain!, wallet, from: asset, to: to!, amount: amount.baseUnits });
    }
    const net = (quote: Quote) => (quote.received === null ? NO_QUOTE : quote.received - quote.extraCost);
    const executable = quotes.filter((quote) => quote.received !== null && quote.reason === null && registered(quote.provider));
    const ranked = [...executable].sort((a, b) => (net(b) > net(a) ? 1 : net(b) < net(a) ? -1 : (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity)));
    const chosen = ranked.find((quote) => quote.provider === request.route) ?? ranked[0];
    // Two steps in: the approval's gas is paid in the chain's coin, which the person must hold there.
    const coinThere = chosen?.approval && chain && wallet ? await within(this.remote(chain).getBalance({ address: wallet }), ZERO) : undefined;

    const evaluation = evaluateCrossChain({
      network,
      capability: { here: view.bridge[network].state, other: view.bridge[other].state },
      signedIn: !user.isAnonymous,
      pausedAll: await pausedAll(this.db, user.id),
      direction,
      wallet: { registered: Boolean(wallet), setUp },
      chain: chainState,
      recipient: recipientFacts,
      asset: from === "unknown" ? { status: "unknown", name: request.asset ?? "" } : asset && isBlocked(asset) ? { status: "blocked", symbol: asset.symbol } : { status: "found", symbol: asset?.symbol ?? "USDC", decimals: asset?.decimals ?? USDC_DECIMALS, usdc: asset?.usdc ?? true },
      amount,
      balance,
      gasFloat: GAS_FLOAT_USDC_BASE_UNITS,
      usdc: usdcBalance,
      nativeFee: chosen && outbound ? feeInUsdc(chosen.nativeFee) : ZERO,
      sourceGas: chosen && !outbound ? (chosen.sourceGas ?? undefined) : undefined,
      sourceCoin: chosen?.approval && coinThere !== undefined ? { symbol: chosen.approval.coin, decimals: NATIVE_DECIMALS, balance: coinThere, needed: chosen.approval.gas } : undefined,
      route: canQuote ? (chosen ? { status: "ok" } : { status: "none", reason: quotes.find((quote) => quote.reason)?.reason ?? "no_quote" }) : { status: "not_requested" },
    });
    return { wallet, clients, direction, chain, recipient, recipientLabel, asset, amount, quotes, ranked, chosen, evaluation };
  }

  private async draft(user: SessionUser, intent: IntentRow, request: StoredRequest, createdBy: "user" | "agent" | "system") {
    const fresh = await this.evaluate(user, intent, request);
    const { wallet, clients, direction, chain, recipient, recipientLabel, asset, amount, quotes, ranked, chosen, evaluation } = fresh;
    let draft: CrossChainDraft | null = null;
    let view: CrossChainDraftView | null = null;
    if (wallet && clients && chain && recipient && asset && chosen && chosen.minReceived !== null && amount.status === "ok") {
      const outbound = direction === "out";
      const sourceTx = !outbound && chosen.provider === "lifi";
      let fee = ZERO;
      if (outbound) {
        const { maxFeePerGas } = await walletGasPrice(clients.client);
        const gas = batchGasOf(chosen.provider) + (chosen.convert ? CROSSCHAIN.convertGas : ZERO);
        fee = ((gas * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT) * maxFeePerGas;
      } else if (sourceTx) fee = chosen.sourceGas ?? ZERO;
      // The first of two steps is paid there, in its coin: the version bounds it.
      else if (chosen.approval) fee = chosen.approval.gas;
      draft = {
        originChainId: outbound ? clients.network.chainId : chain.chainId,
        destinationChainId: outbound ? chain.chainId : clients.network.chainId,
        from: wallet,
        token: asset.native ? zeroAddress : (asset.address as Address),
        amount: amount.baseUnits,
        recipient,
        outputToken: chosen.output.address as Address,
        minReceived: chosen.minReceived,
        provider: (CROSSCHAIN_PROVIDERS as readonly string[]).indexOf(chosen.provider),
        nativeFee: chosen.nativeFee,
        swapMinOut: chosen.convert?.minOut ?? ZERO,
        swapVenue: chosen.convert ? CONVERT_VENUES.indexOf(chosen.convert.venue) : 0,
        maxFee: fee * MAX_FEE_DRAFT_MULTIPLIER,
      };
      const shown = [...ranked, ...quotes.filter((quote) => !ranked.includes(quote))].filter(shownRoute).slice(0, SHOWN_ROUTES);
      view = {
        direction,
        asset: asset.symbol,
        amount: amount.baseUnits.toString(),
        input: assetView(asset),
        output: assetView(chosen.output),
        source: outbound ? this.chainView(clients.network, "arc") : this.chainView(clients.network, chain),
        destination: outbound ? this.chainView(clients.network, chain) : this.chainView(clients.network, "arc"),
        recipient: { address: recipient, label: recipientLabel, own: same(recipient, wallet) },
        routes: shown.map((quote) => ({
          provider: quote.provider,
          received: quote.received?.toString() ?? null,
          // A fee in the asset itself only means something when the same asset arrives.
          fee: quote.received !== null && same(quote.output.symbol, asset.symbol) && quote.output.decimals === asset.decimals && !quote.convert ? (amount.baseUnits - quote.received).toString() : null,
          extraCost: quote.extraCost.toString(),
          net: quote.received !== null ? (quote.received - quote.extraCost).toString() : null,
          etaSeconds: quote.etaSeconds,
          executable: quote.received !== null && quote.reason === null,
          trust: TRUST[quote.provider],
          reason: quote.reason,
          output: assetView(quote.output),
          via: quote.via,
          steps: quote.steps,
          nativeFee: quote.nativeFee > ZERO ? quote.nativeFee.toString() : null,
          convertFirst: quote.convert ? { venue: SWAP_VENUE_LABELS[quote.convert.venue], minUsdc: quote.convert.minOut.toString() } : null,
          approveFirst: quote.approval ? { coin: quote.approval.coin, gas: quote.approval.gas.toString() } : null,
        })),
        chosen: chosen.provider as CrossChainProvider,
        minReceived: chosen.minReceived.toString(),
        // Gas the wallet pays on Arc, in USDC; a move that starts on another chain pays there, in its coin.
        networkFee: outbound ? feeInUsdc(fee).toString() : "0",
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

  /** The USDC bridge's calls out of Arc for exactly `amount`, checked (also the second half of convert-first). */
  private async bridgeUsdc(provider: CrossChainProvider, draft: CrossChainDraft, network: NetworkContext, client: NetworkClients["client"], chain: BridgeDestination, amount: bigint): Promise<{ calls: BridgeCall[]; track: Track } | { changed: true }> {
    const usdc = network.addresses.usdc;
    if (provider === "across") {
      const quote = await acrossQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: usdc, outputToken: chain.usdc, amount, depositor: draft.from, recipient: draft.recipient });
      if (quote.minOutputAmount < draft.minReceived) return { changed: true };
      const check = checkAcrossCalls(quote.calls, { spokePool: quote.spokePool, depositor: draft.from, recipient: draft.recipient, inputToken: usdc, outputToken: chain.usdc, amount, minOutput: draft.minReceived, destinationChainId: chain.chainId });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: quote.calls, track: {} };
    }
    if (provider === "relay") {
      const quote = await relayQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, originCurrency: usdc, destinationCurrency: chain.usdc, amount, user: draft.from, recipient: draft.recipient });
      if (quote.outputAmount < draft.minReceived) return { changed: true };
      const check = checkRelayCalls(quote.calls, { depositories: await relayContracts(network.chainId), depositor: draft.from, token: usdc, amount });
      if (!check.ok) throw this.refused(provider, check.reason);
      // The fill is followed by Relay's request id, kept with the attempt.
      return { calls: quote.calls, track: { requestId: quote.requestId } };
    }
    if (provider === "cctp") {
      const calls = await this.engine.prepare({ network, client, from: draft.from, destination: chain, recipient: draft.recipient, amount: formatUnits(amount, USDC_DECIMALS) });
      const check = checkBridgeCalls(network, calls, { usdc, amount, recipient: draft.recipient, domain: chain.domain, maxFee: amount > draft.minReceived ? amount - draft.minReceived : ZERO });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: calls.map((call) => ({ to: call.to, data: call.data ?? "0x", value: call.value ?? ZERO })), track: {} };
    }
    return this.aggregatorCalls(provider, draft, network, chain, { address: usdc, usdc: true }, amount);
  }

  /** LI.FI's or deBridge's calls out of Arc for exactly `amount` of `token`, checked. */
  private async aggregatorCalls(provider: CrossChainProvider, draft: CrossChainDraft, network: NetworkContext, chain: BridgeDestination, token: { address: Address; usdc: boolean }, amount: bigint): Promise<{ calls: BridgeCall[]; track: Track } | { changed: true }> {
    if (provider === "lifi") {
      const slippageBps = token.usdc && same(draft.outputToken, chain.usdc) ? CROSSCHAIN.stableSlippageBps : CROSSCHAIN.volatileSlippageBps;
      const quote = await lifiQuote({ fromChainId: network.chainId, toChainId: chain.chainId, fromToken: token.address, toToken: draft.outputToken, amount, from: draft.from, to: draft.recipient, slippageBps, priority: "execute" });
      if (quote.minOutputAmount < draft.minReceived) return { changed: true };
      const check = checkLifiCalls(quote.calls, { chainId: network.chainId, token: token.address, amount, recipient: draft.recipient, destinationChainId: chain.chainId });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: quote.calls, track: { tool: quote.tool } };
    }
    if (provider === "debridge") {
      const srcToken = token.usdc ? DEBRIDGE_NATIVE : token.address;
      const srcAmount = token.usdc ? toNative(amount) : amount;
      const quote = await debridgeQuote({ srcChainId: network.chainId, srcToken, amount: srcAmount, dstChainId: chain.chainId, dstToken: draft.outputToken, recipient: draft.recipient, authority: draft.from });
      if (quote.outputAmount < draft.minReceived || quote.fixFee !== draft.nativeFee) return { changed: true };
      const check = checkDebridgeCalls(quote.calls, { token: srcToken, amount: srcAmount, fixFee: quote.fixFee, recipient: draft.recipient, destinationChainId: chain.chainId });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: quote.calls, track: { orderId: quote.orderId } };
    }
    if ((provider as Provider) === "socket") {
      const slippageBps = token.usdc && same(draft.outputToken, chain.usdc) ? CROSSCHAIN.stableSlippageBps : CROSSCHAIN.volatileSlippageBps;
      const route = await socketQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, inputToken: token.address, outputToken: same(draft.outputToken, zeroAddress) ? SOCKET_NATIVE : draft.outputToken, amount, user: draft.from, receiver: draft.recipient, slippageBps, fresh: true });
      if (route.minOutputAmount < draft.minReceived) return { changed: true };
      const check = checkSocketCalls(route.calls, { token: token.address, amount, receiver: draft.recipient, expiresAt: route.expiresAt });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { calls: route.calls, track: { quoteId: route.quoteId } };
    }
    throw this.refused(provider, "not_an_aggregator");
  }

  private async build(draft: CrossChainDraft, network: NetworkContext, client: NetworkClients["client"], chain: BridgeDestination, credit = ZERO): Promise<Built> {
    const provider = CROSSCHAIN_PROVIDERS[draft.provider]!;
    if (draft.originChainId !== network.chainId) {
      if (provider === "lifi") {
        // The chain's own coin, one transaction there.
        const quote = await lifiQuote({ fromChainId: chain.chainId, toChainId: network.chainId, fromToken: LIFI_NATIVE, toToken: draft.outputToken, amount: draft.amount, from: draft.from, to: draft.recipient, slippageBps: CROSSCHAIN.volatileSlippageBps, priority: "execute" });
        if (quote.minOutputAmount < draft.minReceived) return { changed: true };
        const check = checkLifiCalls(quote.calls, { chainId: chain.chainId, token: LIFI_NATIVE, amount: draft.amount, recipient: draft.recipient, destinationChainId: network.chainId });
        if (!check.ok) throw this.refused(provider, check.reason);
        return { kind: "source", call: quote.calls[0]!, track: { tool: quote.tool } };
      }
      // Relay's signature: USDC's ReceiveWithAuthorization, or a Permit2 transfer for any other token.
      const quote = await relayQuote({ originChainId: chain.chainId, destinationChainId: network.chainId, originCurrency: draft.token, destinationCurrency: draft.outputToken, amount: draft.amount, user: draft.from, recipient: draft.recipient, usePermit: true });
      if (quote.permit && quote.calls.length > 0) {
        // Not yet approved to Permit2 there: the first step is exactly that approval, nothing else.
        if (!checkPermit2Approval(quote.calls, { token: draft.token, amount: draft.amount })) {
          this.log.error({ provider }, "security.permit_refused");
          throw problem(HTTP.badGateway, "quote_unavailable", "the route asked for a transaction Kawase does not accept");
        }
        return { kind: "approval", call: quote.calls[0]!, track: {} };
      }
      if (!quote.permit || quote.calls.length > 0) throw problem(HTTP.badGateway, "quote_unavailable");
      if (quote.outputAmount < draft.minReceived) return { changed: true };
      const contracts = await relayContracts(chain.chainId);
      const usdcPermit = same(draft.token, chain.usdc);
      const proxy = contracts.find((address) => same(address, String(quote.permit!.typedData.message.to ?? "")));
      const ok = usdcPermit
        ? Boolean(proxy) && checkRelayPermit(quote.permit, { chainId: chain.chainId, token: chain.usdc, from: draft.from, amount: draft.amount, approvalProxy: proxy! })
        : checkRelayPermit2(quote.permit, { chainId: chain.chainId, token: draft.token, amount: draft.amount, spenders: contracts });
      if (!ok) {
        this.log.error({ provider }, "security.permit_refused");
        throw problem(HTTP.badGateway, "quote_unavailable", "the route asked for a signature Kawase does not accept");
      }
      return { kind: "permit", permit: quote.permit, requestId: quote.requestId };
    }
    if (draft.swapMinOut > ZERO) {
      // Convert first: the Arc swap (its minimum held) and the USDC bridge for exactly that minimum, one batch.
      if (!this.venues) throw this.refused(provider, "no_swap_venues");
      const venue = CONVERT_VENUES[draft.swapVenue]!;
      const decimals = await client.readContract({ address: draft.token, abi: erc20Abi, functionName: "decimals" });
      // Built at half the shown slippage, as swaps are (the build re-prices); a price that moved past the minimum is a new version.
      const prepared = await this.venues
        .prepare(venue, { network, client: client as PublicClient, from: draft.from, tokenIn: draft.token, tokenOut: network.addresses.usdc, amountIn: draft.amount, decimalsIn: decimals, decimalsOut: USDC_DECIMALS, slippageBps: CROSSCHAIN.volatileSlippageBps / SWAP_ROUTE_SLIPPAGE_DIVISOR, minOut: draft.swapMinOut })
        .catch((error: unknown) => {
          if (error instanceof VenueRefused && error.reason === "below_minimum") return undefined;
          throw error;
        });
      if (!prepared || prepared.guaranteedOut < draft.swapMinOut) return { changed: true };
      // The bridge is built while the swap's USDC has not arrived yet: counted as held (the batch is atomic).
      const bridged = await this.bridgeUsdc(provider, draft, network, withCredit(client, network.addresses.usdc, draft.from, draft.swapMinOut), chain, draft.swapMinOut);
      if ("changed" in bridged) return bridged;
      return { kind: "batch", calls: [...prepared.calls.map((call) => ({ to: call.to, data: call.data ?? "0x", value: call.value ?? ZERO })), ...bridged.calls], track: bridged.track };
    }
    const usdc = same(draft.token, network.addresses.usdc);
    if ((provider as Provider) === "gaszip") {
      // USDC → the gas coin there: one deposit carrying exactly the amount as Arc's native coin.
      const amountWei = toNative(draft.amount);
      const quote = await gasZipQuote({ originChainId: network.chainId, destinationChainId: chain.chainId, amountWei, from: draft.from, to: draft.recipient });
      if (quote.outputAmount < draft.minReceived) return { changed: true };
      const check = checkGasZipCalls(quote.calls, { originChainId: network.chainId, destinationChainId: chain.chainId, amountWei, recipient: draft.recipient, expires: quote.expires });
      if (!check.ok) throw this.refused(provider, check.reason);
      return { kind: "batch", calls: quote.calls, track: {} };
    }
    const built = usdc ? await this.bridgeUsdc(provider, draft, network, withCredit(client, network.addresses.usdc, draft.from, credit), chain, draft.amount) : await this.aggregatorCalls(provider, draft, network, chain, { address: draft.token, usdc: false }, draft.amount);
    if ("changed" in built) return built;
    return { kind: "batch", calls: built.calls, track: built.track };
  }

  /**
   * This version's part in a batch (intents/bundle.ts): the same re-check as an approval, and the exact calls it would
   * sign on Arc. A route that starts on another chain (a permit, a transaction there) cannot share a transaction on Arc.
   */
  async bundlePart(user: SessionUser, intentId: string): Promise<BundlePart | "changed" | "final"> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval" || before.expiresAt.getTime() < Date.now()) return "final";
    if (before.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch");
    const current = await this.currentDraft(before);
    const payload = current?.payload as DraftPayload | undefined;
    const changed = async () => {
      await this.redraft(user, intentId);
      return "changed" as const;
    };
    if (!current?.draftHash || !payload?.draft || !payload.view || payload.view.direction !== "out") return changed();
    const draft = loadCrossChainDraft(payload.draft);
    if (crossChainDraftHash(draft) !== current.draftHash) return changed();
    const { network, client } = this.clients(before.network);
    const chain = this.engine.destinations(network).find((entry) => entry.chainId === draft.destinationChainId);
    if (!chain || draft.originChainId !== network.chainId) return changed();
    let built: Built;
    try {
      built = await this.build(draft, network, client, chain, BigInt((before.request as StoredRequest).credit ?? "0"));
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      this.log.warn({ err: error, intentId }, "crosschain build failed");
      throw problem(HTTP.badGateway, "quote_unavailable");
    }
    if ("changed" in built) return changed();
    if (built.kind !== "batch") return "final";
    const provider = CROSSCHAIN_PROVIDERS[draft.provider]!;
    const progress: Progress = { provider, origin: "arc", ...built.track, status: "submitted" };
    return {
      intentId,
      version: before.currentDraftVersion,
      draftHash: current.draftHash as Hex,
      from: draft.from,
      chainId: draft.originChainId,
      calls: built.calls.map((call) => ({ to: call.to, data: call.data.toLowerCase() as Hex, value: call.value })),
      maxFee: draft.maxFee,
      attemptKind: "crosschain_wallet",
      attemptTo: draft.from,
      attemptReceipt: jsonSafe(progress),
    };
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

    let built: Built;
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
    if (built.kind === "permit") {
      unsigned = { kind: "permit", permit: built.permit, requestId: built.requestId };
      answer = { status: "sign_typed", typedData: built.permit.typedData };
    } else {
      // The Arc batch (to the wallet itself), or the one transaction on the other chain.
      const onArc = built.kind === "batch";
      const origin = onArc ? (client as PublicClient) : this.remote(chain);
      const target = built.kind === "batch" ? draft.from : built.call.to;
      const data = (built.kind === "batch" ? encodeSelfBatch(built.calls) : built.call.data).toLowerCase() as Hex;
      const value = built.kind === "batch" ? ZERO : built.call.value;
      try {
        await origin.call({ account: draft.from, to: target, data, value });
      } catch (error) {
        this.log.warn({ err: error, intentId }, "crosschain simulation reverted");
        throw problem(HTTP.badGateway, "simulation_failed");
      }
      const fallbackGas = onArc ? batchGasOf(CROSSCHAIN_PROVIDERS[draft.provider]!) + (draft.swapMinOut > ZERO ? CROSSCHAIN.convertGas : ZERO) : CROSSCHAIN.sourceGasFallback;
      const [nonce, price, estimate] = await Promise.all([
        origin.getTransactionCount({ address: draft.from, blockTag: "pending" }),
        onArc ? walletGasPrice(client) : origin.estimateFeesPerGas().then((fees) => ({ maxFeePerGas: fees.maxFeePerGas ?? ZERO, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? ZERO })),
        origin.estimateGas({ account: draft.from, to: target, data, value }).catch(() => fallbackGas),
      ]);
      const gas = (estimate * GAS_ESTIMATE_HEADROOM_PERCENT) / PERCENT;
      if (gas * price.maxFeePerGas > draft.maxFee) return this.redraft(user, intentId);
      const transaction: UnsignedTransaction = {
        type: "eip1559",
        chainId: onArc ? network.chainId : chain.chainId,
        nonce,
        to: target,
        data,
        value: value.toString(),
        gas: gas.toString(),
        maxFeePerGas: price.maxFeePerGas.toString(),
        maxPriorityFeePerGas: price.maxPriorityFeePerGas.toString(),
      };
      unsigned = { ...(transaction as unknown as Record<string, unknown>), kind: built.kind, track: built.track };
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
        unsignedTransaction: jsonSafe(unsigned),
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

  /** The wallet signed: the exact transaction handed out (broadcast here, on Arc or the other chain), or the permit (handed to Relay). */
  async submitSignature(user: SessionUser, intentId: string, input: { approvalId: string; signedTransaction?: Hex | undefined; signature?: Hex | undefined }): Promise<CrossChainApproveResponse> {
    const before = await this.ownIntent(user.id, intentId);
    if (before.state !== "ready_for_approval") return { status: "final", intent: await this.get(user.id, intentId) };
    const current = await this.currentDraft(before);
    const stored = (current?.payload as DraftPayload | undefined)?.draft;
    if (!stored || !current?.draftHash) return this.redraft(user, intentId);
    const draft = loadCrossChainDraft(stored);
    const provider = CROSSCHAIN_PROVIDERS[draft.provider]!;
    const context = this.clients(before.network);
    const chain = this.engine.destinations(context.network).find((entry) => entry.chainId === (draft.originChainId === context.network.chainId ? draft.destinationChainId : draft.originChainId));

    const prepared = await this.db.transaction(async (tx) => {
      const intent = await this.lockIntent(tx, user.id, intentId);
      if (intent.state !== "ready_for_approval" || intent.currentDraftVersion !== before.currentDraftVersion) return { kind: "final" as const };
      const [approval] = await tx.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, intentId)));
      if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== intent.currentDraftVersion) throw problem(HTTP.conflict, "intent_stale");
      if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
      const unsigned = approval.unsignedTransaction as Record<string, unknown>;
      let txHash: Hex | null = null;
      let progress: Progress;
      if (unsigned.kind === "permit") {
        const permit = unsigned.permit as RelayPermit;
        const valid = input.signature ? await verifyTypedData({ address: draft.from, ...(permit.typedData as unknown as TypedDataDefinition), signature: input.signature }).catch(() => false) : false;
        if (!valid) {
          this.log.warn({ intentId }, "security.permit_signature_mismatch");
          await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
          return { kind: "mismatch" as const };
        }
        progress = { provider, origin: "permit", requestId: String(unsigned.requestId), status: "submitted" };
      } else {
        const transaction = unsigned as unknown as UnsignedTransaction;
        const onArc = unsigned.kind === "batch";
        const approvalStep = unsigned.kind === "approval";
        if (!input.signedTransaction) throw problem(HTTP.badRequest, "validation", "a signed transaction is needed");
        const parsed = parseTransaction(input.signedTransaction);
        const signer = await recoverTransactionAddress({ serializedTransaction: input.signedTransaction as never }).catch(() => undefined);
        const ok =
          signer?.toLowerCase() === draft.from.toLowerCase() &&
          parsed.chainId === draft.originChainId &&
          parsed.to?.toLowerCase() === transaction.to.toLowerCase() &&
          (onArc ? parsed.to?.toLowerCase() === draft.from.toLowerCase() : true) &&
          parsed.data?.toLowerCase() === transaction.data.toLowerCase() &&
          (parsed.value ?? ZERO) === BigInt(transaction.value) &&
          (onArc || approvalStep ? (parsed.value ?? ZERO) === ZERO : (parsed.value ?? ZERO) === draft.amount) &&
          parsed.nonce === transaction.nonce &&
          (parsed.gas ?? ZERO) * (parsed.maxFeePerGas ?? ZERO) <= draft.maxFee;
        if (!ok) {
          this.log.warn({ intentId }, "security.draft_mismatch");
          await tx.update(approvals).set({ status: "rejected" }).where(eq(approvals.id, approval.id));
          return { kind: "mismatch" as const };
        }
        txHash = keccak256(input.signedTransaction);
        if (approvalStep) {
          // The first of two steps: recorded, the intent stays ready for its signature (asked as soon as this lands).
          await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
          const [attempt] = await tx
            .insert(txAttempts)
            .values({ userId: user.id, intentId, network: intent.network, chainId: draft.originChainId, attemptNo: await nextAttemptNo(tx, intentId), kind: "crosschain_approval", provider: "user_wallet", idempotencyKey: randomUUID(), fromAddress: draft.from, toAddress: transaction.to, txHash, status: "prepared" })
            .returning({ id: txAttempts.id });
          return { kind: "approval" as const, attemptId: attempt!.id };
        }
        progress = { provider, origin: onArc ? "arc" : "source", ...((unsigned.track as Track | undefined) ?? {}), status: "submitted" };
      }
      await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
      const [attempt] = await tx
        .insert(txAttempts)
        .values({
          userId: user.id,
          intentId,
          network: intent.network,
          chainId: draft.originChainId,
          attemptNo: await nextAttemptNo(tx, intentId),
          kind: "crosschain_wallet",
          provider: progress.origin === "permit" ? ("relayer" as const) : ("user_wallet" as const),
          idempotencyKey: randomUUID(),
          fromAddress: draft.from,
          toAddress: progress.origin === "source" ? (unsigned.to as string) : draft.from,
          txHash,
          status: "prepared",
          receipt: progress as unknown as Record<string, unknown>,
        })
        .returning({ id: txAttempts.id });
      await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, intentId));
      return { kind: "go" as const, attemptId: attempt!.id, origin: progress.origin, permit: unsigned.kind === "permit" ? (unsigned.permit as RelayPermit) : null };
    });

    if (prepared.kind === "mismatch") throw problem(HTTP.unprocessable, "transaction_mismatch");
    if (prepared.kind === "final") return { status: "final", intent: await this.get(user.id, intentId) };
    if (prepared.kind === "approval") return this.afterApproval(user, intentId, before.currentDraftVersion, prepared.attemptId, input.signedTransaction!, chain);
    try {
      if (prepared.permit) await submitRelayPermit(prepared.permit, input.signature!);
      else if (prepared.origin === "source" && chain) await this.remote(chain).sendRawTransaction({ serializedTransaction: input.signedTransaction! });
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

  /**
   * The first of two steps was signed: broadcast there and waited for; once it has landed, the second (the transfer's
   * Permit2 signature) is built and handed back to sign under the same yes. Nothing has moved until that one is sent.
   */
  private async afterApproval(user: SessionUser, intentId: string, version: number, attemptId: string, signed: Hex, chain: BridgeDestination | undefined): Promise<CrossChainApproveResponse> {
    if (!chain) throw problem(HTTP.unprocessable, "network_unavailable");
    const remote = this.remote(chain);
    let status: "confirmed" | "reverted" | "unknown" = "unknown";
    try {
      const hash = await remote.sendRawTransaction({ serializedTransaction: signed });
      const receipt = await remote.waitForTransactionReceipt({ hash, timeout: APPROVAL_WAIT_MS });
      status = receipt.status === "success" ? "confirmed" : "reverted";
    } catch (error) {
      this.log.warn({ intentId, message: (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX) }, "crosschain approval not confirmed");
    }
    await this.db.update(txAttempts).set({ status }).where(eq(txAttempts.id, attemptId));
    if (status !== "confirmed") throw problem(HTTP.badGateway, "simulation_failed", `the approval on ${chain.id} did not go through; nothing moved`);
    return this.approve(user, intentId, { version, surface: "app" });
  }

  // ── Tracking ────────────────────────────────────────────────────────────────────────────────────────────────

  private async follow(intentId: string) {
    for (let attempt = 0; attempt < TRACK_POLL_ATTEMPTS; attempt++) {
      await sleep(TRACK_POLL_MS);
      if (await this.track(intentId).catch(() => false)) return;
    }
  }

  /** Whether the origin receipt shows exactly what the draft moves leaving the wallet. */
  private async originHolds(receipt: TransactionReceipt, draft: CrossChainDraft, network: NetworkContext, onArc: boolean, client: PublicClient): Promise<boolean> {
    if (receipt.status !== "success") return false;
    if (!onArc) {
      // The other chain's own coin: the transaction carried exactly the amount.
      const sent = await client.getTransaction({ hash: receipt.transactionHash });
      return same(sent.from, draft.from) && sent.value === draft.amount;
    }
    // On Arc every USDC movement (native or through the ERC-20) is logged from the system address in 18 decimals.
    const usdcOut = nativeOut(receipt, draft.from);
    if (same(draft.token, network.addresses.usdc)) return usdcOut === toNative(draft.amount) + draft.nativeFee;
    return outOf(receipt, draft.token, draft.from) === draft.amount && usdcOut === toNative(draft.swapMinOut) + draft.nativeFee;
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
      // Attempts from before the origin was recorded: Arc when it started there, otherwise Relay's permit.
      const origin: Origin = progress.origin ?? (draft.originChainId === network.chainId ? "arc" : "permit");

      // The origin receipt first (not for a permit, which Relay executes): exactly the amount leaving the wallet.
      if (origin !== "permit" && progress.status === "submitted") {
        const far = this.engine.destinations(network).find((entry) => entry.chainId === draft.originChainId);
        const originClient = origin === "arc" ? (client as PublicClient) : far ? this.remote(far) : undefined;
        const receipt = originClient ? await originClient.getTransactionReceipt({ hash: attempt.txHash as Hex }).catch(() => undefined) : undefined;
        if (!receipt) {
          if (intent.state === "executing" && attempt.createdAt.getTime() < Date.now() - ms(SEND_UNKNOWN_AFTER_S)) {
            await this.db.update(intents).set({ state: "unknown_outcome" }).where(and(eq(intents.id, intentId), eq(intents.state, "executing")));
          }
          return false;
        }
        if (!(await this.originHolds(receipt, draft, network, origin === "arc", originClient!))) {
          if (receipt.status === "success") this.log.error({ intentId, tx: receipt.transactionHash }, "security.receipt_mismatch");
          await this.settleFailed(intentId, attempt.id, receipt.status === "success" ? "mismatch" : "reverted", null);
          return true;
        }
        await update({ ...progress, origin, status: "filling" });
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
          await tx.update(txAttempts).set({ status: "confirmed", receipt: jsonSafe({ ...progress, origin, status: "delivered", fillTx: filled.fillTx, received: filled.received }) }).where(eq(txAttempts.id, attempt.id));
        });
        return true;
      }
      if (filled.status === "refunded" || filled.status === "failed") {
        await update({ ...progress, origin, status: filled.status });
        await this.settleFailed(intentId, attempt.id, "reverted", filled.status);
        return true;
      }
      if (progress.status !== "filling") await update({ ...progress, origin, status: "filling" });
      return false;
    } finally {
      this.tracking.delete(intentId);
    }
  }

  private async fillOf(progress: Progress, network: NetworkContext, draft: CrossChainDraft, originTx: Hex | null): Promise<{ status: "pending" | "delivered" | "refunded" | "failed"; fillTx: string | null; received: string | null }> {
    const pending = { status: "pending" as const, fillTx: null, received: null };
    if (progress.provider === "relay" && progress.requestId) {
      const status = await relayStatus(progress.requestId as Hex);
      if (status.status === "success") return { status: "delivered", fillTx: status.destinationTxHash, received: draft.minReceived.toString() };
      if (status.status === "refund") return { status: "refunded", fillTx: null, received: null };
      if (status.status === "failure") return { status: "failed", fillTx: null, received: null };
      return pending;
    }
    if (progress.provider === "across" && originTx) {
      const status = await acrossStatus(network.chainId, originTx);
      if (status.status === "filled") return { status: "delivered", fillTx: status.fillTxHash, received: draft.minReceived.toString() };
      if (status.status === "refunded" || status.status === "expired") return { status: "refunded", fillTx: null, received: null };
      return pending;
    }
    if (progress.provider === "cctp" && originTx) {
      const forward = await this.engine.progress(network, originTx);
      if (forwardDelivered(forward)) return { status: "delivered", fillTx: forward?.forwardTxHash ?? null, received: draft.minReceived.toString() };
      return pending;
    }
    if (progress.provider === "lifi" && originTx && progress.tool) {
      const status = await lifiStatus({ txHash: originTx, fromChainId: draft.originChainId, toChainId: draft.destinationChainId, tool: progress.tool });
      if (status.status === "delivered") return { status: "delivered", fillTx: status.receivingTx, received: (status.received ?? draft.minReceived).toString() };
      if (status.status === "refunded" || status.status === "failed") return { status: status.status, fillTx: null, received: null };
      return pending;
    }
    if (progress.provider === "socket" && progress.quoteId) {
      const status = await socketStatus(progress.quoteId);
      if (status.status === "delivered") return { status: "delivered", fillTx: status.destinationTx, received: (status.received ?? draft.minReceived).toString() };
      if (status.status === "refunded" || status.status === "failed") return { status: status.status, fillTx: null, received: null };
      return pending;
    }
    if (progress.provider === "gaszip" && originTx) {
      const status = await gasZipStatus(originTx);
      if (status.status === "delivered") return { status: "delivered", fillTx: status.destinationTx, received: draft.minReceived.toString() };
      if (status.status === "refunded" || status.status === "failed") return { status: status.status, fillTx: null, received: null };
      return pending;
    }
    if (progress.provider === "debridge" && progress.orderId) {
      const status = await debridgeStatus(progress.orderId as Hex);
      if (status.status === "delivered") return { status: "delivered", fillTx: status.fillTx, received: draft.minReceived.toString() };
      if (status.status === "refunded") return { status: "refunded", fillTx: null, received: null };
      return pending;
    }
    return pending;
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

const empty = (): StoredRequest => ({ direction: "out", asset: "USDC", amount: null, destination: null, source: null, recipient: null, route: null, toAsset: null });

/** A destination as a contact's chain, when contacts can hold an address there. */
const contactChain = (id: string | undefined): ContactChain => ((CONTACT_CHAINS as readonly string[]).includes(id ?? "") ? (id as ContactChain) : "arc");

function normalise(base: StoredRequest, patch: CrossChainRequest): StoredRequest {
  const pick = <K extends keyof StoredRequest & keyof CrossChainRequest>(key: K): StoredRequest[K] => (patch[key] !== undefined ? (patch[key] as StoredRequest[K]) : base[key]);
  const text = (value: string | null | undefined) => (typeof value === "string" ? value.trim() || null : null);
  return {
    direction: pick("direction") === "in" ? "in" : "out",
    asset: text(pick("asset")) ?? "USDC",
    amount: text(pick("amount")),
    destination: text(pick("destination")),
    source: text(pick("source")),
    recipient: text(pick("recipient")),
    route: pick("route") ?? null,
    toAsset: text(pick("toAsset") ?? null),
    // Only the server sets a credit (a batched withdrawal step); a revision keeps it, a request never brings one.
    ...(base.credit ? { credit: base.credit } : {}),
  };
}

/** What the receipt says left `from` in `token` (ERC-20 Transfer logs from that token). */
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

/** USDC that left `from` on Arc, 18 decimals: the chain's own transfer log, written for native and ERC-20 USDC alike. */
const nativeOut = (receipt: TransactionReceipt, from: Address) => outOf(receipt, ARC_NATIVE_LOGGER as Address, from);

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
