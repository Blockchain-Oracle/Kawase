// The brake (cards/automate-safety.md "Stay in control"): a risky action — more than half the balance to someone new,
// a price impact over the rule, leverage above 5× — warns on its card and goes ahead only with the person's explicit
// override, sent with their approval (then Face ID signs it as always). An approval without it is refused before
// anything is prepared, whatever the client: an old app, a voice turn or the agent can never slip one through.
import { hasBrake } from "@kawase/policy";

import { HTTP, problem } from "../http/problem";

export function requireBrakeOverride(results: readonly { code: string }[], override: boolean | undefined) {
  if (!hasBrake(results) || override) return;
  throw problem(HTTP.conflict, "brake_override", "a risky action: confirm it on its card", { codes: results.map((entry) => entry.code).filter((code) => code.startsWith("BRAKE_")) });
}
