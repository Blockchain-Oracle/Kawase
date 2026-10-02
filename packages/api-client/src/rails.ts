// Money rails (builder B1): Kawase Margin (long/short on Aave V4), and the endpoints that serve it. Kept apart from
// types.ts so the lanes merge cleanly; the client spreads `railsEndpoints` into its routes.
import type { IntentState, NetworkId, PolicyResultView, SendOutcome, UnsignedTransaction } from "./types";

type Call = <T>(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string | undefined }) => Promise<T>;

// ── Kawase Margin ───────────────────────────────────────────────────────────────────────────────────────────

export type MarginSide = "long" | "short";

/** Why a side of a market cannot be traded, as a code the app words (R2: unavailable is never silent). */
export type MarginUnavailable = "mainnet_only" | "no_collateral_factor" | "not_borrowable" | "paused" | "no_liquidity";

/** One market Kawase Margin lists, computed from the venue's live reserves (R1: never a fixed list). */
export type MarginMarketView = {
  /** The asset's symbol as the venue lists it ("cirBTC"). */
  market: string;
  asset: string;
  decimals: number;
  /** USD with 8 decimals, from the venue's oracle. */
  price: string;
  long: MarginSideView;
  short: MarginSideView;
  /** Yearly borrow rates as fractions: USDC (what a long pays) and the asset (what a short pays). */
  borrowAprUsdc: number;
  borrowAprAsset: number;
  /** What the venue can still lend of the asset, base units (a short's ceiling). */
  liquidity: string;
};

export type MarginSideView = { available: boolean; reason: MarginUnavailable | null; maxLeverage: number };

export type MarginMarketsView = {
  network: NetworkId;
  venue: string;
  available: boolean;
  reason: MarginUnavailable | null;
  markets: MarginMarketView[];
  /** The ticket's opening floor and the venue's post-liquidation target, as plain numbers (1.1, 1.24). */
  minOpenHealth: number;
  leverageStep: number;
  presets: readonly number[];
};

export type MarginPositionView = {
  id: string;
  network: NetworkId;
  market: string;
  asset: string;
  side: MarginSide;
  status: "open" | "closed" | "liquidated";
  /** Live, base units: the collateral (the asset for a long, USDC for a short) and the debt (the other one). */
  collateral: string;
  collateralDecimals: number;
  debt: string;
  debtDecimals: number;
  /** USDC base units put in, and what came back on closes. */
  margin: string;
  returned: string;
  /** USD with 8 decimals. */
  entryPrice: string;
  markPrice: string;
  /** Notional ÷ equity now. */
  leverage: number;
  /** USD, decimal numbers for display. */
  notionalUsd: number;
  equityUsd: number;
  pnlUsd: number;
  pnlPercent: number;
  /** How the P&L splits: the asset's price move and the interest paid so far. */
  pnlSplit: { price: number; borrow: number };
  /** The whole account's health on the venue (null with no debt), and this position's liquidation price. */
  health: number | null;
  liquidationPrice: string | null;
  /** How far the price can move against the position before liquidation, as a fraction (0.36 = 36%). */
  liquidationDistance: number | null;
  borrowApr: number;
  openedAt: string;
  closedAt: string | null;
};

export type MarginRequest = {
  action?: "open" | "close" | undefined;
  market?: string | null | undefined;
  side?: MarginSide | null | undefined;
  /** Decimal USDC put in as margin (open). */
  margin?: string | null | undefined;
  /** Notional ÷ margin, e.g. 2 or 2.5 (open). */
  leverage?: number | null | undefined;
  /** Close: the position, and the share of it (0.25, 0.5, 0.75, 1). */
  positionId?: string | null | undefined;
  fraction?: number | null | undefined;
};

export type MarginDraftView = {
  action: "open" | "close";
  market: string;
  side: MarginSide;
  asset: string;
  assetDecimals: number;
  /** USDC base units (open). */
  margin: string;
  leverage: number;
  /** USD, decimal: the exposure the batch builds (open) or unwinds (close). */
  notionalUsd: number;
  /** Base units of the asset held long, or owed short, after the batch. */
  size: string;
  /** Exactly what the batch borrows (open) or at least repays (close), in the debt asset's base units. */
  debtDelta: string;
  debtAsset: string;
  debtDecimals: number;
  /** The least collateral supplied (open) or what is withdrawn (close). */
  collateralDelta: string;
  collateralAsset: string;
  collateralDecimals: number;
  /** Close: the least USDC that comes back to the wallet. */
  returnedMin: string;
  /** The account's health after, as a plain number (1.55), and this position's liquidation price (USD, 8 decimals). */
  healthAfter: number | null;
  liquidationPrice: string | null;
  liquidationDistance: number | null;
  markPrice: string;
  borrowApr: number;
  fraction: number;
  /** Swap legs, borrow/supply loops and the venues the swaps route through. */
  loops: number;
  venues: string[];
  fees: { network: string };
  provider: string;
  quotedAt: string;
};

