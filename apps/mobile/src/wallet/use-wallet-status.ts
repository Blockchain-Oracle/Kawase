import * as React from "react";

import type { WalletStatus } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

/** The wallet as the api sees it (address, per-network setup, balance, allowance), refreshed on demand. */
export function useWalletStatus() {
  const { status } = useSession();
  const [wallet, setWallet] = React.useState<WalletStatus>();
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setWallet(undefined);
      return;
    }
    setLoading(true);
    try {
      setWallet(await api.wallet.status());
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { wallet, loading, refresh };
}
