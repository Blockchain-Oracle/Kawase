// Web: the app's WalletSigner for this build's wallet provider (D41): Privy's embedded wallet (privy-signer.ts), or
// Turnkey's (turnkey-signer.ts, the fallback for one build). Undefined while there is no wallet to sign with.
import type { ApprovalStrength, WalletSigner } from "@kawase/wallet";

import { isPrivy, isWalletConfigured } from "./config";
import { usePrivyWalletSigner } from "./privy-signer";
import { useTurnkeyWalletSigner } from "./turnkey-signer";

export const useWalletSigner: (approval?: ApprovalStrength) => WalletSigner | undefined = !isPrivy
  ? useTurnkeyWalletSigner
  : isWalletConfigured
    ? usePrivyWalletSigner
    : () => undefined;
