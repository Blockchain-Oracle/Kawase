import * as React from "react";

import type { ActivityItem, NetworkId } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type ActivityState = { status: "idle" | "loading" | "ready" | "error"; items: ActivityItem[] };

/** The wallet's money history on the active network, from the api (which reads the chain's explorer). */
export function useActivity(network: NetworkId) {
  const { status } = useSession();
  const [state, setState] = React.useState<ActivityState>({ status: "idle", items: [] });

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setState({ status: "ready", items: [] });
      return;
    }
    setState((current) => ({ status: current.items.length > 0 ? "ready" : "loading", items: current.items }));
    try {
      const { items } = await api.wallet.activity(network);
      setState({ status: "ready", items });
    } catch {
      setState((current) => ({ status: "error", items: current.items }));
    }
  }, [status, network]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
