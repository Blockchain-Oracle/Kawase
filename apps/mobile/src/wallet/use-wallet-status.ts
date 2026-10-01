import * as React from "react";

import type { WalletStatus } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

/**
 * The wallet as the api sees it (address, per-network setup, balance, allowance), refreshed on demand. A failed read
 * is its own state (`error`), so a screen can say "couldn't load" with a Retry instead of looking like work in
 * progress or like an empty wallet (Codex review R08). The last good read stays shown while a refresh fails.
 */
export function useWalletStatus() {
  const { status } = useSession();
  const [wallet, setWallet] = React.useState<WalletStatus>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setWallet(undefined);
      setError(false);
      return;
    }
    setLoading(true);
    try {
      setWallet(await api.wallet.status());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { wallet, loading, error, refresh };
}
