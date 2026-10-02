// Which way a change to the person's limits goes (X7, R5): a tightening applies at once; a loosening needs the person's
// own signature (Face ID), and for an allowance a new on-chain grant. A pure function of the current settings, so the
// screen, the agent's tools and the api can never disagree about which is which.
import type { RiskMode } from "./send";

export const RISK_ORDER: Record<RiskMode, number> = { careful: 0, balanced: 1, autonomous: 2 };

/** The settings a change is compared against, on one network. Amounts are base units of their own token. */
export type LimitSettings = {
  /** Per token (lower-case address): what the signed grant allows per day, and what Kawase holds itself to. */
  allowances: Record<string, { signed: bigint; cap: bigint } | undefined>;
  perPayment: bigint;
  cooldown: { seconds: number; cap: bigint };
  allowlistOnly: boolean;
  /** Contact ids on the allowlist. */
  allowlisted: ReadonlySet<string>;
  riskMode: RiskMode;
  practice: boolean;
  paused: boolean;
};

/** The same shape as the stored change (`@kawase/db` LimitChange), with amounts as base-unit strings. */
export type LimitChangeInput =
  | { kind: "allowance"; token: string; perDay: string }
  | { kind: "allowance_off"; token: string }
  | { kind: "boost"; token: string; extra: string; until: string }
  | { kind: "per_payment"; value: string }
  | { kind: "per_payment_temp"; value: string; until: string }
  | { kind: "cooldown"; seconds: number; cap: string }
  | { kind: "allowlist_only"; on: boolean }
  | { kind: "allowlist"; contactId: string; on: boolean }
  | { kind: "risk_mode"; mode: RiskMode }
  | { kind: "practice"; on: boolean }
  | { kind: "pause"; on: boolean };

export type ChangeDirection = "tighten" | "loosen" | "same";

export type ChangePlan = {
  direction: ChangeDirection;
  /**
   * How a loosening is approved: a new grant the wallet signs (an allowance above what is signed, a raise), or a signed
   * step-up message (everything Kawase enforces itself). A tightening needs neither.
   */
  approval: "none" | "grant" | "message";
};

const ZERO = 0n;
const plan = (direction: ChangeDirection, loosenBy: "grant" | "message" = "message"): ChangePlan => ({
  direction,
  approval: direction === "loosen" ? loosenBy : "none",
});
const compare = (next: bigint, current: bigint): ChangeDirection => (next < current ? "tighten" : next > current ? "loosen" : "same");

export function planLimitChange(settings: LimitSettings, change: LimitChangeInput): ChangePlan {
  switch (change.kind) {
    case "allowance": {
      const current = settings.allowances[change.token.toLowerCase()];
      const next = BigInt(change.perDay);
      // No allowance yet for this token: adding one gives Kawase new authority, so it is a new grant.
      if (!current) return next > ZERO ? plan("loosen", "grant") : plan("same");
      if (next <= current.signed) return plan(compare(next, current.cap));
      return plan("loosen", "grant");
    }
    case "allowance_off":
      return plan(settings.allowances[change.token.toLowerCase()] ? "tighten" : "same");
    case "boost":
      return BigInt(change.extra) > ZERO ? plan("loosen", "grant") : plan("same");
    case "per_payment":
      return plan(compare(BigInt(change.value), settings.perPayment));
    case "per_payment_temp":
      return plan(BigInt(change.value) > settings.perPayment ? "loosen" : "same");
    case "cooldown": {
      // Shorter, or a bigger amount allowed during it, loosens; both the other way tightens.
      const longer = change.seconds >= settings.cooldown.seconds;
      const smaller = BigInt(change.cap) <= settings.cooldown.cap;
      if (change.seconds === settings.cooldown.seconds && BigInt(change.cap) === settings.cooldown.cap) return plan("same");
      return plan(longer && smaller ? "tighten" : "loosen");
    }
    case "allowlist_only":
      return plan(change.on === settings.allowlistOnly ? "same" : change.on ? "tighten" : "loosen");
    case "allowlist": {
      const listed = settings.allowlisted.has(change.contactId);
      return plan(change.on === listed ? "same" : change.on ? "loosen" : "tighten");
    }
    case "risk_mode":
      return plan(compare(BigInt(RISK_ORDER[change.mode]), BigInt(RISK_ORDER[settings.riskMode])));
    case "practice":
      // Practice on is the safe side; going back to real money is the person's own yes.
      return plan(change.on === settings.practice ? "same" : change.on ? "tighten" : "loosen");
    case "pause":
      return plan(change.on === settings.paused ? "same" : change.on ? "tighten" : "loosen");
  }
}
