import { MS_PER_SECOND, SECONDS_PER_MINUTE, SECONDS_PER_HOUR } from "./units";

/** A proposed intent that is not approved in this time expires (the user can re-ask). */
export const INTENT_TTL_S = 15 * SECONDS_PER_MINUTE;
/** A quote older than this is re-quoted before approval. */
export const QUOTE_TTL_S = 30;
export const APPROVAL_TTL_S = 10 * SECONDS_PER_MINUTE;
/** Per-provider timeout when fanning out bridge/swap quotes (cheapest-route-design.md). */
export const PROVIDER_QUOTE_TIMEOUT_MS = 3 * MS_PER_SECOND;
/** A passkey step-up older than this must be repeated before loosening a setting. */
export const STEP_UP_MAX_AGE_S = 5 * SECONDS_PER_MINUTE;
export const CHANNEL_LINK_TOKEN_TTL_S = 15 * SECONDS_PER_MINUTE;
export const RESUME_TOKEN_TTL_S = 24 * SECONDS_PER_HOUR;
/** How many times the agent re-asks for a missing value before moving the question to the screen. */
export const RESUME_MAX_REASKS = 2;
/** How often the api looks again at sends whose outcome is not known yet. */
export const RECONCILE_INTERVAL_MS = 15 * MS_PER_SECOND;
/** A send still unsettled after this long is shown as "checking" (unknown outcome), never retried on its own. */
export const SEND_UNKNOWN_AFTER_S = 5 * SECONDS_PER_MINUTE;
