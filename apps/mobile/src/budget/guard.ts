// The budget guard (D38): may the phone sign this action with no Face ID? It answers `{ silent, reason }`, and only
// says silent when everything below holds on the phone's own reckoning. The server proposes; it never decides.
//  - the budget: the wallet's own EIP-712 signature over these exact terms, for this wallet and this chain;
//  - not paused (the budget or pause-all), not careful mode (a $0 budget), not practice;
//  - the category and the venue are in the budget, and the venue's contract is one the app knows;
//  - the tokens are ones Kawase vouches for (the compiled registry), a send goes to a saved contact, a move goes to
//    the wallet's own address;
//  - the dollars, valued by the phone itself, fit the per-action cap and what is left of the week (the larger of the
//    server's ledger and the phone's own);
//  - price sanity: the card's minimum is no worse than a quote the phone fetched itself (KyberSwap, keyless) less the
//    slippage the network allows and the price gap that would otherwise warn;
//  - every caveat of every leaf, decoded on the phone (@kawase/wallet flow-checks): output to this wallet, at least
//    the card's minimum, spend at most the amount, one use, 120 s, only Kawase's ops wallet, the current kill-switch.
// Anything it cannot check (no quote, a read that failed, settings it could not load) is not silent: the action
// falls back to the ordinary confirm, and `reason` names why so the card can say the fix.
//
// A plain module: prices, chain reads and the phone ledger are injected (price.ts, chain.ts, ledger-store.ts). The
// Stage 3 screens call `budgetAllows` before `confirmWithBiometrics` and skip it only when `silent` is true.
import { DEFAULT_LIMITS, EARN_FLOOR_BPS, EARN_SHARES_CEILING_BPS } from "@kawase/config";
import {
  SigningRefused,
  arcNetworkOf,
  arcStablecoin,
  checkEarnLeaves,
  checkSwapLeaves,
  leafGuarantees,
  opsWalletFor,
  reviveDelegationTypedData,
  swapVenueContracts,
  verifyBudget,
  vouchedToken,
  type BudgetCategory,
  type BudgetPolicy,
  type DecodedDelegation,
} from "@kawase/wallet";
import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";

import type { ChainReads } from "./chain";
import { usdValueOf, type PhoneQuote } from "./price";
import type { BudgetView } from "./types";

const BPS = 10_000n;
/** Share-price drift a vault may show between the server's preview and the phone's (minutes apart). */
const VAULT_DRIFT_BPS = 10n;
const MS_PER_SECOND = 1000;
const ZERO = 0n;
/** A swap is the exact approval, the venue's call and the allowance reset (USDC paid as Arc's native coin: one call). */
const MIN_SWAP_LEAVES = 3;

/** Leaf typed data as the api sends it (the salt as a decimal string). */
export type LeafTypedData = Record<string, unknown>;

/** What the agent or a screen wants to do, as its card shows it: addresses and base units. */
export type GuardAction =
  | { kind: "swap"; venue: string; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint; leaves: readonly LeafTypedData[] }
  | { kind: "earn"; action: "deposit" | "withdraw"; vault: Address; amount: bigint; leaves: readonly LeafTypedData[] }
  | { kind: "send"; token: Address; to: Address; amount: bigint }
  | { kind: "bridge"; venue: string; token: Address; amount: bigint; recipient: Address }
  | { kind: "x402"; venue: string; amountUsd: bigint };

export type GuardContext = {
  /** This wallet. */
  wallet: Address;
  /** The active Arc network's chain id. */
  chainId: number;
  /** GET /budget, or null when the person has none on this network. */
  budget: BudgetView | null;
  /** The safety settings (pause-all, the risk dial, practice), or null when they could not be read. */
  safety: { pausedAt: string | null; riskMode: "careful" | "balanced" | "autonomous"; practice: boolean } | null;
  /** Saved contacts' addresses, as the phone has them. */
  contacts: readonly string[];
  now?: Date | undefined;
};

export type GuardDeps = {
  quote: PhoneQuote;
  reads: ChainReads;
  /** The phone ledger's spend this week (ledger.ts). */
  localSpent: (wallet: Address, chainId: number, now: Date) => Promise<bigint>;
};

export type GuardRefusal =
  | "no_budget"
  | "budget_unverified"
  | "paused"
  | "guard_mode"
  | "practice"
  | "settings_unknown"
  | "category_off"
  | "venue_off"
  | "token_unvetted"
  | "new_person"
  | "new_destination"
  | "unpriced"
  | "price_off"
  | "over_action_cap"
  | "over_week"
  | "leaf_refused";

export type Guarantee = { token: Address; amount: bigint; direction: "increase" | "decrease" };

