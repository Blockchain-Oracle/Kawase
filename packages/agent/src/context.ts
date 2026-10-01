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
  SendRequest,
  SwapRequest,
  WalletSummary,
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
  findContacts(query: string): Promise<ContactLine[]>;
  /** A payment request with a shareable link, on the active network. */
  createPaymentRequest(input: PaymentRequestInput): Promise<{ request: PaymentRequest } | { status: "needs_sign_in" | "needs_wallet" }>;
  /** The person's latest message, so an address the model passes can be checked against their own words. */
  lastUserText: string;
};
