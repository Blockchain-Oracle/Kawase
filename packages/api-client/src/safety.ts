// Wallet & limits (cards/automate-safety.md "Stay in control"): the authority receipt, the allowance per token, the
// per-payment cap, the new-recipient cooldown, the allowlist, temporary raises, pause all, the risk dial, practice mode
// and the exit kit. Tightening applies at once; loosening returns what to sign (X7).
import type { ApiUser, NetworkId, TransactionRequestResponse } from "./types";

export type RiskMode = "careful" | "balanced" | "autonomous";

/** One token's daily allowance. Amounts are base units of that token. */
export type AllowanceView = {
  token: string;
  symbol: string;
  decimals: number;
  grantId: string;
  /** What Kawase holds itself to per day (the person may have lowered it below the signed grant). */
  perDay: string;
  /** What the signed grant allows per day: the chain's guarantee. */
  signedPerDay: string;
  /** What is left today: the chain's room under the person's cap. */
  leftToday: string;
  expiresAt: string;
  /** A temporary raise on top, while it lasts. */
  boost: { grantId: string; extra: string; until: string; leftToday: string } | null;
};

export type AllowlistEntry = { contactId: string; name: string; address: string };

export type SafetyView = {
  network: NetworkId;
  walletAddress: string | null;
  setUp: boolean;
  pausedAt: string | null;
  riskMode: RiskMode;
  practice: boolean;
  allowances: AllowanceView[];
  /** USDC base units; checked by Kawase on every payment. */
  perPayment: { value: string; default: string; temp: { value: string; until: string } | null };
  cooldown: { seconds: number; cap: string };
  allowlist: { only: boolean; entries: AllowlistEntry[] };
  /** Grants that are on, by kind (the exit kit revokes them all). */
  grants: { allowance: number; automation: number; marketplace: number };
};

export type SafetyChange =
  | { kind: "allowance"; token: string; perDay: string }
  | { kind: "allowance_off"; token: string }
  | { kind: "boost"; token: string; extra: string; until: string }
  | { kind: "per_payment"; value: string }
  | { kind: "per_payment_temp"; value: string; until: string }
  | { kind: "cooldown"; seconds: number; cap: string }
  | { kind: "allowlist_only"; on: boolean }
  | { kind: "allowlist"; contactId: string; on: boolean }
  | { kind: "risk_mode"; mode: RiskMode }
  | { kind: "practice"; on: boolean }
  | { kind: "pause"; on: boolean };

/** Now or after a change, in display parts (the app formats them in the person's language). */
export type LimitValue = {
  amount?: string | undefined;
  decimals?: number | undefined;
  symbol?: string | undefined;
  seconds?: number | undefined;
  mode?: RiskMode | undefined;
  on?: boolean | undefined;
  until?: string | undefined;
  name?: string | undefined;
};

export type SafetyChangeResponse =
  | {
      status: "applied" | "unchanged";
      safety: SafetyView;
      user: ApiUser;
      /** Turning a token's allowance off: the on-chain revoke for the wallet to sign (Kawase already stopped using it). */
      revoke?: TransactionRequestResponse | null | undefined;
    }
  | {
      status: "needs_approval";
      changeId: string;
      change: SafetyChange;
      before: LimitValue;
      after: LimitValue;
      expiresAt: string;
      /**
       * What the wallet signs (one Face ID): a step-up message for a limit Kawase enforces, or a new grant for an
       * allowance or a raise — plus the revoke of the grant it replaces, so the chain never holds both.
       */
      approval:
        | { kind: "message"; typedData: Record<string, unknown> }
        | { kind: "grant"; typedData: Record<string, unknown>; receipt: Record<string, unknown>; revoke: TransactionRequestResponse | null };
    };

export type TokenOption = { token: string; symbol: string; decimals: number; balance: string; hasAllowance: boolean };

export type ExitKitResponse = { safety: SafetyView; user: ApiUser; revoke: TransactionRequestResponse | null };

export type SafetyApi = {
  get: () => Promise<SafetyView>;
  tokens: (address?: string) => Promise<{ tokens: TokenOption[] }>;
  change: (change: SafetyChange, via?: "app" | "chat" | "voice") => Promise<SafetyChangeResponse>;
  approve: (changeId: string, signature: string) => Promise<SafetyChangeResponse>;
  /** Pause all: instant. */
  pause: () => Promise<SafetyChangeResponse>;
  /** The exit kit's first two steps: pause, then the one transaction that revokes every grant on this network. */
  exitKit: () => Promise<ExitKitResponse>;
};

/** What the agent's safety tools return, for the chat card (cards/automate-safety.md). */
export type SafetyToolOutput = {
  network: NetworkId;
  /**
   * applied: a tightening, done now · unchanged · needs_approval: the card asks for Face ID · revoke: the card signs the
   * on-chain revoke · view: the limits as they are · refused: with a reason the card says.
   */
  status: "applied" | "unchanged" | "needs_approval" | "revoke" | "view" | "refused";
  /** The change asked for, or the revoke. */
  change: SafetyChange | { kind: "revoke"; what: "allowance" | "automation" | "everything"; token?: string | undefined } | null;
  response: SafetyChangeResponse | null;
  revoke: TransactionRequestResponse | null;
  safety: SafetyView | null;
  reason?: string | undefined;
};

/**
 * The brake (cards/automate-safety.md): a risky draft — over half the balance to someone new, a price impact over the
 * rule, leverage above 5× — carries one of these warnings, and its approval must say `override: true` (the person saw
 * the warning and goes ahead with Face ID). The api refuses it otherwise (`brake_override`).
 */
export const BRAKE_CODES: readonly string[] = ["BRAKE_HALF_BALANCE", "BRAKE_PRICE_IMPACT", "BRAKE_LEVERAGE"];
export const hasBrake = (results: readonly { code: string }[] | undefined) => Boolean(results?.some((entry) => BRAKE_CODES.includes(entry.code)));
