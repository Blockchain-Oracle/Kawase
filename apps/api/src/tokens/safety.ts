// Safety on every token page and every buy (cards/trade.md "Safety"): the copycat rule Kawase runs itself, plus
// GoPlus's contract facts where GoPlus covers the chain. Missing facts are "unknown", never "ok".
import type { SafetyCheck, SafetyVerdict, TokenView } from "@kawase/api-client";

import type { SecurityFacts } from "../market/sources";

/** A sell tax at or above this makes a token a trap: Kawase refuses to buy it. */
const BLOCK_TAX_PCT = 50;
/** Above this, the tax is shown as a warning. */
const WARN_TAX_PCT = 10;

export type Lookalike = { address: string; name: string; liquidityUsd: number | null };

const yesNo = (value: boolean | null, bad: boolean, level: "warn" | "danger"): SafetyCheck["state"] =>
  value === null ? "unknown" : value === bad ? level : "ok";

export function safetyVerdict(token: TokenView, facts: SecurityFacts | null, lookalikes: Lookalike[]): SafetyVerdict {
  const reasons: string[] = [];
  let level: SafetyVerdict["level"] = "ok";
  const raise = (to: SafetyVerdict["level"], reason: string) => {
    reasons.push(reason);
    if (to === "block" || (to === "caution" && level === "ok")) level = to;
  };

  if (token.status === "impersonator") raise("block", "impersonator");
  if (token.status === "lookalike") raise("caution", "lookalike");
  if (token.status === "unverified") raise("caution", "unverified");
  if (token.kind === "permissioned") raise("caution", "permissioned");

  const checks: SafetyCheck[] = [];
  if (facts) {
    if (facts.honeypot) raise("block", "honeypot");
    if (facts.cannotSellAll) raise("block", "cannot_sell_all");
    if ((facts.sellTaxPct ?? 0) >= BLOCK_TAX_PCT) raise("block", "sell_tax");
    else if ((facts.sellTaxPct ?? 0) > WARN_TAX_PCT || (facts.buyTaxPct ?? 0) > WARN_TAX_PCT) raise("caution", "high_tax");
    if (facts.hiddenOwner || facts.takeBackOwnership) raise("caution", "owner_control");
    if (facts.mintable && token.status !== "canonical") raise("caution", "mintable");
    if (facts.openSource === false) raise("caution", "closed_source");
    const tax = (value: number | null): SafetyCheck => ({
      id: "",
      state: value === null ? "unknown" : value >= BLOCK_TAX_PCT ? "danger" : value > WARN_TAX_PCT ? "warn" : "ok",
      value: value === null ? null : `${value}`,
    });
    checks.push(
      { id: "honeypot", state: yesNo(facts.honeypot, true, "danger") },
      { ...tax(facts.sellTaxPct), id: "sell_tax" },
      { ...tax(facts.buyTaxPct), id: "buy_tax" },
      { id: "mintable", state: token.status === "canonical" && facts.mintable ? "ok" : yesNo(facts.mintable, true, "warn") },
      { id: "owner", state: facts.hiddenOwner || facts.takeBackOwnership ? "warn" : facts.ownerRenounced === null ? "unknown" : "ok" },
      { id: "open_source", state: yesNo(facts.openSource, false, "warn") },
      { id: "pausable", state: token.status === "canonical" && facts.pausable ? "ok" : yesNo(facts.pausable, true, "warn") },
      { id: "holders", state: facts.holders === null ? "unknown" : "ok", value: facts.holders === null ? null : `${facts.holders}` },
    );
  } else {
    checks.push({ id: "honeypot", state: "unknown" }, { id: "sell_tax", state: "unknown" }, { id: "owner", state: "unknown" });
  }
  return { level, reasons, checks, lookalikes, checkedBy: facts ? "GoPlus" : null };
}
