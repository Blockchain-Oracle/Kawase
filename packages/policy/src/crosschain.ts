// The checks for one cross-chain move (routes.md): out of Arc to anyone on another chain, or Bring to Arc. Pure, from
// gathered facts: where it goes and from where, to whom (R6: an invalid or unknown recipient asks; a first-time one
// warns), how much against what the origin holds, and whether any route can carry it now. Every move is the owner's
// own yes (Face ID): the daily allowance covers sends on Arc only.
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts, RecipientFacts } from "./send";

export type CrossChainFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  direction: "out" | "in";
  wallet: { registered: boolean; setUp: boolean };
  /** The chain on the far side is known (named, or the only one holding money for Bring to Arc). */
  chain: "found" | "missing" | "unknown";
  /** Out only: own address when nothing was said. */
  recipient: RecipientFacts | { status: "own" };
  amount: AmountFacts;
  /** Base units the origin holds (Arc for out, the source chain for in), and Arc's gas float for out. */
  balance: bigint;
  gasFloat: bigint;
  /** Whether at least one route can carry it now, and why not. */
  route: { status: "ok" } | { status: "none"; reason: string } | { status: "not_requested" };
};

export type CrossChainEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
const s = (value: bigint) => value.toString();
const done = (results: PolicyResult[]): CrossChainEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateCrossChain(facts: CrossChainFacts): CrossChainEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") return done([result(facts.capability.other === "available" ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "bridge" })]);
  if (facts.pausedAll) return done([result("PAUSED_ALL")]);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (facts.direction === "out" && !facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (facts.chain !== "found") results.push(result("DESTINATION_MISSING"));

  const recipient = facts.recipient;
  if (recipient.status === "invalid") results.push(result("RECIPIENT_INVALID", { query: recipient.query }));
  else if (recipient.status === "unknown") results.push(result("RECIPIENT_UNKNOWN", { query: recipient.query }));
  else if (recipient.status === "no_wallet") results.push(result("RECIPIENT_NO_WALLET", { handle: recipient.handle }));
  else if (recipient.status === "ambiguous") results.push(result("RECIPIENT_AMBIGUOUS"));
  else if (recipient.status === "resolved") {
    if (recipient.lookalikeOf) results.push(result("LOOKALIKE_ADDRESS", { name: recipient.lookalikeOf }));
    else if (!recipient.paidBefore && recipient.via === "address") results.push(result("FIRST_TIME_RECIPIENT"));
  }

  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  if (facts.amount.status === "ok" && facts.amount.baseUnits > ZERO) {
    const amount = facts.amount.baseUnits;
    if (amount > facts.balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.balance), asset: "USDC" }));
    else if (facts.direction === "out" && facts.balance - amount < facts.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.gasFloat), asset: "USDC" }));
  }
  if (facts.route.status === "none") results.push(result("QUOTE_UNAVAILABLE", { reason: facts.route.reason }));
  return done(results);
}
