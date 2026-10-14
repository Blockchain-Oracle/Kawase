// D38, the phone's budget guard (apps/mobile/src/budget/guard.ts) on leaves this package really builds: a swap inside
// a budget the wallet signed is silent, and every reason it must not be is caught on the phone with the fix it names:
// a forged or missing budget, pause, careful mode, practice, a category or venue left out, a token Kawase does not
// vouch for, a stranger, a destination that is not the wallet, a price worse than the phone's own quote, no quote,
// the per-action cap, the week (the larger of the server's and the phone's ledgers), and a leaf that bends the card.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@kawase/networks";
import { KAWASE_OPS_WALLETS, budgetTypedData, venueRouters, type BudgetPolicy } from "@kawase/wallet";

import { budgetAllows, type GuardAction, type GuardContext, type GuardDeps } from "../../../../apps/mobile/src/budget/guard.ts";
import { createPhoneLedger, spentIn, weekStart } from "../../../../apps/mobile/src/budget/ledger.ts";
import type { BudgetView } from "../../../../apps/mobile/src/budget/types.ts";
import { swapAdapterContract } from "../../app-kit/src/index.ts";
import { buildEarnLeaves, buildSwapLeaves, grantTypedData, randomSalt } from "../src";

const network = getNetwork("testnet");
const chainId = network.chainId;
const owner = privateKeyToAccount(generatePrivateKey());
const wallet = owner.address;
const ops = KAWASE_OPS_WALLETS[chainId]!;
const router = venueRouters(chainId, "app_kit")[0]!;
const vault = getAddress(privateKeyToAccount(generatePrivateKey()).address);
const contact = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const { usdc, eurc } = network.addresses;
const USD = 1_000_000n;
const nowDate = new Date("2026-10-14T12:00:00Z");
const now = Math.floor(nowDate.getTime() / 1000);
const nonce = 2n;
const json = <T>(value: T) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as T;
const typed = (leaf: Delegation) => json(grantTypedData(network, leaf)) as Record<string, unknown>;

async function signedBudget(overrides: Partial<BudgetPolicy> = {}, view: Partial<BudgetView> = {}): Promise<BudgetView> {
  const policy: BudgetPolicy = { wallet, chainId, weeklyCap: 50n * USD, perActionCap: 20n * USD, categories: ["swap", "earn", "send", "bridge", "x402"], venues: ["app_kit", vault.toLowerCase(), "cctp", "aisa"], issuedAt: now - 60, version: 1, ...overrides };
  const signature = await owner.signTypedData(budgetTypedData(policy));
  return {
    network: "testnet",
    policy: { ...policy, weeklyCap: policy.weeklyCap.toString(), perActionCap: policy.perActionCap.toString() },
    signature,
    paused: false,
    spentThisWeek: "0",
    leftThisWeek: policy.weeklyCap.toString(),
    weekStartsAt: weekStart(nowDate).toISOString(),
    weekEndsAt: nowDate.toISOString(),
    ...view,
  };
}

const swapLeaves = (overrides: { minOut?: bigint; ops?: Address; router?: Address } = {}) => {
  const leaves = buildSwapLeaves({ network, wallet, ops: overrides.ops ?? ops, router: overrides.router ?? router, tokenIn: usdc, tokenOut: eurc, amountIn: 10n * USD, minOut: overrides.minOut ?? 8_500_000n, routerCalldata: "0xdeadbeef" as Hex, nonce, now, salts: [randomSalt(), randomSalt()] });
  return [typed(leaves.approveLeaf), typed(leaves.swapLeaf)];
};
const swap = (overrides: Partial<Extract<GuardAction, { kind: "swap" }>> = {}): GuardAction => ({ kind: "swap", venue: "app_kit", tokenIn: usdc, tokenOut: eurc, amountIn: 10n * USD, minOut: 8_500_000n, leaves: swapLeaves(), ...overrides });

/** The phone's own market: 10 USDC buys 8.6 EURC; a USDC amount is worth itself. */
const deps = (overrides: Partial<GuardDeps> = {}): GuardDeps => ({
  quote: async ({ tokenIn, amountIn }) => (tokenIn.toLowerCase() === eurc.toLowerCase() ? (amountIn * 116n) / 100n : (amountIn * 86n) / 100n),
  reads: { nonce: async () => nonce, vaultPreview: async (_chain, _vault, assets) => ({ sharesIn: assets * 1000n, sharesOut: assets * 1000n }) },
  localSpent: async () => 0n,
  ...overrides,
});
const context = async (overrides: Partial<GuardContext> = {}): Promise<GuardContext> => ({ wallet, chainId, budget: await signedBudget(), safety: { pausedAt: null, riskMode: "balanced", practice: false }, contacts: [contact], now: nowDate, ...overrides });

test("the venue list the phone compiles in is App Kit's real adapter", () => {
  assert.equal(router, swapAdapterContract(network));
});

