// Every guard verdict as words (i18n namespace `budget`): the chip a silent action shows, or the line and the fix a
// card offers when it is not silent ("Blockers are the fix": never a bare "not allowed").
import type { BudgetCategory } from "@kawase/wallet";

import type { GuardRefusal, GuardVerdict } from "./guard";

/** What the fix button does; the Stage 3 card maps each to its sheet or to the ordinary approval. */
export type GuardFix = "set_budget" | "resign_budget" | "resume" | "change_mode" | "stop_practice" | "retry" | "edit_budget" | "approve_once" | "review";

const FIX: Record<GuardRefusal, GuardFix> = {
  no_budget: "set_budget",
  budget_unverified: "resign_budget",
  paused: "resume",
  guard_mode: "change_mode",
  practice: "stop_practice",
  settings_unknown: "retry",
  category_off: "edit_budget",
  venue_off: "edit_budget",
  token_unvetted: "approve_once",
  new_person: "approve_once",
  new_destination: "approve_once",
  unpriced: "approve_once",
  price_off: "review",
  over_action_cap: "approve_once",
  over_week: "approve_once",
  leaf_refused: "review",
};

export type GuardCopy = { line: string; fixLabel?: string | undefined; fix?: GuardFix | undefined };

/** The i18n keys for a verdict; `web` picks "no code" over "no Face ID" for the chip. */
export function guardCopyKeys(verdict: GuardVerdict, web = false): GuardCopy {
  if (verdict.silent) return { line: web ? "budget.insideChipWeb" : "budget.insideChip" };
  return { line: `budget.reason.${verdict.reason}`, fixLabel: `budget.fix.${verdict.reason}`, fix: FIX[verdict.reason] };
}

export const categoryKey = (category: BudgetCategory) => `budget.category.${category}`;
