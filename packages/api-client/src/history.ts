// Looking back (cards/automate-safety.md "Look back"): why each movement happened, exports, the weekly report, and
// what Kawase keeps of conversations.
import type { NetworkId } from "./types";

export type WhyKind = "send" | "swap" | "bridge" | "earn" | "automation" | "agent_wallet" | "payout" | "invoice" | "incoming" | "other";

/** One step of the decision record, in order. Codes are words the app translates (policy reason codes, routes). */
export type WhyStep =
  | { step: "asked"; at: string; surface: "app" | "chat" | "voice" | "automation"; words: Record<string, unknown> }
  | { step: "automation"; at: string; automationId: string; kind: string; schedule: string | null; trigger: Record<string, string> | null }
  /** Every check ran; `clear` when none stopped it; warnings shown; anything still open (a fix it needed). */
  | { step: "checked"; at: string; clear: boolean; warnings: string[]; open: string[]; blocking: string | null }
  | { step: "route"; at: string; route: string | null; provider: string | null; alternatives: { provider: string; amountOut?: string | undefined }[] }
  | { step: "approved"; at: string; route: string; via: string }
  | { step: "sent"; at: string; by: string; txHash: string; status: string }
  | { step: "matched"; at: string; what: "request" | "invoice"; reference: string | null }
  | { step: "audit"; at: string; action: string; decision: string | null };

export type WhyView = {
  network: NetworkId;
  txHash: string;
  kind: WhyKind;
  /** What it was, in a few words of data the app formats (an invoice number, a payee count, a provider). */
  facts: Record<string, string | number | null>;
  steps: WhyStep[];
  explorerUrl: string | null;
};

export type ReportView = {
  network: NetworkId;
  from: string;
  to: string;
  /** Per asset, base units. */
  received: Record<string, string>;
  sent: Record<string, string>;
  counts: { received: number; sent: number; swaps: number; bridges: number; earn: number };
  services: { spent: string; purchases: number };
  automations: { ran: number; skipped: number };
  invoices: { paid: number; amount: Record<string, string> };
  /** Decimals of every asset above that is not USDC or EURC (6), e.g. an invoice paid in cirBTC (8). */
  decimals?: Record<string, number> | undefined;
  /** False when the explorer had more history than one report reads. */
  complete: boolean;
};

export type PrivacySettings = {
  /** Conversations older than this many days are deleted; null keeps them until deleted. */
  transcriptRetentionDays: number | null;
  conversations: number;
  oldest: string | null;
};
