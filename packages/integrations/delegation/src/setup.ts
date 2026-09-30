// One-time setup: the user's EOA delegates its code to MetaMask's EIP7702StatelessDeleGator (EIP-7702).
// The user only signs the authorization; a relayer sends the type-4 transaction and pays the gas, so a
// brand-new wallet needs no USDC (spike 15).
import type { Address, Hex } from "viem";
import { DELEGATION_FRAMEWORK, type NetworkContext } from "@kawase/networks";

const DELEGATION_DESIGNATOR_PREFIX = "0xef0100";

/** What the wallet signs at setup. The nonce is the account's next transaction nonce (the relayer sends the tx). */
export function setupAuthorizationRequest(network: NetworkContext, accountNonce: number) {
  return {
    contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator as Address,
    chainId: network.chainId,
    nonce: accountNonce,
  };
}

/** True when the account's code is the 7702 designator for the delegator we expect. */
export function isWalletSetUp(code: Hex | undefined): boolean {
  if (!code) return false;
  const expected = `${DELEGATION_DESIGNATOR_PREFIX}${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.slice("0x".length)}`;
  return code.toLowerCase() === expected.toLowerCase();
}

/** The authorization that removes the 7702 code again (part of the exit kit). */
export function teardownAuthorizationRequest(network: NetworkContext, accountNonce: number) {
  return {
    contractAddress: "0x0000000000000000000000000000000000000000" as Address,
    chainId: network.chainId,
    nonce: accountNonce,
  };
}
