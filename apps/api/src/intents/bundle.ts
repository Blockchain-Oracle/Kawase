// One transaction carrying several intents (money-out.md "How": review lines → Face ID always → one batch, swaps +
// transfers/burns). Each intent keeps its own engine's checks, draft and receipt witness: the engine hands over the
// calls its approval would have built (`BundlePart`), the batch is one EIP-7702 self-call of all of them in order,
// and the one signed transaction is recorded against every intent, so each follows and settles exactly as if it had
// been signed alone. A batch is all or nothing on chain: if any call reverts, nothing moved.
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import type { Address, Hex, PublicClient } from "viem";

import type { UnsignedTransaction } from "@kawase/api-client";
import { approvals, intents, spendLedger, txAttempts, type Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";
import { nextAttemptNo, type Tx } from "./chain";

const ZERO = 0n;

/** What one intent puts into a batch: its calls, re-checked on fresh facts exactly as its approval would be. */
export type BundlePart = {
  intentId: string;
  version: number;
  draftHash: Hex;
  from: Address;
  chainId: number;
  calls: { to: Address; data: Hex; value: bigint }[];
  /** The most this intent's draft allows for the network fee; the batch may spend at most their sum. */
  maxFee: bigint;
  /** How the attempt is recorded (its engine's own kind), and where it points. */
  attemptKind: "swap_wallet" | "send_wallet" | "crosschain_wallet";
  attemptTo: Address;
  /** Extra state the engine keeps on its attempt (the cross-chain provider, for following the fill). */
  attemptReceipt?: Record<string, unknown> | undefined;
  /** Sends only: what the spend limits count, reserved when the batch is recorded. */
  ledger?: { asset: string; amount: string } | null | undefined;
};

/** Every engine that can put an intent into a batch: `changed`, the version was redrafted; `final`, it cannot go. */
export type BundleEngine = {
  bundlePart(user: SessionUser, intentId: string): Promise<BundlePart | "changed" | "final">;
  /** Follows the intent's transaction until its receipt is settled (true) or the watch ends. */
  track(intentId: string): Promise<boolean>;
};

/**
 * Records the signed batch against one part, inside the caller's transaction: the part's approval request (handed
 * out with the batch) is approved, an attempt carries the batch's hash, and the intent is executing. Refused when
 * the intent moved on since the batch was built.
 */
export async function recordBundled(
  tx: Tx,
  // `nonce`: on the first part only (one wallet nonce per transaction; the others point at the same hash).
  input: {
    userId: string;
    network: "mainnet" | "testnet";
    part: BundlePart;
    approvalId: string;
    nonce: number | null;
    txHash: Hex;
    fitsLimits?: (tx: Tx) => Promise<boolean>;
  },
): Promise<string> {
  const { part } = input;
  const [intent] = await tx
    .select()
    .from(intents)
    .where(and(eq(intents.id, part.intentId), eq(intents.userId, input.userId)))
    .for("update");
  if (!intent || intent.state !== "ready_for_approval" || intent.currentDraftVersion !== part.version)
    throw problem(HTTP.conflict, "intent_stale");
  const [approval] = await tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.intentId, part.intentId)));
  if (!approval || approval.status !== "pending_signature" || approval.draftVersion !== part.version)
    throw problem(HTTP.conflict, "intent_stale");
  if (approval.expiresAt.getTime() < Date.now()) throw problem(HTTP.conflict, "intent_stale", "the approval expired");
  if (input.fitsLimits && !(await input.fitsLimits(tx)))
    throw problem(HTTP.conflict, "intent_stale", "a limit changed; review again");
  await tx.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id));
  if (part.ledger)
    await tx
      .insert(spendLedger)
      .values({
        userId: input.userId,
        network: input.network,
        intentId: part.intentId,
        category: "send",
        asset: part.ledger.asset,
        amount: BigInt(part.ledger.amount),
      });
  const [attempt] = await tx
    .insert(txAttempts)
    .values({
      userId: input.userId,
      intentId: part.intentId,
      network: input.network,
      chainId: part.chainId,
      attemptNo: await nextAttemptNo(tx, part.intentId),
      kind: part.attemptKind,
      provider: "user_wallet",
      idempotencyKey: randomUUID(),
      fromAddress: part.from,
      toAddress: part.attemptTo,
      nonce: input.nonce,
      txHash: input.txHash,
      status: "prepared",
      ...(part.attemptReceipt ? { receipt: part.attemptReceipt } : {}),
    })
    .returning({ id: txAttempts.id });
  await tx.update(intents).set({ state: "executing" }).where(eq(intents.id, part.intentId));
  return attempt!.id;
}

/** The node refused the batch before taking it: none of its intents moved. */
export async function failBundled(db: Db, parts: { intentId: string; attemptId: string }[], error: string) {
  await db.transaction(async (tx) => {
    for (const part of parts) {
      const [moved] = await tx
        .update(intents)
        .set({ state: "failed", completedAt: new Date() })
        .where(and(eq(intents.id, part.intentId), inArray(intents.state, ["executing", "unknown_outcome", "approved"])))
        .returning({ id: intents.id });
      if (!moved) continue;
      await tx
        .update(txAttempts)
        .set({ status: "not_sent", errorCode: error })
        .where(eq(txAttempts.id, part.attemptId));
      await tx.update(spendLedger).set({ state: "released" }).where(eq(spendLedger.intentId, part.intentId));
    }
  });
}

/** The approval request every part carries: the one batch transaction, for that part's version. */
export async function offerBundled(
  tx: Tx,
  input: {
    userId: string;
    network: "mainnet" | "testnet";
    part: BundlePart;
    transaction: UnsignedTransaction;
    expiresAt: Date;
    surface: "app" | "chat" | "voice";
  },
) {
  const { part } = input;
  await tx
    .update(approvals)
    .set({ status: "rejected" })
    .where(and(eq(approvals.intentId, part.intentId), eq(approvals.status, "pending_signature")));
  const [row] = await tx
    .insert(approvals)
    .values({
      intentId: part.intentId,
      draftVersion: part.version,
      draftHash: part.draftHash,
      userId: input.userId,
      network: input.network,
      route: "wallet_signature",
      unsignedTransaction: input.transaction as unknown as Record<string, unknown>,
      signerAddress: part.from,
      status: "pending_signature",
      decidedViaSurface: input.surface,
      expiresAt: input.expiresAt,
    })
    .returning({ id: approvals.id });
  return row!.id;
}

/**
 * A read-only view of the chain where `wallet` already holds `credit` more of `token`: used only to build the calls
 * of a step that spends what an earlier call in the same batch delivers (a bridge after a conversion). The calls are
 * checked as always, and on chain the batch is atomic: if less arrives, the whole transaction reverts.
 */
export function withCredit<C extends PublicClient>(client: C, token: Address, wallet: Address, credit: bigint): C {
  if (credit <= ZERO) return client;
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const readContract = (async (args: { address: Address; functionName: string; args?: readonly unknown[] }) => {
    const value = await (client.readContract as (input: unknown) => Promise<unknown>)(args);
    if (
      same(args.address, token) &&
      args.functionName === "balanceOf" &&
      same(args.args?.[0], wallet) &&
      typeof value === "bigint"
    )
      return value + credit;
    return value;
  }) as C["readContract"];
  return new Proxy(client, {
    get: (target, key, receiver) => (key === "readContract" ? readContract : Reflect.get(target, key, receiver)),
  });
}
