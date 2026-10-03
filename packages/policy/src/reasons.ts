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
  /** R6: the recipient is a token contract (money sent there is lost). */
  RECIPIENT_TOKEN_CONTRACT: "policy",
  /** R6: the token's issuer has blocked the recipient (USDC/EURC blocklist). */
  RECIPIENT_ISSUER_BLOCKED: "policy",
  /** R6: an address that looks like a saved contact's but is not it (a lookalike) is never paid. */
  LOOKALIKE_ADDRESS: "policy",
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
  /** The person's token rules allow only tokens Kawase vouches for (D12 access level "verified only"). */
  TOKEN_RULE_ACCESS: "policy",
  // Preconditions: one fix, then the same request resumes.
  SIGN_IN_REQUIRED: "precondition",
  WALLET_NOT_READY: "precondition",
  WALLET_NOT_SET_UP: "precondition",
  ON_OTHER_NETWORK: "precondition",
  INSUFFICIENT_BALANCE: "precondition",
  INSUFFICIENT_GAS: "precondition",
  /** Short of USDC for the fee, and Kawase's relayer has paid this person's fees as often or as much as it does in a day. */
  GAS_RELAY_LIMIT: "precondition",
  /** Short of USDC for the fee, and Kawase's relayer has spent its gas budget for the day (security review H5). */
  GAS_RELAY_BUDGET_SPENT: "precondition",
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
  /** A cross-chain move names an asset Kawase cannot find on that side. */
  MOVE_ASSET_UNKNOWN: "clarification",
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
  /** R6: a contract that is not a known smart wallet: it may not be able to move what it receives. */
  RECIPIENT_CONTRACT: "warning",
  UNSAVED_ADDRESS: "warning",
  ABOVE_ALLOWANCE: "warning",
  NO_ALLOWANCE: "warning",
  LEAVES_LITTLE_FOR_FEES: "warning",
  /** The wallet cannot pay this send's fee, so Kawase's EIP-3009 relayer carries it and pays the fee (no dead end). */
  GAS_RELAYED: "warning",
  /** A batch (swap, bridge, earn, lend, margin, cross-chain) the wallet cannot pay the fee for: Kawase's relayer sends it. */
  FEE_PAID_BY_KAWASE: "warning",
  RATE_BELOW_REFERENCE: "warning",
  /** Buying a token Kawase does not vouch for (unverified or a lookalike): shown on the card. */
  TOKEN_UNVERIFIED: "warning",
  VAULT_LOW_LIQUIDITY: "warning",
  /** The wallet holds less than one run today; runs skip until it is topped up. */
  FIRST_RUN_UNDERFUNDED: "warning",
  /** A run skipped because this period's amount was already sent (the grant's cap). */
  AUTOMATION_PERIOD_USED: "warning",
  VAULT_RISK_WARNING: "warning",
  /** Paused: the agent and automations stand still; the person's own Face ID still works (D-pause). */
  AGENT_PAUSED: "warning",
  /**
   * A new address is still in its cooldown and this is above what it may get without the person: nothing goes on the
   * allowance or by an automation (it waits in Needs you); the person's own Face ID send is never blocked (D-cooldown).
   */
  NEW_RECIPIENT_COOLDOWN: "warning",
  /** First payment to this address: offer a small test amount first. */
  TEST_AMOUNT_SUGGESTED: "warning",
  /**
   * The brake (cards/automate-safety.md): a risky action warns and needs the person's explicit override (Face ID on
   * the card) — over half the balance to someone new, a price impact over the rule, leverage above 5×.
   */
  BRAKE_HALF_BALANCE: "warning",
  BRAKE_PRICE_IMPACT: "warning",
  BRAKE_LEVERAGE: "warning",
  /** Only allowlisted recipients go without the person; this one needs their Face ID. */
  NOT_ON_ALLOWLIST: "warning",
  /** Above the human-approval threshold ($100 on mainnet): never on the allowance, whatever the risk dial. */
  ABOVE_APPROVAL_THRESHOLD: "warning",
  /** Past what one address gets in a week without the person ($200 on mainnet): this one needs their Face ID. */
  OVER_RECIPIENT_WEEKLY: "warning",
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

/** The brake codes: an approval while one is present must carry the person's explicit override. */
export const BRAKE_CODES: ReadonlySet<ReasonCode> = new Set(["BRAKE_HALF_BALANCE", "BRAKE_PRICE_IMPACT", "BRAKE_LEVERAGE"]);
export const hasBrake = (results: readonly { code: string }[]) => results.some((entry) => BRAKE_CODES.has(entry.code as ReasonCode));
