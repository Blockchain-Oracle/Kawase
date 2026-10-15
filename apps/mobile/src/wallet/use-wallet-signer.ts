// Web: the app's WalletSigner: Privy's embedded wallet (privy-signer.ts, D41), or the dev key in local development.
// Undefined while there is no wallet to sign with.
import type { WalletSigner } from "@kawase/wallet";

import { isDev, isWalletConfigured } from "./config";
import { useDevWalletSigner } from "./dev-signer";
import { usePrivyWalletSigner } from "./privy-signer";

export const useWalletSigner: () => WalletSigner | undefined = isDev
  ? useDevWalletSigner
  : isWalletConfigured
    ? usePrivyWalletSigner
    : () => undefined;
