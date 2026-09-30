// A plain local key behind the WalletSigner interface. For tests and scripts only: it is how the
// on-chain limit design was proven on Arc testnet (spike 15) before any wallet provider was wired in.
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { WalletSigner } from "./signer";

export function localKeySigner(privateKey: Hex): WalletSigner {
  return privateKeyToAccount(privateKey);
}
