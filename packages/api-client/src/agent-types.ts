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
  label: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | "swap" | "bridge" | "earn" | null;
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
  /** What runs today, precisely (actions, assets, chains, routes, triggers). */
  supports?: readonly string[];
  /** Planned branches that do not run yet. */
  notYet?: readonly string[];
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

/**
 * Why a send inside the allowance waited for the person's tap instead of going at once (H2): they did not name the
 * recipient in their own message, or content from outside Kawase was read after it.
 */
export type SendHold = "not_typed" | "outside_text";

export type ProposeSendOutput = { intent: import("./types").SendIntent; summary: SendSummary; held?: SendHold | undefined };

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

export type BridgeSummary = {
  intentId: string;
  network: AgentNetwork;
  status: "ready" | "bridging" | "delivered" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "failed";
  /** "5.00 USDC from Arc Testnet → at least 4.95 USDC on Base Sepolia". */
  transfer: string | null;
  route: string | null;
  problem: string | null;
};

export type ProposeBridgeOutput = { intent: import("./types").BridgeIntent; summary: BridgeSummary };

export type EarnSummary = {
  intentId: string;
  network: AgentNetwork;
  status: "ready" | "moving" | "done" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "failed";
  /** "Deposit 10.00 USDC into EarnKit USDC Vault (4.2% a year)". */
  action: string | null;
  problem: string | null;
  warnings: string[];
};

export type ProposeEarnOutput = { intent: import("./types").EarnIntent; summary: EarnSummary };

export type EarnOverviewLine = {
  vaults: { name: string; protocol: string; apy: string; available: string; circleGuarded: boolean; status: string; address: string }[];
  positions: { name: string; worth: string; apy: string }[];
  network: AgentNetwork;
};

export type AutomationSummary = {
  automationId: string;
  network: AgentNetwork;
  status: "ready" | "on" | "paused" | "needs_answer" | "needs_fix" | "refused" | "not_possible" | "needs_sign_in" | "ended";
  /** "Every Tuesday at 09:00 (Africa/Lagos): send 1.00 USDC to Alex". */
  readBack: string | null;
  nextRuns: string[];
  /** "At most 1.00 USDC a week can ever go to this address, enforced on Arc, until 1 Oct 2027." */
  bound: string | null;
  problem: string | null;
  warnings: string[];
};

export type ProposeAutomationOutput = { automation: import("./types").AutomationView; summary: AutomationSummary };
export type ListAutomationsOutput = { network: AgentNetwork; automations: ProposeAutomationOutput[] };

// ── Watching the agent work: the route race, the budget's yes, the model's health (front-door lane) ─────────────

/** What race_routes asks every venue for. Amounts are decimals as the person said them ("2.5"); tokens as named. */
export type RouteRaceRequest = {
  kind: "swap" | "bridge" | "yield";
  /** Swap: what goes out (a symbol or 0x address); bridge and yield: the asset (USDC when not said). */
  from: string | null;
  /** Swap: what comes in. */
  to: string | null;
  amount: string | null;
  /** Bridge out of Arc: the chain it lands on ("base"). */
  destination: string | null;
  /** Bring to Arc: the chain it leaves. */
  source: string | null;
};

/**
 * Every snapshot race_routes yields (the AI SDK sends all but the last as preliminary). `racing`: venues are still
 * answering; `done`: every venue answered or timed out, and `race.best` is Kawase's suggestion (the propose step
 * re-quotes it before anything moves); `routes_unavailable`: no race ran, and the card says so instead of showing rows.
 * A race never invents a quote.
 */
export type RaceRoutesOutput =
  | { status: "racing" | "done"; request: RouteRaceRequest; race: import("./routes").RouteRace }
  | { status: "routes_unavailable"; request: RouteRaceRequest; race: null; reason: "not_bound" | "failed" | "no_venues" };

/** One money step the agent wants to take, as the weekly budget sees it (D38). The Budget lane answers allows(). */
export type BudgetAction = {
  /** The tool that would act. */
  tool: string;
  kind: "swap" | "bridge" | "bring_in" | "earn" | "send" | "x402";
  /** Decimal amount in `asset`, as asked; null when the person did not say (never inside a budget). */
  amount: string | null;
  asset: string | null;
  /** The venue the race picked or the person chose, when there is one. */
  venue: string | null;
  /** Bridges and sends: who receives ("self" is the person's own address). */
  recipient: "self" | "other" | null;
  network: AgentNetwork;
};

/** Why an agent step goes without a tap, or waits for one (the run card says which). */
export type ApprovalReason = "inside_budget" | "no_budget" | "over_budget" | "outside_text" | "other_recipient" | "amount_missing";

/** The configured model, checked with one tiny tool call at start and every 10 minutes. */
export type AgentHealth = { status: "online" | "offline" | "unknown"; checkedAt: string | null; model: string; reason: string | null };
