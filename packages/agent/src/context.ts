// What a turn may read and do, injected by the caller (the api) so the agent never reaches into storage or chains
// itself (K2: the model proposes, code resolves). Everything is already scoped to one user and the network the
// session is on; no tool takes a network, an address or an approval from the model.
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
} from "@kawase/api-client";

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
  /** Drafts a send from the person's words; code resolves the recipient and runs every check (K2). */
  proposeSend(input: SendRequest): Promise<ProposeSendOutput>;
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
  /** The person's latest message, so an address the model passes can be checked against their own words. */
  lastUserText: string;
  /** Typing in chat, or talking: a spoken answer is short and never reads out addresses or long numbers. */
  surface: "chat" | "voice";
  // Money rails (B1). Optional so a context without them still builds; the tools say so when one is missing.
  /** Kawase Margin markets from the venue's live reserves, with each side's leverage cap. */
  marginMarkets?(): Promise<MarginMarketsOutput>;
  /** The person's open long/short positions with live P&L, health and liquidation price. */
  marginPositions?(): Promise<MarginPositionsOutput>;
  /** Drafts a margin order (open or close); the person slides to confirm on the card. */
  proposeMargin?(input: MarginRequest): Promise<ProposeMarginOutput>;
};
