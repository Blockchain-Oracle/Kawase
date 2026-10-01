// The checks for one send, as a pure function of facts the caller gathered (balances and the remaining allowance
// read from the chain, limits and what was already spent from the database, who the recipient resolved to).
// The same function runs when the agent drafts, when the person approves (with fresh facts), and before
// anything is sent, so the three can never disagree (ARCHITECTURE §2, §8).
import type { CapabilityState } from "@kawase/config";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";

/** How the send is authorized: inside the signed allowance (no prompt), or by a fresh wallet signature (Face ID). */
export type SendRoute = "allowance" | "wallet_signature";

export type RecipientFacts =
  | { status: "missing" }
  | { status: "unknown"; query: string }
  | { status: "ambiguous"; query: string; count: number }
  | { status: "invalid"; query: string }
  | { status: "self" }
  | { status: "no_wallet"; handle: string }
  | {
      status: "resolved";
      address: string;
      via: "contact" | "handle" | "address";
      name?: string | undefined;
      /** Set while a changed contact address waits out its cooldown (ISO time it becomes payable). */
      holdUntil?: string | undefined;
      blocked?: boolean | undefined;
      /** A completed send to this exact address on this network exists. */
      paidBefore: boolean;
      /** The name of a saved contact whose address looks like this one but is not it. */
      lookalikeOf?: string | undefined;
    };

export type AmountFacts = { status: "missing" } | { status: "invalid" } | { status: "ok"; baseUnits: bigint };

export type SendFacts = {
  network: NetworkId;
  /** The send capability here and on the other network (D15). */
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: {
    registered: boolean;
    /** The 7702 code is on the address (needed for the allowance only). */
    setUp: boolean;
    /** ERC-20 balances in each asset's base units. USDC also pays the network fee on Arc. */
    balances: Record<AssetId, bigint>;
  };
  recipient: RecipientFacts;
  /** What the person said; undefined when they did not name one. */
  asset: AssetId | undefined;
  amount: AmountFacts;
  /** The everyday allowance (USDC only): whether one is signed and what the chain says is left this period. */
  allowance: { active: boolean; available: bigint };
  /** The person's limits for this network, in the asset's own units. */
  limits: { perTx: bigint; daily: bigint; weekly: bigint };
  /** Reserved and committed sends of this asset in the last day and week. */
  spent: { day: bigint; week: bigint };
  thresholds: {
    /** A first payment to a new address above this always takes Face ID. */
    firstTimeStepUp: bigint;
    /** USDC kept for network fees when the wallet pays them itself. */
    gasFloat: bigint;
  };
};

export type SendEvaluation = {
  results: PolicyResult[];
  blocking: PolicyResult | undefined;
  /** Set only when nothing blocks. */
  route: SendRoute | undefined;
  /** The asset the send will use (the one named, or the only one held). */
  asset: AssetId | undefined;
};

const ZERO = 0n;
const s = (value: bigint) => value.toString();

function chooseAsset(named: AssetId | undefined, balances: Record<AssetId, bigint>): AssetId | "unclear" {
  if (named) return named;
  const held = (Object.keys(balances) as AssetId[]).filter((asset) => balances[asset] > ZERO);
  if (held.length > 1) return "unclear";
  return held[0] ?? "USDC";
}

function done(results: PolicyResult[], asset: AssetId | undefined, route?: SendRoute): SendEvaluation {
  const blocking = blockingResult(results);
  return { results, blocking, route: blocking ? undefined : route, asset };
}

export function evaluateSend(facts: SendFacts): SendEvaluation {
  const results: PolicyResult[] = [];

  // Gates that make every other check meaningless.
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")], facts.asset);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "send" })], facts.asset);
  }
  if (facts.pausedAll) return done([result("PAUSED_ALL")], facts.asset);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")], facts.asset);

  // Who.
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
      if (recipient.holdUntil)
        results.push(result("ADDRESS_CHANGE_HOLD", { name: recipient.name ?? "", until: recipient.holdUntil }));
      break;
  }

  // What and how much.
  const chosen = chooseAsset(facts.asset, facts.wallet.balances);
  if (chosen === "unclear") results.push(result("ASSET_UNCLEAR"));
  const asset = chosen === "unclear" ? undefined : chosen;
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO))
    results.push(result("AMOUNT_INVALID"));

  const amount = facts.amount.status === "ok" && facts.amount.baseUnits > ZERO ? facts.amount.baseUnits : undefined;
  if (!asset || amount === undefined || recipient.status !== "resolved") return done(results, asset);

  // The person's own limits: refusals, with the numbers.
  const { limits, spent } = facts;
  if (amount > limits.perTx) results.push(result("OVER_PER_TX_LIMIT", { limit: s(limits.perTx), asset }));
  if (spent.day + amount > limits.daily)
    results.push(result("OVER_DAILY_LIMIT", { limit: s(limits.daily), used: s(spent.day), asset }));
  if (spent.week + amount > limits.weekly)
    results.push(result("OVER_WEEKLY_LIMIT", { limit: s(limits.weekly), used: s(spent.week), asset }));

  const balance = facts.wallet.balances[asset];
  if (amount > balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(balance), asset }));

  // The route: the allowance only covers USDC, up to what the chain says is left, to a recipient that needs no
  // second look. Everything else is a wallet signature (Face ID).
  const firstTime = !recipient.paidBefore;
  const lookalike = Boolean(recipient.lookalikeOf);
  if (firstTime) results.push(result("FIRST_TIME_RECIPIENT"));
  if (lookalike) results.push(result("LOOKALIKE_ADDRESS", { name: recipient.lookalikeOf ?? "" }));
  if (recipient.via === "address") results.push(result("UNSAVED_ADDRESS"));

  const allowanceCovers = asset === "USDC" && facts.wallet.setUp && facts.allowance.active;
  if (asset === "USDC" && !allowanceCovers) results.push(result("NO_ALLOWANCE"));
  if (allowanceCovers && amount > facts.allowance.available)
    results.push(result("ABOVE_ALLOWANCE", { available: s(facts.allowance.available), asset }));

  const stepUp = lookalike || (firstTime && amount > facts.thresholds.firstTimeStepUp);
  const route: SendRoute =
    allowanceCovers && amount <= facts.allowance.available && !stepUp ? "allowance" : "wallet_signature";

  // Fees: on the wallet route the wallet pays them in USDC; on the allowance route Kawase does.
  const usdcLeft = facts.wallet.balances.USDC - (asset === "USDC" ? amount : ZERO);
  if (route === "wallet_signature" && usdcLeft < facts.thresholds.gasFloat && amount <= balance)
    results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
  if (route === "allowance" && usdcLeft < facts.thresholds.gasFloat) results.push(result("LEAVES_LITTLE_FOR_FEES"));

  return done(results, asset, route);
}
