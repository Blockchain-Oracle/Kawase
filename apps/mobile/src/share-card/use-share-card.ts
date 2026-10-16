// The card for the signed-in wallet on the current network: the portfolio (its balance snapshots and prices) and the
// timeline Home and Activity already read (one shared feed cache, no extra poll). A guest has no card; a read that fails
// says so with a retry; a wallet with nothing in the period says why. The card is rebuilt only when its inputs change.
import * as React from "react";

import { useAgentFeed } from "@/home/use-agent-feed";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useSession } from "@/session/session-provider";

import { MARKER_GAP_SHARE } from "./layout";
import { buildPeriodCard, type PeriodCardData, type SharePeriod } from "./model";

export type ShareCardState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "empty" }
  | { status: "ready"; card: PeriodCardData };

export function useShareCard(period: SharePeriod): ShareCardState {
  const { status } = useSession();
  const { portfolio, error, refresh } = usePortfolio();
  const agent = useAgentFeed();
  const items = React.useMemo(() => agent.feed?.groups.flatMap((group) => group.items) ?? [], [agent.feed]);
  const retry = React.useCallback(() => {
    void refresh();
    void agent.refresh();
  }, [refresh, agent]);
  const result = React.useMemo(
    () => (portfolio && agent.feed ? buildPeriodCard({ period, portfolio, items, now: Date.now(), markerGap: MARKER_GAP_SHARE }) : null),
    [period, portfolio, items, agent.feed],
  );
  if (status !== "account") return { status: "guest" };
  if (result) return result.status === "ready" ? { status: "ready", card: result.card } : { status: "empty" };
  if ((error && !portfolio) || (agent.error && !agent.feed)) return { status: "error", retry };
  return { status: "loading" };
}
