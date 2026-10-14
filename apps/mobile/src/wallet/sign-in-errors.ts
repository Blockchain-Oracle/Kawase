// What went wrong during sign-in, in the terms the sheet needs to say it truthfully (Codex review R08): the person
// closed a provider's sheet (not an error), the code was wrong or expired, too many codes were asked for, the phone
// is offline, or something else. The Turnkey kit wraps its errors (a `TurnkeyError` whose `cause` holds the original),
// so the whole chain is read: codes, messages and HTTP statuses.
import { ApiError } from "@kawase/api-client";

export type SignInFailure = "cancelled" | "invalidCode" | "expiredCode" | "rateLimited" | "offline" | "other";

// What the Turnkey kit and Apple say when the person closed the provider's sheet: not an error to show.
const CANCELLED = /cancel|did not complete successfully|1001/i;
const INVALID_CODE = /invalid otp|otp code is invalid|INVALID_OTP_CODE/i;
const EXPIRED_CODE = /expired/i;
// Turnkey says "Max number of OTPs have been initiated"; its core rewords that to "Maximum number of OTPs…".
const RATE_LIMITED = /too many|rate.?limit|max(imum)? number of otps|MAX_OTP_INITIATED_ERROR/i;
const OFFLINE = /network request failed|fetch failed|could not connect|offline|timed out|internet connection|NETWORK_ERROR|TIMEOUT/i;
const HTTP_TOO_MANY = 429;
/** How deep the `cause` chain is followed. */
const CHAIN_DEPTH = 5;

type Link = { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; cause?: unknown };

function chain(failure: unknown): Link[] {
  const links: Link[] = [];
  let current: unknown = failure;
  for (let depth = 0; depth < CHAIN_DEPTH && current && typeof current === "object"; depth++) {
    links.push(current as Link);
    current = (current as Link).cause;
  }
  return links;
}

/** True when the person backed out of a provider's sheet, which the screen treats as "nothing happened". */
export const isCancelled = (failure: unknown) =>
  failure instanceof Error && CANCELLED.test(`${failure.message} ${String((failure as { code?: unknown }).code ?? "")}`);

export function classifySignInFailure(failure: unknown): SignInFailure {
  const links = chain(failure);
  if (links.some((link) => CANCELLED.test(`${String(link.message ?? "")} ${String(link.code ?? "")}`))) return "cancelled";
  const text = links.map((link) => `${String(link.message ?? "")} ${String(link.code ?? "")}`).join(" ");
  const statuses = links.map((link) => Number(link.status ?? link.statusCode));
  if (INVALID_CODE.test(text)) return EXPIRED_CODE.test(text) ? "expiredCode" : "invalidCode";
  if (EXPIRED_CODE.test(text) && /otp|code/i.test(text)) return "expiredCode";
  if (RATE_LIMITED.test(text) || statuses.includes(HTTP_TOO_MANY) || (failure instanceof ApiError && failure.code === "rate_limited"))
    return "rateLimited";
  // A failed fetch is a TypeError anywhere in the chain (a sign-in stage wraps it in an AuthStageError).
  if (links.some((link) => link instanceof TypeError) || OFFLINE.test(text)) return "offline";
  return "other";
}
