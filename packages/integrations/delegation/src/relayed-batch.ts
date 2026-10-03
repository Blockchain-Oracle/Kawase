// A batch the relayer sends for the wallet (plan §B "Gas": no out-of-gas dead end). With EIP-7702 the wallet runs the
// DeleGator, so instead of sending its own self-batch (and paying the fee in USDC it may not have), it signs a one-time
// delegation to Kawase's relayer whose caveats allow exactly these calls and nothing else:
// - ExactExecutionBatch (ExactExecution for one call): exactly these targets, values and calldata, in this order;
// - LimitedCalls 1: it can be redeemed once;
// - Timestamp: only until `expiresAt`;
// - Redeemer: only the relayer may redeem it.
// The relayer redeems it in batch mode and pays the gas. The signature can do nothing but this one batch.
import { ExecutionMode, ROOT_AUTHORITY, createExecution, type Delegation } from "@metamask/smart-accounts-kit";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import type { Address, Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";
import type { BatchCall } from "./batch";
import type { ContractCall } from "./redeem";

const ONCE = 1;
const UNSIGNED: Hex = "0x";

export type RelayedBatchTerms = {
  network: NetworkContext;
  wallet: Address;
  relayer: Address;
  calls: readonly BatchCall[];
  /** Unix seconds. */
  expiresAt: number;
  /** Random 32 bytes. */
  salt: Hex;
};

const NO_VALUE = 0n;
const executions = (calls: readonly BatchCall[]) => calls.map((call) => createExecution({ target: call.to, value: call.value ?? NO_VALUE, callData: call.data ?? "0x" }));
/** One call is redeemed in single mode (the kit writes a lone execution in the single layout; see batch.ts). */
const modeOf = (calls: readonly BatchCall[]) => (calls.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault);

/** The one-time delegation the wallet signs (with `grantTypedData`). */
export function buildRelayedBatch(terms: RelayedBatchTerms): Delegation {
  const environment = delegationEnvironment(terms.network);
  if (terms.calls.length === 0) throw new Error("a batch needs at least one call");
  const [first] = executions(terms.calls);
  const exact = createCaveatBuilder(environment);
  const pinned = terms.calls.length === 1 ? exact.addCaveat("exactExecution", { execution: first! }) : exact.addCaveat("exactExecutionBatch", { executions: executions(terms.calls) });
  const caveats = pinned
    .addCaveat("limitedCalls", { limit: ONCE })
    .addCaveat("timestamp", { afterThreshold: 0, beforeThreshold: terms.expiresAt })
    .addCaveat("redeemer", { redeemers: [terms.relayer] })
    .build();
  return { delegate: terms.relayer, delegator: terms.wallet, authority: ROOT_AUTHORITY as Hex, caveats, salt: terms.salt, signature: UNSIGNED };
}

/** The relayer's transaction: redeem the signed delegation with exactly the batch it names. */
export function encodeRedeemBatch(network: NetworkContext, grant: Delegation, calls: readonly BatchCall[]): ContractCall {
  const environment = delegationEnvironment(network);
  const data = DelegationManager.encode.redeemDelegations({
    delegations: [[grant]],
    modes: [modeOf(calls)],
    executions: [executions(calls)],
  });
  return { to: environment.DelegationManager, data };
}
