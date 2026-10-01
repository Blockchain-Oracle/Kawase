// What a rule does at one check, as a pure function of the facts (review A1). Balance triggers fire once per crossing:
// "above" fires when the balance is at or over the line and the rule is armed, then waits until the balance is back
// under the line to arm again ("below" the mirror image), so a balance that stays high never fires twice. Money in
// fires once per matching receipt (the runner keys each run by the receipt). Amounts: what is above a reserve, a
// share of the receipt, or a fixed amount — never more than the wallet holds above the gas float it needs for its
// own transactions.
import { GAS_FLOAT_USDC_BASE_UNITS } from "@kawase/config";
import type { RuleAction } from "@kawase/db";

const ZERO = 0n;
const PERCENT = 100n;
/** A rule moves nothing smaller than this (USDC base units, 0.01): a run for less is not worth a transaction. */
export const RULE_MIN_MOVE = 10_000n;

export type RulePlan =
  /** Do the step for this amount (null for an alert), and disarm a balance trigger. */
  | { kind: "fire"; amount: bigint | null }
  /** Nothing to do; `rearm` when a balance trigger's balance is back on the other side of its line. */
  | { kind: "wait"; rearm: boolean };

export function planRule(action: RuleAction, facts: { balance: bigint; receipt?: bigint | undefined }): RulePlan {
  const spendable = facts.balance > GAS_FLOAT_USDC_BASE_UNITS ? facts.balance - GAS_FLOAT_USDC_BASE_UNITS : ZERO;
  const trigger = action.trigger;
  if (trigger.type === "balance_above" || trigger.type === "balance_below") {
    const threshold = BigInt(trigger.threshold);
    const crossed = trigger.type === "balance_above" ? facts.balance >= threshold : facts.balance < threshold;
    if (!crossed) return { kind: "wait", rearm: !action.armed };
    if (!action.armed) return { kind: "wait", rearm: false };
    if (action.step.type === "notify") return { kind: "fire", amount: null };
    return sized(amountFor(action, facts.balance, undefined), spendable);
  }
  // Money in.
  if (facts.receipt === undefined) return { kind: "wait", rearm: false };
  if (action.step.type === "notify") return { kind: "fire", amount: null };
  return sized(amountFor(action, facts.balance, facts.receipt), spendable);
}

function amountFor(action: RuleAction, balance: bigint, receipt: bigint | undefined): bigint {
  const amount = action.amount;
  if (amount.mode === "fixed") return BigInt(amount.amount);
  if (amount.mode === "percent") return receipt === undefined ? ZERO : (receipt * BigInt(Math.round(amount.percent))) / PERCENT;
  const reserve = BigInt(amount.reserve);
  const floor = reserve > GAS_FLOAT_USDC_BASE_UNITS ? reserve : GAS_FLOAT_USDC_BASE_UNITS;
  return balance > floor ? balance - floor : ZERO;
}

function sized(amount: bigint, spendable: bigint): RulePlan {
  const capped = amount < spendable ? amount : spendable;
  return capped >= RULE_MIN_MOVE ? { kind: "fire", amount: capped } : { kind: "wait", rearm: false };
}
