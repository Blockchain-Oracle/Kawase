// What is left of an allowance this period, read from the enforcer that will refuse anything more. The enforcer
// keys its spend counter by (DelegationManager, delegation hash), where the hash is the delegation struct's hash
// (`hashDelegation`), not the EIP-712 digest the wallet signed.
import type { Delegation } from "@metamask/smart-accounts-kit";
import { ERC20PeriodTransferEnforcer } from "@metamask/smart-accounts-kit/contracts";
import { hashDelegation } from "@metamask/smart-accounts-kit/utils";
import type { Client } from "viem";
import { DELEGATION_FRAMEWORK, type NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";

export type AllowanceAvailability = {
  /** Base units the redeemer may still move this period. */
  available: bigint;
  /** True when no transfer has happened yet in the current period. */
  isNewPeriod: boolean;
};

export async function allowanceAvailable(
  client: Client,
  network: NetworkContext,
  grant: Delegation,
): Promise<AllowanceAvailability> {
  const environment = delegationEnvironment(network);
  const enforcer = DELEGATION_FRAMEWORK.enforcers.erc20PeriodTransfer.toLowerCase();
  const caveat = grant.caveats.find((entry) => entry.enforcer.toLowerCase() === enforcer);
  if (!caveat) throw new Error("The grant has no period cap");
  const result = await ERC20PeriodTransferEnforcer.read.getAvailableAmount({
    client,
    contractAddress: caveat.enforcer,
    delegationManager: environment.DelegationManager,
    delegationHash: hashDelegation(grant),
    terms: caveat.terms,
  });
  return { available: result.availableAmount, isNewPeriod: result.isNewPeriod };
}
