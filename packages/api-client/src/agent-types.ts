// What the agent's tools return: the api streams these to the app inside tool parts, and the chat's cards render
// them. Shared here (client-safe) so the server-only agent package and the app agree on one shape.
export type AgentNetwork = "mainnet" | "testnet";

export type Money = { asset: "USDC" | "EURC"; baseUnits: string; display: string };

export type WalletSummary =
  | { status: "guest" }
  | { status: "no_wallet" }
  | {
      status: "ready";
      address: string;
      handle: string | null;
      setUp: boolean;
      balances: Money[];
      allowance: { perDay: Money; until: string | null } | null;
    };

export type ActivityLine = {
  direction: "in" | "out";
  amount: Money;
  counterparty: string;
  counterpartyName: string | null;
  /** Which known wallet it is, for the card's real mark. */
  label: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | null;
  at: string;
  explorerUrl: string;
};

export type CapabilityLine = {
  id: string;
  here: "available" | "coming" | "unavailable";
  otherNetwork: "available" | "coming" | "unavailable";
  reason?: string;
};

export type FaucetResult =
  | { status: "sent"; amounts: Money[]; nextAt: string }
  | { status: "claimed_today"; nextAt: string }
  | { status: "not_testnet" }
  | { status: "needs_sign_in" }
  | { status: "needs_wallet" }
  | { status: "failed"; fallbackUrl: string };

export type AuthoritySummary = {
  perPeriod: Money;
  periodSeconds: number;
  until: string | null;
  onlyThisToken: boolean;
  unknownTerms: boolean;
} | null;
