// Setting the weekly budget (D38): ONE approval signs the budget, the away pack, the nonce rotation that turns the pack
// on, and the revoke of the old any-recipient allowance (the security fix). Raising anything asks the owner (Face ID,
// or the web's confirm); lowering, pausing and revoking never ask. Before a single signature the phone checks, on its
// own: the terms are exactly what the person set (the typed data is built here, never taken from the response), every
// grant of the pack pays only saved contacts, the budget's vaults or the wallet itself, for the wallet's next nonce read
// on Arc, and the rotation and the revoke only take power away.
import type { Address } from "viem";

import type { NetworkId, RevokeRequest } from "@kawase/api-client";
import {
  SigningRefused,
  arcStablecoin,
  budgetTypedData,
  checkAwayPack,
  checkRevoke,
  opsWalletFor,
  reviveDelegationTypedData,
  type BudgetCategory,
  type BudgetPolicy,
  type WalletSigner,
} from "@kawase/wallet";

import { signRevoke, submitRevoke } from "@/wallet/sign-revoke";

import { arcReads } from "./chain";
import { budgetApi, type ChainOutcome, type SaveAnswer, type SignedRequest } from "./client";
import { chainIdOf, invalidateGuardContext, loadGuardContext } from "./silent";
import type { BudgetView } from "./types";

const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1000;
/** The pack lives 30 days (api AWAY_PACK_DAYS); the phone accepts a day of slack on top. */
const PACK_DAYS_ACCEPTED = 31;
const ONE = 1n;

/** What the person set on the screen, in base units (US dollars, 6 decimals). */
export type BudgetDraft = { weeklyCap: bigint; perActionCap: bigint; categories: BudgetCategory[]; venues: string[] };

const lower = (list: readonly string[]) => [...new Set(list.map((entry) => entry.toLowerCase()))];
const subset = (inner: readonly string[], outer: readonly string[]) => lower(inner).every((entry) => lower(outer).includes(entry));
const sameSet = (a: readonly string[], b: readonly string[]) => subset(a, b) && subset(b, a);

/** A new budget that lets Kawase do anything more than the signed one: the owner confirms it. */
export function isLoosening(current: BudgetView | null, draft: BudgetDraft): boolean {
  if (!current) return true;
  const policy = current.policy;
  return draft.weeklyCap > BigInt(policy.weeklyCap) || draft.perActionCap > BigInt(policy.perActionCap) || !subset(draft.categories, policy.categories) || !subset(draft.venues, policy.venues);
}

export type SignBudgetOutcome =
  | { outcome: "saved"; answer: SaveAnswer }
  | { outcome: "cancelled" | "unavailable" | "failed" }
  /** The phone would not sign what it was handed: nothing was signed. */
  | { outcome: "refused"; reason: string };

type Confirm = () => Promise<"approved" | "cancelled" | "failed" | "unavailable">;

async function signRequest(signer: WalletSigner, request: RevokeRequest): Promise<SignedRequest> {
  const signed = await signRevoke(signer, request);
  return { requestId: signed.requestId, relayed: "relayed" in request, signed: signed.signed };
}

/**
 * Sign and save the budget the person set. `confirm` is the owner's check (confirmWithBiometrics with its words); it is
 * called only when the new budget loosens the signed one.
 */
