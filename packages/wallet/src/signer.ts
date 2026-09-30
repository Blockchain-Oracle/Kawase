// The one shape every wallet provider has to fit (ARCHITECTURE §4, D33).
// The user's wallet is an ordinary EOA. It signs exactly three kinds of thing:
//   1. one EIP-7702 authorization at setup,
//   2. EIP-712 typed data (grants, settings changes),
//   3. ordinary transactions (payments above the allowance, swap and bridge steps, revokes).
// A viem LocalAccount already has that shape, so the rest of the code (viem clients, the MetaMask
// delegation kit, Circle's App Kit adapter) takes a WalletSigner with no glue.
import type { LocalAccount } from "viem";

export type WalletSigner = LocalAccount & {
  signAuthorization: NonNullable<LocalAccount["signAuthorization"]>;
};

/** How strongly a signature was approved. `passkey` is enforced by the wallet provider, not by our app. */
export type ApprovalStrength = "session" | "passkey";
