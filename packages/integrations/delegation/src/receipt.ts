// The "can / can never" receipt shown to the user. It is decoded from the signed caveat bytes, not from
// the draft that produced them, so it always describes what the chain will actually enforce.
import { decodeCaveat } from "@metamask/smart-accounts-kit/utils";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { size, slice, type Address, type Hex } from "viem";
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
  /**
   * Every pinned argument word, by its byte offset in calldata (4 = the first argument): `value` is the whole word,
   * `address` its low 20 bytes (meaningful when the argument is an address).
   */
  pins: { startIndex: number; address: Address; value: Hex }[];
  /** The most times the grant can ever be redeemed, from the LimitedCalls caveat. */
  maxCalls: number | undefined;
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
    maxCalls: undefined,
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
        // One pin may cover several ABI words (a struct's fields in a row), or only the top of one (a "≤" bound); each
        // is listed on its own. A pinned address is a whole word whose last 20 bytes are the address; the first
        // argument is the recipient.
        const value = decoded.value as Hex;
        for (let offset = 0; offset < size(value); offset += ABI_WORD_BYTES) {
          const pinned = slice(value, offset, Math.min(offset + ABI_WORD_BYTES, size(value)));
          const address = (
            size(pinned) === ABI_WORD_BYTES ? slice(pinned, ABI_WORD_BYTES - ADDRESS_BYTES, ABI_WORD_BYTES) : "0x"
          ) as Address;
          receipt.pins.push({ startIndex: decoded.startIndex + offset, address, value: pinned });
          if (decoded.startIndex + offset === FIRST_ARGUMENT_OFFSET) receipt.recipient = address;
        }
        break;
      }
      case "limitedCalls":
        receipt.maxCalls = decoded.limit;
        break;
      default:
        receipt.unknownCaveats.push(caveat.enforcer);
    }
  }
  return receipt;
}
