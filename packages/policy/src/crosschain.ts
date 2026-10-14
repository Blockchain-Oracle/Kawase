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
  /** What moves: found (its symbol and decimals; USDC unless said), not found, or a token Kawase will not move. */
  asset: { status: "found"; symbol: string; decimals: number; usdc: boolean } | { status: "unknown"; name: string } | { status: "blocked"; symbol: string };
  amount: AmountFacts;
  /** Base units of the asset the origin holds (Arc for out, the source chain for in), and Arc's gas float for out. */
  balance: bigint;
  gasFloat: bigint;
  /** Out with an asset other than USDC: the wallet's USDC on Arc (gas) and any flat fee the chosen route adds in it. */
  usdc?: bigint | undefined;
  nativeFee?: bigint | undefined;
  /** In from another chain's own coin: the gas that transaction costs there, paid from the same coin. */
  sourceGas?: bigint | undefined;
  /** In with a token that needs its Permit2 approval there first: that transaction's gas, paid in the chain's coin, and what the person holds of it. */
  sourceCoin?: { symbol: string; decimals: number; balance: bigint; needed: bigint } | undefined;
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
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  // Pause all stops everything that would move without the person (X30); this is always the person's own yes, so it
  // goes on, and the card says the pause is on.
  if (facts.pausedAll) results.push(result("AGENT_PAUSED"));
  if (facts.direction === "out" && !facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));
  if (facts.chain !== "found") results.push(result("DESTINATION_MISSING"));
  if (facts.asset.status === "unknown") return done([...results, result("MOVE_ASSET_UNKNOWN", { asset: facts.asset.name })]);
  if (facts.asset.status === "blocked") return done([...results, result("TOKEN_BLOCKED", { symbol: facts.asset.symbol })]);
  const asset = facts.asset;

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
    if (amount > facts.balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.balance), asset: asset.symbol, decimals: String(asset.decimals) }));
    else if (facts.direction === "out" && asset.usdc && facts.balance - amount < facts.gasFloat + (facts.nativeFee ?? ZERO)) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.gasFloat), asset: "USDC" }));
    else if (facts.direction === "out" && !asset.usdc && (facts.usdc ?? ZERO) < facts.gasFloat + (facts.nativeFee ?? ZERO)) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.gasFloat + (facts.nativeFee ?? ZERO)), asset: "USDC" }));
    else if (facts.direction === "in" && facts.sourceGas && amount + facts.sourceGas > facts.balance) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.sourceGas), asset: asset.symbol, decimals: String(asset.decimals) }));
    else if (facts.direction === "in" && facts.sourceCoin && facts.sourceCoin.balance < facts.sourceCoin.needed) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.sourceCoin.needed), asset: facts.sourceCoin.symbol, decimals: String(facts.sourceCoin.decimals) }));
  }
  if (facts.route.status === "none") results.push(result("QUOTE_UNAVAILABLE", { reason: facts.route.reason }));
  return done(results);
}