export type GuardVerdict =
  | {
      silent: true;
      reason: "inside_budget";
      category: BudgetCategory;
      /** What this action counts against the week, in US dollar base units (6 decimals). */
      amountUsd: bigint;
      /** What is left of the week after it. */
      leftAfter: bigint;
      /** The leaves' on-chain guarantees, for the receipt line ("Output had to land in your wallet: at least …"). */
      guarantees: Guarantee[];
    }
  | { silent: false; reason: GuardRefusal; detail?: string | undefined };

const refuse = (reason: GuardRefusal, detail?: string): GuardVerdict => ({ silent: false, reason, detail });

const CATEGORY: Record<GuardAction["kind"], BudgetCategory> = { swap: "swap", earn: "earn", send: "send", bridge: "bridge", x402: "x402" };
/** Tokens a silent action may touch: what Kawase vouches for, except a permissioned asset or a vault share. */
const SILENT_KINDS = new Set(["dollar", "fiat", "bitcoin", "ether", "rwa", "token"]);
const STABLE_KINDS = new Set(["dollar", "fiat"]);

/** Whether both sides of a swap are tokens a silent swap may touch (the first thing the guard asks of a swap). */
export function swapTokensSilent(chainId: number, tokenIn: Address, tokenOut: Address): boolean {
  const sold = vouchedToken(chainId, tokenIn);
  const bought = vouchedToken(chainId, tokenOut);
  return Boolean(sold && bought && SILENT_KINDS.has(sold.kind) && SILENT_KINDS.has(bought.kind));
}

function policyOf(view: BudgetView): BudgetPolicy | undefined {
  const { policy } = view;
  if (!isAddress(policy.wallet) || !/^\d+$/.test(policy.weeklyCap) || !/^\d+$/.test(policy.perActionCap)) return undefined;
  return { ...policy, wallet: getAddress(policy.wallet), weeklyCap: BigInt(policy.weeklyCap), perActionCap: BigInt(policy.perActionCap) };
}

/** The leaves as the wallet signs them, all for this chain. */
function leavesFor(leaves: readonly LeafTypedData[], chainId: number) {
  const revived = leaves.map((leaf) => reviveDelegationTypedData(leaf as { message?: Record<string, unknown> }));
  for (const leaf of revived) {
    const domain = (leaf as { domain?: { chainId?: unknown } }).domain;
    if (Number(domain?.chainId) !== chainId) throw new SigningRefused("a leaf for another chain");
  }
  return revived as Parameters<typeof checkEarnLeaves>[0];
}

const guaranteesOf = (leaves: readonly DecodedDelegation[]) => leaves.flatMap((leaf) => leafGuarantees(leaf));

