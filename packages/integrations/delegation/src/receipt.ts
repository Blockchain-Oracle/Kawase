// The "can / can never" receipt shown to the user. It is decoded from the signed caveat bytes, not from
// the draft that produced them, so it always describes what the chain will actually enforce.
import { decodeCaveat } from "@metamask/smart-accounts-kit/utils";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { slice, type Address, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";

const ADDRESS_BYTES = 20;
const ABI_WORD_BYTES = 32;
const FIRST_ARGUMENT_OFFSET = 4;

export type GrantReceipt = {
  wallet: Address;
  redeemer: Address;
  token: Address | undefined;
  amountPerPeriod: bigint | undefined;
  periodSeconds: number | undefined;
  startsAt: number | undefined;
  expiresAt: number | undefined;
  /** Contracts the agent may call. */
  targets: Address[];
  /** 4-byte selectors the agent may call. */
  methods: Hex[];
  /** Set when the grant is pinned to one recipient (an automation): an address pinned as the first argument. */
  recipient: Address | undefined;
  /** Every argument pinned to an address, by its byte offset in calldata (4 = the first argument). */
  pins: { startIndex: number; address: Address }[];
  /** The most native value a redeem may carry. 0 means none. */
  maxNativeValue: bigint | undefined;
  /** Addresses allowed to redeem, from the Redeemer caveat. */
  redeemers: Address[];
  /** Enforcers this code does not understand. A receipt with any of these must not be shown as safe. */
  unknownCaveats: Address[];
};

export function describeGrant(network: NetworkContext, grant: Delegation): GrantReceipt {
  const environment = delegationEnvironment(network);
  const receipt: GrantReceipt = {
    wallet: grant.delegator,
    redeemer: grant.delegate,
    token: undefined,
    amountPerPeriod: undefined,
    periodSeconds: undefined,
    startsAt: undefined,
    expiresAt: undefined,
    targets: [],
    methods: [],
    recipient: undefined,
    pins: [],
    maxNativeValue: undefined,
    redeemers: [],
    unknownCaveats: [],
  };
  for (const caveat of grant.caveats) {
    let decoded;
    try {
      decoded = decodeCaveat({ caveat, environment });
    } catch {
      receipt.unknownCaveats.push(caveat.enforcer);
      continue;
    }
    switch (decoded.type) {
      case "erc20PeriodTransfer":
        receipt.token = decoded.tokenAddress;
        receipt.amountPerPeriod = decoded.periodAmount;
        receipt.periodSeconds = decoded.periodDuration;
        receipt.startsAt = decoded.startDate;
        break;
      case "allowedTargets":
        receipt.targets = [...decoded.targets];
        break;
      case "allowedMethods":
        receipt.methods = decoded.selectors.map((selector) => selector as Hex);
        break;
      case "timestamp":
        receipt.expiresAt = decoded.beforeThreshold;
        break;
      case "redeemer":
        receipt.redeemers = [...decoded.redeemers];
        break;
      case "valueLte":
        receipt.maxNativeValue = decoded.maxValue;
        break;
      case "allowedCalldata": {
        // A pinned address is one ABI word whose last 20 bytes are the address; the first argument is the recipient.
        const address = slice(decoded.value as Hex, ABI_WORD_BYTES - ADDRESS_BYTES, ABI_WORD_BYTES) as Address;
        receipt.pins.push({ startIndex: decoded.startIndex, address });
        if (decoded.startIndex === FIRST_ARGUMENT_OFFSET) receipt.recipient = address;
        break;
      }
      default:
        receipt.unknownCaveats.push(caveat.enforcer);
    }
  }
  return receipt;
}
