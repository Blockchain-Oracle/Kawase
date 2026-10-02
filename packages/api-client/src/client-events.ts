// What the app reports when a step fails on a phone the team can't see (a TestFlight or store build): the step,
// the classified failure and the error's own words, with anything personal or secret taken out. The api logs it
// as one structured line; nothing is stored.

/** Bounds shared by the app (before sending) and the api (validation). */
export const CLIENT_EVENT_LIMITS = {
  messageMax: 300,
  fieldMax: 64,
  versionMax: 40,
} as const;

export type ClientEvent = {
  /** The step that failed, e.g. a sign-in stage ("code", "proof") or "kit" for the wallet kit's own report. */
  stage: string;
  outcome: "failed";
  /** The app's classification of the failure (sign-in: cancelled, invalidCode, offline, other…). */
  category: string;
  /** The error's code, when it has one (a Turnkey or api code). */
  code?: string | undefined;
  /** The error's message chain, redacted and cut to `messageMax`. */
  message?: string | undefined;
  /** The sign-in attempt, to find the api's own lines for the same attempt. */
  attemptId?: string | undefined;
  appVersion?: string | undefined;
  buildNumber?: string | undefined;
  platform: string;
};

// Order matters: whole tokens and keys go before the shorter patterns could cut them in pieces.
const REDACTIONS: [RegExp, string][] = [
  [/bearer\s+[\w.~+/=-]+/gi, "Bearer [token]"],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/(0x)?[0-9a-f]{32,}/gi, "[hex]"],
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[blob]"],
  [/\b\d{6}\b/g, "[digits]"],
];

/** Takes emails, codes, keys and tokens out of diagnostic text and keeps the rest of the message. */
export function redactDiagnostic(text: string, max: number = CLIENT_EVENT_LIMITS.messageMax): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
