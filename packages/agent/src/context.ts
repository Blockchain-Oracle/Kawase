// What a turn may read and do, injected by the caller (the api) so the agent never reaches into storage or chains
// itself (K2: the model proposes, code resolves). Everything is already scoped to one user and the network the
// session is on; no tool takes a network, an address or an approval from the model.
import type { JSONValue } from "ai";
import type {
  ActivityLine,
  AgentNetwork,
  AuthoritySummary,
  CapabilityLine,
  ContactLine,
  FaucetResult,
  PaymentRequest,
  PaymentRequestInput,
  ProposeSendOutput,
  ProposeSwapOutput,
  ProposeBridgeOutput,
  ProposeEarnOutput,
  EarnOverviewLine,
  EarnRequest,
  AutomationInput,
  AutoSaveInput,
  RuleInput,
  ProposeAutomationOutput,
  ListAutomationsOutput,
  BridgeRequest,
  SendRequest,
  SwapRequest,
  WalletSummary,
  MarginMarketsOutput,
  MarginPositionsOutput,
  MarginRequest,
  ProposeMarginOutput,
  ProtectPositionOutput,
  BuyProposalOutput,
  CrossChainRequest,
  ProposeCrossChainOutput,
  CompareYieldOutput,
  LendRequest,
  ProposeLendOutput,
  ProposeLpOutput,
  WithdrawPlanInput,
  WithdrawProposalOutput,
  PortfolioView,
  TokenDetailView,
  TokenSearchResult,
  AgentTopUpProposal,
  AgentWalletLine,
  BuyOutcome,
  BuyServiceInput,
  InspectServiceResult,
  MarketplaceCategory,
  ServiceSearchResult,
  SafetyChange,
  SafetyToolOutput,
  DcaInput,
  AutomationEdit,
  AutomationEditResponse,
  SimulationView,
  ExportLinkOutput,
  WeeklyReportOutput,
  ExplainOutput,
  DeviceSignOutProposal,
  DeleteAccountProposal,
  FeeReserveView,
  BudgetAction,
  RouteRace,
  RouteRaceRequest,
} from "@kawase/api-client";

import type { IntelligenceContext } from "./intelligence";

/** The weekly budget (D38), as the agent asks it: may this step go without the person's tap? The Budget lane binds it. */
export type AgentBudget = {
  /** True only when the step fits the person's signed budget (week, per action, category, venue). */
  allows(action: BudgetAction): Promise<boolean>;
};

export type {
  ActivityLine,
  AgentNetwork,
  AuthoritySummary,
  CapabilityLine,
  ContactLine,
  FaucetResult,
  Money,
  ProposeSendOutput,
  ProposeSwapOutput,
  SendRequest,
  SendSummary,
  SwapRequest,
  SwapSummary,
  WalletSummary,
} from "@kawase/api-client";

/** What the model reads of a tool's result (display strings, untrusted data already quarantined). */
export type ModelSummary = { [key: string]: JSONValue | undefined };

