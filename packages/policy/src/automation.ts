// The checks for turning an automation on (Stage 8), as a pure function of gathered facts. Who and how much follow
// the send rules (a resolved recipient, a valid amount within the person's per-send limit); the schedule must be
// one Kawase can keep; the wallet must be set up, since the automation's grant lives in its EIP-7702 code. Each
// run is checked again when it happens (the send rules on fresh facts), and a run that cannot go is skipped with
// its reason, never squeezed through.
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts, RecipientFacts } from "./send";

export type AutomationFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  wallet: { registered: boolean; setUp: boolean; balance: bigint };
  recipient: RecipientFacts;
  amount: AmountFacts;
  asset: "USDC" | "EURC";
  schedule: { valid: boolean };
  limits: { perTx: bigint };
};

export type AutomationEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
const s = (value: bigint) => value.toString();
const done = (results: PolicyResult[]): AutomationEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateAutomation(facts: AutomationFacts): AutomationEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "automations" })]);
  }
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));

  const recipient = facts.recipient;
  switch (recipient.status) {
    case "missing":
      results.push(result("RECIPIENT_MISSING"));
      break;
    case "unknown":
      results.push(result("RECIPIENT_UNKNOWN", { query: recipient.query }));
      break;
    case "ambiguous":
      results.push(result("RECIPIENT_AMBIGUOUS", { query: recipient.query, count: String(recipient.count) }));
      break;
    case "invalid":
      results.push(result("RECIPIENT_INVALID", { query: recipient.query }));
      break;
    case "self":
      results.push(result("RECIPIENT_IS_SELF"));
      break;
    case "no_wallet":
      results.push(result("RECIPIENT_NO_WALLET", { handle: recipient.handle }));
      break;
    case "resolved":
      if (recipient.blocked) results.push(result("RECIPIENT_BLOCKED", { name: recipient.name ?? "" }));
      if (recipient.holdUntil) results.push(result("ADDRESS_CHANGE_HOLD", { name: recipient.name ?? "", until: recipient.holdUntil }));
      if (recipient.lookalikeOf) results.push(result("LOOKALIKE_ADDRESS", { name: recipient.lookalikeOf }));
      if (recipient.via === "address") results.push(result("UNSAVED_ADDRESS"));
      break;
  }
  if (!facts.schedule.valid) results.push(result("SCHEDULE_INVALID"));
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  if (facts.amount.status === "ok" && facts.amount.baseUnits > ZERO) {
    const amount = facts.amount.baseUnits;
    if (amount > facts.limits.perTx) results.push(result("OVER_PER_TX_LIMIT", { limit: s(facts.limits.perTx), asset: facts.asset }));
    if (amount > facts.wallet.balance) results.push(result("FIRST_RUN_UNDERFUNDED", { balance: s(facts.wallet.balance), asset: facts.asset }));
  }
  return done(results);
}

export type AutoSaveFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  wallet: { registered: boolean; setUp: boolean };
  vault: { status: "found"; active: boolean; lowLiquidity: boolean; warnings: string[] } | { status: "missing" };
  keep: AmountFacts;
  schedule: { valid: boolean };
  /** Auto-save is already on (or paused) on this network. */
  existing: boolean;
};

/**
 * Turning Auto-save on: a vault that takes deposits, an amount to keep ready, a schedule Kawase can keep, and no other
 * Auto-save here. What the grants allow is fixed by code (only between the wallet and its own position in that vault),
 * so there is no per-period cap to check; each run looks at the balance afresh.
 */
export function evaluateAutoSave(facts: AutoSaveFacts): AutomationEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "automations" })]);
  }
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (facts.vault.status === "missing") return done([...results, result("VAULT_UNAVAILABLE")]);
  if (!facts.vault.active) results.push(result("VAULT_UNAVAILABLE"));
  if (facts.existing) results.push(result("AUTO_SAVE_EXISTS"));
  if (!facts.schedule.valid) results.push(result("SCHEDULE_INVALID"));
  if (facts.keep.status === "invalid" || (facts.keep.status === "ok" && facts.keep.baseUnits < ZERO)) results.push(result("AMOUNT_INVALID"));
  if (facts.vault.lowLiquidity) results.push(result("VAULT_LOW_LIQUIDITY"));
  if (facts.vault.warnings.length > 0) results.push(result("VAULT_RISK_WARNING", { warnings: facts.vault.warnings.join(", ") }));
  return done(results);
}

