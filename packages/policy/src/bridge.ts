// The checks for one bridge out of Arc (Stage 6b), as a pure function of gathered facts: the destination chain, the
// amount against the balance and the route's fee, and whether a route answered. A bridge moves the person's own
// USDC to their own address on another chain, so it is not spending (no limits), but it is always their own yes
// (Face ID): the allowance covers transfers on Arc only.
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type BridgeFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: { registered: boolean; setUp: boolean; usdc: bigint };
  /** The destination the person named, if any. */
  destination: string | undefined;
  /** Base units of USDC. */
  amount: AmountFacts;
  route: { status: "ok"; maxRouteFee: bigint } | { status: "unavailable" } | { status: "not_requested" };
  thresholds: { gasFloat: bigint };
};

export type BridgeEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
const s = (value: bigint) => value.toString();

const done = (results: PolicyResult[]): BridgeEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateBridge(facts: BridgeFacts): BridgeEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "bridge" })]);
  }
  if (facts.pausedAll) return done([result("PAUSED_ALL")]);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  // Approve + burn go out as one batch from the wallet's own EIP-7702 code.
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (!facts.destination) results.push(result("DESTINATION_MISSING"));
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  const amount = facts.amount.status === "ok" && facts.amount.baseUnits > ZERO ? facts.amount.baseUnits : undefined;
  if (!facts.destination || amount === undefined) return done(results);

  if (amount > facts.wallet.usdc) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.wallet.usdc), asset: "USDC" }));
  else if (facts.wallet.usdc - amount < facts.thresholds.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
  if (facts.route.status === "unavailable") results.push(result("QUOTE_UNAVAILABLE"));
  if (facts.route.status === "ok" && amount <= facts.route.maxRouteFee)
    results.push(result("AMOUNT_BELOW_FEE", { fee: s(facts.route.maxRouteFee), asset: "USDC" }));
  return done(results);
}