test("a swap inside a signed budget is silent, with the leaf's guarantees for the receipt", async () => {
  const verdict = await budgetAllows(swap(), await context(), deps());
  assert.equal(verdict.silent, true, JSON.stringify(verdict, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  if (!verdict.silent) return;
  assert.equal(verdict.amountUsd, 10n * USD);
  assert.equal(verdict.leftAfter, 40n * USD);
  assert.deepEqual(
    verdict.guarantees.map((entry) => [entry.token.toLowerCase(), entry.direction, entry.amount]),
    [
      [eurc.toLowerCase(), "increase", 8_500_000n],
      [usdc.toLowerCase(), "decrease", 10n * USD],
    ],
  );
});

test("no budget, a forged one, or one for another wallet is never silent", async () => {
  assert.equal((await budgetAllows(swap(), await context({ budget: null }), deps())).reason, "no_budget");
  const raised = await signedBudget();
  raised.policy.weeklyCap = (500n * USD).toString();
  assert.equal((await budgetAllows(swap(), await context({ budget: raised }), deps())).reason, "budget_unverified");
  const other = await signedBudget({ wallet: stranger });
  assert.equal((await budgetAllows(swap(), await context({ budget: other }), deps())).reason, "budget_unverified");
});

test("pause, careful mode, practice and unreadable settings are never silent", async () => {
  assert.equal((await budgetAllows(swap(), await context({ budget: await signedBudget({}, { paused: true }) }), deps())).reason, "paused");
  assert.equal((await budgetAllows(swap(), await context({ safety: { pausedAt: nowDate.toISOString(), riskMode: "balanced", practice: false } }), deps())).reason, "paused");
  assert.equal((await budgetAllows(swap(), await context({ safety: { pausedAt: null, riskMode: "careful", practice: false } }), deps())).reason, "guard_mode");
  assert.equal((await budgetAllows(swap(), await context({ safety: { pausedAt: null, riskMode: "autonomous", practice: true } }), deps())).reason, "practice");
  assert.equal((await budgetAllows(swap(), await context({ safety: null }), deps())).reason, "settings_unknown");
});

test("a category or venue outside the budget, an unknown router or an unvetted token asks", async () => {
  assert.equal((await budgetAllows(swap(), await context({ budget: await signedBudget({ categories: ["earn"] }) }), deps())).reason, "category_off");
  assert.equal((await budgetAllows(swap(), await context({ budget: await signedBudget({ venues: ["kyberswap"] }) }), deps())).reason, "venue_off");
  assert.equal((await budgetAllows(swap({ venue: "socket" }), await context({ budget: await signedBudget({ venues: ["socket"] }) }), deps())).reason, "venue_off");
  assert.equal((await budgetAllows(swap({ tokenOut: stranger }), await context(), deps())).reason, "token_unvetted");
});

test("price sanity: a minimum worse than the phone's own quote, or no quote at all, asks", async () => {
  // Market 8.6 EURC; testnet stable tolerance is 2% slippage + 1% gap, so the floor is 8.342.
  const low = swap({ minOut: 8_300_000n, leaves: swapLeaves({ minOut: 8_300_000n }) });
  assert.equal((await budgetAllows(low, await context(), deps())).reason, "price_off");
  assert.equal((await budgetAllows(swap(), await context(), deps({ quote: async () => undefined }))).reason, "unpriced");
});

test("the per-action cap and the week, counting the larger of the two ledgers", async () => {
  assert.equal((await budgetAllows(swap(), await context({ budget: await signedBudget({ perActionCap: 5n * USD }) }), deps())).reason, "over_action_cap");
  assert.equal((await budgetAllows(swap(), await context({ budget: await signedBudget({}, { spentThisWeek: (45n * USD).toString() }) }), deps())).reason, "over_week");
  // The server forgot a spend; the phone did not.
  assert.equal((await budgetAllows(swap(), await context(), deps({ localSpent: async () => 41n * USD }))).reason, "over_week");
});

test("leaves that bend the card are refused on the phone: a lower minimum, another redeemer, another router", async () => {
  const lower = await budgetAllows(swap({ leaves: swapLeaves({ minOut: 8_400_000n }) }), await context(), deps());
  assert.equal(lower.reason, "leaf_refused");
  assert.equal((await budgetAllows(swap({ leaves: swapLeaves({ ops: stranger }) }), await context(), deps())).reason, "leaf_refused");
  assert.equal((await budgetAllows(swap({ leaves: swapLeaves({ router: stranger }) }), await context(), deps())).reason, "leaf_refused");
  assert.equal((await budgetAllows(swap({ leaves: swapLeaves().slice(0, 1) }), await context(), deps())).reason, "leaf_refused");
  // A leaf bound to an old kill-switch nonce is dead on chain anyway; the phone says so before signing.
  assert.equal((await budgetAllows(swap(), await context(), deps({ reads: { nonce: async () => nonce + 1n, vaultPreview: async () => undefined } }))).reason, "leaf_refused");
});

test("a kill-switch nonce the phone could not read is never silent, for swaps and vault moves alike", async () => {
  // Otherwise a leaf bound to the next nonce would pass now and come alive the moment the person pulls the switch.
  const unread = deps({ reads: { nonce: async () => undefined, vaultPreview: async (_chain, _vault, assets) => ({ sharesIn: assets * 1000n, sharesOut: assets * 1000n }) } });
  const swapVerdict = await budgetAllows(swap({ leaves: swapLeaves() }), await context(), unread);
  assert.equal(swapVerdict.silent, false);
  assert.equal(swapVerdict.reason, "settings_unknown");
  const leaves = buildEarnLeaves({ network, wallet, ops, action: "deposit", vault, asset: usdc, amount: 5n * USD, minOut: 4_950_000_000n, nonce: nonce + 1n, now, salts: [randomSalt(), randomSalt()] });
  const deposit: GuardAction = { kind: "earn", action: "deposit", vault, amount: 5n * USD, leaves: leaves.leaves.map(typed) };
  const earnVerdict = await budgetAllows(deposit, await context(), unread);
  assert.equal(earnVerdict.silent, false);
  assert.equal(earnVerdict.reason, "settings_unknown");
});

test("a vault deposit inside the budget is silent; without the vault's own preview it asks", async () => {
  const leaves = buildEarnLeaves({ network, wallet, ops, action: "deposit", vault, asset: usdc, amount: 5n * USD, minOut: 4_950_000_000n, nonce, now, salts: [randomSalt(), randomSalt()] });
  const deposit: GuardAction = { kind: "earn", action: "deposit", vault, amount: 5n * USD, leaves: leaves.leaves.map(typed) };
  const verdict = await budgetAllows(deposit, await context(), deps());
  assert.equal(verdict.silent, true, verdict.silent ? "" : `${verdict.reason}: ${verdict.detail}`);
  assert.equal((await budgetAllows(deposit, await context(), deps({ reads: { nonce: async () => nonce, vaultPreview: async () => undefined } }))).reason, "unpriced");
  // Shares below the phone's own preview floor.
  const stingy = buildEarnLeaves({ network, wallet, ops, action: "deposit", vault, asset: usdc, amount: 5n * USD, minOut: 4_000_000_000n, nonce, now, salts: [randomSalt(), randomSalt()] });
  assert.equal((await budgetAllows({ ...deposit, leaves: stingy.leaves.map(typed) }, await context(), deps())).reason, "leaf_refused");
});

test("sends go only to saved contacts, moves only to the wallet itself, x402 inside the cap", async () => {
  assert.equal((await budgetAllows({ kind: "send", token: usdc, to: contact, amount: 3n * USD }, await context(), deps())).silent, true);
  assert.equal((await budgetAllows({ kind: "send", token: usdc, to: stranger, amount: 3n * USD }, await context(), deps())).reason, "new_person");
  assert.equal((await budgetAllows({ kind: "bridge", venue: "cctp", token: usdc, amount: 3n * USD, recipient: wallet }, await context(), deps())).silent, true);
  assert.equal((await budgetAllows({ kind: "bridge", venue: "cctp", token: usdc, amount: 3n * USD, recipient: stranger }, await context(), deps())).reason, "new_destination");
  assert.equal((await budgetAllows({ kind: "x402", venue: "aisa", amountUsd: 100_000n }, await context(), deps())).silent, true);
  assert.equal((await budgetAllows({ kind: "x402", venue: "unknown", amountUsd: 100_000n }, await context(), deps())).reason, "venue_off");
});

test("the phone ledger counts this ISO week, keeps one row per intent, and gives back a released one", async () => {
  const store = new Map<string, string>();
  const ledger = createPhoneLedger({ get: async (key) => store.get(key), set: async (key, value) => void store.set(key, value) });
  const monday = weekStart(nowDate).getTime();
  await ledger.record(wallet, chainId, { intentId: "a", category: "swap", venue: "app_kit", amountUsd: "2000000", at: monday + 1 });
  await ledger.record(wallet, chainId, { intentId: "a", category: "swap", venue: "app_kit", amountUsd: "3000000", at: monday + 2 });
  await ledger.record(wallet, chainId, { intentId: "b", category: "earn", venue: "vault", amountUsd: "1000000", at: monday - 1 });
  assert.equal(await ledger.spent(wallet, chainId, nowDate), 3_000_000n);
  await ledger.release(wallet, chainId, "a");
  assert.equal(await ledger.spent(wallet, chainId, nowDate), 0n);
  assert.equal(spentIn([], nowDate), 0n);
  assert.equal(weekStart(new Date("2026-10-18T23:59:00Z")).toISOString(), "2026-10-12T00:00:00.000Z");
});