export type RuleFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  /** The step's own capability (bridge, yield); notify needs none. */
  stepCapability: CapabilityState | null;
  signedIn: boolean;
  wallet: { registered: boolean; setUp: boolean };
  trigger: {
    type: "balance_above" | "balance_below" | "money_in" | "price" | "money_out";
    threshold: AmountFacts | null;
    from: RecipientFacts | null;
    minAmount: AmountFacts | null;
    /** Price: both tokens found, and the amount in and least out. */
    price?: { tokens: boolean; amountIn: AmountFacts; minOut: AmountFacts } | undefined;
  };
  step:
    | { type: "bridge"; destination: boolean }
    | { type: "save"; vault: { status: "found"; active: boolean; warnings: string[] } | { status: "missing" } }
    | { type: "notify" }
    /** Send to someone else: who, resolved by the send rules, and the daily cap. */
    | { type: "send"; recipient: RecipientFacts; capPerDay: AmountFacts }
    /** A swap: both tokens found. */
    | { type: "swap"; tokens: boolean };
  amount: { mode: "fixed" | "excess" | "percent" | "roundup"; value: AmountFacts | null; percent: number | null } | null;
};

const MAX_PERCENT = 100;
const positive = (facts: AmountFacts | null) => facts?.status === "ok" && facts.baseUnits > ZERO;

/**
 * Turning a rule on: the trigger has its number (and a known sender, if one was named), the step can run here (its
 * capability, the chain or the vault), the amount rule is complete, and the wallet is set up (its grants live there;
 * an alert needs no grant but still reads the wallet). Each run checks again on fresh facts.
 */
