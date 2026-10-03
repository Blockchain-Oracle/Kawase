// Recent searches on Markets: the tokens the person opened from a search, newest first, on this device. A
// convenience only (kept in AsyncStorage; a failed read simply shows none), so it never holds anything private.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";

import type { TokenView } from "@kawase/api-client";

const KEY = "kawase.markets.recent";
const KEEP = 8;

export type RecentToken = Pick<TokenView, "chainId" | "address" | "symbol" | "name" | "logoUrl" | "decimals">;

async function read(): Promise<RecentToken[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as RecentToken[]) : [];
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = React.useState<RecentToken[]>([]);
  React.useEffect(() => {
    void read().then(setRecent);
  }, []);

  const remember = React.useCallback(async (token: RecentToken) => {
    const next = [
      { chainId: token.chainId, address: token.address, symbol: token.symbol, name: token.name, logoUrl: token.logoUrl, decimals: token.decimals },
      ...(await read()).filter((entry) => !(entry.chainId === token.chainId && entry.address.toLowerCase() === token.address.toLowerCase())),
    ].slice(0, KEEP);
    setRecent(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const clear = React.useCallback(async () => {
    setRecent([]);
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  }, []);

  return { recent, remember, clear };
}