export type MarginIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  request: { action: "open" | "close"; market: string | null; side: MarginSide | null; margin: string | null; leverage: number | null; positionId: string | null; fraction: number | null };
  draft: MarginDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  positionId: string | null;
  tx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type MarginApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: MarginIntent }
  | { status: "sign"; intent: MarginIntent; approvalId: string; transaction: UnsignedTransaction };

/** What the agent is told; the card carries the exact figures and the slide. */
export type MarginSummary = {
  intentId: string;
  network: NetworkId;
  status: "ready" | "opening" | "closing" | "done" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "failed";
  text: string;
  blocking: string | null;
};
export type ProposeMarginOutput = { intent: MarginIntent; summary: MarginSummary };
export type MarginMarketsOutput = MarginMarketsView & { summary: string };
export type MarginPositionsOutput = { network: NetworkId; positions: MarginPositionView[]; summary: string };

// ── Buy with Apple Pay / Google Pay / debit (Circle Onramp) ──────────────────────────────────────────────────

export type OnrampStatus = "created" | "opened" | "submitted" | "settled" | "not_completed" | "expired";

export type OnrampOrderView = {
  id: string;
  network: NetworkId;
  status: OnrampStatus;
  /** The provider's reason when it did not complete (SESSION_TIMEOUT, CANCELED_BY_CUSTOMER, NO_PAYMENT_OPTIONS…). */
  reason: string | null;
  /** What arrives (USDC or EURC) and the fiat asked for. */
  asset: string;
  fiatAmount: string | null;
  fiatCurrency: string | null;
  /** The token to buy with it afterwards, when asked for. */
  thenToken: string | null;
  /** Base units that arrived, seen on chain. */
  received: string | null;
  tx: { hash: string; explorerUrl: string } | null;
  settledAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export type OnrampAvailability = {
  network: NetworkId;
  available: boolean;
  /** Testnet runs on Circle's Onramp sandbox (test cards, test money). */
  sandbox: boolean;
  reason: "sign_in" | "no_wallet" | "not_configured" | null;
  deliverable: readonly string[];
  defaultAmount: string;
};

export type OnrampStartRequest = { asset?: string | null | undefined; amount?: string | null | undefined; currency?: string | null | undefined; then?: string | null | undefined };
export type OnrampStartResponse = { order: OnrampOrderView; widgetUrl: string; expiresAt: string };
export type OnrampEventInput = { event: string; code?: string | null | undefined; payload?: Record<string, unknown> | undefined };

/** What start_buy proposes: the card's button mints the session when tapped (sessions live 30 minutes). */
export type BuyProposalOutput = OnrampAvailability & { asset: string; amount: string; currency: string; then: string | null; summary: string };

// ── Cross-chain: out of Arc to anyone, and Bring to Arc (routes.md) ─────────────────────────────────────────

export type CrossChainProvider = "cctp" | "across" | "relay";
export type CrossChainRouteReason = "needs_source_gas" | "not_on_arc_testnet" | "no_quote" | "amount_too_low" | "timeout" | "convert_first" | "own_address_only";

export type CrossChainRouteView = {
  provider: CrossChainProvider;
  /** Base units that would arrive (6 decimals), when quoted. */
  received: string | null;
  /** What the route takes, and what the person pays on top (gas they would pay elsewhere counts here). */
  fee: string | null;
  extraCost: string;
  /** received − extraCost, the ranking key. */
  net: string | null;
  etaSeconds: number | null;
  executable: boolean;
  /** "burn_mint" (Circle burns and mints native USDC) or "solver" (a relayer fills and is repaid). */
  trust: "burn_mint" | "solver";
  reason: CrossChainRouteReason | null;
};

export type CrossChainChainView = { chainId: number; name: string; key: string };

export type CrossChainDraftView = {
  direction: "out" | "in";
  asset: string;
  amount: string;
  source: CrossChainChainView;
  destination: CrossChainChainView;
  recipient: { address: string; label: string | null; own: boolean };
  routes: CrossChainRouteView[];
  chosen: CrossChainProvider;
  minReceived: string;
  /** Gas the wallet pays on Arc (USDC base units); "0" for a gasless permit. */
  networkFee: string;
  quotedAt: string;
};

export type CrossChainStage = "draft" | "submitted" | "filling" | "delivered" | "refunded" | "failed";

export type CrossChainIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  stage: CrossChainStage;
  version: number;
  request: CrossChainRequest;
  draft: CrossChainDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  /** The origin transaction and, once filled, the destination's. */
  tx: { hash: string; explorerUrl: string } | null;
  fillTx: { hash: string; explorerUrl: string } | null;
  received: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type CrossChainRequest = {
  direction?: "out" | "in" | undefined;
  asset?: string | null | undefined;
  amount?: string | null | undefined;
  /** Out: the destination chain id or name ("base"); in: the source chain. */
  destination?: string | null | undefined;
  source?: string | null | undefined;
  /** Out: an address, @handle or contact; own address when absent. */
  recipient?: string | null | undefined;
  route?: CrossChainProvider | null | undefined;
};

export type CrossChainApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: CrossChainIntent }
  | { status: "sign"; intent: CrossChainIntent; approvalId: string; transaction: UnsignedTransaction }
  | { status: "sign_typed"; intent: CrossChainIntent; approvalId: string; typedData: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> } };

