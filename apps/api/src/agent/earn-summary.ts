// What the model is told about earning: the vaults and positions, and a proposed deposit or withdrawal, in plain
// English with numbers formatted. The card carries the exact figures and the button.
import type { EarnIntent, EarnSummary, PolicyResultView } from "@kawase/api-client";
import { amount, formatAmount } from "@kawase/money";

const DISPLAY_LOCALE = "en";
const PERCENT = 100;
const APY_DIGITS = 2;
const usdc = (baseUnits: string | null | undefined) => (baseUnits ? formatAmount(amount("USDC", BigInt(baseUnits)), DISPLAY_LOCALE) : "");
export const percent = (fraction: number) => `${(fraction * PERCENT).toFixed(APY_DIGITS)}%`;

function describe(result: PolicyResultView): string {
  const p = result.params ?? {};
  switch (result.code) {
    case "NOT_AVAILABLE_YET":
      return "Earning is not available on this network yet.";
    case "ON_OTHER_NETWORK":
      return "Earning works on the other network; offer to switch.";
    case "SIGN_IN_REQUIRED":
      return "The person must sign in first.";
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return "The wallet is not set up on this network yet; the card offers to set it up.";
    case "VAULT_UNAVAILABLE":
      return "That vault is not available here (or there is nothing to withdraw from).";
    case "AMOUNT_MISSING":
      return "How much USDC?";
    case "AMOUNT_INVALID":
      return "The amount is not valid.";
    case "INSUFFICIENT_BALANCE":
      return `Not enough USDC: the balance is ${usdc(p.balance)}.`;
    case "INSUFFICIENT_GAS":
      return `A little USDC must stay in the wallet for the network fee (about ${usdc(p.needed)}).`;
    case "OVER_POSITION":
      return `More than they hold in the vault (${usdc(p.position)}).`;
    case "VAULT_LIQUIDITY_SHORT":
      return `The vault can pay out only ${usdc(p.available)} right now (the rest is lent out); suggest a smaller amount or later.`;
    case "VAULT_LOW_LIQUIDITY":
      return "The vault's liquidity is low: withdrawals may have to wait.";
    case "VAULT_RISK_WARNING":
      return `App Kit flags this vault: ${p.warnings}.`;
    default:
      return result.code;
  }
}

export function summarizeEarn(intent: EarnIntent): EarnSummary {
  const blocking = intent.blocking;
  const draft = intent.draft;
  const moving = intent.state === "executing" || intent.state === "approved" || intent.state === "unknown_outcome";
  const status: EarnSummary["status"] =
    intent.state === "completed"
      ? "done"
      : moving
        ? "moving"
        : intent.state === "failed"
          ? "failed"
          : !blocking
            ? "ready"
            : blocking.code === "SIGN_IN_REQUIRED"
              ? "needs_sign_in"
              : blocking.kind === "clarification"
                ? "needs_answer"
                : blocking.kind === "precondition"
                  ? "needs_fix"
                  : blocking.kind === "policy"
                    ? "refused"
                    : "not_possible";
  const action = draft
    ? draft.action === "deposit"
      ? `Deposit ${usdc(draft.amount)} into ${draft.vault.name} (${percent(draft.vault.apy)} a year now; about ${usdc(draft.yearlyEarnings)} a year on ${usdc(draft.positionAfter)})`
      : `Withdraw ${usdc(draft.amount)} from ${draft.vault.name} (at least ${usdc(draft.minReceived)} comes back; ${usdc(draft.positionAfter)} stays in)`
    : intent.request.amount
      ? `${intent.request.action} ${intent.request.amount} USDC`
      : null;
  return {
    intentId: intent.id,
    network: intent.network,
    status,
    action,
    problem: blocking ? describe(blocking) : null,
    warnings: intent.results.filter((entry) => entry.kind === "warning").map(describe),
  };
}
