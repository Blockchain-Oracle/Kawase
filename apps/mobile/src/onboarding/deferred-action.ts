// Value first, sign last (Senryo's `useTermsGate` + `PENDING_LINK`): a guest who taps a money action does not meet a
// login wall. The action is remembered here, the sign-in sheet opens over the page they are on, and once the account
// exists — and any setup it still owes is done — the same action opens by itself, once, without a second tap.
//
// The record is released (ready to run) when sign-in needs no onboarding, or when onboarding finishes
// (`finishOnboarding`); `DeferredActionHost` in the tab shell runs it. Closing the sign-in sheet without signing in
// forgets it. It is kept in storage too, so a kill between sign-in and setup still ends where the person was going.
// It holds a verb, never a URL from outside the app, so it cannot be steered anywhere else.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/** The money actions a guest can start before having an account. */
export const DEFERRED_VERBS = ["send", "receive", "fund", "swap", "bridge"] as const;
export type DeferredVerb = (typeof DEFERRED_VERBS)[number];

export type DeferredAction = {
  verb: DeferredVerb;
  /** When the guest tapped it (an old record is dropped, never run). */
  at: number;
  /** Signed in and set up: the host may run it now. */
  released: boolean;
};

const KEY = "kawase.deferredAction.v1";
/** A tap older than this is not what the person is doing any more. */
const FRESH_MS = 30 * 60 * 1_000;

let pending: DeferredAction | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const isVerb = (value: unknown): value is DeferredVerb =>
  typeof value === "string" && (DEFERRED_VERBS as readonly string[]).includes(value);

function save() {
  const write = pending ? AsyncStorage.setItem(KEY, JSON.stringify(pending)) : AsyncStorage.removeItem(KEY);
  void write.catch(() => undefined);
}

function set(next: DeferredAction | undefined) {
  pending = next;
  save();
  notify();
}

/** A guest tapped a money action: keep it until the account exists. The latest tap wins. */
export function deferAction(verb: DeferredVerb) {
  set({ verb, at: Date.now(), released: false });
}

/** Signed in and nothing more to set up: the action may open now. */
export function releaseDeferredAction() {
  if (pending && !pending.released) set({ ...pending, released: true });
}

/** The sign-in sheet closed without an account, or the person chose something else: forget it. */
export function dropDeferredAction() {
  if (pending) set(undefined);
}

/** The released action, once (it is forgotten as it is taken). Stale records are dropped. */
export function takeDeferredAction(): DeferredVerb | undefined {
  if (!pending?.released) return undefined;
  const { verb, at } = pending;
  set(undefined);
  return Date.now() - at <= FRESH_MS ? verb : undefined;
}

/** What is waiting, for the sign-in sheet's title ("Sign in to send") and setup's last step. */
export const deferredAction = () => pending;

let hydrated = false;
/**
 * Reads a record left by a kill. One that was already released, or whose sign-in then completed (`signedIn`), may run;
 * a stale one is removed.
 */
export async function hydrateDeferredAction(signedIn: boolean): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw || pending) return;
    const stored = JSON.parse(raw) as Partial<DeferredAction>;
    if (!isVerb(stored.verb) || typeof stored.at !== "number" || Date.now() - stored.at > FRESH_MS) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    pending = { verb: stored.verb, at: stored.at, released: Boolean(stored.released) || signedIn };
    notify();
  } catch {
    // Storage is a convenience here: without it the action simply does not resume after a kill.
  }
}

export function useDeferredAction(): DeferredAction | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => pending,
    () => pending,
  );
}