export type ElsewhereView = { network: NetworkId; chains: { chainId: number; name: string; key: string; asset: string; balance: string }[] };

export type ProposeCrossChainOutput = { crosschain: true; intent: CrossChainIntent; summary: string };

export function railsEndpoints(call: Call) {
  return {
    crosschain: {
      /** USDC the person holds at the same address on the CCTP chains ("Bring to Arc"). */
      elsewhere: () => call<ElsewhereView>("GET", "/crosschain/elsewhere"),
      create: (request: CrossChainRequest) => call<{ intent: CrossChainIntent }>("POST", "/crosschain/orders", request),
      get: (id: string) => call<{ intent: CrossChainIntent }>("GET", `/crosschain/orders/${id}`),
      revise: (id: string, patch: CrossChainRequest) => call<{ intent: CrossChainIntent }>("PATCH", `/crosschain/orders/${id}`, patch),
      cancel: (id: string) => call<{ intent: CrossChainIntent }>("POST", `/crosschain/orders/${id}/cancel`),
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<CrossChainApproveResponse>("POST", `/crosschain/orders/${id}/approve`, { version }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signed: { signedTransaction?: string; signature?: string }) =>
        call<CrossChainApproveResponse>("POST", `/crosschain/orders/${id}/signature`, { approvalId, ...signed }),
    },
    onramp: {
      status: () => call<OnrampAvailability>("GET", "/onramp"),
      /** Mints a Circle Onramp session for the person's own address; open `widgetUrl` top level (system browser). */
      start: (request: OnrampStartRequest) => call<OnrampStartResponse>("POST", "/onramp/orders", request),
      get: (id: string) => call<{ order: OnrampOrderView }>("GET", `/onramp/orders/${id}`),
      /** The widget's lifecycle hints (UX only; settlement comes from the chain). */
      event: (id: string, input: OnrampEventInput) => call<{ order: OnrampOrderView }>("POST", `/onramp/orders/${id}/events`, input),
    },
    margin: {
      /** Markets, sides and leverage caps from the venue's live reserves; no account needed (R13). */
      markets: () => call<MarginMarketsView>("GET", "/margin/markets"),
      positions: () => call<{ positions: MarginPositionView[] }>("GET", "/margin/positions"),
      create: (request: MarginRequest) => call<{ intent: MarginIntent }>("POST", "/margin/orders", request),
      get: (id: string) => call<{ intent: MarginIntent }>("GET", `/margin/orders/${id}`),
      revise: (id: string, patch: MarginRequest) => call<{ intent: MarginIntent }>("PATCH", `/margin/orders/${id}`, patch),
      cancel: (id: string) => call<{ intent: MarginIntent }>("POST", `/margin/orders/${id}/cancel`),
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<MarginApproveResponse>("POST", `/margin/orders/${id}/approve`, { version }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<MarginApproveResponse>("POST", `/margin/orders/${id}/signature`, { approvalId, signedTransaction }),
    },
  };
}
