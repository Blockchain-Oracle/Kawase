// The receipt slip for any row of the feed (Abu, 10-15: "when you click on out, even though it's a transfer, it's a
// bridge, whatever, it's still receipt"): one builder, so Home, Activity and Why draw the same slip for the same
// movement. Only money that moved has a receipt; a held, failed, practised or scheduled row has none.
import type { AgentFeedItem } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";

import { short, useFeedCopy } from "@/home/feed-copy";

import type { ReceiptData } from "./receipt-slip";

export function useFeedReceipt() {
  const copy = useFeedCopy();
  return (item: AgentFeedItem): ReceiptData | null => {
    if (item.outcome !== "confirmed" || !item.token || !item.amount) return null;
    const ids = arcIdentity(item.network);
    const assetMark = item.token.symbol === "USDC" ? ids.usdc : item.token.symbol === "EURC" ? ids.eurc : undefined;
    const base = { network: item.network, at: item.at, txHash: item.txHash, explorerUrl: item.explorerUrl } as const;
    const venue = copy.venueName(item);
    if (item.kind === "swap" && item.other)
      return {
        ...base,
        kind: "swap",
        direction: "sent",
        amount: `${copy.money(item.other.amount, item.other.token)} → ${copy.money(item.amount, item.token)}`,
        counterparty: venue ?? "Arc",
      };
    return {
      ...base,
      kind: "transfer",
      direction: item.kind === "receive" ? "received" : "sent",
      amount: copy.money(item.amount, item.token),
      counterparty: item.counterparty ? short(item.counterparty) : (venue ?? ""),
      assetMark,
    };
  };
}

/** The row behind a transaction, from the feed this device already read (Why opens from a row). */
export function findByTx(groups: { items: AgentFeedItem[] }[] | undefined, tx: string | undefined): AgentFeedItem | null {
  if (!groups || !tx) return null;
  const hash = tx.toLowerCase();
  for (const group of groups) for (const item of group.items) if (item.txHash?.toLowerCase() === hash) return item;
  return null;
}
