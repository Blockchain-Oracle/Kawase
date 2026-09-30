import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { DELEGATION_FRAMEWORK, type NetworkContext } from "@kawase/networks";

/**
 * The MetaMask Delegation Framework deployment for a network, checked against the addresses we verified
 * on chain (packages/networks). A mismatch means the kit was upgraded to a deployment we have not checked.
 */
export function delegationEnvironment(network: NetworkContext) {
  const environment = getSmartAccountsEnvironment(network.chainId);
  const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
  if (
    !same(environment.DelegationManager, DELEGATION_FRAMEWORK.delegationManager) ||
    !same(environment.implementations.EIP7702StatelessDeleGatorImpl, DELEGATION_FRAMEWORK.eip7702StatelessDeleGator)
  ) {
    throw new Error(`Delegation framework addresses for chain ${network.chainId} differ from the verified ones`);
  }
  return environment;
}