/** May the phone sign this action with no prompt? See the file header for every rule. */
export async function budgetAllows(action: GuardAction, context: GuardContext, deps: GuardDeps): Promise<GuardVerdict> {
  const now = context.now ?? new Date();
  const { wallet, chainId } = context;
  const network = arcNetworkOf(chainId);
  const ops = opsWalletFor(chainId);
  if (!network || !ops) return refuse("budget_unverified", "not an Arc network");

  // 1. A budget this wallet signed, for this chain, on these exact terms.
  if (!context.budget) return refuse("no_budget");
  const policy = policyOf(context.budget);
  if (!policy || !isAddressEqual(policy.wallet, wallet) || policy.chainId !== chainId) return refuse("budget_unverified");
  if (!(await verifyBudget(policy, context.budget.signature as Hex))) return refuse("budget_unverified");

  // 2. Nothing switched off.
  if (!context.safety) return refuse("settings_unknown");
  if (context.budget.paused || context.safety.pausedAt) return refuse("paused");
  if (context.safety.riskMode === "careful") return refuse("guard_mode");
  if (context.safety.practice) return refuse("practice");

  // 3. The kind of action and the venue are the person's.
  const category = CATEGORY[action.kind];
  if (!policy.categories.includes(category)) return refuse("category_off", category);
  const venue = action.kind === "earn" ? action.vault.toLowerCase() : action.kind === "send" ? undefined : action.venue.toLowerCase();
  if (venue !== undefined && !policy.venues.includes(venue)) return refuse("venue_off", venue);

  // 4. What it is worth, by the phone's own reckoning, and the per-kind rules.
  const limits = DEFAULT_LIMITS[network];
  let amountUsd: bigint | undefined;
  let leaves: () => Promise<DecodedDelegation[]> = () => Promise.resolve([]);
  const nowSeconds = Math.floor(now.getTime() / MS_PER_SECOND);

  switch (action.kind) {
    case "swap": {
      if (!swapTokensSilent(chainId, action.tokenIn, action.tokenOut)) return refuse("token_unvetted");
      const tokenIn = vouchedToken(chainId, action.tokenIn)!;
      const tokenOut = vouchedToken(chainId, action.tokenOut)!;
      const venueContracts = swapVenueContracts(chainId, action.venue);
      if (!venueContracts) return refuse("venue_off", action.venue);
      const usdc = arcStablecoin(network, "USDC");
      const market = await deps.quote({ chainId, tokenIn: action.tokenIn, tokenOut: action.tokenOut, amountIn: action.amountIn });
      if (market === undefined) return refuse("unpriced");
      const stable = STABLE_KINDS.has(tokenIn.kind) && STABLE_KINDS.has(tokenOut.kind);
      const tolerance = BigInt((stable ? limits.maxSlippageStableBps : limits.maxSlippageOtherBps) + limits.warnRateGapBps);
      const floor = (market * (BPS - tolerance)) / BPS;
      if (action.minOut < floor || action.minOut === ZERO) return refuse("price_off", `${action.minOut} < ${floor}`);
      amountUsd = await usdValueOf(chainId, action.tokenIn, action.amountIn, deps.quote);
      // The leaf must be bound to the kill-switch as it stands now; without that read a leaf for the next nonce would
      // pass and come alive the moment the person pulls the switch.
      const nonce = await deps.reads.nonce(chainId, wallet);
      if (nonce === undefined) return refuse("settings_unknown", "kill-switch nonce unreadable");
      leaves = async () => {
        const typed = leavesFor(action.leaves, chainId);
        const nativeUsdc = typed.length === 1 && usdc !== undefined && isAddressEqual(usdc, action.tokenIn);
        if (typed.length < MIN_SWAP_LEAVES && !nativeUsdc) throw new SigningRefused("a swap without its approval and reset");
        const checked = checkSwapLeaves(typed, { wallet, ops, now: nowSeconds, nonce, venue: venueContracts, usdc, tokenIn: action.tokenIn, tokenOut: action.tokenOut, amountIn: action.amountIn, minOut: action.minOut });
        return [checked.swap];
      };
      break;
    }
    case "earn": {
      const usdc = arcStablecoin(network, "USDC");
      if (!usdc) return refuse("token_unvetted");
      const preview = await deps.reads.vaultPreview(chainId, action.vault, action.amount);
      if (!preview || preview.sharesIn === ZERO) return refuse("unpriced");
      const deposit = action.action === "deposit";
      const minOut = deposit ? (preview.sharesIn * EARN_FLOOR_BPS * (BPS - VAULT_DRIFT_BPS)) / (BPS * BPS) : (action.amount * EARN_FLOOR_BPS) / BPS;
      const maxSharesIn = deposit ? undefined : (preview.sharesOut * (EARN_SHARES_CEILING_BPS + VAULT_DRIFT_BPS)) / BPS;
      amountUsd = action.amount;
      const nonce = await deps.reads.nonce(chainId, wallet);
      if (nonce === undefined) return refuse("settings_unknown", "kill-switch nonce unreadable");
      leaves = async () => {
        return checkEarnLeaves(leavesFor(action.leaves, chainId), { wallet, ops, now: nowSeconds, nonce, action: action.action, vaults: [action.vault], vault: action.vault, asset: usdc, amount: action.amount, minOut, maxSharesIn });
      };
      break;
    }
    case "send": {
      const token = vouchedToken(chainId, action.token);
      if (!token || !STABLE_KINDS.has(token.kind)) return refuse("token_unvetted");
      if (!context.contacts.some((contact) => isAddress(contact) && isAddressEqual(contact, action.to))) return refuse("new_person");
      amountUsd = await usdValueOf(chainId, action.token, action.amount, deps.quote);
      break;
    }
    case "bridge": {
      if (!isAddressEqual(action.recipient, wallet)) return refuse("new_destination");
      const token = vouchedToken(chainId, action.token);
      if (!token || token.kind !== "dollar") return refuse("token_unvetted");
      amountUsd = await usdValueOf(chainId, action.token, action.amount, deps.quote);
      break;
    }
    case "x402":
      amountUsd = action.amountUsd;
      break;
  }
  if (amountUsd === undefined || amountUsd <= ZERO) return refuse("unpriced");

  // 5. Within the action cap and what is left of the week (the larger ledger counts).
  if (amountUsd > policy.perActionCap) return refuse("over_action_cap");
  const serverSpent = /^\d+$/.test(context.budget.spentThisWeek) ? BigInt(context.budget.spentThisWeek) : ZERO;
  const localSpent = await deps.localSpent(wallet, chainId, now).catch(() => ZERO);
  const spent = serverSpent > localSpent ? serverSpent : localSpent;
  if (spent + amountUsd > policy.weeklyCap) return refuse("over_week");

  // 6. Every leaf, decoded here, says exactly what the card says.
  let decoded: DecodedDelegation[];
  try {
    decoded = await leaves();
  } catch (error) {
    if (error instanceof SigningRefused) return refuse("leaf_refused", error.message);
    throw error;
  }
  return { silent: true, reason: "inside_budget", category, amountUsd, leftAfter: policy.weeklyCap - spent - amountUsd, guarantees: guaranteesOf(decoded) };
}
