// Everything the person holds on the active network (R1): every token on Arc, positions, other chains, Hidden —
// priced by the api. A failed read is its own state and the last good portfolio stays shown (Codex review R08).
// Kept in component state on purpose: no module-level store for the React Compiler to memoize.
import * as React from "react";

import type { PortfolioView } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function usePortfolio() {
  const { status, user } = useSession();
  const network = user?.activeNetwork;
  const [portfolio, setPortfolio] = React.useState<PortfolioView>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setPortfolio(undefined);
      setError(false);
      return;
    }
    setLoading(true);
    try {
      setPortfolio((await api.portfolio.get()).portfolio);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  // A network switch is a different portfolio: drop the old one at once, then read the new.
  React.useEffect(() => {
    setPortfolio((current) => (current && current.network !== network ? undefined : current));
    void refresh();
  }, [refresh, network]);

  const setVisibility = React.useCallback(
    async (address: string, visibility: "auto" | "shown" | "hidden") => {
      await api.portfolio.setVisibility(address, visibility);
      await refresh();
    },
    [refresh],
  );

  return { portfolio, loading, error, refresh, setVisibility };
}
