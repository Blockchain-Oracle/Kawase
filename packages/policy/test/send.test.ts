// M9: the human-approval threshold and the per-recipient weekly cap (packages/config limits.ts) are enforced. Above the
// threshold, or past what one address gets in a week, a send never goes on the allowance — whatever the risk dial — and
// takes the person's own yes; neither ever stops the person's own Face ID send (X31).
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LIMITS } from "@kawase/config";

import { evaluateSend, type SendFacts } from "../src";

const limits = DEFAULT_LIMITS.mainnet;
const USDC = (value: number) => BigInt(Math.round(value * 1_000_000));

/** A paid-before, saved, allowlisted contact; the USDC allowance on with room; nothing else in the way. */
function facts(amount: number, change: Partial<SendFacts> = {}): SendFacts {
  return {
    network: "mainnet",
    capability: { here: "available", other: "available" },
    signedIn: true,
    pausedAll: false,
    wallet: { registered: true, setUp: true, balance: USDC(1000), usdc: USDC(1000) },
    recipient: { status: "resolved", address: "0x1111111111111111111111111111111111111111", via: "contact", name: "Mum", paidBefore: true, allowlisted: true },
    asset: "USDC",
    assetUnclear: false,
    isUsdc: true,
    allowable: true,
    amount: { status: "ok", baseUnits: USDC(amount) },
    allowance: { active: true, available: USDC(500) },
    riskMode: "balanced",
    limits: { perTx: limits.perTransaction, daily: limits.daily, weekly: limits.weekly, perRecipientWeekly: limits.perRecipientWeekly },
    spent: { day: 0n, week: 0n, recipientWeek: 0n },
    thresholds: { approval: limits.approvalThreshold, firstTimeStepUp: limits.firstTimeRecipientApprovalThreshold, gasFloat: USDC(0.05) },
    ...change,
  };
}
const codes = (evaluation: ReturnType<typeof evaluateSend>) => evaluation.results.map((entry) => entry.code);

test("the mainnet defaults the rules read: $100 approval threshold, $200 a week to one address", () => {
  assert.equal(limits.approvalThreshold, USDC(100));
  assert.equal(limits.perRecipientWeekly, USDC(200));
});

test("up to the approval threshold a send can go on the allowance; above it, it takes the person's own yes", () => {
  const at = evaluateSend(facts(100));
  assert.equal(at.route, "allowance");
  assert.equal(codes(at).includes("ABOVE_APPROVAL_THRESHOLD"), false);
  const above = evaluateSend(facts(150));
  assert.equal(above.route, "wallet_signature");
  assert.equal(above.blocking, undefined, "the person's own yes still sends it");
  const result = above.results.find((entry) => entry.code === "ABOVE_APPROVAL_THRESHOLD");
  assert.deepEqual(result?.params, { limit: USDC(100).toString(), asset: "USDC" });
  assert.equal(result?.kind, "warning");
});

test("the approval threshold holds on Autonomous too", () => {
  assert.equal(evaluateSend(facts(150, { riskMode: "autonomous" })).route, "wallet_signature");
  assert.equal(evaluateSend(facts(90, { riskMode: "autonomous" })).route, "allowance");
});

test("a person's own threshold (limits.approval_threshold) is the one read", () => {
  assert.equal(evaluateSend(facts(150, { thresholds: { ...facts(0).thresholds, approval: USDC(200) } })).route, "allowance");
  assert.equal(evaluateSend(facts(60, { thresholds: { ...facts(0).thresholds, approval: USDC(50) } })).route, "wallet_signature");
});

test("past $200 a week to one address, the next send takes the person's own yes", () => {
  const upTo = evaluateSend(facts(20, { spent: { day: 0n, week: USDC(180), recipientWeek: USDC(180) } }));
  assert.equal(upTo.route, "allowance", "exactly the cap still fits");
  const past = evaluateSend(facts(30, { spent: { day: 0n, week: USDC(180), recipientWeek: USDC(180) } }));
  assert.equal(past.route, "wallet_signature");
  assert.equal(past.blocking, undefined);
  assert.deepEqual(past.results.find((entry) => entry.code === "OVER_RECIPIENT_WEEKLY")?.params, { limit: USDC(200).toString(), used: USDC(180).toString(), asset: "USDC", name: "Mum" });
  // What went to others this week does not count against this one.
  assert.equal(evaluateSend(facts(30, { spent: { day: 0n, week: USDC(400), recipientWeek: 0n } })).route, "allowance");
});

test("a token valued in dollars is held to the same rules by its dollar value; one without a price is never on the allowance anyway", () => {
  const priced = facts(0, { asset: "cirBTC", isUsdc: false, allowable: false, amount: { status: "ok", baseUnits: 1_000n }, limitAmount: USDC(150), decimals: 8 });
  assert.equal(codes(evaluateSend(priced)).includes("ABOVE_APPROVAL_THRESHOLD"), true);
  const unpriced = evaluateSend({ ...priced, limitAmount: null });
  assert.equal(codes(unpriced).includes("ABOVE_APPROVAL_THRESHOLD"), false);
  assert.equal(codes(unpriced).includes("OVER_RECIPIENT_WEEKLY"), false);
  assert.equal(unpriced.route, "wallet_signature");
});

test("the per-send, daily and weekly limits still refuse as before", () => {
  assert.equal(evaluateSend(facts(300)).blocking?.code, "OVER_PER_TX_LIMIT");
  assert.equal(evaluateSend(facts(50, { spent: { day: USDC(480), week: USDC(480), recipientWeek: 0n } })).blocking?.code, "OVER_DAILY_LIMIT");
});
