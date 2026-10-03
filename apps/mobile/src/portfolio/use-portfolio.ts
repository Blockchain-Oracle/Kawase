// Everything the person holds on the active network (R1): every token on Arc, positions, other chains, Hidden —
// priced by the api. A failed read is its own state and the last good portfolio stays shown (Codex review R08).
// Kept in component state on purpose: no module-level store for the React Compiler to memoize.
import * as React from "react";

import type { PortfolioView } from "@kawase/api-client";

import { api } from "@/session/api";
import { readCache, writeCache } from "@/session/cache";
import { useSession } from "@/session/session-provider";

export function usePortfolio() {
  const { status, user } = useSession();
  const network = user?.activeNetwork;
  // A new display currency is a new rate on every value: read again.
  const currency = user?.displayCurrency;
  const [portfolio, setPortfolio] = React.useState<PortfolioView>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  /** When the portfolio shown was read (a cached one from an earlier launch shows "updated N min ago" while offline). */
  const [updatedAt, setUpdatedAt] = React.useState<number>();
  const cacheKey = user ? `portfolio:${user.id}:${network}:${currency ?? "USD"}` : undefined;

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setPortfolio(undefined);
      setError(false);
      return;
    }
    setLoading(true);
    try {
      const fresh = (await api.portfolio.get()).portfolio;
      setPortfolio(fresh);
      setUpdatedAt(Date.now());
      setError(false);
      if (cacheKey) void writeCache(cacheKey, fresh);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status, cacheKey]);

  // The last good read from an earlier launch shows at once (and stays if the network read fails).
  React.useEffect(() => {
    setUpdatedAt(undefined);
    if (!cacheKey) return;
    let live = true;
    void readCache<PortfolioView>(cacheKey).then((cached) => {
      if (!live || !cached) return;
      setPortfolio((current) => current ?? cached.value);
      setUpdatedAt((current) => current ?? cached.at);
    });
    return () => {
      live = false;
    };
  }, [cacheKey]);

  // A network switch is a different portfolio: drop the old one at once, then read the new.
  React.useEffect(() => {
    setPortfolio((current) => (current && current.network !== network ? undefined : current));
    void refresh();
  }, [refresh, network, currency]);

  const setVisibility = React.useCallback(
    async (address: string, visibility: "auto" | "shown" | "hidden") => {
      await api.portfolio.setVisibility(address, visibility);
      await refresh();
    },
    [refresh],
  );

  return { portfolio, loading, error, updatedAt, refresh, setVisibility };
}
