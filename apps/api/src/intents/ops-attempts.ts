// Attempts the ops wallet sends through Circle (automation runs: sends, Auto-save moves, bridge rules), shared by the
// money services. An attempt is prepared with its call before anything is sent; it is handed to Circle once, keyed
// by its own idempotency key, so a resubmission after a lost answer is the same transaction; its hash comes from
// Circle once Circle has one, and an attempt Circle gave up on before sending is settled as not sent.
import { eq } from "drizzle-orm";
import type { Address, Hex } from "viem";

import { txAttempts, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP } from "../http/problem";
import type { OpsExecutor } from "../send/ops";
import type { Chains } from "../wallet/chain";

type AttemptRow = typeof txAttempts.$inferSelect;

export class OpsAttempts {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly ops: OpsExecutor,
    private readonly log: Logger,
    /** Settles the attempt's intent as not sent (the service's own transition). */
    private readonly notSent: (intentId: string, attemptId: string, error: string) => Promise<void>,
  ) {}

  /** Hands a prepared attempt to Circle once. */
  async submit(intentId: string, attempt: AttemptRow) {
    if (attempt.provider !== "circle_dcw" || attempt.providerRef) return;
    const prepared = (attempt.receipt as { prepared?: { to: Address; data: Hex } } | null)?.prepared;
    const ops = this.chains.get(attempt.network)?.ops;
    if (!prepared || !ops) return;
    try {
      const sent = await this.ops.execute({ network: attempt.network, walletId: ops.walletId, contract: prepared.to, callData: prepared.data, idempotencyKey: attempt.idempotencyKey, refId: `${intentId}:v1` });
      await this.db.update(txAttempts).set({ providerRef: sent.id, status: "submitted" }).where(eq(txAttempts.id, attempt.id));
    } catch (error) {
      const e = error as { status?: number; code?: number; message?: string };
      const definitive = typeof e.status === "number" && e.status >= HTTP.badRequest && e.status < HTTP.internal && e.status !== HTTP.tooManyRequests;
      this.log.warn({ intentId, status: e.status, code: e.code, message: e.message }, "ops execute failed");
      if (definitive) await this.notSent(intentId, attempt.id, `circle ${e.code ?? e.status}`);
      else await this.db.update(txAttempts).set({ errorCode: "ops_unclear" }).where(eq(txAttempts.id, attempt.id));
    }
  }

  /** The attempt's hash: its own, or Circle's once Circle has one (submitting it first if it never was). */
  async hash(intentId: string, network: NetworkId, attempt: AttemptRow): Promise<Hex | undefined> {
    if (attempt.txHash) return attempt.txHash as Hex;
    if (attempt.provider !== "circle_dcw") return undefined;
    if (!attempt.providerRef) {
      await this.submit(intentId, attempt);
      return undefined;
    }
    const transaction = await this.ops.get(network, attempt.providerRef);
    if (transaction.txHash) {
      const hash = transaction.txHash.toLowerCase() as Hex;
      await this.db.update(txAttempts).set({ txHash: hash, status: "pending_chain" }).where(eq(txAttempts.id, attempt.id));
      return hash;
    }
    if (transaction.state === "failed") await this.notSent(intentId, attempt.id, transaction.error ?? "failed");
    return undefined;
  }
}
