// Small values the app keeps between launches: the session token (secret, secure storage on native), the
// installation id, the chosen language, and the last user the api confirmed, so an offline start still knows who
// is signed in (Codex review R01).
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { orderedWrite } from "./write-queue";

const KEYS = {
  token: "kawase.session",
  installationId: "kawase.installation",
  locale: "kawase.locale",
  user: "kawase.user",
} as const;

async function read(key: string): Promise<string | undefined> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }
  return (await SecureStore.getItemAsync(key)) ?? undefined;
}

function write(key: string, value: string | undefined): Promise<void> {
  return orderedWrite(key, async () => {
    if (Platform.OS === "web") {
      try {
        if (value === undefined) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, value);
      } catch {
        // Private windows and blocked storage: the session lasts for the page.
      }
      return;
    }
    if (value === undefined) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  });
}

export const sessionStorage = {
  getToken: () => read(KEYS.token),
  setToken: (token: string | undefined) => write(KEYS.token, token),
  getLocale: () => read(KEYS.locale),
  setLocale: (locale: string) => write(KEYS.locale, locale),
  /** The last user the api returned (JSON), or undefined. A damaged value reads as nothing. */
  async getUser<T>(): Promise<T | undefined> {
    const raw = await read(KEYS.user);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setUser: (user: unknown) => write(KEYS.user, user === undefined ? undefined : JSON.stringify(user)),
  /** A stable id per install, made once. */
  async installationId(): Promise<string> {
    const existing = await read(KEYS.installationId);
    if (existing) return existing;
    const created = randomUUID();
    await write(KEYS.installationId, created);
    return created;
  },
};