export type AgentContext = {
  network: AgentNetwork;
  /** The person's language, as a code ("fr") and its own name ("Français"). */
  locale: string;
  languageName: string;
  isGuest: boolean;
  handle: string | null;
  wallet(): Promise<WalletSummary>;
  activity(limit: number): Promise<ActivityLine[]>;
  capabilities(): Promise<CapabilityLine[]>;
  claimTestMoney(): Promise<FaucetResult>;
  authority(): Promise<AuthoritySummary>;
  /**
   * Drafts a send from the person's words; code resolves the recipient and runs every check (K2). `autoSend`: whether
   * one inside the allowance may go without their tap (H2: only for a recipient they named, nothing outside read since).
   */
  proposeSend(input: SendRequest, options: { autoSend: boolean }): Promise<ProposeSendOutput>;
  /** Drafts a swap between USDC and EURC with a fresh quote; the person approves on the card (always Face ID). */
  proposeSwap(input: SwapRequest): Promise<ProposeSwapOutput>;
  /** Drafts a bridge of USDC from Arc to the person's own address on another chain; approved on the card. */
  proposeBridge(input: BridgeRequest): Promise<ProposeBridgeOutput>;
  /** The USDC vaults here (yield, liquidity) and what the person holds in them. */
  earnOverview(): Promise<EarnOverviewLine>;
  /** Drafts a deposit into or withdrawal from a vault; approved on the card. */
  proposeEarn(input: EarnRequest): Promise<ProposeEarnOutput>;
  /** Drafts an automation (a scheduled send) with its read-back, next runs and on-chain bound; turned on on the card. */
  draftAutomation(input: AutomationInput): Promise<ProposeAutomationOutput>;
  /** Auto-save's draft: keep an amount ready, the rest into the person's own savings (and back when low). */
  draftAutoSave(input: AutoSaveInput): Promise<ProposeAutomationOutput>;
  /** A rule's draft: a trigger (balance above/below, money in), an amount rule and one step (bridge, save, alert). */
  draftRule(input: RuleInput): Promise<ProposeAutomationOutput>;
  /** The person's automations on this network that are on or paused. */
  listAutomations(): Promise<ListAutomationsOutput>;
  /** Pause, resume or skip the next run at once; cancel stops every run at once (the revoke is offered on the card). */
  changeAutomation(input: { automationId: string; change: "pause" | "resume" | "skip_next" | "cancel" }): Promise<ProposeAutomationOutput>;
  findContacts(query: string): Promise<ContactLine[]>;
  /** A payment request with a shareable link, on the active network. */
  createPaymentRequest(input: PaymentRequestInput): Promise<{ request: PaymentRequest } | { status: "needs_sign_in" | "needs_wallet" }>;
  /** Paid services (x402): Circle's catalog searched (free), one listing with its live price (free). */
  searchServices(input: { query: string; category?: MarketplaceCategory | undefined }): Promise<ServiceSearchResult & { summary: ModelSummary }>;
  inspectService(input: BuyServiceInput): Promise<{ result: InspectServiceResult; summary: ModelSummary }>;
  /** One paid call from the person's agent wallet, inside their budget; the answer is untrusted data. */
  buyService(input: BuyServiceInput): Promise<{ outcome: BuyOutcome; summary: ModelSummary }>;
  /** The agent wallet: balance (Gateway and on hand), budget, spent today, recent purchases. */
  agentWallet(): Promise<{ wallet: AgentWalletLine; summary: ModelSummary }>;
  /** The "Top up your agent wallet" card; the person picks the amount and taps (nothing moves from this call). */
  proposeAgentTopUp(input: { amount?: string | undefined }): Promise<{ proposal: AgentTopUpProposal; summary: ModelSummary }>;
  /** The person's latest message, so an address the model passes can be checked against their own words. */
  lastUserText: string;
  /** Typing in chat, or talking: a spoken answer is short and never reads out addresses or long numbers. */
  surface: "chat" | "voice";
  /** Memory, history search, Arc knowledge and the extra cards (A5). */
  intelligence: IntelligenceContext;
  // Money rails (B1). Optional so a context without them still builds; the tools say so when one is missing.
  /** Kawase Margin markets from the venue's live reserves, with each side's leverage cap. */
  marginMarkets?(): Promise<MarginMarketsOutput>;
  /** The person's open long/short positions with live P&L, health and liquidation price. */
  marginPositions?(): Promise<MarginPositionsOutput>;
  /** Drafts a margin order (open or close); the person slides to confirm on the card. */
  proposeMargin?(input: MarginRequest): Promise<ProposeMarginOutput>;
  /** Take-profit / stop-loss on an open position (USD prices; null clears one). */
  protectPosition?(input: { positionId: string | null; market: string | null; side: "long" | "short" | null; takeProfit: string | null | undefined; stopLoss: string | null | undefined }): Promise<ProtectPositionOutput>;
  /** Buy with Apple Pay / Google Pay / debit (Circle Onramp): the card's button starts it; nothing is charged here. */
  proposeBuy?(input: { asset?: string | null; amount?: string | null; then?: string | null }): Promise<BuyProposalOutput>;
  /** Drafts a cross-chain move with route options: out of Arc to anyone, or Bring to Arc (gasless). */
  proposeCrossChain?(input: CrossChainRequest): Promise<ProposeCrossChainOutput>;
  /** Where an asset can earn: Aave V4, Morpho vaults (liquid ones), LP shown as advanced; ranked by rate among liquid. */
  compareYield?(input: { asset: string; amount: string | null; venue?: string | null | undefined }): Promise<CompareYieldOutput>;
  /** Drafts an Aave V4 action: supply, withdraw, borrow (collateral in the same batch) or repay; approved on the card. */
  proposeLend?(input: LendRequest): Promise<ProposeLendOutput>;
  /** Aero LP: a deposit quoted (one asset in, the range inferred), or the positions to withdraw or claim; the card opens the LP screen. */
  proposeLp?(input: { action: "deposit" | "withdraw" | "claim"; pool: string | null; asset: string | null; amount: string | null }): Promise<ProposeLpOutput>;
  /** Plans a withdrawal (any assets, to an exchange, a saved place or an own wallet); the card opens Withdraw. */
  proposeWithdraw?(input: WithdrawPlanInput): Promise<WithdrawProposalOutput>;
  /** Every asset the person holds on this network, on other chains and in positions, priced (R1). */
  portfolio(): Promise<PortfolioView>;
  /** Tokens on this network by name, symbol or address, with the copycat status of each. */
  searchTokens(query: string): Promise<TokenSearchResult[]>;
  /** One token's page: market, safety verdict, the person's holding and what they can do with it. */
  tokenDetail(address: string): Promise<TokenDetailView>;
  /** Drafts a trade of any pair (buy, sell, swap) with every venue's fresh quote; approved on the card. */
  proposeTrade(input: { from: string | null; to: string | null; amount: string | null; venue?: string | null | undefined }): Promise<ProposeSwapOutput>;
  // Watching it work (front-door lane). Optional so a context without them still builds.
  /**
   * Every venue's quote as it lands (the Routes lane's race, bound by the api): one snapshot per answer, the last with
   * `done`. Without it race_routes says "routes_unavailable".
   */
  raceRoutes?(request: RouteRaceRequest, options: { signal?: AbortSignal | undefined }): AsyncIterable<RouteRace>;
  /** The weekly budget's yes (D38). Without it every money step waits for the person's tap. */
  budget?: AgentBudget | undefined;
  // Wallet & limits (A3). Optional so a context without them still builds; the tools say so when one is missing.
  /** The risk dial, practice mode and pause, read from the session for the instructions (X11). */
  riskMode?: "careful" | "balanced" | "autonomous" | undefined;
  practice?: boolean | undefined;
  pausedAll?: boolean | undefined;
  /** The person's display currency and today's rate (B2-3), when it is not US dollars. */
  display?: { currency: string; perUsd: number } | undefined;
  /** The person's limits now. */
  safetyView?(): Promise<SafetyToolOutput & { summary: ModelSummary }>;
  /** A change: tightening applies at once; loosening comes back as a card to approve with Face ID. */
  changeSafety?(change: SafetyChange): Promise<SafetyToolOutput & { summary: ModelSummary }>;
  proposeLimitChange?(input: {
    limit: "allowance" | "per_payment" | "temporary_raise" | "cooldown" | "practice";
    token?: string | undefined;
    amount?: string | undefined;
    hours?: number | undefined;
    on?: boolean | undefined;
  }): Promise<SafetyToolOutput & { summary: ModelSummary }>;
  proposeAllowlistChange?(input: { action: "add" | "remove" | "only_on" | "only_off"; contact?: string | undefined }): Promise<SafetyToolOutput & { summary: ModelSummary }>;
  revokeGrant?(input: { what: "allowance" | "automation" | "everything"; token?: string | undefined; automationId?: string | undefined }): Promise<SafetyToolOutput & { summary: ModelSummary }>;
  // Automations 8c (A3).
  draftDca?(input: DcaInput): Promise<ProposeAutomationOutput>;
  editAutomation?(input: { automationId: string } & AutomationEdit): Promise<{ automation: AutomationEditResponse["automation"]; edit: AutomationEditResponse; summary: ModelSummary }>;
  simulateAutomation?(input: { automationId: string }): Promise<{ simulation: SimulationView; automation?: AutomationEditResponse["automation"] | undefined; summary: ModelSummary }>;
  automationRuns?(input: { automationId?: string | undefined; limit: number }): Promise<{ network: AgentNetwork; automations: ProposeAutomationOutput[]; summary: ModelSummary }>;
  // History and account from chat (builder B2). Optional so a context without them still builds.
  /** A short-lived download link for one month of history as CSV or beancount. */
  exportHistory?(input: { month: string | null; format: "csv" | "beancount" }): Promise<{ link: ExportLinkOutput; summary: ModelSummary }>;
  /** The weekly report card. */
  weeklyReport?(input: { days: number | null }): Promise<{ output: WeeklyReportOutput; summary: ModelSummary }>;
  /** Why one movement happened: the decision record (the latest movement, in or out, when not named). */
  explainTransaction?(input: { txHash: string | null; which: "latest" | "latest_in" | "latest_out" }): Promise<{ output: ExplainOutput; summary: ModelSummary }>;
  /** The devices, for the person to sign one out on the card. */
  proposeDeviceSignOut?(input: { device: string | null }): Promise<{ proposal: DeviceSignOutProposal; summary: ModelSummary }>;
  /** The fee reserve: Arc fees are USDC; "~N actions left" and the relayer for when it runs out (B2-3). */
  feeReserve?(): Promise<{ reserve: FeeReserveView | null; summary: ModelSummary }>;
  /** What deleting the account means; the person does it on the delete screen with their @handle typed. */
  proposeDeleteAccount?(): Promise<{ proposal: DeleteAccountProposal; summary: ModelSummary }>;
};
