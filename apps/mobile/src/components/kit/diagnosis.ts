// What went wrong, in one small vocabulary every state and every money action shares (Mitoshi's Diagnosis, Kawase's
// kinds). An error becomes a Diagnosis once, at the edge; the kit then draws honest words for it (`shell.diagnosis.*`),
// names the one fix that can help (`fixForDiagnosis`), and says whether money moved (the tx kit). Raw technical text is
// kept for the "technical details" disclosure and never shown as a headline.

export type DiagnosisKind =
  | "offline"
  | "timeout"
  | "server"
  | "rate-limited"
  | "balance"
  | "gas"
  | "limit"
  | "sign-in"
  | "wallet"
  | "rejected"
  | "slippage"
  | "expired"
  | "unknown";

export type Diagnosis = {
  kind: DiagnosisKind;
  /** Trying the same thing again can help (a dropped connection yes, an empty balance no). */
  retryable: boolean;
  /** The raw message or code, for the technical disclosure only. */
  technical?: string;
  errorName?: string;
};

/** The one action that can fix a blocker, named so the button wears it ("Add money", "Set a budget"). */
export type BlockerFixKind =
  "add-money" | "sign-in" | "set-budget" | "raise-limit" | "switch-network" | "setup-wallet" | "retry";
export type BlockerFix = { kind: BlockerFixKind };

/** API error codes the app already speaks (use-resume's blocking codes) mapped to a kind. */
const CODE_KIND: Record<string, DiagnosisKind> = {
  SIGN_IN_REQUIRED: "sign-in",
  ACCOUNT_REQUIRED: "sign-in",
  WALLET_NOT_READY: "wallet",
  WALLET_NOT_SET_UP: "wallet",
  NO_WALLET: "wallet",
  NO_ALLOWANCE: "limit",
  INSUFFICIENT_BALANCE: "balance",
  INSUFFICIENT_GAS: "gas",
  GAS_RELAY_LIMIT: "gas",
  GAS_RELAY_BUDGET_SPENT: "gas",
  RATE_LIMITED: "rate-limited",
  QUOTE_EXPIRED: "expired",
  SLIPPAGE: "slippage",
  USER_REJECTED: "rejected",
};

const RETRYABLE: ReadonlySet<DiagnosisKind> = new Set([
  "offline",
  "timeout",
  "server",
  "rate-limited",
  "expired",
  "slippage",
  "unknown",
]);

const NETWORK_FAILURE = /network request failed|failed to fetch|networkerror|load failed|offline|internet/i;
const TIMEOUT = /timed? ?out|aborterror|etimedout/i;
const REJECTED = /user (rejected|denied|cancel)|cancell?ed by (the )?user|biometric.*(cancel|fail)/i;
const SERVER_STATUS = 500;
const RATE_LIMIT_STATUS = 429;

/** Turns anything thrown (an api error with a `code`/`status`, a fetch failure, a cancelled prompt) into a Diagnosis. */
export function diagnose(error: unknown, code?: string): Diagnosis {
  const object =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown })
      : {};
  const message = typeof object.message === "string" ? object.message : typeof error === "string" ? error : "";
  const known = code ?? (typeof object.code === "string" ? object.code : undefined);
  const status = typeof object.status === "number" ? object.status : undefined;
  const errorName = typeof object.name === "string" ? object.name : undefined;
  const technical = [known, message].filter(Boolean).join(" · ") || undefined;
  const base = { ...(technical ? { technical } : {}), ...(errorName ? { errorName } : {}) };
  const make = (kind: DiagnosisKind): Diagnosis => ({ kind, retryable: RETRYABLE.has(kind), ...base });
  if (known && known in CODE_KIND) return make(CODE_KIND[known] as DiagnosisKind);
  if (known && /^OVER_/.test(known)) return make("limit");
  if (REJECTED.test(message)) return make("rejected");
  if (status === RATE_LIMIT_STATUS) return make("rate-limited");
  if (status !== undefined && status >= SERVER_STATUS) return make("server");
  if (TIMEOUT.test(`${errorName ?? ""} ${message}`)) return make("timeout");
  if (NETWORK_FAILURE.test(message)) return make("offline");
  return make("unknown");
}

/** The fix that can unblock a diagnosis; null when nothing the person can do will help (then it only names the state). */
export function fixForDiagnosis(kind: DiagnosisKind, retryable: boolean): BlockerFix | null {
  switch (kind) {
    case "balance":
    case "gas":
      return { kind: "add-money" };
    case "sign-in":
      return { kind: "sign-in" };
    case "wallet":
      return { kind: "setup-wallet" };
    case "limit":
      return { kind: "raise-limit" };
    default:
      return retryable ? { kind: "retry" } : null;
  }
}
