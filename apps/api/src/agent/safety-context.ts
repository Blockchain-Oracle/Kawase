// The Wallet & limits part of the agent's view (builder A3): read the limits, change them, take grants back. Kept apart
// from context.ts so the lanes merge cleanly; context.ts spreads it in. Tokens and contacts arrive as the person said
// them and are resolved here (K2); a tightening applies at once, a loosening is a card the person approves with Face
// ID, and the model is only ever told what happened.
import { formatUnits, parseUnits } from "viem";

import type { AgentContext, ModelSummary } from "@kawase/agent";
import type { LimitValue, SafetyChange, SafetyChangeResponse, SafetyToolOutput, SafetyView } from "@kawase/api-client";

import type { AutomationService } from "../automations/service";
import type { ContactService } from "../contacts/service";
import { ProblemError } from "../http/problem";
import type { SafetyService } from "../safety/service";
import type { SessionUser } from "../types";

type Out = SafetyToolOutput & { summary: ModelSummary };
const MS_PER_HOUR = 3_600_000;
const SECONDS_PER_HOUR = 3_600;
const USDC_DECIMALS = 6;
const ZERO = 0n;
const RISK_WORDS = { careful: "guard", balanced: "balanced", autonomous: "autonomous" } as const;
const TOKEN_WORDS: Record<string, string> = { dollar: "USDC", dollars: "USDC", usd: "USDC", euro: "EURC", euros: "EURC", eur: "EURC" };

const shown = (amount: string, decimals: number, symbol: string) => `${formatUnits(BigInt(amount), decimals)} ${symbol}`;
const valueText = (value: LimitValue) => {
  if (value.mode) return RISK_WORDS[value.mode];
  if (value.amount !== undefined) return shown(value.amount, value.decimals ?? USDC_DECIMALS, value.symbol ?? "USDC") + (value.until ? ` until ${value.until}` : "") + (value.seconds !== undefined ? ` during ${value.seconds / SECONDS_PER_HOUR} h` : "");
  if (value.on !== undefined) return value.on ? "on" : "off";
  return "";
};

function limitsSummary(view: SafetyView): ModelSummary {
  return {
    network: view.network,
    paused: Boolean(view.pausedAt),
    riskDial: RISK_WORDS[view.riskMode],
    practice: view.practice,
    allowances: view.allowances.map((entry) => ({
      token: entry.symbol,
      perDay: shown(entry.perDay, entry.decimals, entry.symbol),
      guaranteedOnChain: shown(entry.signedPerDay, entry.decimals, entry.symbol),
      leftToday: shown(entry.leftToday, entry.decimals, entry.symbol),
      raise: entry.boost ? `${shown(entry.boost.extra, entry.decimals, entry.symbol)} extra until ${entry.boost.until}` : null,
    })),
    perPayment: shown(view.perPayment.temp?.value ?? view.perPayment.value, USDC_DECIMALS, "USDC") + (view.perPayment.temp ? ` until ${view.perPayment.temp.until}` : ""),
    newRecipientCooldown: view.cooldown.seconds > 0 ? `${view.cooldown.seconds / SECONDS_PER_HOUR} h, at most ${shown(view.cooldown.cap, USDC_DECIMALS, "USDC")} per payment meanwhile` : "off",
    allowlistOnly: view.allowlist.only,
    allowlist: view.allowlist.entries.map((entry) => entry.name),
    grantsOn: view.grants,
  };
}

function changeSummary(response: SafetyChangeResponse): ModelSummary {
  if (response.status === "needs_approval")
    return { status: "needs_approval", now: valueText(response.before), after: valueText(response.after), next: "Waiting for the person's Face ID on the card." };
  return { status: response.status, ...(response.revoke ? { next: "Kawase stopped using it now; the card offers to revoke it on Arc with Face ID." } : {}), limits: limitsSummary(response.safety) };
}

