// The `sign_leaf` path shared by swap and earn (D38): instead of one transaction the wallet signs behind Face ID, the
// phone signs one-shot leaves silently (after its own checks, packages/wallet flow-checks) and Kawase's ops wallet
// redeems them in one `redeemDelegations`, paying the gas. Each leaf can do only its one call, once, within 120 s, and
// the swap's output must land in the wallet (ERC20BalanceChange), so the ops key can never redirect it.
//
// Here: the response shape, the leaves as the phone receives them (typed data + decoded receipt), the stored request,
// and the signature check (each leaf must be signed by the intent's own wallet over exactly the stored terms).
import type { Delegation } from "@metamask/smart-accounts-kit";
import { and, eq } from "drizzle-orm";
import { recoverTypedDataAddress, type Address, type Hex, type TypedDataDefinition } from "viem";

import { describeGrant, grantTypedData, type LeafStep } from "@kawase/integrations-delegation";
import type { NetworkContext, NetworkId } from "@kawase/networks";
import type { BudgetCategory } from "@kawase/wallet";

import { HTTP, problem } from "../http/problem";
import type { Tx } from "../intents/chain";
import { budgetLeafRequests } from "./schema";
import { serializeTyped, type BudgetRefusal, type BudgetService } from "./service";

/** Seconds before a leaf's on-chain end after which Kawase no longer redeems it (room for Circle and a block). */
const REDEEM_MARGIN_S = 30;
const MS_PER_SECOND = 1000;
/** Budget dollars are 6-decimal base units, like USDC. */
const USD_UNITS = 1_000_000;

/** What the swap and earn services need from the budget. */
export type LeafBudget = Pick<BudgetService, "allows" | "reserve">;

/** One leaf as the phone receives it: the typed data to sign and the receipt decoded from the same bytes. */
export type LeafOffer = { typedData: TypedDataDefinition; receipt: ReturnType<typeof describeGrant> };

export type LeafBudgetLine = { category: BudgetCategory; venue: string; amountUsd: string };

/** The answers of the leaf path, around the service's own intent view. */
export type LeafResponse<Intent> =
  | { status: "sign_leaf"; intent: Intent; approvalId: string; leaves: LeafOffer[]; expiresAt: string; budget: LeafBudgetLine & { leftThisWeek: string } }
  /** Not silent: the phone falls back to the ordinary approval (a slide or Face ID) and says why. */
  | { status: "outside_budget"; intent: Intent; reason: BudgetRefusal | "unpriced" }
  | { status: "executing"; intent: Intent }
  | { status: "changed"; intent: Intent }
  | { status: "final"; intent: Intent };

export function offerLeaves(network: NetworkContext, steps: readonly LeafStep[]): LeafOffer[] {
  return steps.map((step) => serializeTyped({ typedData: grantTypedData(network, step.grant), receipt: describeGrant(network, step.grant) }));
}

/** US dollars (a float from the price feed) as 6-decimal base units, rounded up so the budget never undercounts. */
export const usdBaseUnits = (usd: number) => BigInt(Math.ceil(usd * USD_UNITS));

/** The latest block's time: what the Timestamp caveat compares against. */
export async function chainNow(client: { getBlock: () => Promise<{ timestamp: bigint }> }) {
  return Number((await client.getBlock()).timestamp);
}

/** Stores the leaves handed to the phone for one approval; any older request for the intent is closed. */
export async function storeLeafRequest(
  tx: Tx,
  input: { userId: string; intentId: string; network: NetworkId; kind: "swap" | "earn"; draftVersion: number; draftHash: string; steps: readonly LeafStep[]; line: { category: BudgetCategory; venue: string; amountUsd: bigint }; expiresAt: number },
) {
  await tx
    .update(budgetLeafRequests)
    .set({ status: "rejected" })
    .where(and(eq(budgetLeafRequests.intentId, input.intentId), eq(budgetLeafRequests.status, "pending_signature")));
  const [row] = await tx
    .insert(budgetLeafRequests)
    .values({
      userId: input.userId,
      intentId: input.intentId,
      network: input.network,
      kind: input.kind,
      draftVersion: input.draftVersion,
      draftHash: input.draftHash,
      steps: input.steps.map((step) => ({ grant: step.grant as unknown as Record<string, unknown>, target: step.target, callData: step.callData })),
      category: input.line.category,
      venue: input.line.venue.toLowerCase(),
      amountUsd: input.line.amountUsd,
      expiresAt: new Date((input.expiresAt - REDEEM_MARGIN_S) * MS_PER_SECOND),
    })
    .returning({ id: budgetLeafRequests.id });
  return row!.id;
}

/**
 * The pending request for this approval, still for the current version and not past its redeem margin, with every
 * leaf's signature checked against the intent's own wallet over exactly the stored terms. Throws on anything else.
 */
export async function takeSignedLeaves(
  tx: Tx,
  network: NetworkContext,
  input: { approvalId: string; intentId: string; kind: "swap" | "earn"; draftVersion: number; draftHash: string; wallet: Address; signatures: readonly Hex[] },
) {
  const [request] = await tx
    .select()
    .from(budgetLeafRequests)
    .where(and(eq(budgetLeafRequests.id, input.approvalId), eq(budgetLeafRequests.intentId, input.intentId), eq(budgetLeafRequests.kind, input.kind)))
    .for("update");
  if (!request || request.status !== "pending_signature" || request.draftVersion !== input.draftVersion || request.draftHash !== input.draftHash) throw problem(HTTP.conflict, "intent_stale");
  if (request.expiresAt.getTime() < Date.now()) {
    await tx.update(budgetLeafRequests).set({ status: "expired" }).where(eq(budgetLeafRequests.id, request.id));
    throw problem(HTTP.conflict, "intent_stale", "the leaves expired; approve again");
  }
  if (input.signatures.length !== request.steps.length) throw problem(HTTP.unprocessable, "signature_mismatch", "one signature per leaf");
  const steps: LeafStep[] = [];
  for (const [index, stored] of request.steps.entries()) {
    const grant = stored.grant as unknown as Delegation;
    const signature = input.signatures[index]!;
    const signer = await recoverTypedDataAddress({ ...grantTypedData(network, grant), signature } as never).catch(() => undefined);
    if (!signer || signer.toLowerCase() !== input.wallet.toLowerCase() || grant.delegator.toLowerCase() !== input.wallet.toLowerCase()) {
      await tx.update(budgetLeafRequests).set({ status: "rejected" }).where(eq(budgetLeafRequests.id, request.id));
      throw problem(HTTP.unprocessable, "signature_mismatch", "a leaf was not signed by this wallet");
    }
    steps.push({ grant: { ...grant, signature }, target: stored.target as Address, callData: stored.callData as Hex });
  }
  return { request, steps };
}

export async function markLeafRequest(tx: Tx, id: string, status: "redeemed" | "rejected") {
  await tx.update(budgetLeafRequests).set({ status }).where(eq(budgetLeafRequests.id, id));
}
