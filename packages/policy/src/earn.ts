// The checks for one earn action (Stage 6c), as a pure function of gathered facts: the vault (status, how much it
// can pay out now), the person's USDC and their position in it. Moving their own money into or out of a vault is
// not spending (no limits), but it is always their own yes (Face ID): the allowance covers transfers only.
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type EarnFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: { registered: boolean; setUp: boolean; usdc: bigint };
  action: "deposit" | "withdraw";
  vault:
    | { status: "missing" }
    | { status: "found"; active: boolean; lowLiquidity: boolean; stuck?: boolean; warnings: string[]; available: bigint; position: bigint };
  /** USDC base units. */
  amount: AmountFacts;
  thresholds: { gasFloat: bigint };
};

export type EarnEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
const s = (value: bigint) => value.toString();
const done = (results: PolicyResult[]): EarnEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateEarn(facts: EarnFacts): EarnEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "yield" })]);
  }
  // Pause all stops the agent and automations; this is always the person's own yes, so it is never blocked (D-pause).
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (facts.vault.status === "missing") return done([...results, result("VAULT_UNAVAILABLE")]);
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  const amount = facts.amount.status === "ok" && facts.amount.baseUnits > ZERO ? facts.amount.baseUnits : undefined;
  if (amount === undefined) return done(results);

  const vault = facts.vault;
  if (facts.action === "deposit") {
    if (!vault.active) results.push(result("VAULT_UNAVAILABLE"));
    if (amount > facts.wallet.usdc) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.wallet.usdc), asset: "USDC" }));
    else if (facts.wallet.usdc - amount < facts.thresholds.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
    // Never into a source that could not give it back now (gaps.md G1); low liquidity is a warning on the card.
    if (vault.stuck) results.push(result("VAULT_LIQUIDITY_STUCK", { available: s(vault.available), asset: "USDC" }));
    else if (vault.lowLiquidity) results.push(result("VAULT_LOW_LIQUIDITY"));
  } else {
    if (amount > vault.position) results.push(result("OVER_POSITION", { position: s(vault.position), asset: "USDC" }));
    else if (amount > vault.available) results.push(result("VAULT_LIQUIDITY_SHORT", { available: s(vault.available), asset: "USDC" }));
    if (facts.wallet.usdc < facts.thresholds.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
  }
  if (vault.warnings.length > 0) results.push(result("VAULT_RISK_WARNING", { warnings: vault.warnings.join(", ") }));
  return done(results);
}
