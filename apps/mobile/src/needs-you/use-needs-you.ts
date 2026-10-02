// The Needs-you queue on the device (cards/automate-safety.md): what waits for the person, read when a screen is in
// focus, and the count the Activity badge shows. State lives in the component that asks.
import { useFocusEffect } from "expo-router";
import * as React from "react";

import type { NeedsYouItem } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useNeedsYou() {
  const { status, user } = useSession();
  const [items, setItems] = React.useState<NeedsYouItem[]>();
  const [pending, setPending] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const account = status === "account";
  const network = user?.activeNetwork;

  // Read again on a network switch: the queue is per network.
  const refresh = React.useCallback(async () => {
    if (!account || !network) return;
    try {
      const result = await api.needsYou.list();
      setItems(result.items);
      setPending(result.pending);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [account, network]);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** An item changed here (approved, declined): shown at once, without waiting for the next read. */
  const replace = React.useCallback((item: NeedsYouItem) => {
    setItems((current) => current?.map((entry) => (entry.id === item.id ? item : entry)));
    setPending((count) => (item.status === "pending" ? count : Math.max(0, count - 1)));
  }, []);

  return { items, pending, failed, refresh, replace, account };
}
