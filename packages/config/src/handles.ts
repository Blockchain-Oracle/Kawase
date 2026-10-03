/**
 * The optional @handle (D35): a public, unique name a user can be paid by ("send 10 to @abu"). Rules are shared by
 * the api (validation, availability) and the app (the field's state slot).
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
/** Lowercase letters, digits and underscore; the api lowercases before checking uniqueness. */
export const HANDLE_PATTERN = /^[a-z0-9_]+$/;
/** How long the field waits after the last keystroke before asking the api. */
export const HANDLE_CHECK_DEBOUNCE_MS = 350;
/** Names that would impersonate the product, its partners or staff. */
export const RESERVED_HANDLES = new Set([
  "kawase",
  "kawase_app",
  "kawaseapp",
  "arc",
  "arcnetwork",
  "circle",
  "usdc",
  "eurc",
  "admin",
  "administrator",
  "support",
  "help",
  "official",
  "staff",
  "team",
  "security",
  "root",
  "system",
  "null",
  "undefined",
  "me",
  "you",
  "everyone",
  "anonymous",
  "guest",
]);

export type HandleProblem = "too_short" | "too_long" | "invalid" | "reserved";

/** Any handle that reads as Kawase itself (@kawasedemo, @kawase_support…) could pass for the app: reserved too. */
const IMPERSONATES_KAWASE = /kawase/;

/** Returns the first rule the handle breaks, or null. Uniqueness is the api's job. */
export const normalizeHandle = (raw: string): string => raw.trim().toLowerCase().replace(/^@/, "");

export const handleProblem = (raw: string): HandleProblem | null => {
  const handle = normalizeHandle(raw);
  if (handle.length < HANDLE_MIN) return "too_short";
  if (handle.length > HANDLE_MAX) return "too_long";
  if (!HANDLE_PATTERN.test(handle)) return "invalid";
  if (RESERVED_HANDLES.has(handle) || IMPERSONATES_KAWASE.test(handle)) return "reserved";
  return null;
};
