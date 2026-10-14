// The silent path (D38) for the screens' money hooks (intents/use-wallet-intent.ts, send/use-send.ts): inside the
// signed budget the phone signs with no Face ID and no web confirm; outside it the hook's ordinary confirm stays.
//  - swaps and vault moves: the api hands one-shot leaves (`sign_leaf`), the guard decodes every one of them against
//    its own quote and reads, the wallet signs them, Kawase's ops wallet redeems them (guard.ts, packages/wallet);
//  - sends to a saved contact: the guard checks the contact and the dollars, the week is reserved on the api first,
//    and the wallet signs exactly the transfer on the card (checkSendTransaction / checkTransferAuthorization).
// Everything the phone signs silently goes into its own weekly ledger and comes back out if the action dies.
import { randomUUID } from "expo-crypto";
import type { Address, TypedDataDefinition } from "viem";

import type { EarnIntent, IntentState, LeafResponse, NetworkId, SendIntent, SwapIntent } from "@kawase/api-client";
import { arcStablecoin, reviveDelegationTypedData, type BudgetCategory, type WalletSigner } from "@kawase/wallet";

import { ARC_CHAIN_IDS } from "@/safety/use-safety";
import { api } from "@/session/api";

import { arcReads } from "./chain";
import { budgetApi } from "./client";
import { budgetAllows, type GuardAction, type GuardContext, type GuardDeps, type GuardVerdict } from "./guard";
import { phoneLedger } from "./ledger-store";
import { kyberQuote } from "./price";

/** How long the guard's inputs (budget, limits, contacts) are reused between two actions. */
const CONTEXT_TTL_MS = 15_000;
/** Intent states in which nothing moved: the room the phone counted comes back. */
const DEAD: ReadonlySet<IntentState> = new Set(["failed", "canceled", "expired", "rejected"] as IntentState[]);

export const chainIdOf = (network: NetworkId): number => ARC_CHAIN_IDS[network];

const deps: GuardDeps = { quote: kyberQuote(), reads: arcReads, localSpent: (wallet, chainId, now) => phoneLedger.spent(wallet, chainId, now) };

let cached: { key: string; at: number; context: Promise<GuardContext> } | undefined;

/** Forget the cached inputs (the budget or the limits just changed). */
export function invalidateGuardContext() {
  cached = undefined;
}

/**
 * The guard's inputs for this wallet on this network: the signed budget (null when there is none or it could not be
 * read: then nothing is silent), the safety settings (null when unreadable: then nothing is silent), and the saved
 * contacts' payable addresses (a frozen address change or a blocked contact is not a saved contact).
 */
export function loadGuardContext(wallet: Address, network: NetworkId): Promise<GuardContext> {
  const key = `${wallet.toLowerCase()}:${network}`;
  if (cached && cached.key === key && Date.now() - cached.at < CONTEXT_TTL_MS) return cached.context;
  const context = (async (): Promise<GuardContext> => {
    const [budget, safety, contacts] = await Promise.all([
      budgetApi.get().then((answer) => answer.budget).catch(() => null),
      api.safety.get().catch(() => null),
      api.contacts.list().then((answer) => answer.contacts).catch(() => []),
    ]);
    return {
      wallet,
      chainId: chainIdOf(network),
      budget,
      safety: safety ? { pausedAt: safety.pausedAt, riskMode: safety.riskMode, practice: safety.practice } : null,
      contacts: contacts.filter((contact) => contact.address && !contact.blocked && !contact.pendingChange).map((contact) => contact.address!),
    };
  })();
  cached = { key, at: Date.now(), context };
  context.catch(() => invalidateGuardContext());
  return context;
}

/** Whether a budget could cover this kind of action at all: no budget, paused or the category off skips the leaf offer. */
function mayCover(context: GuardContext, category: BudgetCategory) {
  const budget = context.budget;
  return Boolean(budget && !budget.paused && budget.policy.categories.includes(category) && context.safety && !context.safety.pausedAt && context.safety.riskMode !== "careful" && !context.safety.practice);
}

export type SilentLeafOutcome<T> =
  /** The ordinary path (the person's confirm); `verdict` says why when the guard decided. */
  | { handled: false; verdict?: GuardVerdict | undefined }
  /** Signed silently and sent (or the api answered changed/final/executing): show `answer.intent`. */
  | { handled: true; answer: LeafResponse<T>; verdict?: GuardVerdict | undefined };

type LeafKind = "swap" | "earn";

function swapAction(intent: SwapIntent, leaves: readonly Record<string, unknown>[]): GuardAction | undefined {
  const draft = intent.draft;
  if (!draft) return undefined;
  const tokenIn = (draft.tokens?.in.address ?? arcStablecoin(intent.network, draft.tokenIn)) as Address | undefined;
  const tokenOut = (draft.tokens?.out.address ?? arcStablecoin(intent.network, draft.tokenOut)) as Address | undefined;
  if (!tokenIn || !tokenOut) return undefined;
  return { kind: "swap", venue: draft.venue ?? "app_kit", tokenIn, tokenOut, amountIn: BigInt(draft.amountIn), minOut: BigInt(draft.minOut), leaves };
}

