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
      /** When this address was first known (saved as a contact, or first paid): the new-recipient cooldown runs from here. */
      knownSince?: string | undefined;
      /** On the person's allowlist on this network. */
      allowlisted?: boolean | undefined;
    };

/** The risk dial (X11): careful (Guard) confirms everything; balanced is D33; autonomous may act on its own suggestions inside grants. */
export type RiskMode = "careful" | "balanced" | "autonomous";

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
  /**
   * The everyday allowance for this send's token (one per token, cards/automate-safety.md): whether one is on, and what
   * is left this period — the chain's room, never more than the person's own tighter cap.
   */
  allowance: { active: boolean; available: bigint };
  /** The risk dial; absent = balanced. */
  riskMode?: RiskMode | undefined;
  /** A new address can receive at most `cap` per payment until `seconds` after it was first known. */
  cooldown?: { seconds: number; cap: bigint; now: string } | undefined;
  /** Only allowlisted recipients may be paid inside the allowance (without the person). */
  allowlistOnly?: boolean | undefined;
  /** The person's limits for this network, in the asset's own units. */
  limits: { perTx: bigint; daily: bigint; weekly: bigint };
  /** Reserved and committed sends of this asset in the last day and week. */
  spent: { day: bigint; week: bigint };
  thresholds: {
    /** A first payment to a new address above this always takes Face ID. */
    firstTimeStepUp: bigint;
    /** USDC kept for network fees when the wallet pays them itself. */
    gasFloat: bigint;
    /** A first payment above a few times this offers sending this much first (base units of the asset). */
    testAmount?: bigint | undefined;
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
const MS_PER_SECOND = 1000;
const HALF = 2n;
/** A test amount is offered when the payment is at least this many times it. */
const TEST_FACTOR = 5n;
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
  // Pause all stops the agent and automations (cards/automate-safety.md): nothing goes on the allowance, but the
  // person's own Face ID still works, so the exit kit's "withdraw everything" can run while paused.
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

  // The new-recipient cooldown (D-cooldown): an address first known less than `seconds` ago gets at most `cap` per
  // payment without the person — so above it nothing goes on the allowance or by an automation. The person's own Face ID
  // send is never blocked by it.
  const cooldown = facts.cooldown;
  let cooling = false;
  if (cooldown && cooldown.seconds > 0) {
    const now = Date.parse(cooldown.now);
    const since = recipient.knownSince ? Date.parse(recipient.knownSince) : now;
    const endsAt = since + cooldown.seconds * MS_PER_SECOND;
    if (endsAt > now && amount > cooldown.cap) {
      cooling = true;
      results.push(result("NEW_RECIPIENT_COOLDOWN", { cap: s(cooldown.cap), asset, until: new Date(endsAt).toISOString() }));
    }
  }

  // The route: the allowance only covers USDC, up to what the chain says is left, to a recipient that needs no
  // second look. Everything else is a wallet signature (Face ID).
  const firstTime = !recipient.paidBefore;
  const lookalike = Boolean(recipient.lookalikeOf);
  if (firstTime) results.push(result("FIRST_TIME_RECIPIENT"));
  // A first payment: offer a small test amount first, when this one is well above it.
  const test = facts.thresholds.testAmount ?? ZERO;
  if (firstTime && test > ZERO && amount > test * TEST_FACTOR) results.push(result("TEST_AMOUNT_SUGGESTED", { test: s(test), asset }));
  // The brake: more than half of what the wallet holds of this token, to someone new.
  const brake = firstTime && amount * HALF > balance && amount <= balance;
  if (brake) results.push(result("BRAKE_HALF_BALANCE", { name: recipient.name ?? "" }));
  if (lookalike) results.push(result("LOOKALIKE_ADDRESS", { name: recipient.lookalikeOf ?? "" }));
  if (recipient.via === "address") results.push(result("UNSAVED_ADDRESS"));

  const offAllowlist = Boolean(facts.allowlistOnly) && !recipient.allowlisted;
  if (facts.pausedAll) results.push(result("AGENT_PAUSED"));
  if (offAllowlist) results.push(result("NOT_ON_ALLOWLIST", { name: recipient.name ?? "" }));
  const allowanceCovers = facts.wallet.setUp && facts.allowance.active && !facts.pausedAll && !offAllowlist && !cooling && !brake;
  if (!facts.allowance.active) results.push(result("NO_ALLOWANCE", { asset }));
  if (allowanceCovers && amount > facts.allowance.available)
    results.push(result("ABOVE_ALLOWANCE", { available: s(facts.allowance.available), asset }));

  // Guard confirms every first payment to an address with Face ID, whatever the amount (X11).
  const careful = facts.riskMode === "careful";
  const stepUp = lookalike || (firstTime && (careful || amount > facts.thresholds.firstTimeStepUp));
  const route: SendRoute =
    allowanceCovers && amount <= facts.allowance.available && !stepUp ? "allowance" : "wallet_signature";

  // Fees: on the wallet route the wallet pays them in USDC; on the allowance route Kawase does.
  const usdcLeft = facts.wallet.balances.USDC - (asset === "USDC" ? amount : ZERO);
  if (route === "wallet_signature" && usdcLeft < facts.thresholds.gasFloat && amount <= balance)
    results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
  if (route === "allowance" && usdcLeft < facts.thresholds.gasFloat) results.push(result("LEAVES_LITTLE_FOR_FEES"));

  return done(results, asset, route);
}
