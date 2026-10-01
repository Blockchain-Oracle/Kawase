// What a turn may read and do, injected by the caller (the api) so the agent never reaches into storage or chains
// itself (K2: the model proposes, code resolves). Everything is already scoped to one user and the network the
// session is on; no tool takes a network, an address or an approval from the model.
import type {
  ActivityLine,
  AgentNetwork,
  AuthoritySummary,
  CapabilityLine,
  FaucetResult,
  WalletSummary,
} from "@kawase/api-client";

export type {
  ActivityLine,
  AgentNetwork,
  AuthoritySummary,
  CapabilityLine,
  FaucetResult,
  Money,
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
};