function earnAction(intent: EarnIntent, leaves: readonly Record<string, unknown>[]): GuardAction | undefined {
  const draft = intent.draft;
  if (!draft) return undefined;
  return { kind: "earn", action: draft.action, vault: draft.vault.address as Address, amount: BigInt(draft.amount), leaves };
}

/**
 * Try the silent path for a swap or a vault move: ask the api for the leaves, check them on the phone, sign them with
 * no prompt and send the signatures. Anything the guard will not vouch for returns `handled: false` before a single
 * signature, and the hook asks the person as before.
 */
export async function trySilentLeaves<T extends SwapIntent | EarnIntent>(kind: LeafKind, intent: T, signer: WalletSigner): Promise<SilentLeafOutcome<T>> {
  const context = await loadGuardContext(signer.address, intent.network).catch(() => undefined);
  if (!context || !mayCover(context, kind)) return { handled: false };
  const offer = (
    kind === "swap" ? await api.budget.swapLeaf(intent.id, intent.version, randomUUID()) : await api.budget.earnLeaf(intent.id, intent.version, randomUUID())
  ) as LeafResponse<T>;
  if (offer.status === "outside_budget") return { handled: false };
  if (offer.status !== "sign_leaf") return { handled: true, answer: offer };
  const typed = offer.leaves.map((leaf) => leaf.typedData);
  const action = kind === "swap" ? swapAction(offer.intent as SwapIntent, typed) : earnAction(offer.intent as EarnIntent, typed);
  if (!action) return { handled: false };
  const verdict = await budgetAllows(action, context, deps);
  if (!verdict.silent) return { handled: false, verdict };
  const chainId = context.chainId;
  await phoneLedger.record(signer.address, chainId, { intentId: intent.id, category: verdict.category, venue: offer.budget.venue, amountUsd: verdict.amountUsd.toString() });
  try {
    const signatures: string[] = [];
    for (const leaf of typed) signatures.push(await signer.signTypedData(reviveDelegationTypedData(leaf) as unknown as TypedDataDefinition));
    const answer = (
      kind === "swap" ? await api.budget.swapLeafSignature(intent.id, offer.approvalId, signatures) : await api.budget.earnLeafSignature(intent.id, offer.approvalId, signatures)
    ) as LeafResponse<T>;
    if (answer.status === "outside_budget" || answer.status === "changed" || answer.status === "final") await phoneLedger.release(signer.address, chainId, intent.id);
    if (answer.status === "outside_budget") return { handled: false, verdict };
    invalidateGuardContext();
    return { handled: true, answer, verdict };
  } catch (error) {
    await phoneLedger.release(signer.address, chainId, intent.id);
    throw error;
  }
}

/**
 * Whether a send may be signed with no prompt: the guard's verdict for exactly the card (a saved contact, a dollar
 * stablecoin, the caps), and then the api's own reservation of the week. Only `silent: true` skips the confirm.
 */
export async function silentSendVerdict(intent: SendIntent, wallet: Address): Promise<GuardVerdict> {
  const draft = intent.draft;
  const context = await loadGuardContext(wallet, intent.network).catch(() => undefined);
  if (!draft || !context) return { silent: false, reason: "settings_unknown" };
  if (!mayCover(context, "send")) return { silent: false, reason: context.budget ? "category_off" : "no_budget" };
  const token = (draft.token?.address ?? arcStablecoin(intent.network, draft.asset)) as Address | undefined;
  if (!token) return { silent: false, reason: "token_unvetted" };
  const verdict = await budgetAllows({ kind: "send", token, to: draft.recipient.address as Address, amount: BigInt(draft.amount) }, context, deps);
  if (!verdict.silent) return verdict;
  const reserved = await budgetApi.reserveSend(intent.id, verdict.amountUsd).catch(() => undefined);
  if (!reserved?.ok) return { silent: false, reason: "over_week" };
  await phoneLedger.record(wallet, context.chainId, { intentId: intent.id, category: "send", venue: "transfer", amountUsd: verdict.amountUsd.toString() });
  invalidateGuardContext();
  return verdict;
}

/**
 * What the review says before the tap: would the budget send this without asking? The same checks as
 * `silentSendVerdict`, with no reservation and nothing recorded (a preview, never the decision).
 */
export async function previewSendVerdict(intent: SendIntent, wallet: Address): Promise<boolean> {
  const draft = intent.draft;
  const context = await loadGuardContext(wallet, intent.network).catch(() => undefined);
  if (!draft || !context || !mayCover(context, "send")) return false;
  const token = (draft.token?.address ?? arcStablecoin(intent.network, draft.asset)) as Address | undefined;
  if (!token) return false;
  const verdict = await budgetAllows({ kind: "send", token, to: draft.recipient.address as Address, amount: BigInt(draft.amount) }, context, deps);
  return verdict.silent;
}

/** An action the phone counted ended without moving money: its room comes back (a no-op for one it never counted). */
export function releaseIfDead(intent: { id: string; state: IntentState; network: NetworkId }, wallet: Address | undefined) {
  if (!wallet || !DEAD.has(intent.state)) return;
  void phoneLedger.release(wallet, chainIdOf(intent.network), intent.id).catch(() => undefined);
}