export async function signBudget(input: { draft: BudgetDraft; current: BudgetView | null; signer: WalletSigner; network: NetworkId; confirm: Confirm }): Promise<SignBudgetOutcome> {
  const { draft, current, signer, network } = input;
  const chainId = chainIdOf(network);
  const wallet = signer.address as Address;
  const ops = opsWalletFor(chainId);
  const usdc = arcStablecoin(network, "USDC");
  if (!ops || !usdc) return { outcome: "unavailable" };
  try {
    const terms = { weeklyCap: draft.weeklyCap.toString(), perActionCap: draft.perActionCap.toString(), categories: draft.categories, venues: lower(draft.venues) };
    const [proposal, context, nonce] = await Promise.all([budgetApi.proposePack(terms), loadGuardContext(wallet, network), arcReads.nonce(chainId, wallet)]);

    // 1. The terms are the person's own, for this wallet and chain, newer than what is signed.
    const offered = proposal.policy;
    const policy: BudgetPolicy = { ...offered, wallet, weeklyCap: BigInt(offered.weeklyCap), perActionCap: BigInt(offered.perActionCap), categories: offered.categories, venues: offered.venues };
    if (offered.wallet.toLowerCase() !== wallet.toLowerCase() || offered.chainId !== chainId) throw new SigningRefused("a budget for another wallet or chain");
    if (policy.weeklyCap !== draft.weeklyCap || policy.perActionCap !== draft.perActionCap || !sameSet(policy.categories, draft.categories) || !sameSet(policy.venues, draft.venues)) throw new SigningRefused("a budget with other terms than the screen");
    if (current && policy.version <= current.policy.version) throw new SigningRefused("an older budget");

    // 2. The away pack: for the wallet's next nonce, only saved contacts, the budget's vaults, the wallet itself.
    if (nonce === undefined) return { outcome: "unavailable" };
    const next = nonce + ONE;
    if (BigInt(proposal.away.nonce) !== next) throw new SigningRefused("an away pack for another kill-switch nonce");
    const now = Math.floor(Date.now() / MS_PER_SECOND);
    const offers = proposal.away.offers.map((offer) => ({ purpose: offer.purpose, subject: offer.subject, typedData: reviveDelegationTypedData(offer.typedData as { message?: Record<string, unknown> }) }));
    checkAwayPack(offers, {
      wallet,
      ops,
      nonce: next,
      usdc,
      chainId,
      latestEnd: now + PACK_DAYS_ACCEPTED * SECONDS_PER_DAY,
      contacts: context.contacts,
      perContactPerWeek: draft.perActionCap,
      vaults: draft.venues.filter((venue) => venue.startsWith("0x")),
    });

    // 3. The rotation and the old allowance's revoke only take power away (and the rotation turns the new pack on).
    const requests = [proposal.rotation, proposal.allowanceRevoke].filter((request): request is RevokeRequest => Boolean(request));
    for (const request of requests) checkRevoke("relayed" in request ? { typedData: request.typedData } : { transaction: request.transaction }, wallet);

    // 4. One approval, only when the new budget lets Kawase do more.
    if (isLoosening(current, draft)) {
      const check = await input.confirm();
      if (check !== "approved") return { outcome: check === "unavailable" ? "unavailable" : check === "failed" ? "failed" : "cancelled" };
    }

    // 5. Everything signed under that one yes, then saved together.
    const signature = await signer.signTypedData(budgetTypedData(policy));
    const signatures: { salt: string; signature: string }[] = [];
    for (const offer of offers) signatures.push({ salt: String(offer.typedData.message?.salt ?? ""), signature: await signer.signTypedData(offer.typedData as never) });
    const rotation = await signRequest(signer, proposal.rotation);
    const allowanceRevoke = proposal.allowanceRevoke ? await signRequest(signer, proposal.allowanceRevoke) : undefined;
    const answer = await budgetApi.save({ policy: offered, signature, away: { proposalId: proposal.away.proposalId, signatures }, rotation, allowanceRevoke });
    invalidateGuardContext();
    return { outcome: "saved", answer };
  } catch (error) {
    if (error instanceof SigningRefused) return { outcome: "refused", reason: error.reason };
    throw error;
  }
}

export type RevokeAllOutcome = { kill: ChainOutcome; legacy: ChainOutcome };

/**
 * Revoke everything (the exit kit), with no prompt: it only ever takes power away. The budget pauses at once on the
 * api; the wallet signs the kill-switch (every leaf and away grant dies) and the revoke of every older grant, and the
 * relayer (or the wallet itself) sends both.
 */
export async function revokeAll(signer: WalletSigner): Promise<RevokeAllOutcome> {
  const { revoke } = await budgetApi.killSwitch();
  const { legacy, ...kill } = revoke;
  const signedKill = await signRequest(signer, kill as RevokeRequest);
  const killed = await budgetApi
    .submitKillSwitch(signedKill)
    .then((sent): ChainOutcome => ({ status: sent.status, tx: sent.tx }))
    .catch((): ChainOutcome => ({ status: "failed", tx: null }));
  let legacyOutcome: ChainOutcome = null;
  if (legacy) {
    const signed = await signRevoke(signer, legacy);
    legacyOutcome = await submitRevoke(legacy, signed)
      .then((sent): ChainOutcome => ({ status: sent.status === "confirmed" ? "confirmed" : "reverted", tx: sent.tx }))
      .catch((): ChainOutcome => ({ status: "failed", tx: null }));
  }
  invalidateGuardContext();
  return { kill: killed, legacy: legacyOutcome };
}
