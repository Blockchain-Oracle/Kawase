// Several calls as one transaction from the user's own wallet. With EIP-7702 the wallet runs MetaMask's
// StatelessDeleGator code, whose `execute(mode, executionCalldata)` accepts calls from the account itself; a
// transaction the wallet sends to its own address therefore executes the whole batch atomically (approve + swap,
// approve + burn) behind one signature, and one Face ID.
import { ExecutionMode, createExecution } from "@metamask/smart-accounts-kit";
import { DeleGatorCore } from "@metamask/smart-accounts-kit/contracts";
import type { Address, Hex } from "viem";

import type { ContractCall } from "./redeem";

const NO_VALUE = 0n;

export type BatchCall = { to: Address; data?: Hex | undefined; value?: bigint | undefined };

/** The calldata the wallet sends to itself to run `calls` in order, all or nothing. */
export function encodeSelfBatch(calls: readonly BatchCall[]): Hex {
  if (calls.length === 0) throw new Error("a batch needs at least one call");
  return DeleGatorCore.encode.executeWithMode({
    mode: ExecutionMode.BatchDefault,
    executions: calls.map((call) => createExecution({ target: call.to, callData: call.data ?? "0x", value: call.value ?? NO_VALUE })),
  });
}

/** The whole transaction: from the wallet, to the wallet. */
export function selfBatchCall(wallet: Address, calls: readonly BatchCall[]): ContractCall & { value: bigint } {
  return { to: wallet, data: encodeSelfBatch(calls), value: NO_VALUE };
}
