// Grants: what the agent may do with the user's wallet, as ERC-7710 delegations whose caveats are built
// here, in code, never by the model (K2). The wallet signs the typed data; the chain enforces the caveats.
import { CaveatType, ScopeType, createDelegation, type Delegation } from "@metamask/smart-accounts-kit";
import { SIGNABLE_DELEGATION_TYPED_DATA, toDelegationStruct } from "@metamask/smart-accounts-kit/utils";
import { pad, type Address, type Hex, type TypedDataDefinition } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";

const TRANSFER_SIGNATURE = "transfer(address,uint256)";
/** Offset of the first argument in calldata: right after the 4-byte selector. */
const FIRST_ARGUMENT_OFFSET = 4;
const ABI_WORD_BYTES = 32;
const DELEGATION_DOMAIN_NAME = "DelegationManager";
const DELEGATION_DOMAIN_VERSION = "1";
const UNSIGNED: Hex = "0x";

export type GrantTerms = {
  network: NetworkContext;
  /** The user's wallet (the delegator). */
  wallet: Address;
  /** The agent's ops wallet: the only address that may redeem. */
  redeemer: Address;
  /** The ERC-20 token, e.g. USDC. */
  token: Address;
  /** Base units of the token per period. */
  amountPerPeriod: bigint;
  periodSeconds: number;
  /** Unix seconds. The first period starts here. */
  startsAt: number;
  /** Unix seconds. After this the grant is dead. */
  expiresAt: number;
  /** Random 32 bytes; makes each grant unique. */
  salt: Hex;
};

function build(terms: GrantTerms, recipient: Address | undefined): Delegation {
  const environment = delegationEnvironment(terms.network);
  return createDelegation({
    environment,
    from: terms.wallet,
    to: terms.redeemer,
    // Adds the period cap and refuses any native value.
    scope: {
      type: ScopeType.Erc20PeriodTransfer,
      tokenAddress: terms.token,
      periodAmount: terms.amountPerPeriod,
      periodDuration: terms.periodSeconds,
      startDate: terms.startsAt,
    },
    caveats: [
      { type: CaveatType.AllowedTargets, targets: [terms.token] },
      { type: CaveatType.AllowedMethods, selectors: [TRANSFER_SIGNATURE] },
      { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: terms.expiresAt },
      { type: CaveatType.Redeemer, redeemers: [terms.redeemer] },
      ...(recipient
        ? [
            {
              type: CaveatType.AllowedCalldata,
              startIndex: FIRST_ARGUMENT_OFFSET,
              value: pad(recipient, { size: ABI_WORD_BYTES }),
            } as const,
          ]
        : []),
    ],
    salt: terms.salt,
  });
}

/** The everyday allowance: up to `amountPerPeriod` of one token per period, to any recipient. */
export function buildAllowanceGrant(terms: GrantTerms): Delegation {
  return build(terms, undefined);
}

/** One automation: the same limits, and only to one recipient. */
export function buildAutomationGrant(terms: GrantTerms & { recipient: Address }): Delegation {
  return build(terms, terms.recipient);
}

/** The EIP-712 payload the wallet signs for a grant. */
export function grantTypedData(network: NetworkContext, grant: Delegation): TypedDataDefinition {
  const environment = delegationEnvironment(network);
  return {
    domain: {
      name: DELEGATION_DOMAIN_NAME,
      version: DELEGATION_DOMAIN_VERSION,
      chainId: network.chainId,
      verifyingContract: environment.DelegationManager,
    },
    types: SIGNABLE_DELEGATION_TYPED_DATA,
    primaryType: "Delegation",
    message: toDelegationStruct({ ...grant, signature: UNSIGNED }),
  } as TypedDataDefinition;
}

export function withSignature(grant: Delegation, signature: Hex): Delegation {
  return { ...grant, signature };
}
