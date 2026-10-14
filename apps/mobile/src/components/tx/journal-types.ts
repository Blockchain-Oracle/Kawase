// The intent journal's shapes, apart from its storage so the pure recovery reader (and its tests) can use them.

export type IntentKind = "send" | "swap" | "bridge" | "earn" | "buy" | "trade" | "service" | "other";
export type JournalNetwork = "mainnet" | "testnet";

/** What the flow knows about an action before it is signed. */
export interface JournalMark {
  /** In words, for the recovery message: "Swap 2 USDC to EURC", "Send 5 USDC to Ada". */
  what: string;
  kind: IntentKind;
  network: JournalNetwork;
}

export interface JournalEntry extends JournalMark {
  /** The intent's id or digest: what the status is read by. */
  id: string;
  /** Lower-case wallet address. */
  owner: string;
  sentAt: number;
  txHash?: string;
}

/** What reading an intent's status said. "pending" is read again; the rest end it. */
export type IntentReading = "settled" | "failed" | "missing" | "pending" | "unreadable";

export type RecoveryNote = {
  entry: JournalEntry;
  outcome: Exclude<IntentReading, "pending">;
  /** Why this device did not see it: the app was closed, or only the answer was lost on the way. */
  unseen: "closed" | "lost";
};
