// What the agent's tools return: the api streams these to the app inside tool parts, and the chat's cards render
// them. Shared here (client-safe) so the server-only agent package and the app agree on one shape.
export type AgentNetwork = "mainnet" | "testnet";

export type Money = { asset: "USDC" | "EURC"; baseUnits: string; display: string };

/**
 * Money cards carry the network they were read on, so a card reopened later renders with that network, not the one
 * the person is on now (Codex review R04). Optional: threads stored before this field existed lack it.
 */
export type OnNetwork = { network?: AgentNetwork };

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
  /** Which known wallet it is, for the card's real mark ("swap": the person's own swap). */
  label: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | "swap" | null;
  /** For a swap: what went out for `amount`. */
  paid?: Money | undefined;
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

/** A saved contact as the agent sees it (no notes: they are the person's own untrusted text). */
export type ContactLine = {
  name: string;
  handle: string | null;
  /** Short form, e.g. 0x1234…abcd; null while an address change is on hold. */
  address: string | null;
  onHold: boolean;
  paidBefore: boolean;
};

/**
 * What the model is told about a proposed send (the card gets the whole intent): plain English it rephrases in the
 * person's language, never numbers it has to compute.
 */
export type SendSummary = {
  intentId: string;
  network: AgentNetwork;
  status: "sending" | "sent" | "ready" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "failed";
  recipient: string | null;
  amount: string | null;
  /** How it will be approved once the person taps Send. */
  approval: string | null;
  /** What stops it, in plain English, when something does. */
  problem: string | null;
  warnings: string[];
};

export type ProposeSendOutput = { intent: import("./types").SendIntent; summary: SendSummary };

export type SwapSummary = {
  intentId: string;
  network: AgentNetwork;
  status: "ready" | "swapping" | "swapped" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "failed";
  /** "5.00 USDC → about 4.11 EURC (at least 4.07 EURC)". */
  trade: string | null;
  /** Quoted rate against Circle's market rate, in words. */
  rate: string | null;
  problem: string | null;
  warnings: string[];
};

export type ProposeSwapOutput = { intent: import("./types").SwapIntent; summary: SwapSummary };