export function evaluateRule(facts: RuleFacts): AutomationEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "automations" })]);
  }
  if (facts.stepCapability !== null && facts.stepCapability !== "available") return done([result("NOT_AVAILABLE_YET", { capability: facts.step.type === "bridge" ? "bridge" : "yield" })]);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.wallet.setUp && facts.step.type !== "notify") results.push(result("WALLET_NOT_SET_UP"));

  const trigger = facts.trigger;
  const lineTrigger = trigger.type === "balance_above" || trigger.type === "balance_below";
  if (lineTrigger && !positive(trigger.threshold)) results.push(result("RULE_INCOMPLETE", { missing: "threshold" }));
  if (trigger.type === "price") {
    if (!trigger.price?.tokens) results.push(result("ASSET_UNCLEAR"));
    else if (!positive(trigger.price.amountIn)) results.push(result("RULE_INCOMPLETE", { missing: "amount" }));
    else if (!positive(trigger.price.minOut)) results.push(result("RULE_INCOMPLETE", { missing: "threshold" }));
    // A price acts by swapping (always attended) or by telling the person.
    if (facts.step.type !== "swap" && facts.step.type !== "notify") results.push(result("RULE_INCOMPLETE", { missing: "step" }));
  }
  // Round-ups save the change of each payment: they need a vault to save into.
  if (trigger.type === "money_out" && facts.step.type !== "save") results.push(result("RULE_INCOMPLETE", { missing: "step" }));
  if (trigger.type === "money_in" && trigger.minAmount && trigger.minAmount.status === "invalid") results.push(result("AMOUNT_INVALID"));
  const from = trigger.from;
  if (from && from.status !== "resolved") {
    if (from.status === "unknown") results.push(result("RECIPIENT_UNKNOWN", { query: from.query }));
    else if (from.status === "ambiguous") results.push(result("RECIPIENT_AMBIGUOUS", { query: from.query, count: String(from.count) }));
    else if (from.status === "invalid") results.push(result("RECIPIENT_INVALID", { query: from.query }));
  }

  const step = facts.step;
  if (step.type === "bridge" && !step.destination) results.push(result("DESTINATION_MISSING"));
  if (step.type === "save") {
    if (step.vault.status === "missing" || !step.vault.active) results.push(result("VAULT_UNAVAILABLE"));
    else if (step.vault.warnings.length > 0) results.push(result("VAULT_RISK_WARNING", { warnings: step.vault.warnings.join(", ") }));
  }
  if (step.type === "send") {
    const to = step.recipient;
    if (to.status === "missing") results.push(result("RECIPIENT_MISSING"));
    else if (to.status === "unknown") results.push(result("RECIPIENT_UNKNOWN", { query: to.query }));
    else if (to.status === "ambiguous") results.push(result("RECIPIENT_AMBIGUOUS", { query: to.query, count: String(to.count) }));
    else if (to.status === "invalid") results.push(result("RECIPIENT_INVALID", { query: to.query }));
    else if (to.status === "self") results.push(result("RECIPIENT_IS_SELF"));
    else if (to.status === "no_wallet") results.push(result("RECIPIENT_NO_WALLET", { handle: to.handle }));
    else {
      if (to.blocked) results.push(result("RECIPIENT_BLOCKED", { name: to.name ?? "" }));
      if (to.holdUntil) results.push(result("ADDRESS_CHANGE_HOLD", { name: to.name ?? "", until: to.holdUntil }));
      if (to.lookalikeOf) results.push(result("LOOKALIKE_ADDRESS", { name: to.lookalikeOf }));
    }
    if (!positive(step.capPerDay)) results.push(result("RULE_INCOMPLETE", { missing: "cap" }));
  }
  if (step.type === "swap" && !step.tokens) results.push(result("ASSET_UNCLEAR"));

  // A price's swap moves the trigger's own amount; a round-up's amount is the change of each payment.
  if (step.type !== "notify" && trigger.type !== "price" && trigger.type !== "money_out") {
    const amount = facts.amount;
    if (!amount) results.push(result("RULE_INCOMPLETE", { missing: "amount" }));
    else if (amount.mode === "percent") {
      if (trigger.type !== "money_in") results.push(result("RULE_INCOMPLETE", { missing: "amount" }));
      else if (amount.percent === null || amount.percent <= 0 || amount.percent > MAX_PERCENT) results.push(result("RULE_INCOMPLETE", { missing: "percent" }));
    } else if (amount.mode === "excess") {
      if (trigger.type !== "balance_above") results.push(result("RULE_INCOMPLETE", { missing: "amount" }));
      else if (amount.value && amount.value.status === "invalid") results.push(result("AMOUNT_INVALID"));
    } else if (amount.mode === "roundup") results.push(result("RULE_INCOMPLETE", { missing: "amount" }));
    else if (!positive(amount.value)) results.push(result(amount.value?.status === "invalid" ? "AMOUNT_INVALID" : "RULE_INCOMPLETE", { missing: "amount" }));
  }
  return done(results);
}

export type DcaFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  /** The swap capability here: a DCA is a swap on a schedule. */
  swap: CapabilityState;
  signedIn: boolean;
  wallet: { registered: boolean; balance: bigint };
  tokens: { from: boolean; to: boolean; same: boolean };
  amount: AmountFacts;
  schedule: { valid: boolean };
};

/**
 * Turning a DCA on: both tokens known and different, an amount, a schedule. It holds no grant: every run waits in Needs
 * you with a fresh quote and the person confirms the swap (R5: every swap is confirmed by the person).
 */
export function evaluateDca(facts: DcaFacts): AutomationEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "automations" })]);
  }
  if (facts.swap !== "available") return done([result("NOT_AVAILABLE_YET", { capability: "swap" })]);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.tokens.from || !facts.tokens.to) results.push(result("ASSET_UNCLEAR"));
  else if (facts.tokens.same) results.push(result("SWAP_SAME_TOKEN"));
  if (!facts.schedule.valid) results.push(result("SCHEDULE_INVALID"));
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  if (facts.amount.status === "ok" && facts.amount.baseUnits > facts.wallet.balance) results.push(result("FIRST_RUN_UNDERFUNDED", { balance: s(facts.wallet.balance), asset: "" }));
  return done(results);
}
