// Practice mode (cards/automate-safety.md, R11): writes are simulated, never sent. A practice write is the exact
// transaction it would have been, run as an `eth_call` from the exact sender (the ops wallet for an allowance redeem,
// the person's wallet for a Face ID send) — Arc's RPC has no `eth_simulateV1` or `debug_traceCall` (probed
// 2026-09-29, 07-automations-contacts-safety/limits-and-safety.md §4), so a dry call is the honest "would have": it
// says whether the chain would have accepted it, not what a model guessed.
import { BaseError, ContractFunctionRevertedError, type Address, type Hex } from "viem";

import { practiceRuns, type Db, type PracticeResult } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import type { NetworkClients } from "../wallet/chain";

type Executor = Pick<Db, "insert">;
const REASON_MAX = 160;

/** The chain's answer to the exact call, without sending it. */
export async function simulateCall(client: NetworkClients["client"], call: { from: Address; to: Address; data: Hex }): Promise<PracticeResult> {
  const simulatedAt = new Date().toISOString();
  try {
    await client.call({ account: call.from, to: call.to, data: call.data });
    return { ok: true, error: null, simulatedAt };
  } catch (error) {
    return { ok: false, error: revertReason(error), simulatedAt };
  }
}

function revertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) return (reverted.reason ?? reverted.shortMessage).slice(0, REASON_MAX);
    return error.shortMessage.slice(0, REASON_MAX);
  }
  return String(error).slice(0, REASON_MAX);
}

export async function recordPractice(
  db: Executor,
  entry: { userId: string; network: NetworkId; kind: string; intentId?: string | null; automationId?: string | null; summary: Record<string, string>; result: PracticeResult },
) {
  const [row] = await db
    .insert(practiceRuns)
    .values({
      userId: entry.userId,
      network: entry.network,
      kind: entry.kind,
      intentId: entry.intentId ?? null,
      automationId: entry.automationId ?? null,
      summary: entry.summary,
      result: entry.result,
    })
    .onConflictDoNothing()
    .returning({ id: practiceRuns.id });
  return row?.id;
}
