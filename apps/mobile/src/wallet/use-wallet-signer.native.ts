// iOS and Android: the app's WalletSigner for this build's wallet provider (D41): Privy's embedded wallet
// (privy-signer.native.ts, loaded only on a Privy build), or Turnkey's (turnkey-signer.native.ts, the fallback for one
// build). Undefined while there is no wallet to sign with.
import type { ApprovalStrength, WalletSigner } from "@kawase/wallet";

import { isPrivy, isWalletConfigured } from "./config";
import { useTurnkeyWalletSigner } from "./turnkey-signer.native";

const privy: typeof import("./privy-signer.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluated only on a Privy build (see above)
  isPrivy && isWalletConfigured ? require("./privy-signer.native") : undefined;

export const useWalletSigner: (approval?: ApprovalStrength) => WalletSigner | undefined = !isPrivy
  ? useTurnkeyWalletSigner
  : (privy?.usePrivyWalletSigner ?? (() => undefined));
