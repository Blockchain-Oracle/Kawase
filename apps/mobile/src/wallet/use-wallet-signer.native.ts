// iOS and Android: the app's WalletSigner over Privy's embedded wallet (privy-signer.native.ts, D41), loaded only when
// the build has the Privy ids. Undefined while there is no wallet to sign with.
import type { WalletSigner } from "@kawase/wallet";

import { isWalletConfigured } from "./config";

const privy: typeof import("./privy-signer.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Privy's native modules load only with its ids
  isWalletConfigured ? require("./privy-signer.native") : undefined;

export const useWalletSigner: () => WalletSigner | undefined =
  privy?.usePrivyWalletSigner ?? (() => undefined);
