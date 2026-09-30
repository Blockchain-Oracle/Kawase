// Calldata for the DelegationManager. The agent's ops wallet sends the redeem; the user's wallet sends the revoke.
import { ExecutionMode, createExecution, type Delegation } from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";

export type ContractCall = { to: Address; data: Hex };

/** The agent spends inside a grant: `token.transfer(to, amount)` executed from the user's wallet. */
export function encodeRedeemTransfer(
  network: NetworkContext,
  grant: Delegation,
  transfer: { token: Address; to: Address; amount: bigint },
): ContractCall {
  const environment = delegationEnvironment(network);
  const callData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [transfer.to, transfer.amount] });
  const data = DelegationManager.encode.redeemDelegations({
    delegations: [[grant]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[createExecution({ target: transfer.token, callData })]],
  });
  return { to: environment.DelegationManager, data };
}

/** The user revokes a grant. With EIP-7702 the wallet is the delegator, so it sends this itself. */
export function encodeRevoke(network: NetworkContext, grant: Delegation): ContractCall {
  const environment = delegationEnvironment(network);
  return { to: environment.DelegationManager, data: DelegationManager.encode.disableDelegation({ delegation: grant }) };
}
