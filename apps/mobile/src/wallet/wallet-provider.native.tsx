// iOS and Android: the wallet provider for this build (D41): Privy, or Turnkey as the fallback for one build
// (EXPO_PUBLIC_WALLET_PROVIDER). Privy's modules are loaded only on a Privy build, so a Turnkey build never evaluates
// its native modules. Without the provider's ids the app still runs (guest look-around).
import type { ReactNode } from "react";

import { isPrivy, isWalletConfigured } from "./config";
import { TurnkeyWalletProvider } from "./turnkey-provider";

const privy: typeof import("./privy-provider.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluated only on a Privy build (see above)
  isPrivy && isWalletConfigured ? require("./privy-provider.native") : undefined;

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!isPrivy) return <TurnkeyWalletProvider>{children}</TurnkeyWalletProvider>;
  if (!privy) return <>{children}</>;
  return <privy.PrivyWalletProvider>{children}</privy.PrivyWalletProvider>;
}
