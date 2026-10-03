// Automations 8c (cards/automate-safety.md "Automate anything"): payroll and DCA, rules that send to others, swap, act
// on a price or round up, practice runs, editing in place, and the Needs-you queue.
import type { AutomationGrantRequest, NetworkId, SendIntent, SwapIntent, TransactionRequestResponse } from "./types";

type Every = "day" | "week" | "month";
type ScheduleFields = {
  every: Every;
  weekday?: number | undefined;
  monthday?: number | undefined;
  time?: string | undefined;
  timezone?: string | undefined;
};

/** Payroll: several people on one schedule; each line is its own grant pinned to that person. */
export type PayrollAutomationInput = ScheduleFields & {
  lines: { recipient: string; amount: string; asset?: "USDC" | "EURC" | undefined }[];
  note?: string | null | undefined;
};

/** DCA: "buy $10 of ARGUS every day". Tokens as the person said them (a symbol, USDC/EURC, or an address). */
export type DcaInput = ScheduleFields & { from: string; to: string; amount: string };

export type PayrollAutomationView = {
  lines: { recipientWords: string; recipientName: string | null; recipientAddress: string | null; asset: "USDC" | "EURC"; amount: string }[];
  note: string | null;
};
export type DcaView = { tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string; decimalsIn: number; decimalsOut: number; amount: string };

/** An edit in place: narrowing applies at once; widening answers with the new grant to sign (and the old one's revoke). */
export type AutomationEdit = {
  every?: Every | undefined;
  weekday?: number | undefined;
  monthday?: number | undefined;
  time?: string | undefined;
  timezone?: string | undefined;
  amount?: string | undefined;
  note?: string | null | undefined;
  /** Drafts only (the asset picker on the card): a scheduled send's currency, or what a DCA buys (any token). */
  asset?: "USDC" | "EURC" | undefined;
  to?: string | undefined;
};
export type AutomationEditResponse = {
  automation: import("./types").AutomationView;
  /** Set when the edit gives the automation more than its grant allows: sign these, then `editActivate`. */
  grant: AutomationGrantRequest | null;
  revoke: TransactionRequestResponse | null;
};

/** What the next runs would do right now ("would have" on fresh facts; the first one dry-run on chain). */
export type SimulatedRun = {
  at: string;
  outcome: "would_send" | "would_swap" | "would_skip" | "would_wait" | "would_ask";
  /** Base units of the token sent or swapped, when it would move money. */
  amount: string | null;
  asset: string | null;
  to: string | null;
  reason: string | null;
  /** The chain's answer to the exact transaction (the first run only). */
  chain: { ok: boolean; error: string | null } | null;
};
export type SimulationView = { automationId: string; network: NetworkId; runs: SimulatedRun[] };

/** One step waiting for the person (Needs you). */
export type NeedsYouRequest =
  | { type: "send"; recipient: string; recipientAddress: string; name: string | null; asset: "USDC" | "EURC"; amount: string; note: string | null }
  | { type: "swap"; tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string; decimalsIn: number; amount: string; quotedOut: string | null; decimalsOut: number | null };

export type NeedsYouItem = {
  id: string;
  network: NetworkId;
  automationId: string | null;
  automationKind: string | null;
  /** Why it waits: NOT_ON_ALLOWLIST, NEW_RECIPIENT_COOLDOWN, OVER_GRANT, SWAP_STEP, PRICE_REACHED. */
  reason: string;
  reasonParams: Record<string, string> | null;
  request: NeedsYouRequest;
  status: "pending" | "approved" | "declined" | "expired";
  intentId: string | null;
  intentKind: "send" | "swap" | null;
  decidedAt: string | null;
  decidedVia: string | null;
  expiresAt: string;
  createdAt: string;
};

export type NeedsYouApproval =
  | { status: "opened"; item: NeedsYouItem; kind: "send"; intent: SendIntent }
  | { status: "opened"; item: NeedsYouItem; kind: "swap"; intent: SwapIntent }
  /** Answered already (here or on another device): what happened, and when. */
  | { status: "answered"; item: NeedsYouItem };

export type NeedsYouApi = {
  list: () => Promise<{ items: NeedsYouItem[]; pending: number }>;
  get: (id: string) => Promise<{ item: NeedsYouItem }>;
  approve: (id: string, via?: "app" | "push" | "web" | "chat") => Promise<NeedsYouApproval>;
  decline: (id: string, via?: "app" | "push" | "web" | "chat") => Promise<{ item: NeedsYouItem }>;
};

export type AutomationsMoreApi = {
  payroll: (input: PayrollAutomationInput) => Promise<{ automation: import("./types").AutomationView }>;
  dca: (input: DcaInput) => Promise<{ automation: import("./types").AutomationView }>;
  /** Turn a draft on in practice: no grant; runs are "would have". */
  practice: (id: string) => Promise<{ automation: import("./types").AutomationView }>;
  simulate: (id: string) => Promise<SimulationView>;
  edit: (id: string, edit: AutomationEdit) => Promise<AutomationEditResponse>;
  editActivate: (id: string, signatures: { grantId: string; signature: string }[]) => Promise<{ automation: import("./types").AutomationView }>;
};
