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
  // An account's wallet is being read from the first render, so nothing shows "no wallet" before the first answer.
  const [loading, setLoading] = React.useState(status === "account");
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

  /** The first read has answered (or there is no account): only then may a screen say there is no wallet. */
  const known = status !== "account" || wallet !== undefined || (error && !loading);
  return { wallet, loading, error, known, refresh };
}
