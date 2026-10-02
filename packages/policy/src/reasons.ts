// Every reason a request can stop or carry a note, and its kind (T1). The kind decides what the person sees:
// an error explains, a policy refusal is final (edit the amount, open the rule, or cancel; never "split it"),
// a precondition shows its fix inline and the request resumes after it, a clarification asks one question,
// and a warning goes on the confirm card without blocking.

/** Kinds in precedence order: when several block at once, the first kind present leads (ARCHITECTURE §3). */
export const POLICY_KINDS = ["error", "policy", "precondition", "clarification", "warning"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const REASONS = {
  // Errors: nothing the person can fix here.
  NOT_AVAILABLE_YET: "error",
  SWAP_PAIR_UNSUPPORTED: "error",
  /** No venue lists this market, or this side of it (R2: the reason and the nearest path are shown). */
  MARGIN_MARKET_UNAVAILABLE: "error",
  MARGIN_SIDE_UNAVAILABLE: "error",
  /** Aave V4 does not list this asset here, or not for borrowing. */
  LEND_ASSET_UNAVAILABLE: "error",
  /** The collateral named cannot back a loan (its collateral factor is 0, e.g. EURC). */
  LEND_NOT_COLLATERAL: "error",
  /** A repay with no debt in that asset. */
  LEND_NOTHING_OWED: "error",
  /** A close names a position the person does not hold. */
  POSITION_MISSING: "error",
  /** The vault is not listed here, or not taking deposits. */
  VAULT_UNAVAILABLE: "error",
  // Policy refusals: terminal for this version.
  PAUSED_ALL: "policy",
  OVER_PER_TX_LIMIT: "policy",
  OVER_DAILY_LIMIT: "policy",
  OVER_WEEKLY_LIMIT: "policy",
  ADDRESS_CHANGE_HOLD: "policy",
  RECIPIENT_BLOCKED: "policy",
  PRICE_IMPACT_HIGH: "policy",
  /** A new address can get only a small amount per payment until its cooldown ends (Wallet & limits). */
  NEW_RECIPIENT_COOLDOWN: "policy",
  /** More leverage than the venue's collateral factor allows at the opening health floor. */
  LEVERAGE_TOO_HIGH: "policy",
  /** The account would be too close to liquidation after this borrow or withdrawal. */
  HEALTH_TOO_LOW: "policy",
  /** The source can pay out almost nothing right now: Kawase does not deposit into it (gaps.md G1). */
  VAULT_LIQUIDITY_STUCK: "policy",
  /** The token is an impersonator, a honeypot or cannot be sold: Kawase never buys it (copycat rule, GoPlus). */
  TOKEN_BLOCKED: "policy",
  /** Over the token rules' per-trade limit for unverified tokens (D12: $50 by default). */
  TOKEN_RULE_TRADE: "policy",
  /** Over the token rules' daily limit for unverified tokens (D12: $200 by default). */
  TOKEN_RULE_DAY: "policy",
  // Preconditions: one fix, then the same request resumes.
  SIGN_IN_REQUIRED: "precondition",
  WALLET_NOT_READY: "precondition",
  WALLET_NOT_SET_UP: "precondition",
  ON_OTHER_NETWORK: "precondition",
  INSUFFICIENT_BALANCE: "precondition",
  INSUFFICIENT_GAS: "precondition",
  /** No swap price right now: "Try again" re-quotes the same request. */
  QUOTE_UNAVAILABLE: "precondition",
  /** The amount would not cover the route's fee: a bigger amount fixes it. */
  AMOUNT_BELOW_FEE: "precondition",
  /** More than the person holds in the vault. */
  OVER_POSITION: "precondition",
  /** The vault cannot pay that much out right now (its liquidity is lent). */
  VAULT_LIQUIDITY_SHORT: "precondition",
  /** Auto-save is already on here: one at a time (turn the old one off first). */
  AUTO_SAVE_EXISTS: "precondition",
  /** The bridge route's fee right now is above what a rule's grants allow (16.77 USDC). */
  BRIDGE_FEE_HIGH: "precondition",
  // Clarifications: one question.
  RECIPIENT_MISSING: "clarification",
  RECIPIENT_UNKNOWN: "clarification",
  RECIPIENT_AMBIGUOUS: "clarification",
  RECIPIENT_INVALID: "clarification",
  RECIPIENT_IS_SELF: "clarification",
  RECIPIENT_NO_WALLET: "clarification",
  AMOUNT_MISSING: "clarification",
  AMOUNT_INVALID: "clarification",
  ASSET_UNCLEAR: "clarification",
  SWAP_SAME_TOKEN: "clarification",
  DESTINATION_MISSING: "clarification",
  MARKET_MISSING: "clarification",
  SIDE_MISSING: "clarification",
  /** A schedule Kawase cannot keep (an unknown time zone, a day out of range). */
  SCHEDULE_INVALID: "clarification",
  /** A rule without the number it needs: the balance line, the share, or the amount. */
  RULE_INCOMPLETE: "clarification",
  // Warnings: shown on the confirm card.
  FIRST_TIME_RECIPIENT: "warning",
  LOOKALIKE_ADDRESS: "warning",
  UNSAVED_ADDRESS: "warning",
  ABOVE_ALLOWANCE: "warning",
  NO_ALLOWANCE: "warning",
  LEAVES_LITTLE_FOR_FEES: "warning",
  RATE_BELOW_REFERENCE: "warning",
  /** Buying a token Kawase does not vouch for (unverified or a lookalike): shown on the card. */
  TOKEN_UNVERIFIED: "warning",
  VAULT_LOW_LIQUIDITY: "warning",
  /** The wallet holds less than one run today; runs skip until it is topped up. */
  FIRST_RUN_UNDERFUNDED: "warning",
  /** A run skipped because this period's amount was already sent (the grant's cap). */
  AUTOMATION_PERIOD_USED: "warning",
  VAULT_RISK_WARNING: "warning",
  /** Paused: the agent and automations stand still; the person's own Face ID still works. */
  AGENT_PAUSED: "warning",
  /** Only allowlisted recipients go without the person; this one needs their Face ID. */
  NOT_ON_ALLOWLIST: "warning",
  /** Leverage: the margin can be lost; the card names the liquidation price. */
  MARGIN_RISK: "warning",
  HEALTH_NEAR_LIMIT: "warning",
} as const satisfies Record<string, PolicyKind>;

export type ReasonCode = keyof typeof REASONS;

/** One check's outcome. `params` are display values (decimal strings, names) for the message templates. */
export type PolicyResult = {
  code: ReasonCode;
  kind: PolicyKind;
  params?: Record<string, string>;
};

export const result = (code: ReasonCode, params?: Record<string, string>): PolicyResult =>
  params ? { code, kind: REASONS[code], params } : { code, kind: REASONS[code] };

/** The result that decides what happens next: the first by kind precedence, warnings never block. */
export function blockingResult(results: readonly PolicyResult[]): PolicyResult | undefined {
  for (const kind of POLICY_KINDS) {
    if (kind === "warning") return undefined;
    const found = results.find((entry) => entry.kind === kind);
    if (found) return found;
  }
  return undefined;
}
