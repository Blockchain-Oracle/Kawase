// Talk to Kawase answers sooner (Abu's review 10-15, measured: ~0.6 s for the session, ~2 s to join the room, the
// worker at once, the greeting ~2.4 s later, plus the voice code's download on a first open). Two head starts, both
// free: the voice code loads while the signed-in app is idle, and a session is minted then (and again after each
// conversation), so opening goes straight to joining. Minting dispatches nothing (the worker comes when the room is
// joined) and its thread stays out of the list until something is said, so one that goes unused just expires. A
// session is handed out once, only on the network it was minted for and only while younger than SESSION_FRESH_MS.
import type { VoiceSession } from "@kawase/api-client";

import { api } from "@/session/api";

/** Well inside the token's 30 minutes, and short enough that the voice settings it carries are current. */
const SESSION_FRESH_MS = 300_000;

let code: Promise<unknown> | undefined;
let pending: { at: number; network: string; session: Promise<VoiceSession> } | undefined;

/** Loads the voice code ahead of the first open (idempotent). */
export function preloadVoiceCode(): void {
  code ??= import("./voice-session").catch(() => {
    code = undefined;
  });
}

const fresh = (network: string) => Boolean(pending && pending.network === network && Date.now() - pending.at < SESSION_FRESH_MS);

/** Loads the code and mints a session for `network` now, unless a fresh one is waiting. */
export function prefetchVoice(network: string): void {
  preloadVoiceCode();
  if (fresh(network)) return;
  const session = api.voice.session();
  // A failed head start is forgotten; opening asks again.
  session.catch(() => {
    if (pending?.session === session) pending = undefined;
  });
  pending = { at: Date.now(), network, session };
}

/** The session to join: the prefetched one while it is fresh (handed out once), else a new one. */
export function takeVoiceSession(network: string): Promise<VoiceSession> {
  const ready = fresh(network) ? pending!.session : undefined;
  pending = undefined;
  return ready ?? api.voice.session();
}
