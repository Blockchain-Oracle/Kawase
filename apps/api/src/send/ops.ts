// The agent's ops wallet (a Circle developer-controlled wallet per network) sends contract calls: today, the redeem
// of a person's allowance. Circle de-duplicates on the idempotency key, so the same key with the same body returns
// the same transaction; reconciliation relies on that to recover a call whose answer was lost (ARCHITECTURE §5).
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { Address, Hex } from "viem";

import type { ApiEnv } from "@kawase/env";
import type { NetworkId } from "@kawase/networks";

export type OpsCall = {
  network: NetworkId;
  walletId: string;
  contract: Address;
  callData: Hex;
  /** A v4 UUID persisted before this call. */
  idempotencyKey: string;
  /** Our reference, e.g. "{intentId}:v{version}". */
  refId: string;
};

/** Circle's transaction states; on Arc a transfer goes SENT → COMPLETE with no CONFIRMED step. */
export type OpsState = "pending" | "complete" | "failed";

export type OpsTransaction = { id: string; state: OpsState; txHash: string | undefined; error: string | undefined };

export type OpsExecutor = {
  execute(call: OpsCall): Promise<OpsTransaction>;
  get(network: NetworkId, id: string): Promise<OpsTransaction>;
};

const FAILED = new Set(["FAILED", "CANCELLED", "DENIED"]);
const COMPLETE = new Set(["COMPLETE", "CONFIRMED"]);

const toState = (state: string | undefined): OpsState =>
  state && COMPLETE.has(state) ? "complete" : state && FAILED.has(state) ? "failed" : "pending";

export function circleOps(env: ApiEnv): OpsExecutor {
  const clients = {
    testnet: initiateDeveloperControlledWalletsClient({
      apiKey: env.CIRCLE_TEST_API_KEY,
      entitySecret: env.CIRCLE_TEST_ENTITY_SECRET,
    }),
    mainnet:
      env.CIRCLE_LIVE_API_KEY && env.CIRCLE_LIVE_ENTITY_SECRET
        ? initiateDeveloperControlledWalletsClient({
            apiKey: env.CIRCLE_LIVE_API_KEY,
            entitySecret: env.CIRCLE_LIVE_ENTITY_SECRET,
          })
        : undefined,
  } as const;
  const client = (network: NetworkId) => {
    const found = clients[network];
    if (!found) throw new Error(`No Circle client for ${network}`);
    return found;
  };

  return {
    async execute(call) {
      const response = await client(call.network).createContractExecutionTransaction({
        walletId: call.walletId,
        contractAddress: call.contract,
        callData: call.callData,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        idempotencyKey: call.idempotencyKey,
        refId: call.refId,
      });
      const id = response.data?.id;
      if (!id) throw new Error("Circle returned no transaction id");
      return { id, state: toState(response.data?.state), txHash: undefined, error: undefined };
    },
    async get(network, id) {
      const transaction = (await client(network).getTransaction({ id })).data?.transaction;
      return {
        id,
        state: toState(transaction?.state),
        txHash: transaction?.txHash ?? undefined,
        error: transaction?.errorReason ?? undefined,
      };
    },
  };
}
