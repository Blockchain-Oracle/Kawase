// Dev mode's wallet (config.ts `isDev`): one throwaway testnet key per dev email, generated on first sign-in and kept
// in this browser's storage, so signing in again as the same `@kawase.test` email finds the same wallet. Never on a
// production build: the api refuses dev sign-in there, and a key here never holds anything but test money.
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STORE = "kawase.dev.keys";
const CURRENT = "kawase.dev.current";

type Keys = Record<string, Hex>;

const storage = (): Storage | undefined => (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage);
/** Native has no localStorage: the key lives as long as the app does (dev mode is for the local web app). */
const memory: { keys: Keys; current: string | undefined } = { keys: {}, current: undefined };

function readKeys(): Keys {
  const raw = storage()?.getItem(STORE);
  if (!raw) return memory.keys;
  try {
    return JSON.parse(raw) as Keys;
  } catch {
    return {};
  }
}

function writeKeys(keys: Keys) {
  memory.keys = keys;
  storage()?.setItem(STORE, JSON.stringify(keys));
}

/** The key for this email, made the first time. */
export function devKeyFor(email: string): Hex {
  const id = email.trim().toLowerCase();
  const keys = readKeys();
  const known = keys[id];
  if (known) return known;
  const key = generatePrivateKey();
  writeKeys({ ...keys, [id]: key });
  return key;
}

/** The signed-in dev email (the signer uses its key), or none after sign-out. */
export function setCurrentDevEmail(email: string | undefined) {
  memory.current = email?.trim().toLowerCase();
  if (email) storage()?.setItem(CURRENT, memory.current!);
  else storage()?.removeItem(CURRENT);
}

export function currentDevEmail(): string | undefined {
  return storage()?.getItem(CURRENT) ?? memory.current;
}

export function currentDevAccount() {
  const email = currentDevEmail();
  return email ? privateKeyToAccount(devKeyFor(email)) : undefined;
}
