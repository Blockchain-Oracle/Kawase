// "Open in <screen>" (front door: cards to screens and back): every agent card and feed row opens the screen it
// belongs to by its intent id, never by re-typed text — `/i/<id>` draws that exact intent live (a draft still waiting
// can be fixed and approved there; a finished one shows what happened; a withdrawal resumes on Withdraw, a margin
// order on its position). A watched automation opens Automations; a conversation opens the thread.
import type { Href } from "expo-router";

import { useT } from "@/i18n";

/** The kinds an intent can be, as the screens name them. */
const SCREEN: Record<string, string> = {
  swap: "feed.open.swap",
  trade: "feed.open.swap",
  send: "feed.open.send",
  practice: "feed.open.send",
  bridge: "feed.open.move",
  crosschain: "feed.open.move",
  earn: "feed.open.earn",
  lend: "feed.open.earn",
  margin: "feed.open.trade",
  withdraw: "feed.open.withdraw",
  automation: "feed.open.automation",
  buy: "feed.open.buy",
};

export type OpenTarget = { label: string; href: Href };

export function useOpenIn() {
  const { t } = useT();
  return {
    /** The intent's own screen, by id. */
    intent: (kind: string, intentId: string): OpenTarget => ({ label: t(SCREEN[kind] ?? "feed.open.details"), href: `/i/${intentId}` as Href }),
    /** The conversation the agent did it in. */
    thread: (threadId: string): OpenTarget => ({ label: t("feed.open.thread"), href: { pathname: "/chat", params: { thread: threadId } } as Href }),
    automations: (): OpenTarget => ({ label: t("feed.open.automation"), href: "/automations" as Href }),
  };
}
