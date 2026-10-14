// Web: the wallet provider for this build (D41): Privy, or Turnkey as the fallback for one build
// (EXPO_PUBLIC_WALLET_PROVIDER). Without the provider's ids the app still runs (guest look-around).
import type { ReactNode } from "react";

import { isDev, isPrivy, isWalletConfigured } from "./config";
import { PrivyWalletProvider } from "./privy-provider";
import { TurnkeyWalletProvider } from "./turnkey-provider";

export function WalletProvider({ children }: { children: ReactNode }) {
  if (isDev) return <>{children}</>;
  if (!isPrivy) return <TurnkeyWalletProvider>{children}</TurnkeyWalletProvider>;
  if (!isWalletConfigured) return <>{children}</>;
  return <PrivyWalletProvider>{children}</PrivyWalletProvider>;
}
