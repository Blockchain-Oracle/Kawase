// The api's unsigned transaction (JSON: numbers as decimal strings) as viem's serializable shape, for the wallet to sign.
import type { TransactionSerializable } from "viem";

import type { UnsignedTransaction } from "@kawase/api-client";

export function toSerializable(transaction: UnsignedTransaction): TransactionSerializable {
  return {
    type: "eip1559",
    chainId: transaction.chainId,
    nonce: transaction.nonce,
    to: transaction.to,
    data: transaction.data,
    value: BigInt(transaction.value),
    gas: BigInt(transaction.gas),
    maxFeePerGas: BigInt(transaction.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
  };
}