export function safetyContext(input: { user: SessionUser; safety: SafetyService | undefined; automations: AutomationService; contacts: ContactService; surface: "chat" | "voice" }): Partial<AgentContext> {
  const { user, safety } = input;
  const network = user.activeNetwork;
  const via = input.surface;
  const refused = (reason: string, change: SafetyToolOutput["change"] = null): Out => ({ network, status: "refused", change, response: null, revoke: null, safety: null, reason, summary: { status: "refused", reason } });
  const guard = async (change: SafetyToolOutput["change"], work: () => Promise<Out>): Promise<Out> => {
    if (!safety) return refused("Wallet & limits are not available here.", change);
    if (user.isAnonymous) return refused("The person must sign in first.", change);
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProblemError) return refused(error.detail ?? error.code, change);
      throw error;
    }
  };
  const apply = (change: SafetyChange) =>
    guard(change, async () => {
      const response = await safety!.change(user, change, via);
      const status = response.status === "needs_approval" ? "needs_approval" : response.status;
      return { network, status, change, response, revoke: response.status === "needs_approval" ? null : (response.revoke ?? null), safety: response.status === "needs_approval" ? null : response.safety, summary: changeSummary(response) };
    });

  /** A token as the person said it, among those they hold or have an allowance for. */
  const token = async (words: string | undefined) => {
    if (!words?.trim()) return undefined;
    const said = TOKEN_WORDS[words.trim().toLowerCase()] ?? words.trim();
    const { tokens } = await safety!.tokens(user);
    return tokens.find((entry) => entry.symbol.toLowerCase() === said.toLowerCase());
  };

  return {
    riskMode: user.riskMode as AgentContext["riskMode"],
    practice: user.practiceMode,
    pausedAll: Boolean(user.pausedAllAt),

    safetyView: () =>
      guard(null, async () => {
        const view = await safety!.view(user);
        return { network, status: "view", change: null, response: null, revoke: null, safety: view, summary: limitsSummary(view) };
      }),

    changeSafety: apply,

    proposeLimitChange: (request) =>
      guard(null, async () => {
        const units = (amount: string, decimals: number) => parseUnits(amount, decimals).toString();
        const until = request.hours ? new Date(Date.now() + request.hours * MS_PER_HOUR).toISOString() : undefined;
        if (request.limit === "practice") return apply({ kind: "practice", on: request.on ?? true });
        if (request.limit === "per_payment") {
          if (!request.amount) return refused("How much per payment?");
          return apply({ kind: "per_payment", value: units(request.amount, USDC_DECIMALS) });
        }
        if (request.limit === "cooldown") {
          if (request.hours === undefined && !request.amount) return refused("How long, and how much may a new address get meanwhile?");
          const view = await safety!.view(user);
          return apply({
            kind: "cooldown",
            seconds: Math.round((request.hours ?? view.cooldown.seconds / SECONDS_PER_HOUR) * SECONDS_PER_HOUR),
            cap: request.amount ? units(request.amount, USDC_DECIMALS) : view.cooldown.cap,
          });
        }
        if (request.limit === "temporary_raise" && !request.token) {
          if (!request.amount || !until) return refused("How much per payment, and for how many hours?");
          return apply({ kind: "per_payment_temp", value: units(request.amount, USDC_DECIMALS), until });
        }
        const found = await token(request.token ?? "USDC");
        if (!found) return refused(`No token called ${request.token ?? "USDC"} in this wallet here.`);
        if (!request.amount) return refused(`How much ${found.symbol} per day?`);
        const amount = units(request.amount, found.decimals);
        if (request.limit === "allowance") return apply(amount === "0" ? { kind: "allowance_off", token: found.token } : { kind: "allowance", token: found.token, perDay: amount });
        // A raise: the total per day while it lasts; the extra is what is above today's allowance.
        if (!until) return refused("For how many hours?");
        const view = await safety!.view(user);
        const now = BigInt(view.allowances.find((entry) => entry.token.toLowerCase() === found.token.toLowerCase())?.perDay ?? "0");
        const extra = BigInt(amount) - now;
        if (extra <= ZERO) return refused(`That is not above today's ${found.symbol} allowance.`);
        return apply({ kind: "boost", token: found.token, extra: extra.toString(), until });
      }),

    proposeAllowlistChange: (request) =>
      guard(null, async () => {
        if (request.action === "only_on" || request.action === "only_off") return apply({ kind: "allowlist_only", on: request.action === "only_on" });
        const name = request.contact?.trim().toLowerCase();
        if (!name) return refused("Which contact?");
        const book = await input.contacts.addressBook(user.id);
        const ids = [...new Set(book.filter((entry) => entry.name.toLowerCase() === name || entry.aliases.some((alias) => alias.toLowerCase() === name)).map((entry) => entry.contactId))];
        if (ids.length !== 1) return refused(ids.length === 0 ? `No saved contact called ${request.contact}.` : `More than one contact is called ${request.contact}; which one?`);
        return apply({ kind: "allowlist", contactId: ids[0]!, on: request.action === "add" });
      }),

    revokeGrant: (request) =>
      guard({ kind: "revoke", what: request.what, token: request.token }, async () => {
        const change = { kind: "revoke" as const, what: request.what, token: request.token };
        if (request.what === "everything") {
          const kit = await safety!.exitKit(user);
          return {
            network,
            status: kit.revoke ? "revoke" : "applied",
            change,
            response: null,
            revoke: kit.revoke,
            safety: kit.safety,
            summary: { status: "paused", next: kit.revoke ? "Everything is paused; the card revokes every grant on Arc with one Face ID, then they can move their money out." : "Everything is paused and no grant is on." },
          };
        }
        if (request.what === "automation") {
          if (!request.automationId) return refused("Which automation? (list_automations)");
          const { revoke } = await input.automations.cancel(user, request.automationId);
          return { network, status: revoke ? "revoke" : "applied", change, response: null, revoke: revoke ?? null, safety: null, summary: { status: "canceled", next: revoke ? "It stopped; the card revokes its grant on Arc with Face ID." : "It stopped." } };
        }
        const found = await token(request.token ?? "USDC");
        if (!found) return refused(`No allowance for ${request.token ?? "USDC"} here.`);
        const out = await apply({ kind: "allowance_off", token: found.token });
        return { ...out, change, status: out.revoke ? "revoke" : out.status };
      }),
  };
}
