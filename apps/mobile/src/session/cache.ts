// The last good reads the app keeps between launches (B2-3, plan §A.4 12 "Offline"): balances and the portfolio,
// each with when it was read, so an offline start shows them with "updated N min ago" instead of an empty screen.
// Only reads are kept — nothing that moves money is ever queued here or anywhere else. Keys are per person; signing
// out clears them all. A failed read or write of the cache is never fatal.
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "kawase.cache.";

export type Cached<T> = { value: T; at: number };

export async function readCache<T>(key: string): Promise<Cached<T> | undefined> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ value, at: Date.now() } satisfies Cached<T>));
  } catch {
    // Storage full or blocked: the next launch reads from the network.
  }
}

/** Every cached read (sign-out: another person on this device sees nothing of the last one). */
export async function clearCaches(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing kept, or nothing reachable.
  }
}
