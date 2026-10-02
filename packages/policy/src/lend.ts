// The checks for one Aave V4 action (earn-borrow.md): supply, withdraw, borrow (with collateral put in the same
// batch when asked) or repay, as a pure function of gathered facts. A borrow or a withdrawal that would leave the
// account's health under the floor is refused with the floor named; near it, a warning. Every action is the owner's
// own yes (Face ID).
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type LendFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: { registered: boolean; setUp: boolean; usdc: bigint };
  action: "supply" | "withdraw" | "borrow" | "repay";
  asset: { status: "found"; symbol: string; borrowable: boolean; collateralOk: boolean } | { status: "missing" } | { status: "unknown"; name: string };
  amount: AmountFacts | { status: "all" };
  /** What the action can reach: the wallet's balance (supply, repay), the free supply (withdraw), the debt (repay). */
  limit: { balance: bigint; supplied: bigint; debt: bigint };
  collateral: { status: "none" } | { status: "ok"; balance: bigint; amount: bigint } | { status: "not_collateral"; symbol: string };
  health: { afterBps: number | null; minBps: number; warnBps: number };
  gasFloat: bigint;
};

export type LendEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
const BPS = 10_000;
const TENTHS = 100;
const s = (value: bigint) => value.toString();
const health = (bps: number) => (Math.floor(bps / TENTHS) / TENTHS).toString();
const done = (results: PolicyResult[]): LendEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateLend(facts: LendFacts): LendEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") return done([result(facts.capability.other === "available" ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "lend" })]);
  if (facts.pausedAll) return done([result("PAUSED_ALL")]);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (facts.asset.status === "missing") return done([...results, result("ASSET_UNCLEAR")]);
  if (facts.asset.status === "unknown") return done([...results, result("LEND_ASSET_UNAVAILABLE", { asset: facts.asset.name })]);
  if (facts.action === "borrow" && !facts.asset.borrowable) return done([...results, result("LEND_ASSET_UNAVAILABLE", { asset: facts.asset.symbol })]);
  if (facts.collateral.status === "not_collateral") return done([...results, result("LEND_NOT_COLLATERAL", { asset: facts.collateral.symbol })]);

  const amount = facts.amount;
  if (amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (amount.status === "invalid" || (amount.status === "ok" && amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  const value = amount.status === "ok" ? amount.baseUnits : amount.status === "all" ? (facts.action === "repay" ? facts.limit.debt : facts.limit.supplied) : undefined;
  if (value !== undefined && value > ZERO) {
    if (facts.action === "supply" && value > facts.limit.balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.limit.balance), asset: facts.asset.symbol }));
    if (facts.action === "withdraw" && value > facts.limit.supplied) results.push(result("OVER_POSITION", { position: s(facts.limit.supplied), asset: facts.asset.symbol }));
    if (facts.action === "repay") {
      if (facts.limit.debt === ZERO) results.push(result("LEND_NOTHING_OWED", { asset: facts.asset.symbol }));
      else if (value > facts.limit.balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.limit.balance), asset: facts.asset.symbol }));
    }
    if (facts.collateral.status === "ok" && facts.collateral.amount > facts.collateral.balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.collateral.balance), asset: "collateral" }));
  } else if ((facts.action === "withdraw" || facts.action === "repay") && amount.status === "all") {
    results.push(facts.action === "repay" ? result("LEND_NOTHING_OWED", { asset: facts.asset.symbol }) : result("OVER_POSITION", { position: "0", asset: facts.asset.symbol }));
  }
  if (facts.wallet.usdc < facts.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.gasFloat), asset: "USDC" }));

  const after = facts.health.afterBps;
  if ((facts.action === "borrow" || facts.action === "withdraw") && after !== null && after < BPS * BPS) {
    if (after < facts.health.minBps) results.push(result("HEALTH_TOO_LOW", { health: health(after), min: health(facts.health.minBps) }));
    else if (after < facts.health.warnBps) results.push(result("HEALTH_NEAR_LIMIT", { health: health(after) }));
  }
  return done(results);
}
