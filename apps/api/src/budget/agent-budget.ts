// The agent's side of the weekly budget (D38): AgentContext.budget.allows, bound to the person's signed budget and this
// week's ledger, so the agent's `toolApproval` approves a step inside the budget without a tap (packages/agent
// approval.ts). It only ever says yes to preparing a step: the money still moves on the card, where the phone's own
// guard (apps/mobile/src/budget/guard.ts) checks the leaves and signs silently or asks.
//
// Yes only when all hold, on the server's numbers: a budget on the step's network, not paused, not careful mode, not
// practice; the step's category in the budget (a bridge only to the person's own address: anything to someone else is
// a new destination and asks); the venue in the budget when the step names one; an amount in dollars we can price
// (USDC and other dollar stablecoins as themselves, any other vouched token at its market price); within the per-action
// cap and what is left of the week. A send by the agent always waits for the card (a person, D38/X1), so it is never
// approved here.
//
// The lead binds it in app.ts (one line, beside `raceRoutes`): `budget: agentBudgetFor({ budget, assets })`.
import { parseUnits, type Address } from "viem";

import type { AgentBudget } from "@kawase/agent";
import type { BudgetAction } from "@kawase/api-client";
import type { NetworkId } from "@kawase/networks";
import { CANONICAL_TOKENS, normalizeSymbol } from "@kawase/networks";
import type { BudgetCategory } from "@kawase/wallet";

import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { BudgetService } from "./service";

const USD_DECIMALS = 6;
const DECIMAL = /^\d+(\.\d+)?$/;
const MICRO = 1_000_000;
const TEN = 10n;
const ONE = 1n;
const NONE = 0n;

/** The agent's step kinds as budget categories; a send by the agent is never silent (the card is the ask). */
const CATEGORY: Partial<Record<BudgetAction["kind"], BudgetCategory>> = { swap: "swap", bridge: "bridge", bring_in: "bridge", earn: "earn", x402: "x402" };

type Prices = Pick<AssetService, "prices">;

/** The step's amount in US dollars (6-decimal base units), or undefined when it cannot be priced. */
export async function stepUsd(action: Pick<BudgetAction, "amount" | "asset">, network: NetworkId, prices?: Prices): Promise<bigint | undefined> {
  if (!action.amount || !DECIMAL.test(action.amount)) return undefined;
  const asset = (action.asset ?? "USDC").trim();
  const token = CANONICAL_TOKENS[network].find((entry) => entry.address.toLowerCase() === asset.toLowerCase() || normalizeSymbol(entry.symbol) === normalizeSymbol(asset));
  if (!token) return undefined;
  const units = parseUnits(action.amount, token.decimals);
  if (token.kind === "dollar" && token.peg === "USD") return parseUnits(action.amount, USD_DECIMALS);
  if (!prices) return undefined;
  const { prices: found } = await prices.prices(network, [token.address as Address]);
  const priceUsd = found.get(token.address.toLowerCase())?.priceUsd;
  if (priceUsd === null || priceUsd === undefined || !(priceUsd > 0)) return undefined;
  // Rounded up to the cent's millionth, so the budget never undercounts a step.
  const micro = BigInt(Math.ceil(priceUsd * MICRO));
  const scale = TEN ** BigInt(token.decimals);
  return (units * micro + scale - ONE) / scale;
}

/** May this step go without the person's tap? */
export async function budgetAllowsStep(budget: Pick<BudgetService, "allows">, db: Parameters<BudgetService["allows"]>[0], user: SessionUser, action: BudgetAction, prices?: Prices): Promise<boolean> {
  const category = CATEGORY[action.kind];
  if (!category) return false;
  if (category === "bridge" && action.recipient !== "self") return false;
  if (action.network !== user.activeNetwork) return false;
  const amountUsd = await stepUsd(action, action.network, prices);
  if (amountUsd === undefined || amountUsd <= NONE) return false;
  // The race picks the venue later and the leaf path checks it then; a venue the step already names must be in the budget.
  const verdict = await budget.allows(db, user.id, action.network, { category, venue: action.venue ?? "", amountUsd }, { anyVenue: !action.venue });
  return verdict.ok;
}

/** The AgentDeps binding: `budget: agentBudgetFor({ budget, db, assets })` in app.ts. */
export function agentBudgetFor(deps: { budget: Pick<BudgetService, "allows">; db: Parameters<BudgetService["allows"]>[0]; assets?: Prices | undefined }) {
  return (user: SessionUser): AgentBudget => ({ allows: (action) => budgetAllowsStep(deps.budget, deps.db, user, action, deps.assets) });
}
