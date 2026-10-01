// The in-app inbox (J1, the source of truth for what Kawase did and what came in): read when a screen is in focus,
// marked read when opened. State lives in the component that asks (no module-level store for the React Compiler to
// memoize); a failed read keeps what was shown and says so.
import { useFocusEffect } from "expo-router";
import * as React from "react";

import type { InboxItem } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useInbox() {
  const { status } = useSession();
  const [items, setItems] = React.useState<InboxItem[]>();
  const [unread, setUnread] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const account = status === "account";

  const refresh = React.useCallback(async () => {
    if (!account) return;
    try {
      const result = await api.inbox.list();
      setItems(result.items);
      setUnread(result.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [account]);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const markRead = React.useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setItems((current) => current?.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: now } : item)));
    setUnread((count) => Math.max(0, count - 1));
    await api.inbox.read(id).catch(() => undefined);
  }, []);

  const markAllRead = React.useCallback(async () => {
    const now = new Date().toISOString();
    setItems((current) => current?.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    setUnread(0);
    await api.inbox.readAll().catch(() => undefined);
  }, []);

  return { items, unread, failed, refresh, markRead, markAllRead, account };
}
