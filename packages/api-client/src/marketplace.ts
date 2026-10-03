// The x402 marketplace and the Agent wallet page (cards/marketplace.md). Amounts are USDC base units as decimal
// strings; the app formats them, the agent's summaries carry display strings.
import type { NetworkId } from "./types";

export type MarketplaceCategory =
  | "SOCIAL"
  | "SEARCH"
  | "FINANCIAL"
  | "DATA"
  | "INFRASTRUCTURE"
  | "PREDICTION"
  | "CREATIVE"
  | "OTHER";

export type PaymentRail = "gateway" | "eip3009";

export type BlockedSeller = { key: string; name: string };

export type AgentWalletSettings = {
  dailyBudget: string;
  perCallCap: string;
  askFirst: boolean;
  /** Empty = every category. */
  allowedCategories: MarketplaceCategory[];
  blockedSellers: BlockedSeller[];
  /** The most each can be set to here. */
  limits: { maxDailyBudget: string; maxPerCall: string };
};

export type AgentWalletSettingsChange = { [K in Exclude<keyof AgentWalletSettings, "limits">]?: AgentWalletSettings[K] | undefined };

export type PurchaseStatus = "needs_consent" | "approved" | "paying" | "paid" | "failed_after_payment" | "failed" | "declined";

export type PurchaseView = {
  id: string;
  network: NetworkId;
  status: PurchaseStatus;
  provider: string;
  description: string | null;
  url: string;
  method: string;
  category: MarketplaceCategory;
  payTo: string | null;
  amount: string;
  rail: PaymentRail | null;
  reasonCode: string | null;
  settlement: string | null;
  responsePreview: string | null;
  /** After a failed call: "none" (paid, no refund: x402 has none yet), "not_charged" (the payment never settled). */
  refund: "none" | "not_charged" | null;
  paidAt: string | null;
  createdAt: string;
};

export type AgentWalletMove = {
  id: string;
  kind: "top_up" | "deposit" | "return" | "refill";
  amount: string;
  status: "pending" | "confirmed" | "failed";
  txHashes: string[];
  createdAt: string;
};

export type AgentWalletHistoryItem =
  | { kind: "purchase"; at: string; purchase: PurchaseView }
  | { kind: "move"; at: string; move: AgentWalletMove };

export type AgentWalletView = {
  network: NetworkId;
  /** Null until the agent wallet is first used (it is made on the first top-up). */
  address: string | null;
  balances: { onHand: string; inGateway: string; withdrawing: string; total: string };
  settings: AgentWalletSettings;
  spentToday: string;
  /** The marketplace grant: how much Kawase may move into the agent wallet per day. */
  grant: { perDay: string; expiresAt: string } | null;
  topUpPresets: string[];
  history: AgentWalletHistoryItem[];
};

export type ServiceListing = {
  url: string;
  method: string;
  description: string;
  provider: { name: string; website: string | null; category: MarketplaceCategory };
  price: string;
  /** "0.006 USDC", for the model; the app formats `price` in the person's locale. */
  priceDisplay: string;
  rails: PaymentRail[];
  payTo: string;
};

export type MarketplaceGrantRequest = {
  grantId: string;
  typedData: Record<string, unknown>;
  receipt: Record<string, unknown>;
  /**
   * When an earlier marketplace grant still works on chain: its revoke, a one-time delegation the wallet signs in the
   * same step (the relayer pays), so the new grant replaces the old one on chain. Absent on older servers.
   */
  revoke?: { requestId: string; typedData: Record<string, unknown> } | null;
};

export type TopUpResult =
  | { status: "needs_grant"; grant: MarketplaceGrantRequest }
  | { status: "topped_up"; move: AgentWalletMove; wallet: AgentWalletView };

export type ReturnResult = { status: "returned" | "nothing_to_return"; moves: AgentWalletMove[]; wallet: AgentWalletView };

export type BuyServiceInput = {
  url: string;
  method?: string | undefined;
  /** Values for `{name}` parts of the listed URL. */
  pathParams?: Record<string, string> | undefined;
  query?: Record<string, string> | undefined;
  /** JSON, for POST services. */
  body?: string | undefined;
};

export type RefusalReason =
  | "over_budget"
  | "blocked_seller"
  | "category_off"
  | "not_listed"
  | "paused"
  | "payto_changed"
  | "no_option_here"
  | "declined"
  | "unavailable";

type Caps = { perCallCap: string; dailyBudget: string; spentToday: string };

export type BuyOutcome = { network: NetworkId } & (
  | { status: "paid"; purchase: PurchaseView; content: string; truncated: boolean }
  | { status: "free"; service: ServiceListing; content: string; truncated: boolean }
  | { status: "needs_consent"; purchase: PurchaseView; caps: Caps; why: "over_per_call" | "ask_first" | "after_paid_data" }
  | { status: "needs_top_up"; service: ServiceListing; price: string; wallet: { onHand: string; inGateway: string }; suggested: string; presets: string[] }
  | { status: "refused"; reason: RefusalReason; service?: ServiceListing | undefined; caps?: Caps | undefined }
  | { status: "failed"; reason: "seller_error" | "failed_after_payment" | "payment_failed"; purchase?: PurchaseView | undefined; service?: ServiceListing | undefined }
  | { status: "needs_sign_in" }
  | { status: "needs_wallet" }
  /**
   * Practice mode: every rule checked against the live price, nothing paid. `wouldAsk`: it would have waited for the
   * person's tap first (and why); `funded`: the agent wallet could have paid it.
   */
  | { status: "practiced"; service: ServiceListing; price: string; wouldAsk: "over_per_call" | "ask_first" | "after_paid_data" | null; funded: boolean }
);

export type ServiceSearchResult = { network: NetworkId; services: ServiceListing[]; total: number };

/** The agent's "Top up your agent wallet" card: presets, the suggested amount, one approval (R12: resumes after). */
export type AgentTopUpProposal =
  | {
      network: NetworkId;
      status: "proposed";
      suggested: string;
      presets: string[];
      wallet: { onHand: string; inGateway: string; total: string };
      /** Null until the marketplace grant is signed (the card asks for it with the same tap). */
      grantPerDay: string | null;
    }
  | { network: NetworkId; status: "needs_sign_in" | "needs_wallet" | "unavailable" };

export type AgentWalletLine =
  | ({ status: "ready" } & AgentWalletView)
  | { network: NetworkId; status: "needs_sign_in" | "unavailable" };

export type InspectServiceResult =
  | { network: NetworkId; status: "listed"; service: ServiceListing; livePrice: string | null; free: boolean; withinPerCallCap: boolean | null }
  | { network: NetworkId; status: "not_listed" | "unavailable" };
