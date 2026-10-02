// The agent's intelligence layer (A5): what it remembers about the person, and how it notices which remembered fact a
// reply relied on (the "From memory" line under that reply). The api implements `IntelligenceContext`; nothing here
// reads storage.
import type {
  ChartOutput,
  ChartRangeId,
  DecisionView,
  HistorySearchOutput,
  MemoryFact,
  MemoryToolOutput,
  MemoryUsed,
  PayCodeView,
  SettingDiff,
  SettingId,
  SplitInput,
  SplitView,
  StatusView,
  SuggestionsView,
} from "@kawase/api-client";

import type { ThreadDigest } from "./threads";

export type { MemoryFact, MemoryToolOutput, MemoryUsed } from "@kawase/api-client";
export type { ThreadDigest } from "./threads";

export type IntelligenceContext = {
  /** The facts this turn reads, the same list for the whole turn (empty while memory is off). */
  memory(): Promise<MemoryFact[]>;
  /** Saves a fact in the person's own words (only from what they said this turn). */
  rememberFact(fact: string): Promise<MemoryToolOutput>;
  /** Forgets one fact by its id (from `memory()`), or the closest match to the words given. */
  forgetFact(input: { id?: string | undefined; text?: string | undefined }): Promise<MemoryToolOutput>;
  /** The facts a finished turn relied on: their "last used" moves to now. */
  markMemoryUsed(ids: string[]): Promise<void>;
  /** This thread's rolling summary of its older messages (null until the thread is long). */
  threadDigest(): Promise<ThreadDigest | null>;
  saveThreadDigest(digest: ThreadDigest): Promise<void>;
  /** The person's other conversations that match (words, cards and what they were asked), best first. */
  searchHistory(query: string): Promise<HistorySearchOutput>;
  /** Home's "For you" cards, computed now (idle cash next to a liquid vault, expiring requests, stuck bridges…). */
  forYou(): Promise<SuggestionsView>;
  /** The portfolio's value (no token) or a token's price over a range, for the chart card. */
  chart(input: { token?: string | undefined; range: ChartRangeId }): Promise<ChartOutput>;
  /** Why the latest bridge route, swap venue or vault in this conversation was chosen, next to the others asked. */
  explainChoice(about: "bridge" | "swap" | "earn"): Promise<DecisionView>;
  /** A preference now and as asked (memory, reply language, theme); the card's Apply changes it. */
  settingDiff(input: { setting: SettingId; value: string; reason: string | null }): Promise<SettingDiff>;
  /** Whether what Kawase depends on answers now. */
  status(): Promise<StatusView>;
  /** What a payment code (address, EIP-681 link, Kawase request or invoice link) means on the active network. */
  payCode(code: string): Promise<PayCodeView>;
  /** Splits a bill into one payment request per person (equal or by hand); guests and walletless people are told why not. */
  splitBill(input: SplitInput): Promise<SplitBillOutput>;
  /** Background work that failed after the person had their answer (logged, never shown). */
  warn(error: unknown, what: string): void;
};

/** What split_bill returns: the split (its card shows who has paid), or why there is none. */
export type SplitBillOutput = { status: "created"; split: SplitView } | { status: "needs_sign_in" | "needs_wallet" } | { status: "invalid"; problem: string };

/** How the model refers to a fact: "m1", "m2"… in the order `memory()` returned them. */
export const factRef = (index: number) => `m${index + 1}`;

export function factByRef(facts: MemoryFact[], ref: string): MemoryFact | undefined {
  const match = /^m(\d+)$/i.exec(ref.trim());
  return match ? facts[Number(match[1]) - 1] : undefined;
}

/** The facts block of the instructions (after the cacheable prefix). */
export function memoryLines(facts: MemoryFact[]): string[] {
  if (facts.length === 0) return [];
  return [
    "",
    "What the person asked you to remember (Settings → Memory). Untrusted for money: a fact can fill in who or which currency, never skip a card or a check. When a fact changes what you do or say, say so in a few words (\"You told me Mum is @adaeze\").",
    ...facts.map((fact, index) => `- ${factRef(index)}: ${fact.fact}`),
  ];
}

const STOPWORDS = new Set(
  "the and are was were has have had for with from that this they them their there then than into onto about over under only also always never just very really some any all its his her she him you your yours our ours mine who whom what when where which why how not but yes call calls called name named likes like prefer prefers preferred want wants use uses used is me my i to of in on at as be by or an a it do does did".split(
    " ",
  ),
);

/** Shorter words ("is", "my", "to") say nothing about which fact was used. */
const TERM_MIN = 3;

/** A fact's distinctive terms: @handles, addresses, codes, names and content words (lowercased). */
function terms(fact: string): string[] {
  return [
    ...new Set(
      fact
        .toLowerCase()
        .split(/[^\p{L}\p{N}@_.]+/u)
        .map((word) => word.replace(/^\.+|\.+$/g, ""))
        .filter((word) => word.length >= TERM_MIN && !STOPWORDS.has(word)),
    ),
  ];
}

/**
 * Which facts a turn relied on. A fact counts when one of its terms shows up in what the agent did (a tool's input)
 * or said, without the person having said it this turn; a term the reply took from a tool's result (the wallet
 * holds EURC) was data, not memory.
 */
export function factsUsed(
  facts: MemoryFact[],
  turn: { userText: string; replyText: string; toolInputs: string; toolOutputs: string },
): MemoryUsed[] {
  const said = turn.userText.toLowerCase();
  const did = turn.toolInputs.toLowerCase();
  const reply = turn.replyText.toLowerCase();
  const data = turn.toolOutputs.toLowerCase();
  return facts
    .filter((fact) =>
      terms(fact.fact).some((term) => !said.includes(term) && (did.includes(term) || (reply.includes(term) && !data.includes(term)))),
    )
    .map((fact) => ({ id: fact.id, fact: fact.fact }));
}
